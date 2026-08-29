// Focused browser smoke for MKT-07 against the running Docker Compose topology.
//
// One chart only. MKT-11 owns four live charts, so the other three charts on the
// page are used for nothing except proving that they stay untouched.
//
// `market-ingest` must be stopped while this runs. The registry drops a live
// message whose sequence is not greater than the last one it saw, and ingest
// seeds its sequence from the wall clock, so a running ingest would make these
// publications unobservable. MKT-06 already proved the real ingest path.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { Candle } from "../apps/backend/src/modules/market/domain/candle.js";
import { PostgresCandleRepository } from "../apps/backend/src/modules/market/infrastructure/postgres-candle-repository.js";
import { loadConfig } from "../apps/backend/src/platform/config.js";
import { createDatabasePool } from "../apps/backend/src/platform/database.js";
import { loadRootEnvFile } from "../apps/backend/src/platform/root-env.js";
import { StructuredLogger } from "../apps/backend/src/platform/logger.js";
import { RedisLiveNotificationPublisher } from "../apps/backend/src/platform/realtime/redis-live-notifications.js";

const CHART = "chart-1";
const TIMEFRAME = "5m";
const FIVE_MINUTES_MS = 300_000;
const SETTLE_MS = 1_500;

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter((value): value is string => value !== undefined);
const executablePath = chromeCandidates.find(existsSync);
if (executablePath === undefined) {
  throw new Error("MKT07_SMOKE_BROWSER: set CHROME_EXECUTABLE to a Chromium browser path");
}

loadRootEnvFile();
const config = loadConfig();
const pool = createDatabasePool(config.postgres);
const repository = new PostgresCandleRepository(pool);
const smokeLogger = new StructuredLogger("mkt07-smoke");
const redis = new RedisLiveNotificationPublisher(config.redis.url, smokeLogger);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

let sequence = 0;

function compose(...args: string[]): void {
  execFileSync("docker", ["compose", ...args], { cwd: process.cwd(), stdio: "inherit" });
}

interface ChartCounters {
  readonly snapshotCount: number;
  readonly tickCount: number;
  readonly closedCount: number;
  readonly durableCount: number;
  readonly durableLastOpenTime: string;
  readonly formingOpenTime: string;
  readonly snapshotWatermark: string;
}

async function read(chartId: string): Promise<ChartCounters> {
  return page.locator(`[data-chart-id="${chartId}"]`).evaluate((element) => {
    const data = (element as HTMLElement).dataset;
    return {
      snapshotCount: Number(data.snapshotCount ?? "0"),
      tickCount: Number(data.tickCount ?? "0"),
      closedCount: Number(data.closedCount ?? "0"),
      durableCount: Number(data.durableCount ?? "0"),
      durableLastOpenTime: data.durableLastOpenTime ?? "",
      formingOpenTime: data.formingOpenTime ?? "",
      snapshotWatermark: data.snapshotWatermark ?? ""
    };
  });
}

async function otherCharts(): Promise<Record<string, number>> {
  return page.locator("[data-chart-id]").evaluateAll((elements, chartId) => {
    const totals: Record<string, number> = {};
    for (const element of elements) {
      const data = (element as HTMLElement).dataset;
      const id = data.chartId ?? "";
      if (id === chartId) continue;
      totals[id] = Number(data.tickCount ?? "0") + Number(data.closedCount ?? "0");
    }
    return totals;
  }, CHART);
}

