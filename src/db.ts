import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { ALGO_VERSION, StemResult } from "./porter";
import { WordError } from "./validate";

export interface ItemInput {
  lineNo: number;
  input: string;
}

export interface ItemRecord {
  id: number;
  batchId: number;
  lineNo: number;
  input: string;
  normalized: string | null;
  status: "ok" | "error";
  errorCode: string | null;
  errorMessage: string | null;
  stem: string | null;
  trace: StemResult["traces"] | null;
  dupCount: number;
}

export interface BatchRecord {
  id: number;
  createdAt: string;
  algoVersion: string;
  itemCount: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  algo_version TEXT NOT NULL,
  item_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  line_no INTEGER NOT NULL,
  input TEXT NOT NULL,
  normalized TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  stem TEXT,
  trace_json TEXT,
  dup_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_items_batch ON items(batch_id);
CREATE INDEX IF NOT EXISTS idx_items_stem ON items(stem);
`;

export class Store {
  private db: DatabaseSync;
  readonly dbPath: string;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.dbPath = path.join(dataDir, "porter.db");
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /** 保存一个批次：输入快照 + 每词结果与规则轨迹。 */
  saveBatch(results: Array<{
    lineNo: number;
    input: string;
    result: StemResult | null;
    error: WordError | null;
  }>): BatchRecord {
    const createdAt = new Date().toISOString();
    const insertBatch = this.db.prepare(
      "INSERT INTO batches (created_at, algo_version, item_count) VALUES (?, ?, ?)"
    );
    const insertItem = this.db.prepare(
      `INSERT INTO items
       (batch_id, line_no, input, normalized, status, error_code, error_message, stem, trace_json, dup_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const batchInfo = insertBatch.run(createdAt, ALGO_VERSION, results.length);
    const batchId = Number(batchInfo.lastInsertRowid);
    // 同批次内重复输入：保留首条行号记录，累加重复次数，不丢失输入记录
    const seen = new Map<string, number>(); // input(lower) -> item id
    for (const r of results) {
      const key = r.input.toLowerCase();
      const existing = seen.get(key);
      if (existing !== undefined) {
        this.db.prepare("UPDATE items SET dup_count = dup_count + 1 WHERE id = ?").run(existing);
        // 仍记录一条重复出现，保证行号可追溯
      }
      const info = insertItem.run(
        batchId,
        r.lineNo,
        r.input,
        r.result ? r.result.normalized : null,
        r.error ? "error" : "ok",
        r.error ? r.error.code : null,
        r.error ? r.error.message : null,
        r.result ? r.result.stem : null,
        r.result ? JSON.stringify(r.result.traces) : null
      );
      if (existing === undefined) {
        seen.set(key, Number(info.lastInsertRowid));
      }
    }
    return { id: batchId, createdAt, algoVersion: ALGO_VERSION, itemCount: results.length };
  }

  getBatch(id: number): BatchRecord | null {
    const row = this.db.prepare(
      "SELECT id, created_at AS createdAt, algo_version AS algoVersion, item_count AS itemCount FROM batches WHERE id = ?"
    ).get(id) as BatchRecord | undefined;
    return row ?? null;
  }

  getItems(batchId: number): ItemRecord[] {
    const rows = this.db.prepare(
      `SELECT id, batch_id AS batchId, line_no AS lineNo, input, normalized, status,
              error_code AS errorCode, error_message AS errorMessage, stem, trace_json AS traceJson, dup_count AS dupCount
       FROM items WHERE batch_id = ? ORDER BY line_no, id`
    ).all(batchId) as unknown as Array<Omit<ItemRecord, "trace"> & { traceJson: string | null }>;
    return rows.map((r) => ({
      ...r,
      trace: r.traceJson ? JSON.parse(r.traceJson) : null,
    }));
  }

  listBatches(limit: number): BatchRecord[] {
    return this.db.prepare(
      "SELECT id, created_at AS createdAt, algo_version AS algoVersion, item_count AS itemCount FROM batches ORDER BY id DESC LIMIT ?"
    ).all(limit) as unknown as BatchRecord[];
  }

  /** 按词干分组（仅 ok 项）。 */
  groupByStem(batchId: number): Array<{ stem: string; items: Array<{ lineNo: number; input: string; dupCount: number }> }> {
    const items = this.getItems(batchId).filter((i) => i.status === "ok" && i.stem !== null);
    const groups = new Map<string, Array<{ lineNo: number; input: string; dupCount: number }>>();
    for (const item of items) {
      const list = groups.get(item.stem!) ?? [];
      list.push({ lineNo: item.lineNo, input: item.input, dupCount: item.dupCount });
      groups.set(item.stem!, list);
    }
    return [...groups.entries()].map(([stem, members]) => ({ stem, items: members }));
  }
}
