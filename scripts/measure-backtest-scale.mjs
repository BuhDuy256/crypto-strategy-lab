// Controlled scale measurement for the V5 PostgreSQL-backed backtest runner.
//
// Creates one search experiment, starts it, polls until the search settles, and
// prints one JSON line with the wall-clock time. It is a measurement tool, not
// part of the application: nothing in apps/ imports it.
//
// Usage, against a running Compose topology:
//   node scripts/measure-backtest-scale.mjs <label> <candidates> <seed>
//
// The seed must differ between runs. Backtest runs are keyed by content-derived
// idempotency key, so repeating a seed reuses the previous result instead of
// doing new work, which would measure nothing.
//
// Results recorded with this script live in
// docs/evidence/evidence-performance-and-scale.md.
const API = process.env.API_BASE ?? "http://localhost:3000";
const LABEL = process.argv[2] ?? "unlabeled";
const CANDIDATES = Number(process.argv[3] ?? 24);
const SEED = process.argv[4] ?? `scale-${LABEL}`;

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const endTime = Date.parse("2026-09-03T20:00:00Z");
const startTime = endTime - 30 * 86_400_000;

const request = {
  dataset: { provider: "binance", symbol: "BTCUSDT", timeframe: "1h", startTime, endTime },
  generator: { id: "random-search", version: "1.0.0", configuration: {} },
  searchSpace: {
    strategies: [
      { id: "moving-average", version: "1.0.0" },
      { id: "rsi", version: "1.0.0" },
      { id: "bollinger-bands", version: "1.0.0" },
      { id: "macd", version: "1.0.0" }
    ],
    compositeSizes: [1],
    policies: []
  },
  seed: SEED,
  stopConditions: { maxCandidates: CANDIDATES },
  maxInFlight: 8
};

const { specId } = await post("/experiments/search", request);
const began = Date.now();
await post(`/experiments/${specId}/search/start`);

let progress;
for (;;) {
  await new Promise((r) => setTimeout(r, 500));
  progress = await get(`/experiments/${specId}/search/progress`);
  const done = progress.completed + progress.failed + progress.cancelled;
  if (progress.status !== "running" && done >= progress.submitted && progress.inFlight === 0) break;
  if (Date.now() - began > 15 * 60_000) throw new Error("timeout");
}
const wallMs = Date.now() - began;
console.log(JSON.stringify({
  label: LABEL, specId, wallMs,
  status: progress.status, stopReason: progress.stopReason ?? null,
  generated: progress.generated, submitted: progress.submitted,
  completed: progress.completed, failed: progress.failed
}));