function check(condition: boolean, code: string, detail: string): void {
  if (!condition) throw new Error(`${code}: ${detail}`);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

async function publishTick(candle: Candle, revisionWatermark: number): Promise<void> {
  sequence += 1;
  await redis.publish({
    schemaVersion: "v1", type: "candle.tick", symbol: candle.symbol,
    timeframe: candle.timeframe, revisionWatermark, sequence,
    candle: { ...candle, closed: false }
  });
}

async function publishClosed(candle: Candle, revisionWatermark: number): Promise<void> {
  sequence += 1;
  await redis.publish({
    schemaVersion: "v1", type: "candle.closed", symbol: candle.symbol,
    timeframe: candle.timeframe, revisionWatermark, sequence,
    candle: { ...candle, closed: true }
  });
}

async function waitForCount(
  attribute: "snapshotCount" | "tickCount" | "closedCount",
  previous: number
): Promise<void> {
  await page.waitForFunction(
    ({ chartId, key, before }) => {
      const chart = document.querySelector<HTMLElement>(`[data-chart-id="${chartId}"]`);
      return Number(chart?.dataset[key] ?? "0") > before;
    },
    { chartId: CHART, key: attribute, before: previous }
  );
}

async function waitForApi(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch("http://localhost:8080/api/health");
      if (response.ok) return;
    } catch {
      // A restart briefly removes the upstream. Retry until the health gate returns.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("MKT07_SMOKE_API: API did not recover before timeout");
}

try {
  // AC1: a durable snapshot with a watermark arrives before any live update.
  await page.goto("http://localhost:8080/realtime", { waitUntil: "networkidle" });
  await waitForCount("snapshotCount", 0);
  const afterSnapshot = await read(CHART);
  check(afterSnapshot.snapshotWatermark !== "", "MKT07_SMOKE_WATERMARK",
    "the snapshot carried no watermark");
  check(afterSnapshot.tickCount === 0 && afterSnapshot.closedCount === 0,
    "MKT07_SMOKE_ORDER", "a live update was applied before the snapshot");
  check(afterSnapshot.durableCount > 0, "MKT07_SMOKE_DATA",
    "no seeded BTCUSDT 5m history; run pnpm run demo:seed");

  const seed = await repository.getLatestSnapshot({
    provider: "binance", symbol: "BTCUSDT", timeframe: TIMEFRAME, limit: 1
  });
  const latest = seed.candles[0];
  if (latest === undefined) throw new Error("MKT07_SMOKE_DATA: seed BTCUSDT 5m data first");

  // AC3: a tick moves the forming bar and nothing else.
  const forming: Candle = {
    ...latest,
    openTime: latest.openTime + FIVE_MINUTES_MS,
    closeTime: latest.closeTime + FIVE_MINUTES_MS,
    closed: false,
    revision: 0
  };
  const beforeTick = await read(CHART);
  const othersBefore = await otherCharts();
  await publishTick(forming, Number(beforeTick.snapshotWatermark));
  await waitForCount("tickCount", beforeTick.tickCount);
  const afterTick = await read(CHART);
  check(afterTick.durableCount === beforeTick.durableCount, "MKT07_SMOKE_TICK_DURABLE",
    `a tick entered the durable series: ${beforeTick.durableCount} -> ${afterTick.durableCount}`);
  check(afterTick.formingOpenTime === String(forming.openTime), "MKT07_SMOKE_TICK_FORMING",
    `the forming bar is ${afterTick.formingOpenTime}, expected ${forming.openTime}`);

  // AC2: no other subscription key saw it.
  const othersAfterTick = await otherCharts();
  for (const [id, total] of Object.entries(othersAfterTick)) {
    check(total === othersBefore[id], "MKT07_SMOKE_ISOLATION",
      `${id} received a ${TIMEFRAME} update it did not subscribe to`);
  }

  // AC3 and AC6: the committed candle takes over the bar that was forming.
  const committed = await repository.append({ ...forming, closed: true, revision: 1 });
  const watermark = await repository.getCurrentRevisionWatermark();
  await publishClosed(committed, watermark);
  await waitForCount("closedCount", afterTick.closedCount);
  const afterClosed = await read(CHART);
  // The series is capped at the snapshot length, so it ends on the committed
  // candle rather than growing.
  check(afterClosed.durableLastOpenTime === String(committed.openTime),
    "MKT07_SMOKE_CLOSED_DURABLE",
    `the durable series ends at ${afterClosed.durableLastOpenTime}, expected ${committed.openTime}`);
  check(afterClosed.formingOpenTime === "", "MKT07_SMOKE_CLOSED_FORMING",
    "the forming bar survived the candle that closed it");

  // AC6: the same committed candle again is dropped at the watermark, not applied twice.
  await publishClosed(committed, watermark);
  await settle();
  const afterOverlap = await read(CHART);
  check(afterOverlap.closedCount === afterClosed.closedCount, "MKT07_SMOKE_OVERLAP",
    `an overlapping candle was applied twice: ${afterClosed.closedCount} -> ${afterOverlap.closedCount}`);
  check(afterOverlap.durableCount === afterClosed.durableCount &&
    afterOverlap.durableLastOpenTime === afterClosed.durableLastOpenTime,
    "MKT07_SMOKE_OVERLAP_SERIES",
    "an overlapping candle changed the durable series a second time");

  // AC5: reconnect takes a fresh snapshot before live delivery resumes.
  compose("restart", "api");
  await waitForApi();
  await waitForCount("snapshotCount", afterOverlap.snapshotCount);
  const afterReconnect = await read(CHART);
  check(afterReconnect.formingOpenTime === "", "MKT07_SMOKE_RECONNECT_FORMING",
    "a stale forming bar survived the fresh snapshot");
  check(afterReconnect.durableLastOpenTime === afterClosed.durableLastOpenTime,
    "MKT07_SMOKE_RECONNECT_DATA",
    "the fresh snapshot did not carry the committed candle forward");

  // AC4: retargeting the chart releases the old subscription, so its key goes quiet.
  await page.selectOption(`#${CHART}-timeframe`, "15m");
  await waitForCount("snapshotCount", afterReconnect.snapshotCount);
  const afterRetarget = await read(CHART);
  await publishTick(forming, Number(afterRetarget.snapshotWatermark));
  await publishClosed(committed, Number(afterRetarget.snapshotWatermark) + 1);
  await settle();
  const afterRelease = await read(CHART);
  check(afterRelease.tickCount === afterRetarget.tickCount, "MKT07_SMOKE_RELEASE_TICK",
    "the released 5m subscription still received a tick");
  check(afterRelease.closedCount === afterRetarget.closedCount, "MKT07_SMOKE_RELEASE_CLOSED",
    "the released 5m subscription still received a closed candle");

  if (pageErrors.length > 0) {
    throw new Error(`MKT07_SMOKE_PAGE_ERRORS: ${pageErrors.join(" | ")}`);
  }
  process.stdout.write(
    "MKT-07 browser smoke passed for one chart: snapshot with a watermark before live, " +
    "a tick that moved only the forming bar, a committed candle that took the bar over, " +
    "an overlapping candle applied once, a fresh snapshot after reconnect, and a released " +
    "subscription that went quiet.\n"
  );
} finally {
  await browser.close();
  await redis.close();
  await pool.end();
}
