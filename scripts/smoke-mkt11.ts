// Focused browser smoke for MKT-11 against the running Docker Compose topology.
//
// Four charts, four subscriptions, one page. It proves the six acceptance
// criteria that are observable from outside the process: four live charts at
// four timeframes, an isolated timeframe change, no page reload, the server-side
// entry count before and after, and release on close.
//
// `market-ingest` must be stopped while this runs, for the same reason as the
// MKT-07 smoke: the registry only accepts a live message whose sequence is one
// greater than the last it saw for that subscription, and ingest seeds its
// per-stream sequence from the wall clock. That filtering is the design, not a
// fault, so the smoke publishes its own deterministic sequences instead of
// fighting it. MKT-06 already proved the real ingest path end to end.

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

/** The four charts the Realtime page opens, and the timeframe each starts on. */
const CHARTS = [
  { id: "chart-1", timeframe: "5m" },
  { id: "chart-2", timeframe: "15m" },
  { id: "chart-3", timeframe: "1h" },
  { id: "chart-4", timeframe: "4h" }
] as const;

/** chart-1 moves here. It is seeded, so the new snapshot carries real candles. */
const RETARGET_TIMEFRAME = "1h";

const WEB_ORIGIN = "http://localhost:8080";
const SETTLE_MS = 1_500;
const TIMEFRAME_MS: Record<string, number> = {
  "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000
};

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter((value): value is string => value !== undefined);
const executablePath = chromeCandidates.find(existsSync);
if (executablePath === undefined) {
  throw new Error("MKT11_SMOKE_BROWSER: set CHROME_EXECUTABLE to a Chromium browser path");
}

loadRootEnvFile();
const config = loadConfig();
const pool = createDatabasePool(config.postgres);
const repository = new PostgresCandleRepository(pool);
const smokeLogger = new StructuredLogger("mkt11-smoke");
const redis = new RedisLiveNotificationPublisher(config.redis.url, smokeLogger);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

// One sequence per stream key, because the API tracks sequence per subscription.
const sequences = new Map<string, number>();
const liveDeliveryLatencyMs: number[] = [];

function compose(...args: string[]): void {
  execFileSync("docker", ["compose", ...args], { cwd: process.cwd(), stdio: "inherit" });
}

function check(condition: boolean, code: string, detail: string): void {
  if (!condition) throw new Error(`${code}: ${detail}`);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

interface ChartCounters {
  readonly chartId: string;
  readonly timeframe: string;
  readonly connection: string;
  readonly subscriptionState: string;
  readonly snapshotCount: number;
  readonly tickCount: number;
  readonly closedCount: number;
  readonly durableCount: number;
  readonly durableLastOpenTime: string;
  readonly formingOpenTime: string;
  readonly snapshotWatermark: string;
}

/** Reads every rendered chart at once, in page order. */
async function readAll(): Promise<ChartCounters[]> {
  return page.locator("[data-chart-id]").evaluateAll((elements) =>
    elements.map((element) => {
      const data = (element as HTMLElement).dataset;
      return {
        chartId: data.chartId ?? "",
        timeframe: data.timeframe ?? "",
        connection: data.connection ?? "",
        subscriptionState: data.subscriptionState ?? "",
        snapshotCount: Number(data.snapshotCount ?? "0"),
        tickCount: Number(data.tickCount ?? "0"),
        closedCount: Number(data.closedCount ?? "0"),
        durableCount: Number(data.durableCount ?? "0"),
        durableLastOpenTime: data.durableLastOpenTime ?? "",
        formingOpenTime: data.formingOpenTime ?? "",
        snapshotWatermark: data.snapshotWatermark ?? ""
      };
    }));
}

function chart(all: readonly ChartCounters[], chartId: string): ChartCounters {
  const found = all.find((entry) => entry.chartId === chartId);
  if (found === undefined) throw new Error(`MKT11_SMOKE_MISSING_CHART: ${chartId}`);
  return found;
}

/** The API's own count of client subscriptions it is holding. */
async function activeSubscriptions(): Promise<number> {
  const response = await fetch(`${WEB_ORIGIN}/api/realtime/subscriptions`);
  if (!response.ok) {
    throw new Error(`MKT11_SMOKE_STATUS: /realtime/subscriptions returned ${response.status}`);
  }
  const body = await response.json() as { readonly activeSubscriptions?: unknown };
  if (typeof body.activeSubscriptions !== "number") {
    throw new Error("MKT11_SMOKE_STATUS: activeSubscriptions was not a number");
  }
  return body.activeSubscriptions;
}

async function waitForSubscriptions(expected: number): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const count = await activeSubscriptions();
    if (count === expected) return count;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return activeSubscriptions();
}

