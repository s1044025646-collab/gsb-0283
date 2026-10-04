import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stem, stemWithTrace, measure, hasVowel, endsDoubleConsonant, endsCvc, isConsonant,
} from "../src/porter";

// 原论文中的代表性词对
test("paper examples step1a/1b/1c", () => {
  assert.equal(stem("caresses"), "caress");
  assert.equal(stem("ponies"), "poni");
  assert.equal(stem("ties"), "ti");
  assert.equal(stem("caress"), "caress");
  assert.equal(stem("cats"), "cat");
  assert.equal(stem("feed"), "feed");
  assert.equal(stem("agreed"), "agre");
  assert.equal(stem("plastered"), "plaster");
  assert.equal(stem("bled"), "bled");
  assert.equal(stem("motoring"), "motor");
  assert.equal(stem("sing"), "sing");
  assert.equal(stem("conflated"), "conflat");
  assert.equal(stem("troubled"), "troubl");
  assert.equal(stem("sized"), "size");
  assert.equal(stem("hopping"), "hop");
  assert.equal(stem("tanned"), "tan");
  assert.equal(stem("falling"), "fall");
  assert.equal(stem("hissing"), "hiss");
  assert.equal(stem("fizzed"), "fizz");
  assert.equal(stem("failing"), "fail");
  assert.equal(stem("filing"), "file");
  assert.equal(stem("happy"), "happi");
  assert.equal(stem("sky"), "sky");
});

test("paper examples step2-5", () => {
  assert.equal(stem("relational"), "relat");
  assert.equal(stem("conditional"), "condit");
  assert.equal(stem("rational"), "ration");
  assert.equal(stem("valenci"), "valenc");
  assert.equal(stem("hesitanci"), "hesit");
  assert.equal(stem("digitizer"), "digit");
  assert.equal(stem("conformabli"), "conform");
  assert.equal(stem("radicalli"), "radic");
  assert.equal(stem("differentli"), "differ");
  assert.equal(stem("vileli"), "vile");
  assert.equal(stem("analogousli"), "analog");
  assert.equal(stem("vietnamization"), "vietnam");
  assert.equal(stem("predication"), "predic");
  assert.equal(stem("operator"), "oper");
  assert.equal(stem("feudalism"), "feudal");
  assert.equal(stem("decisiveness"), "decis");
  assert.equal(stem("hopefulness"), "hope");
  assert.equal(stem("callousness"), "callous");
  assert.equal(stem("formaliti"), "formal");
  assert.equal(stem("sensitiviti"), "sensit");
  assert.equal(stem("sensibiliti"), "sensibl");
  assert.equal(stem("triplicate"), "triplic");
  assert.equal(stem("formative"), "form");
  assert.equal(stem("formalize"), "formal");
  assert.equal(stem("electriciti"), "electr");
  assert.equal(stem("electrical"), "electr");
  assert.equal(stem("hopeful"), "hope");
  assert.equal(stem("goodness"), "good");
  assert.equal(stem("revival"), "reviv");
  assert.equal(stem("allowance"), "allow");
  assert.equal(stem("inference"), "infer");
  assert.equal(stem("airliner"), "airlin");
  assert.equal(stem("gyroscopic"), "gyroscop");
  assert.equal(stem("adjustable"), "adjust");
  assert.equal(stem("defensible"), "defens");
  assert.equal(stem("irritant"), "irrit");
  assert.equal(stem("replacement"), "replac");
  assert.equal(stem("adjustment"), "adjust");
  assert.equal(stem("dependent"), "depend");
  assert.equal(stem("adoption"), "adopt");
  assert.equal(stem("homologou"), "homolog");
  assert.equal(stem("communism"), "commun");
  assert.equal(stem("activate"), "activ");
  assert.equal(stem("angulariti"), "angular");
  assert.equal(stem("homologous"), "homolog");
  assert.equal(stem("effective"), "effect");
  assert.equal(stem("bowdlerize"), "bowdler");
  assert.equal(stem("probate"), "probat");
  assert.equal(stem("rate"), "rate");
  assert.equal(stem("cease"), "ceas");
  assert.equal(stem("controll"), "control");
  assert.equal(stem("roll"), "roll");
});

test("measure 计算", () => {
  assert.equal(measure("tr"), 0);
  assert.equal(measure("ee"), 0);
  assert.equal(measure("tree"), 0);
  assert.equal(measure("y"), 0);
  assert.equal(measure("by"), 0);
  assert.equal(measure("trouble"), 1);
  assert.equal(measure("oaten"), 2);
  assert.equal(measure("private"), 2);
  assert.equal(measure("relat"), 2);
});

test("y 的元音/辅音身份", () => {
  assert.equal(isConsonant("syzygy", 0), true);
  assert.equal(isConsonant("syzygy", 1), false);
  assert.equal(isConsonant("toy", 2), true);
  assert.equal(measure("syzygy"), 2);
});

test("条件函数", () => {
  assert.equal(hasVowel("tr"), false);
  assert.equal(hasVowel("trouble"), true);
  assert.equal(endsDoubleConsonant("hopp"), true);
  assert.equal(endsDoubleConsonant("hope"), false);
  assert.equal(endsCvc("hop"), true);
  assert.equal(endsCvc("snow"), false);
  assert.equal(endsCvc("box"), false);
  assert.equal(endsCvc("toy"), false);
});

test("条件不满足时不执行替换", () => {
  const feed = stemWithTrace("feed");
  const eed = feed.traces.find((t) => t.suffix === "eed");
  assert.ok(eed);
  assert.equal(eed.applied, false);
  assert.equal(feed.stem, "feed");
  const bled = stemWithTrace("bled");
  const ed = bled.traces.find((t) => t.suffix === "ed");
  assert.ok(ed);
  assert.equal(ed.applied, false);
  assert.equal(bled.stem, "bled");
  const sky = stemWithTrace("sky");
  const y = sky.traces.find((t) => t.stage === "1c");
  assert.ok(y);
  assert.equal(y.applied, false);
  assert.equal(sky.stem, "sky");
});

test("轨迹包含阶段/后缀/前后词形/条件值", () => {
  const r = stemWithTrace("hopping");
  assert.ok(r.traces.length >= 2);
  const ing = r.traces.find((t) => t.suffix === "ing");
  assert.ok(ing);
  assert.equal(ing.stage, "1b");
  assert.equal(ing.before, "hopping");
  assert.equal(ing.after, "hopp");
  assert.equal(ing.applied, true);
  const dbl = r.traces.find((t) => t.condition.includes("*d"));
  assert.ok(dbl);
  assert.equal(dbl.after, "hop");
});

test("短词不处理", () => {
  assert.equal(stem("a"), "a");
  assert.equal(stem("be"), "be");
  assert.equal(stem("is"), "is");
});

test("大小写：保留原文，计算用小写", () => {
  const r = stemWithTrace("Hopping");
  assert.equal(r.input, "Hopping");
  assert.equal(r.normalized, "hopping");
  assert.equal(r.stem, "hop");
  assert.equal(stem("CARESSES"), "caress");
});
