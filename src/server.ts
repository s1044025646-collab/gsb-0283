import http from "node:http";
import path from "node:path";
import { Store } from "./store.js";
import { analyzeWords, groupByStem, toCsv, ALGO_VERSION } from "./analyze.js";
import { validateWord, validateBatch, MAX_WORD_LENGTH, MAX_BATCH_SIZE } from "./validate.js";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const store = new Store(path.join(DATA_DIR, "stems.db"));

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const isString = typeof body === "string";
  const payload = isString ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": isString ? (headers["Content-Type"] ?? "text/plain; charset=utf-8") : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, code: string, message: string) {
  send(res, status, { error: { code, message } });
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("请求体不是合法 JSON"), { code: "INVALID_JSON" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  try {
    if (req.method === "GET" && p === "/api/health") {
      return send(res, 200, { ok: true, algoVersion: ALGO_VERSION, limits: { maxWordLength: MAX_WORD_LENGTH, maxBatchSize: MAX_BATCH_SIZE } });
    }

    if (req.method === "POST" && p === "/api/stem") {
      const body = (await readBody(req)) as { word?: unknown; words?: unknown };
      if (body.words !== undefined) {
        const bErr = validateBatch(body.words);
        if (bErr) return sendError(res, 400, bErr.code, bErr.message);
        const { outcomes, results } = analyzeWords(body.words as string[]);
        const batchId = store.saveBatch(body.words as string[], results);
        return send(res, 200, { batchId, algoVersion: ALGO_VERSION, results: outcomes });
      }
      const err = validateWord(body.word);
      if (err) return sendError(res, 400, err.code, err.message);
      const { outcomes, results } = analyzeWords([body.word as string]);
      const batchId = store.saveBatch([body.word as string], results);
      return send(res, 200, { batchId, algoVersion: ALGO_VERSION, ...outcomes[0] });
    }

    if (req.method === "POST" && p === "/api/group") {
      const body = (await readBody(req)) as { words?: unknown };
      const bErr = validateBatch(body.words);
      if (bErr) return sendError(res, 400, bErr.code, bErr.message);
      const { outcomes, results } = analyzeWords(body.words as string[]);
      const batchId = store.saveBatch(body.words as string[], results);
      const { groups, errors } = groupByStem(outcomes);
      return send(res, 200, {
        batchId,
        algoVersion: ALGO_VERSION,
        note: "分组仅依据本算法得到的相同词干，同组词含义不一定相同",
        groups,
        errors,
      });
    }

    const traceMatch = p.match(/^\/api\/trace\/([A-Za-z]+)$/);
    if (req.method === "GET" && traceMatch) {
      const word = traceMatch[1];
      const err = validateWord(word);
      if (err) return sendError(res, 400, err.code, err.message);
      const { outcomes } = analyzeWords([word]);
      return send(res, 200, { algoVersion: ALGO_VERSION, ...outcomes[0] });
    }

    if (req.method === "GET" && p === "/api/history") {
      return send(res, 200, { batches: store.listBatches() });
    }

    const histMatch = p.match(/^\/api\/history\/(\d+)$/);
    if (req.method === "GET" && histMatch) {
      const batch = store.getBatch(Number(histMatch[1]));
      if (!batch) return sendError(res, 404, "BATCH_NOT_FOUND", "批次不存在");
      return send(res, 200, batch);
    }

    const exportMatch = p.match(/^\/api\/history\/(\d+)\/export$/);
    if (req.method === "GET" && exportMatch) {
      const batch = store.getBatch(Number(exportMatch[1]));
      if (!batch) return sendError(res, 404, "BATCH_NOT_FOUND", "批次不存在");
      const format = url.searchParams.get("format") ?? "json";
      const outcomes = batch.words.map((w) => ({
        line: w.line,
        input: w.input,
        stem: w.stem ?? undefined,
        error: w.error ? { code: w.error, message: w.error } : undefined,
      }));
      if (format === "csv") {
        return send(res, 200, toCsv(outcomes as never), { "Content-Type": "text/csv; charset=utf-8" });
      }
      if (format === "json") {
        return send(res, 200, batch);
      }
      return sendError(res, 400, "INVALID_FORMAT", "format 仅支持 json 或 csv");
    }

    const recomputeMatch = p.match(/^\/api\/history\/(\d+)\/recompute$/);
    if (req.method === "POST" && recomputeMatch) {
      const r = store.recompute(Number(recomputeMatch[1]));
      if (!r) return sendError(res, 404, "BATCH_NOT_FOUND", "批次不存在");
      return send(res, 200, { ...r, consistent: r.mismatches.length === 0 });
    }

    sendError(res, 404, "NOT_FOUND", "接口不存在");
  } catch (e) {
    const err = e as Error & { code?: string };
    sendError(res, err.code === "INVALID_JSON" ? 400 : 500, err.code ?? "INTERNAL_ERROR", err.message);
  }
});

const requestedPort = Number(process.env.PORT ?? 0);
server.listen(requestedPort, "127.0.0.1", () => {
  const addr = server.address() as { port: number };
  console.log(`porter-stemmer 服务已启动: http://127.0.0.1:${addr.port} (算法版本 ${ALGO_VERSION}, 数据目录 ${DATA_DIR})`);
});

process.on("SIGINT", () => { store.close(); process.exit(0); });
process.on("SIGTERM", () => { store.close(); process.exit(0); });
