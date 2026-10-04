import { ALGO_VERSION, stemWithTrace, StemResult } from "./porter";
import { Store } from "./db";
import { validateBatch, validateWord, WordError } from "./validate";

export interface AnalyzedItem {
  lineNo: number;
  input: string;
  status: "ok" | "error";
  error?: WordError;
  result?: StemResult;
}

export function analyzeWords(inputs: string[]): AnalyzedItem[] {
  return inputs.map((input, idx) => {
    const err = validateWord(input);
    if (err) {
      return { lineNo: idx + 1, input: String(input), status: "error" as const, error: err };
    }
    return { lineNo: idx + 1, input, status: "ok" as const, result: stemWithTrace(input) };
  });
}

export function runBatch(store: Store, inputs: string[]): {
  batchId: number;
  algoVersion: string;
  items: AnalyzedItem[];
} {
  const batchErr = validateBatch(inputs);
  if (batchErr) {
    throw Object.assign(new Error(batchErr.message), { code: batchErr.code });
  }
  const items = analyzeWords(inputs);
  const batch = store.saveBatch(
    items.map((it) => ({
      lineNo: it.lineNo,
      input: it.input,
      result: it.result ?? null,
      error: it.error ?? null,
    }))
  );
  return { batchId: batch.id, algoVersion: ALGO_VERSION, items };
}

/** 重启后按原算法版本复算并与存储结果比较。 */
export function verifyBatch(store: Store, batchId: number): {
  batchId: number;
  algoVersion: string;
  storedVersion: string;
  total: number;
  mismatches: Array<{ lineNo: number; input: string; stored: string | null; recomputed: string | null }>;
} {
  const batch = store.getBatch(batchId);
  if (!batch) {
    throw Object.assign(new Error(`批次 ${batchId} 不存在`), { code: "NOT_FOUND" });
  }
  const items = store.getItems(batchId);
  const mismatches: Array<{ lineNo: number; input: string; stored: string | null; recomputed: string | null }> = [];
  for (const item of items) {
    const recomputed = item.status === "ok" ? stemWithTrace(item.input).stem : null;
    if (recomputed !== item.stem) {
      mismatches.push({ lineNo: item.lineNo, input: item.input, stored: item.stem, recomputed });
    }
  }
  return {
    batchId,
    algoVersion: ALGO_VERSION,
    storedVersion: batch.algoVersion,
    total: items.length,
    mismatches,
  };
}
