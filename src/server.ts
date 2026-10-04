import * as http from "node:http";
import * as path from "node:path";
import { Store } from "./db";
import { runBatch, verifyBatch } from "./service";
import { stemWithTrace, ALGO_VERSION } from "./porter";
import { validateWord, MAX_BATCH_SIZE, MAX_WORD_LENGTH } from "./validate";

const DEFAULT_DATA_DIR = path.join(__dirname, "..", "..", "data");

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message } });
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(","));
  return lines.join("\r\n");
}

export function createServer(store: Store): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === "GET /api/meta") {
        return sendJson(res, 200, {
          algoVersion: ALGO_VERSION,
          algorithm: "Porter 1980 original (not Porter2/Snowball)",
          limits: { maxWordLength: MAX_WORD_LENGTH, maxBatchSize: MAX_BATCH_SIZE },
          note: "词干未必是词典中的真实单词，也不等于词形还原(lemmatization)。",
        });
      }

      if (route === "POST /api/stem") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (Array.isArray(body.words)) {
          const out = runBatch(store, body.words);
          return sendJson(res, 200, out);
        }
        const err = validateWord(body.word);
        if (err) return sendError(res, 400, err.code, err.message);
        const result = stemWithTrace(body.word);
        store.saveBatch([{ lineNo: 1, input: body.word, result, error: null }]);
        return sendJson(res, 200, result);
      }

      if (route === "POST /api/batch") {
        const body = JSON.parse(await readBody(req) || "{}");
        const out = runBatch(store, body.words);
        return sendJson(res, 200, out);
      }

      const groupsMatch = url.pathname.match(/^\/api\/batches\/(\d+)\/groups$/);
      if (req.method === "GET" && groupsMatch) {
        const batchId = Number(groupsMatch[1]);
        if (!store.getBatch(batchId)) return sendError(res, 404, "NOT_FOUND", "批次不存在");
        return sendJson(res, 200, {
          batchId,
          note: "仅按本算法的相同词干分组，不保证同组词含义相同。",
          groups: store.groupByStem(batchId),
        });
      }

      const traceMatch = url.pathname.match(/^\/api\/trace\/([A-Za-z]+)$/);
      if (req.method === "GET" && traceMatch) {
        return sendJson(res, 200, stemWithTrace(traceMatch[1]));
      }

      const verifyMatch = url.pathname.match(/^\/api\/batches\/(\d+)\/verify$/);
      if (req.method === "GET" && verifyMatch) {
        return sendJson(res, 200, verifyBatch(store, Number(verifyMatch[1])));
      }

      const exportMatch = url.pathname.match(/^\/api\/batches\/(\d+)\/export$/);
      if (req.method === "GET" && exportMatch) {
        const batchId = Number(exportMatch[1]);
        if (!store.getBatch(batchId)) return sendError(res, 404, "NOT_FOUND", "批次不存在");
        const items = store.getItems(batchId);
        const format = url.searchParams.get("format") ?? "json";
        if (format === "csv") {
          const csv = toCsv(items.map((i) => ({
            line_no: i.lineNo, input: i.input, status: i.status,
            stem: i.stem, error_code: i.errorCode, dup_count: i.dupCount,
          })));
          res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
          return res.end(csv);
        }
        return sendJson(res, 200, { batchId, algoVersion: ALGO_VERSION, items });
      }

      if (route === "GET /api/history") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
        return sendJson(res, 200, { batches: store.listBatches(limit) });
      }

      return sendError(res, 404, "NOT_FOUND", `未知路由: ${route}`);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err instanceof SyntaxError) {
        return sendError(res, 400, "INVALID_JSON", "请求体不是合法 JSON");
      }
      const status = err.code === "NOT_FOUND" ? 404
        : err.code && err.code !== "INTERNAL_ERROR" ? 400 : 500;
      return sendError(res, status, err.code ?? "INTERNAL_ERROR", err.message);
    }
  });
}

export function startServer(port: number, dataDir: string): Promise<{ port: number; close: () => void }> {
  const store = new Store(dataDir);
  const server = createServer(store);
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({ port: actualPort, close: () => { server.close(); store.close(); } });
    });
  });
}

if (require.main === module) {
  const portArg = process.env.PORT ? Number(process.env.PORT) : 0; // 默认选择空闲端口
  const dataDir = process.env.DATA_DIR ?? DEFAULT_DATA_DIR;
  startServer(portArg, dataDir).then(({ port }) => {
    console.log(`Porter 词干分析服务已启动: http://127.0.0.1:${port}`);
    console.log(`算法版本: ${ALGO_VERSION}  数据目录: ${dataDir}`);
  });
}
