# porter-stemmer：英文 Porter 词干提取与逐规则解释服务

本地运行的英文词干分析后端（仅 API 与 CLI），使用 **TypeScript + Node.js + SQLite**，
完整实现 **Porter 1980 原版词干算法**，并对每个词输出实际触发的规则、条件取值与中间词形。

## 算法版本与来源

- 算法：**Porter 1980 原版**（M.F. Porter, "An algorithm for suffix stripping", *Program*, 14(3):130–137, 1980）。
- 本项目标识的算法版本常量：`porter-1980`（见 `src/porter.ts` 中 `ALGO_VERSION`）。
- **不是** Snowball English / Porter2，也未调用任何现成词干库；所有阶段、measure、
  `*v*`（词干含元音）、`*d`（双辅音）、`*o`（CVC 且末字母非 w/x/y）条件均为本项目自行实现。
- 不下载语料或语言模型，不查询在线词典，不做拼写纠错、词性推断或语义相似度。

### 规则表（原论文规则，按阶段）

- **Step 1a**（复数）：`sses→ss`，`ies→i`，`ss→ss`，`s→""`（按序取第一个匹配，只执行一次）。
- **Step 1b**：`(m>0) eed→ee`；否则 `(*v*) ed→""`、`(*v*) ing→""`，去除后调整：
  `at→ate`、`bl→ble`、`iz→ize`；或双辅音结尾且非 l/s/z 时去掉一个字母；
  或 `m=1 且 *o` 时补 `e`。
- **Step 1c**：`(*v*) y→i`。
- **Step 2**（均要求 `m>0`，取最长匹配后缀，只执行一条）：
  `ational→ate`、`tional→tion`、`enci→ence`、`anci→ance`、`izer→ize`、`abli→able`、
  `alli→al`、`entli→ent`、`eli→e`、`ousli→ous`、`ization→ize`、`ation→ate`、`ator→ate`、
  `alism→al`、`iveness→ive`、`fulness→ful`、`ousness→ous`、`aliti→al`、`iviti→ive`、`biliti→ble`。
- **Step 3**（`m>0`）：`icate→ic`、`ative→""`、`alize→al`、`iciti→ic`、`ical→ic`、`ful→""`、`ness→""`。
- **Step 4**（`m>1`）：`al/ance/ence/er/ic/able/ible/ant/ement/ment/ent/ion/ou/ism/ate/iti/ous/ive/ize → ""`；
  其中 `ion` 额外要求词干以 `s` 或 `t` 结尾。
- **Step 5a**：`m>1` 时去末尾 `e`；`m=1 且非 *o` 时去末尾 `e`。
- **Step 5b**：`m>1 且 *d 且 *L` 时去掉一个末尾 `l`。

约定：measure `m` 为 `[C](VC)^m[V]` 中 VC 序列个数；`y` 在词首或紧跟元音时视为辅音，
否则视为元音。每个阶段只执行一次（阶段内取最长匹配后缀），不会循环到“再无变化”。

## 重要说明（限制）

- **词干不一定是词典中的真实单词，也不等于词形还原（lemmatization）**。例如 `ponies→poni`、
  `relational→relat` 都不是英文单词，这是算法的预期行为。
- 分组仅依据本算法得到的相同词干，**同组词含义不一定相同**。例如 `university` 与
  `universe` 都被归并到 `univers`，这是规则算法的已知误归并风险。
- 仅接受 ASCII 英文字母（`A-Za-z`）；数字、连字符、空格及其他字符会被逐条拒绝并报错。
- 输入原文（含大小写）会被保留并存储，词干计算统一在小写形式上进行，输出词干为小写。
- 限制：单词最长 64 字符，单批最多 500 个词（见 `src/validate.ts`）。

## 环境要求

- Windows 本地运行，Node.js ≥ 22（使用内置 `node:sqlite`，无需原生编译、Docker、WSL 或任何外部服务）。
- 仅开发依赖 `typescript` 与 `@types/node`，无运行时第三方依赖。

## 构建 / 测试 / 启动 / 演示

```powershell
npm install        # 安装开发依赖
npm run build      # 编译 TypeScript 到 dist/
npm test           # 运行全部测试（node:test）
npm start          # 启动 HTTP 服务（默认自动选择空闲端口）
$env:PORT=8080; npm start   # 指定端口
npm run demo       # 运行一组演示命令
```

数据目录默认为项目内 `data/`（可用环境变量 `DATA_DIR` 覆盖），SQLite 文件为 `data/stems.db`。

## CLI 用法

```powershell
node dist/src/cli.js analyze relational hopping   # 单词分析 + 规则轨迹
node dist/src/cli.js trace hopping                # 查看规则路径
node dist/src/cli.js batch words.txt              # 文件批量提取（每行一个词）
node dist/src/cli.js group caresses caress cats   # 按词干分组（--file 从文件读）
node dist/src/cli.js history                      # 历史批次
node dist/src/cli.js show 2                       # 批次详情
node dist/src/cli.js export 2 csv                 # 导出 json/csv
node dist/src/cli.js recompute 2                  # 重启后按当前算法版本复算并比较
```

## HTTP API

默认监听 `127.0.0.1`，未设置 `PORT` 时自动选择空闲端口并打印实际地址。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查、算法版本与限制 |
| POST | `/api/stem` | `{"word":"relational"}` 单词分析；`{"words":[...]}` 批量 |
| POST | `/api/group` | `{"words":[...]}` 按词干分组（保留行号与重复次数） |
| GET | `/api/trace/:word` | 查看某词的规则路径 |
| GET | `/api/history` | 历史批次列表 |
| GET | `/api/history/:id` | 批次详情（含每词规则轨迹） |
| GET | `/api/history/:id/export?format=json\|csv` | 导出 |
| POST | `/api/history/:id/recompute` | 按当前算法版本复算并与存储结果比较（不改写报告） |

### 错误码

`INVALID_CHARACTERS`（含非字母字符）、`EMPTY_WORD`、`WORD_TOO_LONG`、`EMPTY_BATCH`、
`INVALID_BATCH`、`BATCH_TOO_LARGE`、`INVALID_JSON`、`INVALID_FORMAT`、`BATCH_NOT_FOUND`、
`NOT_FOUND`、`INTERNAL_ERROR`。批量请求中非法词逐条报错，不影响同批其他词。

### 解释输出

每个词的 `trace` 数组按阶段列出：阶段（step）、命中后缀、替换串、条件描述与取值
（如 `m=1`、`hasVowel(hopp)=true`）、是否执行替换、前后词形；条件不满足时给出简要原因
（如“词干 measure 为 0，不替换”），不输出逐字符日志。

## 持久化

SQLite 保存：批次输入快照（原始行）、算法版本、每词结果与完整规则轨迹。
同一批次重复读取不会改写报告；服务重启后可用 `recompute` 按原版本复算并比较一致性。

## 测试

`npm test` 覆盖：原论文代表性词对（caresses、ponies、cats、hopping、filing、relational 等 70+ 组）、
measure 与 `*v*`/`*d`/`*o` 条件函数、条件不满足时不执行替换（如 feed/sing/rate/roll）、
大小写保留、非法输入逐条报错、批次顺序与重复行号、分组与误归并示例、CSV 导出、
以及关闭并重开数据库后的持久化与复算一致性。
