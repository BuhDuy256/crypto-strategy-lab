// Focused browser smoke for MKT-09 against the running Docker Compose topology.
//
// It proves the browser sees provider health change while its established chart
// subscriptions keep their durable state. The temporary Compose override cuts
// only market-ingest's Binance hosts; PostgreSQL, API, Redis, and the SPA stay up.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const WEB_ORIGIN = "http://localhost:8080";
const OUTAGE_OVERRIDE = ".scratch/mkt09/outage.yml";
const EXPECTED_CHARTS = 4;
const POLL_TIMEOUT_MS = 75_000;
const STABLE_FOR_MS = 1_500;

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter((value): value is string => value !== undefined);
const executablePath = chromeCandidates.find(existsSync);
if (executablePath === undefined) {
  throw new Error("MKT09_SMOKE_BROWSER: set CHROME_EXECUTABLE to a Chromium browser path");
}

interface ChartState {
  readonly chartId: string;
  readonly connection: string;
  readonly subscriptionState: string;
  readonly durableCount: number;
  readonly durableLastOpenTime: string;
  readonly formingOpenTime: string;
  readonly liveUpdateCount: number;
  readonly snapshotCount: number;
}

interface ProviderHealth {
  readonly provider: string;
  readonly status: string;
  readonly checkedAt: number;
  readonly reason?: string;
}

interface SmokeEvidence {
  readonly baseline: readonly ChartState[];
  readonly outage: readonly ChartState[];
  readonly recovered: readonly ChartState[];
  readonly health: {
    readonly baseline: ProviderHealth;
    readonly outage: ProviderHealth;
    readonly recovered: ProviderHealth;
  };
  readonly transitions: {
    readonly degradedAfterMs: number;
    readonly healthyAfterMs: number;
  };
  readonly subscriptions: {
    readonly baseline: number;
    readonly outage: number;
    readonly recovered: number;
  };
}

function compose(...args: string[]): void {
  execFileSync("docker", ["compose", ...args], { cwd: process.cwd(), stdio: "inherit" });
}

function check(condition: boolean, code: string, detail: string): void {
  if (!condition) throw new Error(`${code}: ${detail}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function providerHealth(): Promise<ProviderHealth> {
  const response = await fetch(`${WEB_ORIGIN}/api/market/provider-health?provider=binance`);
  if (!response.ok) {
    throw new Error(`MKT09_SMOKE_HEALTH_ENDPOINT: returned ${response.status}`);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    throw new Error("MKT09_SMOKE_HEALTH_ENDPOINT: did not return an object");
  }
  const health = body as Partial<ProviderHealth>;
  if (health.provider !== "binance" || typeof health.status !== "string" ||
    typeof health.checkedAt !== "number") {
    throw new Error("MKT09_SMOKE_HEALTH_ENDPOINT: did not return provider health");
  }
  return health as ProviderHealth;
}

async function activeSubscriptions(): Promise<number> {
  const response = await fetch(`${WEB_ORIGIN}/api/realtime/subscriptions`);
  if (!response.ok) {
    throw new Error(`MKT09_SMOKE_SUBSCRIPTIONS: returned ${response.status}`);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null ||
    typeof (body as { readonly activeSubscriptions?: unknown }).activeSubscriptions !== "number") {
    throw new Error("MKT09_SMOKE_SUBSCRIPTIONS: activeSubscriptions was not a number");
  }
  return (body as { readonly activeSubscriptions: number }).activeSubscriptions;
}

async function waitForApi(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${WEB_ORIGIN}/api/health`);
      if (response.ok) return;
    } catch {
      // Recreating ingest does not intentionally restart the API, but the smoke
      // does not treat a short proxy disruption as a successful cleanup.
    }
    await wait(500);
  }
  throw new Error("MKT09_SMOKE_API: API did not become healthy before timeout");
}

async function readCharts(page: import("playwright-core").Page): Promise<ChartState[]> {
  return page.locator("[data-chart-id]").evaluateAll((elements) =>
    elements.map((element) => {
      const data = (element as HTMLElement).dataset;
      return {
        chartId: data.chartId ?? "",
        connection: data.connection ?? "",
        subscriptionState: data.subscriptionState ?? "",
        durableCount: Number(data.durableCount ?? "0"),
        durableLastOpenTime: data.durableLastOpenTime ?? "",
        formingOpenTime: data.formingOpenTime ?? "",
        liveUpdateCount: Number(data.liveUpdateCount ?? "0"),
        snapshotCount: Number(data.snapshotCount ?? "0")
      };
    })
  );
}

