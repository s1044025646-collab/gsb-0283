import { test } from "node:test";
import assert from "node:assert/strict";
import { stem, measure, hasVowel, endsDoubleConsonant, endsCVC, ALGO_VERSION } from "../src/porter.js";

// ---- 原算法代表性词对（Porter 1980 论文示例） ----
const PAIRS: [string, string][] = [
  ["caresses", "caress"],
  ["ponies", "poni"],
  ["ties", "ti"],
  ["caress", "caress"],
  ["cats", "cat"],
  ["feed", "feed"],
  ["agreed", "agre"],
  ["plastered", "plaster"],
  ["bled", "bled"],
  ["motoring", "motor"],
  ["sing", "sing"],
  ["conflated", "conflat"],
  ["troubled", "troubl"],
  ["sized", "size"],
  ["hopping", "hop"],
  ["tanned", "tan"],
  ["falling", "fall"],
  ["hissing", "hiss"],
  ["fizzed", "fizz"],
  ["failing", "fail"],
  ["filing", "file"],
  ["happy", "happi"],
  ["sky", "sky"],
  ["relational", "relat"],
  ["conditional", "condit"],
  ["rational", "ration"],
  ["valenci", "valenc"],
  ["hesitanci", "hesit"],
  ["digitizer", "digit"],
  ["conformabli", "conform"],
  ["radicalli", "radic"],
  ["differentli", "differ"],
  ["vileli", "vile"],
  ["analogousli", "analog"],
  ["vietnamization", "vietnam"],
  ["predication", "predic"],
  ["operator", "oper"],
  ["feudalism", "feudal"],
  ["decisiveness", "decis"],
  ["hopefulness", "hope"],
  ["callousness", "callous"],
  ["formaliti", "formal"],
  ["sensitiviti", "sensit"],
  ["sensibiliti", "sensibl"],
  ["triplicate", "triplic"],
  ["formative", "form"],
  ["formalize", "formal"],
  ["electriciti", "electr"],
  ["electrical", "electr"],
  ["hopeful", "hope"],
  ["goodness", "good"],
  ["revival", "reviv"],
  ["allowance", "allow"],
  ["inference", "infer"],
  ["airliner", "airlin"],
  ["gyroscopic", "gyroscop"],
  ["adjustable", "adjust"],
  ["defensible", "defens"],
  ["irritant", "irrit"],
  ["replacement", "replac"],
  ["adjustment", "adjust"],
  ["dependent", "depend"],
  ["adoption", "adopt"],
  ["homologou", "homolog"],
  ["communism", "commun"],
  ["activate", "activ"],
  ["angulariti", "angular"],
  ["homologous", "homolog"],
  ["effective", "effect"],
  ["bowdlerize", "bowdler"],
  ["probate", "probat"],
  ["rate", "rate"],
  ["cease", "ceas"],
  ["controll", "control"],
  ["roll", "roll"],
];

test("Porter 1980 代表性词对", () => {
  for (const [input, expected] of PAIRS) {
    assert.equal(stem(input).stem, expected, `${input} 应为 ${expected}`);
  }
});

test("短词不被过度处理", () => {
  assert.equal(stem("a").stem, "a");
  assert.equal(stem("be").stem, "be");
  assert.equal(stem("sky").stem, "sky");
  assert.equal(stem("s").stem, ""); // 1a 规则对单字母 s 也去尾，符合原算法
  assert.equal(stem("is").stem, "i");
});

test("大小写：计算用小写，输出小写词干，输入原文保留", () => {
  const r = stem("Hopping");
  assert.equal(r.input, "Hopping");
  assert.equal(r.normalized, "hopping");
  assert.equal(r.stem, "hop");
  assert.equal(stem("CARESSES").stem, "caress");
});

// ---- measure 与条件函数单元测试 ----
test("measure: [C](VC)^m[V]", () => {
  assert.equal(measure("tr"), 0);     // m=0: TR
  assert.equal(measure("ee"), 0);     // m=0: EE
  assert.equal(measure("tree"), 0);   // m=0: TREE
  assert.equal(measure("y"), 0);      // m=0: Y
  assert.equal(measure("by"), 0);     // m=0: BY
  assert.equal(measure("troubl"), 1); // m=1
  assert.equal(measure("oaten"), 2);
  assert.equal(measure("privat"), 2);
  assert.equal(measure("orr"), 1);
  assert.equal(measure("troubl") + measure(""), 1);
  assert.equal(measure("probat"), 2); // m=2
  assert.equal(measure("respons"), 2);
  assert.equal(measure("sensibl") - 1, 1);
  assert.equal(measure("sensitiv"), 3); // m=3
});