async function waitForCount(
  chartId: string,
  key: "snapshotCount" | "tickCount" | "closedCount",
  previous: number
): Promise<void> {
  await page.waitForFunction(
    ({ id, attribute, before }) => {
      const element = document.querySelector<HTMLElement>(`[data-chart-id="${id}"]`);
      return Number(element?.dataset[attribute] ?? "0") > before;
    },
    { id: chartId, attribute: key, before: previous }
  );
}

function nextSequence(timeframe: string): number {
  const next = (sequences.get(timeframe) ?? 0) + 1;
  sequences.set(timeframe, next);
  return next;
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.ceil(sorted.length * ratio) - 1];
  if (value === undefined) throw new Error("MKT11_SMOKE_LATENCY: no samples captured");
  return value;
}

/** The next forming bar after the latest stored candle for a timeframe. */
async function nextForming(timeframe: string): Promise<Candle> {
  const snapshot = await repository.getLatestSnapshot({
    provider: "binance", symbol: "BTCUSDT", timeframe, limit: 1
  });
  const latest = snapshot.candles[0];
  if (latest === undefined) {
    throw new Error(`MKT11_SMOKE_DATA: no BTCUSDT ${timeframe} history; run pnpm run demo:seed`);
  }
  const step = TIMEFRAME_MS[timeframe];
  if (step === undefined) throw new Error(`MKT11_SMOKE_TIMEFRAME: ${timeframe}`);
  return {
    ...latest,
    openTime: latest.openTime + step,
    closeTime: latest.closeTime + step,
    closed: false,
    revision: 0
  };
}

async function publishTick(candle: Candle, revisionWatermark: number): Promise<void> {
  await redis.publish({
    schemaVersion: "v1", type: "candle.tick", symbol: candle.symbol,
    timeframe: candle.timeframe, revisionWatermark,
    sequence: nextSequence(candle.timeframe),
    candle: { ...candle, closed: false }
  });
}

