export const MAX_WORD_LENGTH = 64;
export const MAX_BATCH_SIZE = 500;

export interface ApiError {
  code: string;
  message: string;
  line?: number;
  word?: string;
}

export function validateWord(word: unknown, line?: number): ApiError | null {
  if (typeof word !== "string" || word.length === 0) {
    return { code: "EMPTY_WORD", message: "单词不能为空", line, word: String(word ?? "") };
  }
  if (word.length > MAX_WORD_LENGTH) {
    return { code: "WORD_TOO_LONG", message: `单词长度超过限制 ${MAX_WORD_LENGTH}`, line, word };
  }
  if (!/^[A-Za-z]+$/.test(word)) {
    return { code: "INVALID_CHARACTERS", message: "单词只能包含 ASCII 英文字母（不允许数字、连字符或其他字符）", line, word };
  }
  return null;
}

export function validateBatch(words: unknown): ApiError | null {
  if (!Array.isArray(words)) {
    return { code: "INVALID_BATCH", message: "words 必须是字符串数组" };
  }
  if (words.length === 0) {
    return { code: "EMPTY_BATCH", message: "批量列表不能为空" };
  }
  if (words.length > MAX_BATCH_SIZE) {
    return { code: "BATCH_TOO_LARGE", message: `批量数量超过限制 ${MAX_BATCH_SIZE}` };
  }
  return null;
}
