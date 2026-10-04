/**
 * Porter 1980 原版词干提取算法（带逐规则追踪）。
 * 参考: M.F. Porter, "An algorithm for suffix stripping", Program, 14(3):130-137, 1980.
 * 仅实现论文中的原始规则表（Step 1a/1b/1c/2/3/4/5a/5b），
 * 不是 Snowball English / Porter2。
 */

export const ALGO_VERSION = "porter-1980-1.0.0";

export interface RuleTrace {
  stage: string;          // 例如 "1a", "1b", "2"
  suffix: string;         // 命中的后缀
  replacement: string;    // 规则右侧替换串（可能为空串）
  condition: string;      // 条件描述，如 "m>0"、"*v*"、"m>1 and *d and ends l"
  conditionValue: boolean;// 条件是否满足
  before: string;
  after: string;
  applied: boolean;
  note?: string;
}

export interface StemResult {
  input: string;      // 原始输入（保留大小写）
  normalized: string; // 小写形式
  stem: string;
  traces: RuleTrace[];
}

/** 判断位置 i 是否为辅音。y 的身份依赖位置与前一字符。 */
export function isConsonant(w: string, i: number): boolean {
  const c = w[i];
  if (c === "a" || c === "e" || c === "i" || c === "o" || c === "u") return false;
  if (c === "y") {
    if (i === 0) return true;
    return !isConsonant(w, i - 1);
  }
  return true;
}

/** measure: 词形 [C](VC)^m[V] 中的 m。 */
export function measure(w: string): number {
  let i = 0;
  const n = w.length;
  while (i < n && isConsonant(w, i)) i++; // 跳过开头 [C]
  let m = 0;
  while (true) {
    while (i < n && !isConsonant(w, i)) i++; // V
    if (i >= n) return m;
    while (i < n && isConsonant(w, i)) i++; // C
    m++;
  }
}

/** *v* : 词干中含有元音 */
export function hasVowel(w: string): boolean {
  for (let i = 0; i < w.length; i++) {
    if (!isConsonant(w, i)) return true;
  }
  return false;
}

/** *d : 以双辅音结尾 */
export function endsDoubleConsonant(w: string): boolean {
  const n = w.length;
  if (n < 2) return false;
  return w[n - 1] === w[n - 2] && isConsonant(w, n - 1);
}

/** *o : 以 cvc 结尾，且最后的 c 不是 w、x、y */
export function endsCvc(w: string): boolean {
  const n = w.length;
  if (n < 3) return false;
  if (!isConsonant(w, n - 3) || isConsonant(w, n - 2) || !isConsonant(w, n - 1)) return false;
  const last = w[n - 1];
  return last !== "w" && last !== "x" && last !== "y";
}

interface Step2Rule { suffix: string; replacement: string; }

