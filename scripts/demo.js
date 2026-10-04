// 演示：启动服务（空闲端口），调用主要 API，再关闭。
const { startServer } = require("../dist/src/server");

async function main() {
  const { port, close } = await startServer(0, require("path").join(__dirname, "..", "data"));
  const base = `http://127.0.0.1:${port}`;
  const show = async (label, promise) => {
    const res = await promise;
    const body = await res.json();
    console.log(`\n=== ${label} (HTTP ${res.status}) ===`);
    console.log(JSON.stringify(body, null, 2).slice(0, 1200));
    return body;
  };

  await show("GET /api/meta", fetch(`${base}/api/meta`));
  await show("POST /api/stem relational", fetch(`${base}/api/stem`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word: "relational" }),
  }));
  const batch = await show("POST /api/batch", fetch(`${base}/api/batch`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words: ["caresses", "ponies", "cats", "Hopping", "filing", "cats", "bad-word", "universe", "university"] }),
  }));
  await show(`GET /api/batches/${batch.batchId}/groups`, fetch(`${base}/api/batches/${batch.batchId}/groups`));
  await show("GET /api/trace/hopping", fetch(`${base}/api/trace/hopping`));
  await show(`GET /api/batches/${batch.batchId}/verify`, fetch(`${base}/api/batches/${batch.batchId}/verify`));
  await show("GET /api/history", fetch(`${base}/api/history`));
  const csv = await fetch(`${base}/api/batches/${batch.batchId}/export?format=csv`);
  console.log("\n=== CSV 导出 ===");
  console.log(await csv.text());
  close();
}

main().catch((e) => { console.error(e); process.exit(1); });
