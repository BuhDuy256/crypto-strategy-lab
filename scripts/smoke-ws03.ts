// Focused browser smoke for WS-03 against the running Docker Compose topology.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { PostgresCandleRepository } from "../apps/backend/src/modules/market/infrastructure/postgres-candle-repository.js";
import { loadConfig } from "../apps/backend/src/platform/config.js";
import { createDatabasePool } from "../apps/backend/src/platform/database.js";
import { loadRootEnvFile } from "../apps/backend/src/platform/root-env.js";
import { StructuredLogger } from "../apps/backend/src/platform/logger.js";
import { CommittedLivePublisher } from "../apps/backend/src/platform/realtime/committed-live-publisher.js";
import { RedisLiveNotificationPublisher } from "../apps/backend/src/platform/realtime/redis-live-notifications.js";

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter((value): value is string => value !== undefined);
const executablePath = chromeCandidates.find(existsSync);
if (executablePath === undefined) {
  throw new Error("WS03_SMOKE_BROWSER: set CHROME_EXECUTABLE to a Chromium browser path");
}

loadRootEnvFile();
const config = loadConfig();
const pool = createDatabasePool(config.postgres);
const repository = new PostgresCandleRepository(pool);
const smokeLogger = new StructuredLogger("ws03-smoke");
const redis = new RedisLiveNotificationPublisher(config.redis.url, smokeLogger);
const publisher = new CommittedLivePublisher(redis, smokeLogger);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

function compose(...args: string[]): void {
  execFileSync("docker", ["compose", ...args], { cwd: process.cwd(), stdio: "inherit" });
}

async function counts(attribute: "snapshotCount" | "liveUpdateCount"): Promise<number[]> {
  return page.locator("[data-chart-id]").evaluateAll((elements, key) =>
    elements.map((element) => Number((element as HTMLElement).dataset[key] ?? "0")), attribute
  );
}

async function waitForApi(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://localhost:8080/api/health");
      if (response.ok) return;
    } catch {
      // A restart briefly removes the upstream. Retry until the health gate returns.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("WS03_SMOKE_API: API did not recover before timeout");
}

try {
  await page.goto("http://localhost:8080/realtime", { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const charts = [...document.querySelectorAll<HTMLElement>("[data-chart-id]")];
    return charts.length === 4 && charts.every((chart) => Number(chart.dataset.snapshotCount) >= 1);
  });
  const initialSnapshots = await counts("snapshotCount");
  const initialLive = await counts("liveUpdateCount");

  const snapshot = await repository.getLatestSnapshot({
    provider: "binance", symbol: "BTCUSDT", timeframe: "5m", limit: 1
  });
  const latest = snapshot.candles[0];
  if (latest === undefined) throw new Error("WS03_SMOKE_DATA: seed BTCUSDT 5m data first");
  const result = await publisher.commitAndPublish(async () => {
    const candle = await repository.append({
      ...latest,
      high: Math.max(latest.high, latest.close + 0.01),
      close: latest.close + 0.01,
      volume: latest.volume + 0.01
    });
    return { candle, revisionWatermark: await repository.getCurrentRevisionWatermark() };
  }, ({ candle, revisionWatermark }) => ({
    schemaVersion: "v1", type: "candle.closed", symbol: candle.symbol,
    timeframe: candle.timeframe, revisionWatermark, sequence: 1,
    candle: { ...candle, closed: true }
  }));
  if (!result.published) throw new Error("WS03_SMOKE_PUBLISH: Redis publication failed");

  await page.waitForFunction((previous) => {
    const first = document.querySelector<HTMLElement>('[data-chart-id="chart-1"]');
    return Number(first?.dataset.liveUpdateCount ?? "0") > previous;
  }, initialLive[0] ?? 0);
  const liveAfterPublish = await counts("liveUpdateCount");
  if (liveAfterPublish.slice(1).some((value, index) => value !== initialLive[index + 1])) {
    throw new Error("WS03_SMOKE_ISOLATION: a non-matching chart received the 5m update");
  }

  compose("restart", "api");
  await waitForApi();
  await page.waitForFunction((before) => {
    const charts = [...document.querySelectorAll<HTMLElement>("[data-chart-id]")];
    return charts.every((chart, index) => Number(chart.dataset.snapshotCount) > before[index]);
  }, initialSnapshots);
  const snapshotsAfterReconnect = await counts("snapshotCount");

  compose("stop", "redis");
  compose("restart", "api");
  await waitForApi();
  await page.waitForFunction((before) => {
    const charts = [...document.querySelectorAll<HTMLElement>("[data-chart-id]")];
    return charts.every((chart, index) => Number(chart.dataset.snapshotCount) > before[index]);
  }, snapshotsAfterReconnect);

  if (pageErrors.length > 0) {
    throw new Error(`WS03_SMOKE_PAGE_ERRORS: ${pageErrors.join(" | ")}`);
  }
  process.stdout.write(
    `WS-03 browser smoke passed: four snapshots, isolated live update, ` +
    `fresh reconnect snapshots, and durable snapshots with Redis stopped.\n`
  );
} finally {
  compose("start", "redis");
  compose("restart", "api");
  await browser.close();
  await redis.close();
  await pool.end();
}
