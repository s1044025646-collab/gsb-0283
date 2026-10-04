import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { ALGO_VERSION, stem, StemResult } from "./porter.js";

export interface WordRecord {
  line: number;
  input: string;
  normalized: string | null;
  stem: string | null;
  error: string | null;
  trace: unknown;
}

export interface BatchRecord {
  id: number;
  createdAt: string;
  algoVersion: string;
  words: WordRecord[];
}

export class Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        algo_version TEXT NOT NULL,
        input_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES batches(id),
        line_no INTEGER NOT NULL,
        input TEXT NOT NULL,
        normalized TEXT,
        stem TEXT,
        error TEXT,
        trace_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_results_batch ON results(batch_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  saveBatch(inputs: string[], results: (StemResult | { error: string })[]): number {
    const insertBatch = this.db.prepare(
      "INSERT INTO batches (created_at, algo_version, input_json) VALUES (?, ?, ?)"
    );
    const insertResult = this.db.prepare(
      "INSERT INTO results (batch_id, line_no, input, normalized, stem, error, trace_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const info = insertBatch.run(new Date().toISOString(), ALGO_VERSION, JSON.stringify(inputs));
    const batchId = Number(info.lastInsertRowid);
    results.forEach((r, i) => {
      if ("error" in r) {
        insertResult.run(batchId, i + 1, inputs[i], null, null, r.error, null);
      } else {
        insertResult.run(batchId, i + 1, r.input, r.normalized, r.stem, null, JSON.stringify(r.trace));
      }
    });
    return batchId;
  }

  getBatch(id: number): BatchRecord | null {
    const batch = this.db
      .prepare("SELECT id, created_at, algo_version, input_json FROM batches WHERE id = ?")
      .get(id) as { id: number; created_at: string; algo_version: string; input_json: string } | undefined;
    if (!batch) return null;
    const rows = this.db
      .prepare("SELECT line_no, input, normalized, stem, error, trace_json FROM results WHERE batch_id = ? ORDER BY line_no")
      .all(id) as unknown as {
        line_no: number; input: string; normalized: string | null; stem: string | null;
        error: string | null; trace_json: string | null;
      }[];
    return {
      id: batch.id,
      createdAt: batch.created_at,
      algoVersion: batch.algo_version,
      words: rows.map((r) => ({
        line: r.line_no,
        input: r.input,
        normalized: r.normalized,
        stem: r.stem,
        error: r.error,
        trace: r.trace_json ? JSON.parse(r.trace_json) : null,
      })),
    };
  }

  listBatches(limit = 50): { id: number; createdAt: string; algoVersion: string; count: number }[] {
    const rows = this.db
      .prepare(
        `SELECT b.id, b.created_at, b.algo_version, COUNT(r.id) AS count
         FROM batches b LEFT JOIN results r ON r.batch_id = b.id
         GROUP BY b.id ORDER BY b.id DESC LIMIT ?`
      )
      .all(limit) as unknown as { id: number; created_at: string; algo_version: string; count: number }[];
    return rows.map((r) => ({ id: r.id, createdAt: r.created_at, algoVersion: r.algo_version, count: r.count }));
  }

  // 重启后按当前算法版本复算并与存储结果比较；不改写已保存的报告
  recompute(id: number): { batchId: number; storedVersion: string; currentVersion: string; mismatches: { line: number; input: string; stored: string | null; recomputed: string }[] } | null {
    const batch = this.getBatch(id);
    if (!batch) return null;
    const mismatches: { line: number; input: string; stored: string | null; recomputed: string }[] = [];
    for (const w of batch.words) {
      if (w.error) continue;
      const recomputed = stem(w.input).stem;
      if (recomputed !== w.stem) {
        mismatches.push({ line: w.line, input: w.input, stored: w.stem, recomputed });
      }
    }
    return { batchId: id, storedVersion: batch.algoVersion, currentVersion: ALGO_VERSION, mismatches };
  }
}
