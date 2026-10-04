export const ALGO_VERSION = "porter-1980";

export interface RuleTrace {
  step: string;
  suffix: string;
  replacement: string;
  condition: string;
  conditionValue: string;
  matched: boolean;
  applied: boolean;
  before: string;
  after: string;
  reason?: string;
}

export interface StemResult {
  input: string;
  normalized: string;
  stem: string;
  trace: RuleTrace[];
}

function isConsonant(w: string, i: number): boolean {
  const ch = w[i];
  if (ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u") return false;
  if (ch === "y") {
    if (i === 0) return true;
    return !isConsonant(w, i - 1);
  }
  return true;
}

// Porter measure m: number of VC sequences in [C](VC)^m[V]
export function measure(stem: string): number {
  let m = 0;
  let i = 0;
  const n = stem.length;
  while (i < n && isConsonant(stem, i)) i++;
  while (i < n) {
    while (i < n && !isConsonant(stem, i)) i++;
    if (i >= n) break;
    m++;
    while (i < n && isConsonant(stem, i)) i++;
  }
  return m;
}

export function hasVowel(stem: string): boolean {
  for (let i = 0; i < stem.length; i++) if (!isConsonant(stem, i)) return true;
  return false;
}

export function endsDoubleConsonant(w: string): boolean {
  const n = w.length;
  if (n < 2) return false;
  return w[n - 1] === w[n - 2] && isConsonant(w, n - 1);
}

export function endsCVC(w: string): boolean {
  const n = w.length;
  if (n < 3) return false;
  if (!isConsonant(w, n - 3) || isConsonant(w, n - 2) || !isConsonant(w, n - 1)) return false;
  const last = w[n - 1];
  return last !== "w" && last !== "x" && last !== "y";
}

interface Step2Rule { suffix: string; replacement: string }
const STEP2: Step2Rule[] = [
  { suffix: "ational", replacement: "ate" },
  { suffix: "tional", replacement: "tion" },
  { suffix: "enci", replacement: "ence" },
  { suffix: "anci", replacement: "ance" },
  { suffix: "izer", replacement: "ize" },
  { suffix: "abli", replacement: "able" },
  { suffix: "alli", replacement: "al" },
  { suffix: "entli", replacement: "ent" },
  { suffix: "eli", replacement: "e" },
  { suffix: "ousli", replacement: "ous" },
  { suffix: "ization", replacement: "ize" },
  { suffix: "ation", replacement: "ate" },
  { suffix: "ator", replacement: "ate" },
  { suffix: "alism", replacement: "al" },
  { suffix: "iveness", replacement: "ive" },
  { suffix: "fulness", replacement: "ful" },
  { suffix: "ousness", replacement: "ous" },
  { suffix: "aliti", replacement: "al" },
  { suffix: "iviti", replacement: "ive" },
  { suffix: "biliti", replacement: "ble" },
];

const STEP3: Step2Rule[] = [
  { suffix: "icate", replacement: "ic" },
  { suffix: "ative", replacement: "" },
  { suffix: "alize", replacement: "al" },
  { suffix: "iciti", replacement: "ic" },
  { suffix: "ical", replacement: "ic" },
  { suffix: "ful", replacement: "" },
  { suffix: "ness", replacement: "" },
];

const STEP4_SUFFIXES = [
  "ement", "ance", "ence", "able", "ible", "ment", "ent", "ion", "ant",
  "ism", "ate", "iti", "ous", "ive", "ize", "al", "er", "ic", "ou",
];

function longestFirst(rules: Step2Rule[]): Step2Rule[] {
  return [...rules].sort((a, b) => b.suffix.length - a.suffix.length);
}

export function stem(input: string): StemResult {
  const normalized = input.toLowerCase();
  let w = normalized;
  const trace: RuleTrace[] = [];

  const push = (t: RuleTrace) => trace.push(t);

  // ---------- Step 1a: plurals ----------
  const step1a: Step2Rule[] = [
    { suffix: "sses", replacement: "ss" },
    { suffix: "ies", replacement: "i" },
    { suffix: "ss", replacement: "ss" },
    { suffix: "s", replacement: "" },
  ];
  {
    const rule = step1a.find((r) => w.endsWith(r.suffix));
    if (rule) {
      const before = w;
      w = w.slice(0, w.length - rule.suffix.length) + rule.replacement;
      push({
        step: "1a", suffix: rule.suffix, replacement: rule.replacement,
        condition: "(none)", conditionValue: "-", matched: true, applied: true,
        before, after: w,
      });
    }
  }

  // ---------- Step 1b: -eed / -ed / -ing ----------
  let flag1b = false;
  if (w.endsWith("eed")) {
    const stemPart = w.slice(0, -3);
    const m = measure(stemPart);
    if (m > 0) {
      const before = w;
      w = w.slice(0, -1); // eed -> ee
      push({ step: "1b", suffix: "eed", replacement: "ee", condition: "m > 0", conditionValue: `m=${m}`, matched: true, applied: true, before, after: w });
    } else {
      push({ step: "1b", suffix: "eed", replacement: "ee", condition: "m > 0", conditionValue: `m=${m}`, matched: true, applied: false, before: w, after: w, reason: "词干 measure 为 0，不替换" });
    }
  } else {
    const edMatch = w.endsWith("ed") ? "ed" : w.endsWith("ing") ? "ing" : null;
    if (edMatch) {
      const stemPart = w.slice(0, -edMatch.length);
      const hv = hasVowel(stemPart);
      if (hv) {
        const before = w;
        w = stemPart;
        flag1b = true;
        push({ step: "1b", suffix: edMatch, replacement: "", condition: "词干含元音 (*v*)", conditionValue: `hasVowel(${stemPart})=true`, matched: true, applied: true, before, after: w });
      } else {
        push({ step: "1b", suffix: edMatch, replacement: "", condition: "词干含元音 (*v*)", conditionValue: `hasVowel(${stemPart})=false`, matched: true, applied: false, before: w, after: w, reason: "词干不含元音，不去除后缀" });
      }
    }
  }
  if (flag1b) {
    // adjustment: at/bl/iz -> add e
    const adj = ["at", "bl", "iz"].find((s) => w.endsWith(s));
    if (adj) {
      const before = w;
      w = w + "e";
      push({ step: "1b-adjust", suffix: adj, replacement: adj + "e", condition: "词以 at/bl/iz 结尾", conditionValue: "true", matched: true, applied: true, before, after: w });
    } else if (endsDoubleConsonant(w) && !"lsz".includes(w[w.length - 1])) {
      const before = w;
      w = w.slice(0, -1);
      push({ step: "1b-adjust", suffix: w[w.length - 1] + w[w.length - 1], replacement: w[w.length - 1], condition: "双辅音结尾且非 l/s/z (*d 且非 *L/*S/*Z)", conditionValue: "true", matched: true, applied: true, before, after: w });
    } else {
      const m = measure(w);
      if (m === 1 && endsCVC(w)) {
        const before = w;
        w = w + "e";
        push({ step: "1b-adjust", suffix: "", replacement: "+e", condition: "m = 1 且 *o (CVC，末字母非 w/x/y)", conditionValue: `m=${m}, cvc=true`, matched: true, applied: true, before, after: w });
      }
    }
  }

  // ---------- Step 1c: terminal y ----------
  if (w.endsWith("y")) {
    const stemPart = w.slice(0, -1);
    const hv = hasVowel(stemPart);
    if (hv) {
      const before = w;
      w = stemPart + "i";
      push({ step: "1c", suffix: "y", replacement: "i", condition: "词干含元音 (*v*)", conditionValue: `hasVowel(${stemPart})=true`, matched: true, applied: true, before, after: w });
    } else {
      push({ step: "1c", suffix: "y", replacement: "i", condition: "词干含元音 (*v*)", conditionValue: `hasVowel(${stemPart})=false`, matched: true, applied: false, before: w, after: w, reason: "词干不含元音，y 保留" });
    }
  }

  // ---------- Step 2 ----------
  {
    const rule = longestFirst(STEP2).find((r) => w.endsWith(r.suffix));
    if (rule) {
      const stemPart = w.slice(0, -rule.suffix.length);
      const m = measure(stemPart);
      if (m > 0) {
        const before = w;
        w = stemPart + rule.replacement;
        push({ step: "2", suffix: rule.suffix, replacement: rule.replacement, condition: "m > 0", conditionValue: `m=${m}`, matched: true, applied: true, before, after: w });
      } else {
        push({ step: "2", suffix: rule.suffix, replacement: rule.replacement, condition: "m > 0", conditionValue: `m=${m}`, matched: true, applied: false, before: w, after: w, reason: "词干 measure 为 0，不替换" });
      }
    }
  }

  // ---------- Step 3 ----------
  {
    const rule = longestFirst(STEP3).find((r) => w.endsWith(r.suffix));
    if (rule) {
      const stemPart = w.slice(0, -rule.suffix.length);
      const m = measure(stemPart);
      if (m > 0) {
        const before = w;
        w = stemPart + rule.replacement;
        push({ step: "3", suffix: rule.suffix, replacement: rule.replacement, condition: "m > 0", conditionValue: `m=${m}`, matched: true, applied: true, before, after: w });
      } else {
        push({ step: "3", suffix: rule.suffix, replacement: rule.replacement, condition: "m > 0", conditionValue: `m=${m}`, matched: true, applied: false, before: w, after: w, reason: "词干 measure 为 0，不替换" });
      }
    }
  }

  // ---------- Step 4 ----------
  {
    const suffix = [...STEP4_SUFFIXES].sort((a, b) => b.length - a.length).find((s) => w.endsWith(s));
    if (suffix) {
      const stemPart = w.slice(0, -suffix.length);
      let condOk: boolean;
      let condDesc = "m > 1";
      if (suffix === "ion") {
        const lastCh = stemPart[stemPart.length - 1];
        condOk = measure(stemPart) > 1 && (lastCh === "s" || lastCh === "t");
        condDesc = "m > 1 且词干以 s 或 t 结尾 (*S/*T)";
      } else {
        condOk = measure(stemPart) > 1;
      }
      const m = measure(stemPart);
      if (condOk) {
        const before = w;
        w = stemPart;
        push({ step: "4", suffix, replacement: "", condition: condDesc, conditionValue: `m=${m}`, matched: true, applied: true, before, after: w });
      } else {
        push({ step: "4", suffix, replacement: "", condition: condDesc, conditionValue: `m=${m}`, matched: true, applied: false, before: w, after: w, reason: "条件不满足，不去除后缀" });
      }
    }
  }

  // ---------- Step 5a: final e ----------
  if (w.endsWith("e")) {
    const stemPart = w.slice(0, -1);
    const m = measure(stemPart);
    const cvc = endsCVC(stemPart);
    if (m > 1 || (m === 1 && !cvc)) {
      const before = w;
      w = stemPart;
      push({ step: "5a", suffix: "e", replacement: "", condition: "m > 1，或 m = 1 且非 *o", conditionValue: `m=${m}, cvc=${cvc}`, matched: true, applied: true, before, after: w });
    } else {
      push({ step: "5a", suffix: "e", replacement: "", condition: "m > 1，或 m = 1 且非 *o", conditionValue: `m=${m}, cvc=${cvc}`, matched: true, applied: false, before: w, after: w, reason: "m=1 且词干为 CVC（*o），保留 e" });
    }
  }

  // ---------- Step 5b: final double l ----------
  {
    const m = measure(w);
    if (m > 1 && endsDoubleConsonant(w) && w.endsWith("l")) {
      const before = w;
      w = w.slice(0, -1);
      push({ step: "5b", suffix: "ll", replacement: "l", condition: "m > 1 且 *d 且 *L", conditionValue: `m=${m}`, matched: true, applied: true, before, after: w });
    }
  }

  return { input, normalized, stem: w, trace };
}