test("hasVowel / endsDoubleConsonant / endsCVC", () => {
  assert.equal(hasVowel("tr"), false);
  assert.equal(hasVowel("tap"), true);
  assert.equal(hasVowel("sy"), true); // y 在辅音后作元音
  assert.equal(endsDoubleConsonant("hopp"), true);
  assert.equal(endsDoubleConsonant("hop"), false);
  assert.equal(endsDoubleConsonant("funn"), true);
  assert.equal(endsCVC("hop"), true);
  assert.equal(endsCVC("fil"), true);
  assert.equal(endsCVC("snow"), false); // w 结尾不算
  assert.equal(endsCVC("box"), false);  // x 结尾不算
  assert.equal(endsCVC("toy"), false);  // y 结尾不算
  assert.equal(endsCVC("hopp"), false);
});

// ---- 条件不满足时不执行替换 ----
test("eed 条件 m>0：feed 不变，agreed 变", () => {
  const feed = stem("feed");
  assert.equal(feed.stem, "feed");
  const t = feed.trace.find((x) => x.suffix === "eed");
  assert.ok(t && !t.applied);
  const agreed = stem("agreed");
  assert.equal(agreed.stem, "agre");
  assert.ok(agreed.trace.find((x) => x.suffix === "eed")!.applied);
});

test("ed/ing 需词干含元音：sing 不去 ing，bled 不去 ed", () => {
  assert.equal(stem("sing").stem, "sing");
  assert.equal(stem("bled").stem, "bled");
  const sing = stem("sing");
  const t = sing.trace.find((x) => x.suffix === "ing");
  assert.ok(t && !t.applied && t.reason);
});

test("step2 条件 m>0：短词不触发", () => {
  // "abcational" 之类构造词：词干无元音序列不足
  const r = stem("relational");
  assert.equal(r.stem, "relat");
  const t2 = r.trace.find((x) => x.step === "2");
  assert.ok(t2 && t2.applied && t2.suffix === "ational");
  // 反例：后缀存在但词干 m=0
  const fake = stem("trational");
  const t = fake.trace.find((x) => x.step === "2");
  assert.ok(!t || !t.applied);
});

test("step4 ion 需 s/t 前缀：adoption 去 ion，但非 s/t 不去", () => {
  assert.equal(stem("adoption").stem, "adopt");
  // "abion"：词干 ab m=1 不满足 m>1，不去
  const r = stem("abion");
  const t = r.trace.find((x) => x.step === "4");
  assert.ok(!t || !t.applied);
});

test("step5a 末尾 e：rate 保留 e（m=1 且 *o），probate 去掉", () => {
  const rate = stem("rate");
  assert.equal(rate.stem, "rate");
  const t = rate.trace.find((x) => x.step === "5a");
  assert.ok(t && !t.applied);
  assert.equal(stem("probate").stem, "probat");
  assert.equal(stem("cease").stem, "ceas");
});

test("step5b 双写 l：controll -> control，roll 不变", () => {
  assert.equal(stem("controll").stem, "control");
  assert.equal(stem("roll").stem, "roll");
});

test("1b 调整规则：hopping->hop, filing->file, conflated->conflate 再去 e", () => {
  assert.equal(stem("hopping").stem, "hop");
  assert.equal(stem("filing").stem, "file");
  assert.equal(stem("conflated").stem, "conflat");
  assert.equal(stem("troubled").stem, "troubl");
  assert.equal(stem("hissing").stem, "hiss"); // ss 双写但 s 例外
  assert.equal(stem("falling").stem, "fall"); // ll 双写但 l 例外
});

test("y 的身份依赖位置：happy->happi, sky->sky, syzygy 类", () => {
  assert.equal(stem("happy").stem, "happi");
  assert.equal(stem("sky").stem, "sky");
  assert.equal(hasVowel("sy"), true);
  assert.equal(hasVowel("y"), false); // 词首 y 为辅音
});

test("轨迹包含阶段与前后词形", () => {
  const r = stem("relational");
  assert.ok(r.trace.length >= 2);
  for (const t of r.trace) {
    assert.ok(t.step && t.before !== undefined && t.after !== undefined);
    assert.ok(typeof t.applied === "boolean");
  }
  assert.equal(r.trace[0].before, "relational");
});

test("算法版本常量", () => {
  assert.equal(ALGO_VERSION, "porter-1980");
});
