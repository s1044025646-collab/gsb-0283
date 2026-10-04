import { stem, StemResult, ALGO_VERSION } from "./porter.js";
import { validateWord, validateBatch, ApiError } from "./validate.js";

export interface WordOutcome {
  line: number;
  input: string;
  stem?: string;
  normalized?: string;
  trace?: StemResult["trace"];
  error?: ApiError;
}

export function analyzeWords(words: string[]): { outcomes: WordOutcome[]; results: (StemResult | { error: string })[] } {
  const outcomes: WordOutcome[] = [];
  const results: (StemResult | { error: string })[] = [];
  words.forEach((word, i) => {
    const err = validateWord(word, i + 1);
    if (err) {
      outcomes.push({ line: i + 1, input: String(word ?? ""), error: err });
      results.push({ error: err.code });
    } else {
      const r = stem(word);
      outcomes.push({ line: i + 1, input: word, normalized: r.normalized, stem: r.stem, trace: r.trace });
      results.push(r);
    }
  });
  return { outcomes, results };
}

export function groupByStem(outcomes: WordOutcome[]): {
  groups: { stem: string; count: number; members: { line: number; input: string }[] }[];
  errors: WordOutcome[];
} {
  const map = new Map<string, { line: number; input: string }[]>();
  const errors: WordOutcome[] = [];
  for (const o of outcomes) {
    if (o.error || o.stem === undefined) {
      errors.push(o);
      continue;
    }
    const list = map.get(o.stem) ?? [];
    list.push({ line: o.line, input: o.input });
    map.set(o.stem, list);
  }
  const groups = [...map.entries()].map(([s, members]) => ({
    stem: s,
    count: members.length,
    members,
  }));
  return { groups, errors };
}

export function toCsv(outcomes: WordOutcome[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = ["line,input,stem,error"];
  for (const o of outcomes) {
    rows.push([o.line, esc(o.input), o.stem ?? "", o.error ? esc(o.error.code) : ""].join(","));
  }
  return rows.join("\n") + "\n";
}

export { ALGO_VERSION, validateBatch };
