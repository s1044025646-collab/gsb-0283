import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWord, validateBatch, MAX_BATCH_SIZE, MAX_WORD_LENGTH } from "../src/validate.js";
import { analyzeWords, groupByStem, toCsv } from "../src/analyze.js";

test("非法输入逐条报错", () => {
  assert.equal(validateWord("hello"), null);
  assert.equal(validateWord("Hello"), null);
  assert.equal(validateWord("abc123")?.code, "INVALID_CHARACTERS");
  assert.equal(validateWord("well-known")?.code, "INVALID_CHARACTERS");
  assert.equal(validateWord("café")?.code, "INVALID_CHARACTERS");
  assert.equal(validateWord("")?.code, "EMPTY_WORD");
  assert.equal(validateWord("a".repeat(MAX_WORD_LENGTH + 1))?.code, "WORD_TOO_LONG");
  assert.equal(validateWord(42 as unknown as string)?.code, "EMPTY_WORD");
});

test("批量限制", () => {
  assert.equal(validateBatch(["a", "b"]), null);
  assert.equal(validateBatch([])?.code, "EMPTY_BATCH");
  assert.equal(validateBatch("nope")?.code, "INVALID_BATCH");
  assert.equal(validateBatch(Array(MAX_BATCH_SIZE + 1).fill("a"))?.code, "BATCH_TOO_LARGE");
});

test("批次顺序与重复行号保留", () => {
  const words = ["cats", "Cats", "dogs", "cats"];
  const { outcomes } = analyzeWords(words);
  assert.deepEqual(outcomes.map((o) => o.line), [1, 2, 3, 4]);
  assert.deepEqual(outcomes.map((o) => o.input), words);
  assert.equal(outcomes[0].stem, "cat");
  assert.equal(outcomes[1].stem, "cat");
  assert.equal(outcomes[3].stem, "cat");
});

test("分组保留原始行号与重复次数", () => {
  const { outcomes } = analyzeWords(["caresses", "caress", "cats", "cat"]);
  const { groups } = groupByStem(outcomes);
  const caress = groups.find((g) => g.stem === "caress")!;
  assert.equal(caress.count, 2);
  assert.deepEqual(caress.members.map((m) => m.line), [1, 2]);
  const cat = groups.find((g) => g.stem === "cat")!;
  assert.equal(cat.count, 2);
});

test("误归并风险示例：意义不同的词可能同词干", () => {
  // university/universe 均归并到 univers，展示规则算法限制
  const { outcomes } = analyzeWords(["university", "universe"]);
  assert.equal(outcomes[0].stem, outcomes[1].stem);
});

test("非法词出现在批量中不影响其他词", () => {
  const { outcomes } = analyzeWords(["cats", "bad-word", "dogs"]);
  assert.equal(outcomes[0].stem, "cat");
  assert.equal(outcomes[1].error?.code, "INVALID_CHARACTERS");
  assert.equal(outcomes[2].stem, "dog");
});

test("CSV 导出含表头与全部行", () => {
  const { outcomes } = analyzeWords(["cats", "bad1"]);
  const csv = toCsv(outcomes);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "line,input,stem,error");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith("1,cats,cat,"));
  assert.ok(lines[2].includes("INVALID_CHARACTERS"));
});