function chart(charts: readonly ChartState[], chartId: string): ChartState {
  const found = charts.find((entry) => entry.chartId === chartId);
  if (found === undefined) throw new Error(`MKT09_SMOKE_CHART: missing ${chartId}`);
  return found;
}

function assertLiveCharts(charts: readonly ChartState[], phase: string): void {
  check(charts.length === EXPECTED_CHARTS, "MKT09_SMOKE_CHART_COUNT",
    `${phase}: rendered ${charts.length} charts, expected ${EXPECTED_CHARTS}`);
  check(new Set(charts.map((entry) => entry.chartId)).size === EXPECTED_CHARTS,
    "MKT09_SMOKE_CHART_IDENTITIES", `${phase}: chart ids were not unique`);
  for (const entry of charts) {
    check(entry.snapshotCount > 0, "MKT09_SMOKE_CHART_SNAPSHOT",
      `${phase}: ${entry.chartId} has no snapshot`);
    check(entry.connection === "connected" && entry.subscriptionState === "live",
      "MKT09_SMOKE_CHART_STATE",
      `${phase}: ${entry.chartId} is ${entry.connection}/${entry.subscriptionState}`);
  }
  check(charts.some((entry) => entry.durableCount > 0 && entry.durableLastOpenTime !== ""),
    "MKT09_SMOKE_CHART_DATA", `${phase}: no chart has a durable snapshot`);
}

function assertDurableStateRetained(
  baseline: readonly ChartState[],
  current: readonly ChartState[],
  phase: string
): void {
  for (const entry of baseline) {
    if (entry.durableCount === 0) continue;
    const later = chart(current, entry.chartId);
    check(later.durableCount >= entry.durableCount, "MKT09_SMOKE_DURABLE_LOSS",
      `${phase}: ${entry.chartId} durable count fell ${entry.durableCount} -> ${later.durableCount}`);
    check(later.durableLastOpenTime !== "", "MKT09_SMOKE_DURABLE_IDENTITY",
      `${phase}: ${entry.chartId} lost its durable candle identity`);
  }
}

async function waitForBrowserHealth(
  page: import("playwright-core").Page,
  expected: "healthy" | "degraded"
): Promise<void> {
  await page.waitForFunction(
    (status) => document.querySelector("[data-provider-health]")?.getAttribute("data-provider-health") === status,
    expected,
    { timeout: POLL_TIMEOUT_MS }
  );
}

