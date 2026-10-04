import * as fs from "node:fs";
import * as path from "node:path";
import { Store } from "./db";
import { runBatch, verifyBatch } from "./service";
import { stemWithTrace, ALGO_VERSION } from "./porter";
import { MAX_BATCH_SIZE, MAX_WORD_LENGTH } from "./validate";

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, "..", "..", "data");

function printJson(v: unknown): void {
  console.log(JSON.stringify(v, null, 2));
}

function usage(): void {
  console.log(`Porter 词干提取 CLI（算法版本 ${ALGO_VERSION}）
用法:
  node dist/cli.js stem <word...>        分析一个或多个词（含规则轨迹）
  node dist/cli.js batch <file>          从文件批量提取（每行一个词），写入 SQLite
  node dist/cli.js groups <batchId>      按词干分组查看某批次
  node dist/cli.js trace <word>          查看单词的规则路径
  node dist/cli.js history [limit]       查看历史批次
  node dist/cli.js export <batchId> [json|csv]  导出批次结果
  node dist/cli.js verify <batchId>      按当前算法版本复算并比较
限制: 单词最长 ${MAX_WORD_LENGTH}，批量最多 ${MAX_BATCH_SIZE}`);
}

function main(): void {
  const [cmd, ...args] = process.argv.slice(2);
  const store = new Store(DATA_DIR);
  try {
    switch (cmd) {
      case "stem": {
        if (args.length === 0) throw new Error("请提供至少一个词");
        const out = runBatch(store, args);
        printJson(out);
        break;
      }
      case "batch": {
        const file = args[0];
        if (!file) throw new Error("请提供词表文件路径");
        const words = fs.readFileSync(file, "utf-8")
          .split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        printJson(runBatch(store, words));
        break;
      }
      case "groups": {
        const batchId = Number(args[0]);
        if (!store.getBatch(batchId)) throw new Error(`批次 ${batchId} 不存在`);
        printJson({
          note: "仅按本算法的相同词干分组，不保证同组词含义相同。",
          groups: store.groupByStem(batchId),
        });
        break;
      }
      case "trace": {
        if (!args[0]) throw new Error("请提供一个词");
        printJson(stemWithTrace(args[0]));
        break;
      }
      case "history": {
        printJson(store.listBatches(args[0] ? Number(args[0]) : 20));
        break;
      }
      case "export": {
        const batchId = Number(args[0]);
        if (!store.getBatch(batchId)) throw new Error(`批次 ${batchId} 不存在`);
        const items = store.getItems(batchId);
        const format = args[1] ?? "json";
        if (format === "csv") {
          console.log("line_no,input,status,stem,error_code,dup_count");
          for (const i of items) {
            console.log([i.lineNo, i.input, i.status, i.stem ?? "", i.errorCode ?? "", i.dupCount].join(","));
          }
        } else {
          printJson({ batchId, algoVersion: ALGO_VERSION, items });
        }
        break;
      }
      case "verify": {
        printJson(verifyBatch(store, Number(args[0])));
        break;
      }
      default:
        usage();
        process.exitCode = cmd ? 1 : 0;
    }
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    store.close();
  }
}

main();
