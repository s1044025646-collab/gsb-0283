# Porter 词干提取与逐规则解释服务（本地后端）

基于 **Porter 1980 原版算法** 的英文词干分析后端，仅提供 API 与 CLI，无前端。
使用 TypeScript + Node.js + SQLite（`node:sqlite`，零运行时依赖），Windows 本地直接运行。

## 算法版本与来源

- 版本标识：`porter-1980-1.0.0`（见 `src/porter.ts` 的 `ALGO_VERSION`，随结果与批次一并存储）
- 来源：M.F. Porter, *An algorithm for suffix stripping*, Program, 14(3): 130-137, 1980
- 实现的是论文原始规则表（Step 1a/1b/1c、2、3、4、5a/5b），**不是** Snowball English / Porter2，
  也未采用后续修订（如 `abli`→`bli`、`logi`→`log` 等增补不在本版本内）
- 不下载语料或语言模型，不查询在线词典，不做拼写纠错、词性推断或语义相似度

### 规则表（按阶段，条件均对剥离后缀后的词干求值）

| 阶段 | 规则（条件 → 后缀 → 替换） |
|------|----------------------------|
| 1a | `sses→ss`, `ies→i`, `ss→ss`, `s→''` |
| 1b | `(m>0) eed→ee`；`(*v*) ed→''`；`(*v*) ing→''`；移除 ed/ing 后：`at→ate`, `bl→ble`, `iz→ize`，或 `*d 且非 l/s/z 结尾 → 去尾字母`，或 `(m=1 且 *o) → 补 e` |
| 1c | `(*v*) y→i` |
| 2  | `(m>0) ational→ate, tional→tion, enci→ence, anci→ance, izer→ize, abli→able, alli→al, entli→ent, eli→e, ousli→ous, ization→ize, ation→ate, ator→ate, alism→al, iveness→ive, fulness→ful, ousness→ous, aliti→al, iviti→ive, biliti→ble` |
| 3  | `(m>0) icate→ic, ative→'', alize→al, iciti→ic, ical→ic, ful→'', ness→''` |
| 4  | `(m>1) al, ance, ence, er, ic, able, ible, ant, ement, ment, ent, ion(词干须以 s/t 结尾), ou, ism, ate, iti, ous, ive, ize → ''` |
| 5a | `(m>1) e→''`；`(m=1 且非 *o) e→''` |
| 5b | `(m>1 且 *d 且以 l 结尾) → 去尾字母` |

记号：`m` 为 measure（`[C](VC)^m[V]` 中的 m）；`*v*` 词干含元音；`*d` 以双辅音结尾；
`*o` 以 cvc 结尾且末字母非 w/x/y。`y` 是元音还是辅音取决于位置与前一字符（词首为辅音，辅音后为元音）。
每阶段最长后缀优先，命中一条即终止该阶段，不循环套用。长度 ≤ 2 的词不处理。

## 重要说明

- **词干未必是词典中的真实单词，也不等于词形还原（lemmatization）**。例如 `ponies→poni`、`relational→relat`。
- 分组仅按本算法的相同词干归并，**不保证同组词含义相同**。规则算法存在误归并风险，
  例如 `universe` 与 `university` 词干均为 `univers`，但语义无关。
- 输入保留原始大小写，计算统一使用小写。

## 支持范围与限制

- 仅接受 ASCII 英文字母（`A-Za-z`）；数字、连字符、撇号、空格等逐条报错，不中断整批
- 单词最长 64 字符；单批最多 1000 词
- 长度 ≤ 2 的词原样返回
- 重复输入：每次出现都保留行号记录，首条记录累计 `dupCount`

## 错误码

`EMPTY_INPUT`（空输入）、`NON_ASCII_LETTER`（含非字母字符）、`WORD_TOO_LONG`、
`BATCH_TOO_LARGE`、`INVALID_JSON`、`INVALID_PARAM`、`NOT_FOUND`、`INTERNAL_ERROR`

## 构建 / 测试 / 启动 / 演示

```powershell
npm install        # 仅需开发依赖 typescript / @types/node
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试（node:test）
npm start          # 启动服务，默认绑定 127.0.0.1 的空闲端口
$env:PORT=8080; npm start   # 指定端口
npm run demo       # 端到端演示：起服务、调 API、打印结果
```

数据目录默认为项目内 `data/`（可用环境变量 `DATA_DIR` 覆盖），SQLite 文件为 `data/porter.db`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/meta` | 算法版本、限制与说明 |
| POST | `/api/stem` | `{word}` 单词分析（含规则轨迹）；`{words:[...]}` 等价批量 |
| POST | `/api/batch` | `{words:[...]}` 批量提取，写入 SQLite，返回 `batchId` |
| GET  | `/api/batches/:id/groups` | 按词干分组（含行号与重复次数） |
| GET  | `/api/trace/:word` | 查看单词的规则路径 |
| GET  | `/api/batches/:id/verify` | 按当前算法版本复算并与存储结果比较 |
| GET  | `/api/batches/:id/export?format=json\|csv` | 导出批次 |
| GET  | `/api/history?limit=20` | 历史批次 |

轨迹条目字段：`stage`（阶段）、`suffix`（命中后缀）、`replacement`、`condition` / `conditionValue`
（条件与求值结果）、`before` / `after`（前后词形）、`applied`（是否执行替换）、`note`（简要原因）。

## CLI

```powershell
node dist/src/cli.js stem caresses ponies Hopping   # 单词分析（含轨迹）
node dist/src/cli.js batch words.txt                # 文件批量（每行一词）
node dist/src/cli.js groups 1                       # 按词干分组
node dist/src/cli.js trace relational               # 规则路径
node dist/src/cli.js history 10                     # 历史批次
node dist/src/cli.js export 1 csv                   # 导出 CSV（默认 json）
node dist/src/cli.js verify 1                       # 重启后复算比较
```

## 测试

`test/porter.test.ts` 覆盖论文代表性词对（caresses、ponies、cats、hopping、filing、relational 等
约 60 组）、measure 与 `*v*`/`*d`/`*o` 条件函数、y 的身份、条件不满足时不替换、短词、大小写；
`test/service.test.ts` 覆盖非法输入逐条报错、批次顺序、重复输入行号与次数、重启持久化与复算一致、
同词干归并与误归并示例。

## 已知限制

- 仅实现 1980 原版规则表，未包含后续增补规则；与 Porter2/Snowball 结果可能不同
- 规则算法无语义：会过度归并（universe/university）或归并不足（如不规则变形）
- 仅本地单进程服务，无鉴权，绑定 `127.0.0.1`