async function waitForLiveUpdate(
  page: import("playwright-core").Page,
  before: readonly ChartState[]
): Promise<void> {
  let current = await readCharts(page);
  const attempts = Math.ceil(POLL_TIMEOUT_MS / 1000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (before.some((entry) =>
      chart(current, entry.chartId).liveUpdateCount > entry.liveUpdateCount)) {
      return;
    }
    await wait(1000);
    current = await readCharts(page);
  }
  throw new Error(
    `MKT09_SMOKE_LIVE_RESUME: no chart received a live update after recovery; ` +
    `before=${JSON.stringify(before)} current=${JSON.stringify(current)}`
  );
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

let outageApplied = false;
let runFailure: unknown;
let cleanupFailure: unknown;

try {
  await page.goto(`${WEB_ORIGIN}/realtime`, { waitUntil: "networkidle" });
  await page.waitForFunction((expectedCharts) => document.querySelectorAll("[data-chart-id]").length === expectedCharts,
    EXPECTED_CHARTS,
    { timeout: POLL_TIMEOUT_MS });
  await waitForBrowserHealth(page, "healthy");

  const baseline = await readCharts(page);
  assertLiveCharts(baseline, "baseline");
  const baselineSubscriptions = await activeSubscriptions();
  check(baselineSubscriptions === EXPECTED_CHARTS, "MKT09_SMOKE_SUBSCRIPTIONS_BASELINE",
    `the API holds ${baselineSubscriptions} subscriptions, expected ${EXPECTED_CHARTS}`);
  const baselineHealth = await providerHealth();
  check(baselineHealth.status === "healthy", "MKT09_SMOKE_HEALTH_BASELINE",
    `the endpoint reported ${baselineHealth.status}`);

  await page.evaluate(() => {
    (window as unknown as { __mkt09NoReload?: string }).__mkt09NoReload = "present";
  });
  await wait(STABLE_FOR_MS);
  const stable = await readCharts(page);
  assertLiveCharts(stable, "stable baseline");
  assertDurableStateRetained(baseline, stable, "stable baseline");

  const outageStartedAt = Date.now();
  compose("-f", "docker-compose.yml", "-f", OUTAGE_OVERRIDE,
    "up", "-d", "--no-deps", "--force-recreate", "market-ingest");
  outageApplied = true;
  await waitForBrowserHealth(page, "degraded");
  const degradedAfterMs = Date.now() - outageStartedAt;
  const outage = await readCharts(page);
  const outageSubscriptions = await activeSubscriptions();
  const outageHealth = await providerHealth();
  check(outageHealth.status === "degraded", "MKT09_SMOKE_HEALTH_OUTAGE",
    `the endpoint reported ${outageHealth.status}`);
  check(outageSubscriptions === EXPECTED_CHARTS, "MKT09_SMOKE_SUBSCRIPTIONS_OUTAGE",
    `the API holds ${outageSubscriptions} subscriptions during the outage, expected ${EXPECTED_CHARTS}`);
  assertDurableStateRetained(stable, outage, "outage");
  process.stdout.write(
    `MKT-09 C3 browser evidence: ${JSON.stringify({
      health: outageHealth, charts: outage, subscriptions: outageSubscriptions, degradedAfterMs
    })}\n`
  );

  const restoredAt = Date.now();
  compose("up", "-d", "--no-deps", "--force-recreate", "market-ingest");
  outageApplied = false;
  await waitForApi();
  await waitForBrowserHealth(page, "healthy");
  const healthyAfterMs = Date.now() - restoredAt;
  await waitForLiveUpdate(page, outage);
  const recovered = await readCharts(page);
  const recoveredSubscriptions = await activeSubscriptions();
  const recoveredHealth = await providerHealth();
  check(recoveredHealth.status === "healthy", "MKT09_SMOKE_HEALTH_RECOVERY",
    `the endpoint reported ${recoveredHealth.status}`);
  check(recoveredSubscriptions === EXPECTED_CHARTS, "MKT09_SMOKE_SUBSCRIPTIONS_RECOVERY",
    `the API holds ${recoveredSubscriptions} subscriptions after recovery, expected ${EXPECTED_CHARTS}`);
  assertDurableStateRetained(outage, recovered, "recovery");

  const marker = await page.evaluate(() =>
    (window as unknown as { __mkt09NoReload?: string }).__mkt09NoReload);
  check(marker === "present", "MKT09_SMOKE_RELOAD", "the page reloaded during the outage or recovery");
  if (pageErrors.length > 0) {
    throw new Error(`MKT09_SMOKE_PAGE_ERRORS: ${pageErrors.join(" | ")}`);
  }

  const evidence: SmokeEvidence = {
    baseline: stable,
    outage,
    recovered,
    health: { baseline: baselineHealth, outage: outageHealth, recovered: recoveredHealth },
    transitions: { degradedAfterMs, healthyAfterMs },
    subscriptions: {
      baseline: baselineSubscriptions,
      outage: outageSubscriptions,
      recovered: recoveredSubscriptions
    }
  };
  process.stdout.write(`MKT-09 browser smoke passed: ${JSON.stringify(evidence)}\n`);
} catch (error) {
  runFailure = error;
}

try {
  if (outageApplied) {
    compose("up", "-d", "--no-deps", "--force-recreate", "market-ingest");
    await waitForApi();
  }
} catch (error) {
  cleanupFailure = error;
}

await browser.close();

if (runFailure !== undefined) {
  if (cleanupFailure !== undefined) {
    process.stderr.write(`MKT09_SMOKE_CLEANUP: ${String(cleanupFailure)}\n`);
  }
  throw runFailure;
}
if (cleanupFailure !== undefined) {
  throw cleanupFailure;
}
