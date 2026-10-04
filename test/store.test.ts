import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";
import { analyzeWords } from "../src/analyze.js";

function tmpDb(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "porter-")), "test.db");
}

test("持久化：保存后重开数据库可读取且复算一致（模拟重启）", () => {
  const dbPath = tmpDb();
  const words = ["caresses", "ponies", "hopping", "relational", "bad-word"];
  const { results } = analyzeWords(words);

  const s1 = new Store(dbPath);
  const id = s1.saveBatch(words, results);
  s1.close();

  // “重启”：重新打开同一数据库
  const s2 = new Store(dbPath);
  const batch = s2.getBatch(id)!;
  assert.equal(batch.algoVersion, "porter-1980");
  assert.equal(batch.words.length, 5);
  assert.equal(batch.words[0].stem, "caress");
  assert.equal(batch.words[1].stem, "poni");
  assert.equal(batch.words[2].stem, "hop");
  assert.equal(batch.words[3].stem, "relat");
  assert.ok(batch.words[4].error);
  assert.ok(Array.isArray(batch.words[0].trace) && (batch.words[0].trace as unknown[]).length > 0);

  const r = s2.recompute(id)!;
  assert.equal(r.mismatches.length, 0);
  s2.close();
});

test("同一批次重复读取不改写报告", () => {
  const dbPath = tmpDb();
  const s = new Store(dbPath);
  const { results } = analyzeWords(["cats"]);
  const id = s.saveBatch(["cats"], results);
  const a = JSON.stringify(s.getBatch(id));
  const b = JSON.stringify(s.getBatch(id));
  assert.equal(a, b);
  assert.equal(s.listBatches().length, 1);
  s.close();
});

test("历史列表按时间倒序", () => {
  const dbPath = tmpDb();
  const s = new Store(dbPath);
  const { results } = analyzeWords(["cats"]);
  s.saveBatch(["cats"], results);
  s.saveBatch(["dogs"], analyzeWords(["dogs"]).results);
  const list = s.listBatches();
  assert.equal(list.length, 2);
  assert.ok(list[0].id > list[1].id);
  s.close();
});
