import fs from "node:fs";
import path from "node:path";
import { Store } from "./store.js";
import { analyzeWords, groupByStem, toCsv, ALGO_VERSION } from "./analyze.js";
import { validateWord, validateBatch, MAX_WORD_LENGTH, MAX_BATCH_SIZE } from "./validate.js";
import { StemResult } from "./porter.js";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

function printTrace(o: { input: string; stem?: string; trace?: StemResult["trace"]; error?: { message: string } }) {
  if (o.error) {
    console.log(`  错误: ${o.error.message}`);
    return;
  }
  console.log(`  ${o.input} -> ${o.stem}`);
  for (const t of o.trace ?? []) {
    const mark = t.applied ? "✓" : "✗";
    console.log(`    [${t.step}] ${mark} 后缀 -${t.suffix || "(无)"} -> "${t.replacement}" | 条件 ${t.condition} (${t.conditionValue}) | ${t.before} -> ${t.after}${t.reason ? ` | ${t.reason}` : ""}`);
  }
}

function readWordsFromFile(file: string): string[] {
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function fail(code: string, message: string): never {
  console.error(`错误 [${code}]: ${message}`);
  process.exit(1);
}

const [, , cmd, ...args] = process.argv;

function usage(): never {
  console.log(`porter-stemmer CLI (算法版本 ${ALGO_VERSION})
用法:
  node dist/src/cli.js analyze <word...>     分析单词并显示规则轨迹
  node dist/src/cli.js batch <file>          从文件批量提取词干（每行一个词）
  node dist/src/cli.js group <word...>       按词干分组（或用 --file <file>）
  node dist/src/cli.js trace <word>          查看单词的规则路径
  node dist/src/cli.js history               列出历史批次
  node dist/src/cli.js show <batchId>        查看批次详情
  node dist/src/cli.js export <batchId> [json|csv]   导出批次
  node dist/src/cli.js recompute <batchId>   按当前算法版本复算并比较
  node dist/src/cli.js serve [port]          启动 HTTP 服务（默认自动选择空闲端口）
限制: 单词最长 ${MAX_WORD_LENGTH} 字符，批量最多 ${MAX_BATCH_SIZE} 个`);
  process.exit(0);
}

if (!cmd) usage();

const store = new Store(path.join(DATA_DIR, "stems.db"));

try {
  switch (cmd) {
    case "analyze":
    case "trace": {
      if (args.length === 0) fail("MISSING_ARGUMENT", "请提供至少一个单词");
      const { outcomes } = analyzeWords(args);
      for (const o of outcomes) printTrace(o);
      break;
    }
    case "batch": {
      const file = args[0];
      if (!file) fail("MISSING_ARGUMENT", "请提供输入文件路径");
      const words = readWordsFromFile(file);
      const bErr = validateBatch(words);
      if (bErr) fail(bErr.code, bErr.message);
      const { outcomes, results } = analyzeWords(words);
      const batchId = store.saveBatch(words, results);
      console.log(`批次 #${batchId} 已保存，共 ${words.length} 个词`);
      for (const o of outcomes) {
        if (o.error) console.log(`  行 ${o.line}: ${o.input} -> 错误 [${o.error.code}] ${o.error.message}`);
        else console.log(`  行 ${o.line}: ${o.input} -> ${o.stem}`);
      }
      break;
    }
    case "group": {
      let words: string[];
      const fi = args.indexOf("--file");
      if (fi >= 0) {
        words = readWordsFromFile(args[fi + 1]);
      } else {
        words = args;
      }
      const bErr = validateBatch(words);
      if (bErr) fail(bErr.code, bErr.message);
      const { outcomes, results } = analyzeWords(words);
      const batchId = store.saveBatch(words, results);
      const { groups, errors } = groupByStem(outcomes);
      console.log(`批次 #${batchId}（分组仅按相同词干，不代表含义相同）`);
      for (const g of groups) {
        console.log(`  ${g.stem} (${g.count}): ${g.members.map((m) => `#${m.line} ${m.input}`).join(", ")}`);
      }
      for (const e of errors) {
        console.log(`  行 ${e.line}: ${e.input} -> 错误 [${e.error!.code}]`);
      }
      break;
    }
    case "history": {
      const batches = store.listBatches();
      if (batches.length === 0) console.log("暂无历史批次");
      for (const b of batches) console.log(`  #${b.id}  ${b.createdAt}  ${b.algoVersion}  ${b.count} 词`);
      break;
    }
    case "show": {
      const id = Number(args[0]);
      const batch = store.getBatch(id);
      if (!batch) fail("BATCH_NOT_FOUND", `批次 ${args[0]} 不存在`);
      console.log(`批次 #${batch.id}  ${batch.createdAt}  算法版本 ${batch.algoVersion}`);
      for (const w of batch.words) {
        if (w.error) console.log(`  行 ${w.line}: ${w.input} -> 错误 [${w.error}]`);
        else console.log(`  行 ${w.line}: ${w.input} -> ${w.stem}`);
      }
      break;
    }
    case "export": {
      const id = Number(args[0]);
      const format = args[1] ?? "json";
      const batch = store.getBatch(id);
      if (!batch) fail("BATCH_NOT_FOUND", `批次 ${args[0]} 不存在`);
      if (format === "csv") {
        process.stdout.write(toCsv(batch.words.map((w) => ({
          line: w.line, input: w.input, stem: w.stem ?? undefined,
          error: w.error ? { code: w.error, message: w.error } : undefined,
        })) as never));
      } else if (format === "json") {
        console.log(JSON.stringify(batch, null, 2));
      } else {
        fail("INVALID_FORMAT", "格式仅支持 json 或 csv");
      }
      break;
    }
    case "recompute": {
      const id = Number(args[0]);
      const r = store.recompute(id);
      if (!r) fail("BATCH_NOT_FOUND", `批次 ${args[0]} 不存在`);
      console.log(`批次 #${r.batchId}: 存储版本 ${r.storedVersion}, 当前版本 ${r.currentVersion}`);
      if (r.mismatches.length === 0) console.log("  复算结果一致 ✓");
      else for (const m of r.mismatches) console.log(`  行 ${m.line}: ${m.input} 存储=${m.stored} 复算=${m.recomputed}`);
      break;
    }
    case "serve": {
      const port = args[0] ?? "";
      const env = port ? `PORT=${port} ` : "";
      console.log(`请运行: ${env}node dist/src/server.js`);
      break;
    }
    default:
      usage();
  }
} finally {
  store.close();
}
