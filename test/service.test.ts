import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Store } from "../src/db";
import { runBatch, verifyBatch } from "../src/service";
import { validateWord } from "../src/validate";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "porter-test-"));
}

test("非法输入逐条报错", () => {
  assert.equal(validateWord("cat2")?.code, "NON_ASCII_LETTER");
  assert.equal(validateWord("well-known")?.code, "NON_ASCII_LETTER");
  assert.equal(validateWord("don't")?.code, "NON_ASCII_LETTER");
  assert.equal(validateWord("")?.code, "EMPTY_INPUT");
  assert.equal(validateWord("a".repeat(65))?.code, "WORD_TOO_LONG");
  assert.equal(validateWord("cats"), null);
});

test("批次顺序保留 + 重复输入保留行号与次数", () => {
  const store = new Store(tmpDir());
  const out = runBatch(store, ["cats", "Hopping", "cats", "bad-word", "CATS"]);
  assert.equal(out.items.length, 5);
  assert.deepEqual(out.items.map((i) => i.input), ["cats", "Hopping", "cats", "bad-word", "CATS"]);
  assert.equal(out.items[3].status, "error");
  assert.equal(out.items[3].error?.code, "NON_ASCII_LETTER");
  const items = store.getItems(out.batchId);
  assert.equal(items.length, 5);
  const first = items.find((i) => i.lineNo === 1)!;
  assert.equal(first.dupCount, 3); // cats/cats/CATS 归一化后相同
  store.close();
});

test("重启持久化与复算一致", () => {
  const dir = tmpDir();
  let store = new Store(dir);
  const out = runBatch(store, ["relational", "ponies", "caresses"]);
  store.close();
  store = new Store(dir);
  const batch = store.getBatch(out.batchId);
  assert.ok(batch);
  const verify = verifyBatch(store, out.batchId);
  assert.equal(verify.total, 3);
  assert.equal(verify.mismatches.length, 0);
  assert.equal(verify.algoVersion, verify.storedVersion);
  const groups = store.groupByStem(out.batchId);
  assert.ok(groups.some((g) => g.stem === "poni"));
  store.close();
});

test("同词干归并与误归并风险示例", () => {
  const store = new Store(tmpDir());
  const related = runBatch(store, ["relational", "relate", "relation", "relations"]);
  const stems = new Set(related.items.map((i) => i.result?.stem));
  assert.ok(stems.size <= 2);
  const risky = runBatch(store, ["universe", "university"]);
  assert.equal(risky.items[0].result?.stem, risky.items[1].result?.stem);
  store.close();
});