// Step 2，条件均为 m > 0。按后缀长度降序匹配以保证最长匹配。
const STEP2_RULES: Step2Rule[] = [
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

// Step 3，条件均为 m > 0。
const STEP3_RULES: Step2Rule[] = [
  { suffix: "icate", replacement: "ic" },
  { suffix: "ative", replacement: "" },
  { suffix: "alize", replacement: "al" },
  { suffix: "iciti", replacement: "ic" },
  { suffix: "ical", replacement: "ic" },
  { suffix: "ful", replacement: "" },
  { suffix: "ness", replacement: "" },
];

// Step 4，条件均为 m > 1。ion 需额外满足词干以 s 或 t 结尾。
const STEP4_SUFFIXES = [
  "ement", "ance", "ence", "able", "ible", "ment", "ent", "ion", "ant",
  "al", "er", "ic", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
];

function sortBySuffixLengthDesc(rules: Step2Rule[]): Step2Rule[] {
  return [...rules].sort((a, b) => b.suffix.length - a.suffix.length);
}

const STEP2_SORTED = sortBySuffixLengthDesc(STEP2_RULES);
const STEP3_SORTED = sortBySuffixLengthDesc(STEP3_RULES);
const STEP4_SORTED = [...STEP4_SUFFIXES].sort((a, b) => b.length - a.length);

class Stemmer {
  private w: string;
  private traces: RuleTrace[] = [];

  constructor(word: string) {
    this.w = word;
  }

  private trace(t: RuleTrace): void {
    this.traces.push(t);
  }

  /** 对后缀 suffix 对应词干的 measure（后缀剥离前，仅取词干部分计算）。 */
  private stemMeasure(suffixLen: number): number {
    return measure(this.w.slice(0, this.w.length - suffixLen));
  }

  private step1a(): void {
    const w = this.w;
    if (w.endsWith("sses")) {
      this.apply("1a", "sses", "ss", "always");
    } else if (w.endsWith("ies")) {
      this.apply("1a", "ies", "i", "always");
    } else if (w.endsWith("ss")) {
      this.apply("1a", "ss", "ss", "always");
    } else if (w.endsWith("s")) {
      this.apply("1a", "s", "", "always");
    }
  }

  private apply(stage: string, suffix: string, replacement: string, condition: string,
                conditionValue = true, note?: string): boolean {
    const before = this.w;
    const applied = conditionValue;
    if (applied) {
      this.w = this.w.slice(0, this.w.length - suffix.length) + replacement;
    }
    this.trace({
      stage, suffix, replacement, condition, conditionValue,
      before, after: this.w, applied, note,
    });
    return applied;
  }

  private step1b(): void {
    const w = this.w;
    if (w.endsWith("eed")) {
      const m = this.stemMeasure(3);
      this.apply("1b", "eed", "ee", "m>0", m > 0, `m=${m}`);
      return; // eed 命中后本阶段终止
    }
    let removed = false;
    for (const suffix of ["ed", "ing"]) {
      if (w.endsWith(suffix)) {
        const stem = w.slice(0, w.length - suffix.length);
        const cond = hasVowel(stem);
        removed = this.apply("1b", suffix, "", "*v*", cond,
          cond ? `词干 "${stem}" 含元音` : `词干 "${stem}" 不含元音`);
        break;
      }
    }
    if (!removed) return;
    // ed/ing 被移除后的调整规则（只执行一次）
    const cur = this.w;
    for (const [suffix, replacement] of [["at", "ate"], ["bl", "ble"], ["iz", "ize"]] as const) {
      if (cur.endsWith(suffix)) {
        this.apply("1b", suffix, replacement, "always", true, "ed/ing 移除后的调整");
        return;
      }
    }
    if (endsDoubleConsonant(cur) && !/[lsz]$/.test(cur)) {
      const before = this.w;
      this.w = this.w.slice(0, -1);
      this.trace({
        stage: "1b", suffix: cur.slice(-2), replacement: cur.slice(-1),
        condition: "*d and not ends l/s/z", conditionValue: true,
        before, after: this.w, applied: true,
        note: "ed/ing 移除后的调整：去掉双辅音末尾字母",
      });
      return;
    }
    const m = measure(cur);
    if (m === 1 && endsCvc(cur)) {
      const before = this.w;
      this.w = this.w + "e";
      this.trace({
        stage: "1b", suffix: "", replacement: "e",
        condition: "m=1 and *o", conditionValue: true,
        before, after: this.w, applied: true,
        note: "ed/ing 移除后的调整：短词补 e",
      });
    }
  }

  private step1c(): void {
    const w = this.w;
    if (!w.endsWith("y")) return;
    const stem = w.slice(0, -1);
    const cond = hasVowel(stem);
    this.apply("1c", "y", "i", "*v*", cond,
      cond ? `词干 "${stem}" 含元音` : `词干 "${stem}" 不含元音`);
  }

  private runTable(stage: string, rules: Step2Rule[]): void {
    const w = this.w;
    for (const rule of rules) {
      if (w.endsWith(rule.suffix)) {
        const m = this.stemMeasure(rule.suffix.length);
        this.apply(stage, rule.suffix, rule.replacement, "m>0", m > 0, `m=${m}`);
        return; // 同阶段命中一条即终止
      }
    }
  }

  private step4(): void {
    const w = this.w;
    for (const suffix of STEP4_SORTED) {
      if (!w.endsWith(suffix)) continue;
      const stem = w.slice(0, w.length - suffix.length);
      if (suffix === "ion" && !(stem.endsWith("s") || stem.endsWith("t"))) {
        continue; // ion 需词干以 s/t 结尾，继续尝试其他后缀
      }
      const m = measure(stem);
      const cond = m > 1 && (suffix !== "ion" || true);
      this.apply("4", suffix, "", suffix === "ion" ? "m>1 and stem ends s/t" : "m>1",
        m > 1, `m=${m}`);
      void cond;
      return;
    }
  }

  private step5a(): void {
    const w = this.w;
    if (!w.endsWith("e")) return;
    const stem = w.slice(0, -1);
    const m = measure(stem);
    let cond: boolean;
    let note: string;
    if (m > 1) {
      cond = true;
      note = `m=${m} > 1`;
    } else if (m === 1 && !endsCvc(stem)) {
      cond = true;
      note = `m=1 且词干 "${stem}" 不满足 *o`;
    } else {
      cond = false;
      note = `m=${m}` + (m === 1 ? ` 且词干 "${stem}" 满足 *o` : "");
    }
    this.apply("5a", "e", "", "(m>1) or (m=1 and not *o)", cond, note);
  }

  private step5b(): void {
    const w = this.w;
    if (measure(w) > 1 && endsDoubleConsonant(w) && w.endsWith("l")) {
      const before = this.w;
      this.w = this.w.slice(0, -1);
      this.trace({
        stage: "5b", suffix: "ll", replacement: "l",
        condition: "m>1 and *d and ends l", conditionValue: true,
        before, after: this.w, applied: true,
      });
    }
  }

  run(): { stem: string; traces: RuleTrace[] } {
    // 原算法说明：长度 <= 2 的词不处理（规则条件均无法满足，直接返回）
    if (this.w.length > 2) {
      this.step1a();
      this.step1b();
      this.step1c();
      this.runTable("2", STEP2_SORTED);
      this.runTable("3", STEP3_SORTED);
      this.step4();
      this.step5a();
      this.step5b();
    }
    return { stem: this.w, traces: this.traces };
  }
}

export function stemWithTrace(input: string): StemResult {
  const normalized = input.toLowerCase();
  const { stem, traces } = new Stemmer(normalized).run();
  return { input, normalized, stem, traces };
}

export function stem(input: string): string {
  return stemWithTrace(input).stem;
}
