export const MAX_WORD_LENGTH = 64;
export const MAX_BATCH_SIZE = 1000;

export type ErrorCode =
  | "EMPTY_INPUT"
  | "NON_ASCII_LETTER"
  | "WORD_TOO_LONG"
  | "BATCH_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_PARAM"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export interface WordError {
  code: ErrorCode;
  message: string;
}

const WORD_RE = /^[A-Za-z]+$/;

/** 校验单个词；合法返回 null，否则返回错误。 */
export function validateWord(word: unknown): WordError | null {
  if (typeof word !== "string" || word.length === 0) {
    return { code: "EMPTY_INPUT", message: "输入为空或不是字符串" };
  }
  if (word.length > MAX_WORD_LENGTH) {
    return { code: "WORD_TOO_LONG", message: `词长度超过限制 ${MAX_WORD_LENGTH}` };
  }
  if (!WORD_RE.test(word)) {
    return {
      code: "NON_ASCII_LETTER",
      message: "仅允许 ASCII 英文字母（拒绝数字、连字符、空格及其他字符）",
    };
  }
  return null;
}

export function validateBatch(words: unknown): WordError | null {
  if (!Array.isArray(words)) {
    return { code: "INVALID_PARAM", message: "words 必须是字符串数组" };
  }
  if (words.length === 0) {
    return { code: "EMPTY_INPUT", message: "词列表为空" };
  }
  if (words.length > MAX_BATCH_SIZE) {
    return { code: "BATCH_TOO_LARGE", message: `批量大小超过限制 ${MAX_BATCH_SIZE}` };
  }
  return null;
}