try {
  // Deterministic sequences require ingest to be quiet. See the header comment.
  compose("stop", "market-ingest");

  // ---------------------------------------------------------------- AC1, AC4
  await page.goto(`${WEB_ORIGIN}/realtime`, { waitUntil: "networkidle" });
  for (const entry of CHARTS) await waitForCount(entry.id, "snapshotCount", 0);
  const initial = await readAll();

  check(initial.length === 4, "MKT11_SMOKE_CHART_COUNT",
    `the page rendered ${initial.length} charts, expected 4`);
  check(new Set(initial.map((entry) => entry.chartId)).size === 4,
    "MKT11_SMOKE_IDENTITY", "the four charts do not have four distinct identifiers");
  check(initial.map((entry) => entry.timeframe).join(",") ===
    CHARTS.map((entry) => entry.timeframe).join(","),
    "MKT11_SMOKE_TIMEFRAMES",
    `timeframes are ${initial.map((entry) => entry.timeframe).join(",")}`);
  for (const entry of initial) {
    check(entry.durableCount > 0, "MKT11_SMOKE_DATA",
      `${entry.chartId} has no ${entry.timeframe} history; run pnpm run demo:seed`);
    check(entry.snapshotWatermark !== "", "MKT11_SMOKE_WATERMARK",
      `${entry.chartId} received a snapshot with no watermark`);
    check(entry.connection === "connected" && entry.subscriptionState === "live",
      "MKT11_SMOKE_STATE",
      `${entry.chartId} is ${entry.connection}/${entry.subscriptionState}`);
  }

  const registryAtStart = await waitForSubscriptions(4);
  check(registryAtStart === 4, "MKT11_SMOKE_REGISTRY_START",
    `the API holds ${registryAtStart} subscriptions, expected 4`);

  // A value planted in this document. A full page reload would drop it, so it
  // is how the smoke tells a re-render from a navigation.
  await page.evaluate(() => {
    (window as unknown as { __mkt11Marker?: string }).__mkt11Marker = "no-reload";
  });

  // Every chart streams its own key, and only its own key.
  for (const entry of CHARTS) {
    const before = await readAll();
    const forming = await nextForming(entry.timeframe);
    const publishedAt = performance.now();
    await publishTick(forming, Number(chart(before, entry.id).snapshotWatermark));
    await waitForCount(entry.id, "tickCount", chart(before, entry.id).tickCount);
    liveDeliveryLatencyMs.push(performance.now() - publishedAt);
    const after = await readAll();

    check(chart(after, entry.id).formingOpenTime === String(forming.openTime),
      "MKT11_SMOKE_LIVE",
      `${entry.id} forming bar is ${chart(after, entry.id).formingOpenTime}, expected ${forming.openTime}`);
    check(chart(after, entry.id).durableCount === chart(before, entry.id).durableCount,
      "MKT11_SMOKE_TICK_DURABLE", `a tick entered ${entry.id}'s durable series`);
    for (const other of CHARTS) {
      if (other.id === entry.id) continue;
      check(chart(after, other.id).tickCount === chart(before, other.id).tickCount,
        "MKT11_SMOKE_ISOLATION",
        `${other.id} received a ${entry.timeframe} tick it did not subscribe to`);
    }
  }

  // ---------------------------------------------------------- AC2, AC3, AC4
  const beforeChange = await readAll();
  await page.selectOption("#chart-1-timeframe", RETARGET_TIMEFRAME);
  await waitForCount("chart-1", "snapshotCount", chart(beforeChange, "chart-1").snapshotCount);
  await settle();
  const afterChange = await readAll();

  check(chart(afterChange, "chart-1").timeframe === RETARGET_TIMEFRAME,
    "MKT11_SMOKE_RETARGET", "chart-1 did not move to the new timeframe");
  check(chart(afterChange, "chart-1").durableCount > 0,
    "MKT11_SMOKE_RETARGET_DATA", "chart-1's new snapshot carried no candles");
  check(chart(afterChange, "chart-1").formingOpenTime === "",
    "MKT11_SMOKE_RETARGET_FORMING", "chart-1 carried its old forming bar into the new snapshot");

  for (const other of CHARTS.filter((entry) => entry.id !== "chart-1")) {
    const before = chart(beforeChange, other.id);
    const after = chart(afterChange, other.id);
    check(after.snapshotCount === before.snapshotCount, "MKT11_SMOKE_UNTOUCHED_SNAPSHOT",
      `${other.id} was resubscribed: ${before.snapshotCount} -> ${after.snapshotCount}`);
    check(after.durableCount === before.durableCount, "MKT11_SMOKE_UNTOUCHED_DURABLE",
      `${other.id} lost durable candles: ${before.durableCount} -> ${after.durableCount}`);
    check(after.formingOpenTime === before.formingOpenTime, "MKT11_SMOKE_UNTOUCHED_FORMING",
      `${other.id} lost its forming bar`);
  }

  const marker = await page.evaluate(() =>
    (window as unknown as { __mkt11Marker?: string }).__mkt11Marker);
  check(marker === "no-reload", "MKT11_SMOKE_RELOAD",
    "the page reloaded during the timeframe change");

  const registryAfterChange = await waitForSubscriptions(4);
  check(registryAfterChange === 4, "MKT11_SMOKE_REGISTRY_CHANGE",
    `the API holds ${registryAfterChange} subscriptions after the change, expected 4`);

  // The untouched charts are still live, not merely still rendered.
  for (const entry of CHARTS.filter((item) => item.id !== "chart-1")) {
    const before = await readAll();
    const forming = await nextForming(entry.timeframe);
    const publishedAt = performance.now();
    await publishTick(forming, Number(chart(before, entry.id).snapshotWatermark));
    await waitForCount(entry.id, "tickCount", chart(before, entry.id).tickCount);
    liveDeliveryLatencyMs.push(performance.now() - publishedAt);
  }

  // ---------------------------------------------------------------------- AC5
  await page.close();
  const registryAfterClose = await waitForSubscriptions(0);
  check(registryAfterClose === 0, "MKT11_SMOKE_REGISTRY_RELEASE",
    `the API still holds ${registryAfterClose} subscriptions after the page closed`);

  if (pageErrors.length > 0) {
    throw new Error(`MKT11_SMOKE_PAGE_ERRORS: ${pageErrors.join(" | ")}`);
  }
  process.stdout.write(
    "MKT-11 browser smoke passed: four charts with four distinct identifiers streaming " +
    "live at four timeframes, four active server-side subscriptions, a timeframe change " +
    "on chart-1 that reloaded only chart-1 while the other three kept their candles, " +
    "their forming bars, and their live delivery, no page reload, still four " +
    "subscriptions after the change, and zero after the page closed. " +
    `Redis-to-browser delivery latency ms: ${JSON.stringify({
      samples: liveDeliveryLatencyMs.length,
      min: Math.min(...liveDeliveryLatencyMs),
      p50: percentile(liveDeliveryLatencyMs, 0.5),
      p95: percentile(liveDeliveryLatencyMs, 0.95),
      max: Math.max(...liveDeliveryLatencyMs)
    })}.\n`
  );
} finally {
  await browser.close();
  await redis.close();
  await pool.end();
  compose("start", "market-ingest");
}
