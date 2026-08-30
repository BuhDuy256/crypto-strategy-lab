// Process-level proof for the separate API and backtest-runner lifecycle.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { resetTestDatabase } from "../apps/backend/src/platform/test-database.js";

vi.setConfig({ testTimeout: 300_000 });
import { PostgresCandleRepository } from "../apps/backend/src/modules/market/infrastructure/postgres-candle-repository.js";
import { PostgresDatasetManifestStore } from "../apps/backend/src/modules/market/infrastructure/postgres-dataset-manifest-store.js";
import { MarketDatasetService } from "../apps/backend/src/modules/market/application/market-dataset-service.js";
import { PostgresExperimentSpecificationStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-experiment-specification-store.js";
import { ExperimentSpecificationService } from "../apps/backend/src/modules/experiment/application/experiment-specification-service.js";
import { PostgresBacktestRunStore } from "../apps/backend/src/modules/experiment/infrastructure/postgres-backtest-run-store.js";
import { BacktestRunService } from "../apps/backend/src/modules/experiment/application/backtest-run-service.js";
import { createBuiltInStrategyRegistry } from "../apps/backend/src/modules/strategy/application/built-in-strategy-registry.js";

const root = process.cwd();
const backend = join(root, "apps", "backend");
const children = new Set<ChildProcess>();
const processOutput = new WeakMap<ChildProcess, { text: string }>();
const runtimeIdentity = {
  nodeRuntimeVersion: process.versions.node,
  dependencyLockHash: "d".repeat(64),
  applicationCommit: "integration-app-build",
  workerCommit: "integration-worker-build",
  deterministicConfigVersion: "1.0.0"
};

function startProcess(entry: "main.api.ts" | "main.backtest-runner.ts", extraEnv = {}): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", `src/${entry}`], {
    cwd: backend,
    env: { ...process.env, ...runtimeIdentityToEnv(), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  children.add(child);
  const output = { text: "" };
  processOutput.set(child, output);
  child.stdout?.on("data", (chunk: Buffer) => { output.text += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer) => { output.text += chunk.toString(); });
  child.once("exit", () => children.delete(child));
  return child;
}

async function waitForOutput(child: ChildProcess, expected: string): Promise<void> {
  await waitUntil(async () => {
    if (processOutput.get(child)?.text.includes(expected)) return true;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Process exited before '${expected}': ${processOutput.get(child)?.text ?? ""}`);
    }
    return false;
  });
}

function runtimeIdentityToEnv(): NodeJS.ProcessEnv {
  return {
    DEPENDENCY_LOCK_HASH: runtimeIdentity.dependencyLockHash,
    APPLICATION_COMMIT: runtimeIdentity.applicationCommit,
    WORKER_COMMIT: runtimeIdentity.workerCommit,
    DETERMINISTIC_CONFIG_VERSION: runtimeIdentity.deterministicConfigVersion,
    BACKTEST_RUNNER_CONCURRENCY: "1"
  };
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for process lifecycle condition");
}

async function terminate(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  if (!child.kill(signal)) throw new Error(`Could not send ${signal} to child process`);
  await Promise.race([
    exited,
    new Promise<void>((_resolve, reject) => setTimeout(
      () => reject(new Error(`Child did not exit after ${signal}`)), 5_000
    ))
  ]);
}

async function requestGracefulStop(child: ChildProcess): Promise<void> {
  if (process.platform !== "win32") return terminate(child, "SIGTERM");
  if (!child.connected) throw new Error("Runner IPC channel is unavailable");
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.send("shutdown");
  await Promise.race([
    exited,
    new Promise<void>((_resolve, reject) => setTimeout(
      () => reject(new Error("Child did not exit after graceful shutdown request")), 5_000
    ))
  ]);
}

describe("backtest runner process lifecycle", () => {
  let pool: Pool;
  let specifications: ExperimentSpecificationService;
  let runs: BacktestRunService;
  let datasetRef: Awaited<ReturnType<MarketDatasetService["createDataset"]>>["ref"];

  beforeAll(async () => {
    pool = await resetTestDatabase();
    const candleStore = new PostgresCandleRepository(pool);
    const datasetService = new MarketDatasetService(
      candleStore,
      new PostgresDatasetManifestStore(pool)
    );
    await candleStore.appendMany(Array.from({ length: 1_200 }, (_, index) => ({
      provider: "fixture", symbol: "BTCUSDT", timeframe: "1m" as const,
      openTime: index * 60_000, closeTime: index * 60_000 + 59_999,
      open: 100 + index / 100, high: 102 + index / 100,
      low: 99 + index / 100, close: 101 + index / 100,
      volume: 10, closed: true as const, revision: 1
    })));
    datasetRef = (await datasetService.createDataset({
      provider: "fixture", symbol: "BTCUSDT", timeframe: "1m",
      range: { startTime: 0, endTime: 1_199 * 60_000 }
    })).ref;
    specifications = new ExperimentSpecificationService(
      new PostgresExperimentSpecificationStore(pool),
      datasetService,
      createBuiltInStrategyRegistry()
    );
    const runStore = new PostgresBacktestRunStore(pool);
    runs = new BacktestRunService(specifications, runStore, runStore);
  });

  afterAll(async () => {
    await Promise.all([...children].map((child) => terminate(child, "SIGKILL")));
    await pool?.end();
  });

  async function queueRun(fastPeriod: number): Promise<string> {
    const draft = await specifications.createDraft({
      schemaVersion: "v1", datasetRef,
      strategy: {
        id: "moving-average", version: "1.0.0",
        parameters: { fastPeriod, slowPeriod: 20, priceSource: "close" }
      },
      execution: {
        initialCapital: 10_000, feeRate: 0.001, slippageRate: 0.0005,
        signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
        leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
        stopLoss: { enabled: false }, takeProfit: { enabled: false },
        sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close",
        decimalPlaces: 8
      },
      metricSet: { id: "mvp-metrics", version: "1.0.0" }
    });
    await specifications.freeze(draft.specId, {
      engine: { id: "backtester", version: "1.0.0" }, ...runtimeIdentity
    });
    return (await runs.start(draft.specId, `lifecycle-${fastPeriod}`)).runId;
  }

  it("keeps work independent of the API and accepts one result with two runners", async () => {
    const api = startProcess("main.api.ts", { PORT: "0" });
    const runners = [startProcess("main.backtest-runner.ts"), startProcess("main.backtest-runner.ts")];
    await waitForOutput(api, "API process listening");
    await Promise.all(runners.map((runner) => waitForOutput(runner, "Runner slot ready")));
    const runId = await queueRun(10);
    await waitUntil(async () => (await runs.get(runId)).status === "running");
    await terminate(api, "SIGKILL");
    await waitUntil(async () => (await runs.get(runId)).status === "completed");
    const result = await pool.query(
      "SELECT count(*)::int AS count FROM experiment.backtest_results WHERE run_id = $1", [runId]
    );
    expect(result.rows[0]?.count).toBe(1);
    expect(runners.some((runner) => processOutput.get(runner)?.text.includes("lifecycle-10")))
      .toBe(true);
    await Promise.all(runners.map((runner) => terminate(runner)));
  }, 120_000);

  it("reclaims a hard-killed runner and records the incremented attempt", async () => {
    const first = startProcess("main.backtest-runner.ts");
    await waitForOutput(first, "Runner slot ready");
    const runId = await queueRun(11);
    await waitUntil(async () => (await runs.get(runId)).status === "running");
    await terminate(first, "SIGKILL");
    await pool.query(
      "UPDATE experiment.backtest_runs SET lease_expires_at = now() - interval '1 second' WHERE run_id = $1",
      [runId]
    );
    const replacement = startProcess("main.backtest-runner.ts");
    await waitForOutput(replacement, "Runner slot ready");
    await waitUntil(async () => (await runs.get(runId)).status === "completed");
    const attempts = await pool.query(
      "SELECT attempt_number, failure_reason FROM experiment.backtest_attempts WHERE run_id = $1 ORDER BY attempt_number",
      [runId]
    );
    expect(attempts.rows).toEqual([
      { attempt_number: 1, failure_reason: "BACKTEST_LEASE_EXPIRED" },
      { attempt_number: 2, failure_reason: null }
    ]);
    await terminate(replacement);
  }, 120_000);

  it("releases an active claim on graceful shutdown and a replacement completes it", async () => {
    const first = startProcess("main.backtest-runner.ts");
    await waitForOutput(first, "Runner slot ready");
    const runId = await queueRun(12);
    await waitUntil(async () => (await runs.get(runId)).status === "running");
    await requestGracefulStop(first);
    expect((await runs.get(runId)).status).toBe("queued");
    const replacement = startProcess("main.backtest-runner.ts");
    await waitForOutput(replacement, "Runner slot ready");
    await waitUntil(async () => (await runs.get(runId)).status === "completed");
    const attempts = await pool.query(
      "SELECT attempt_number, failure_reason FROM experiment.backtest_attempts WHERE run_id = $1 ORDER BY attempt_number",
      [runId]
    );
    expect(attempts.rows).toEqual([
      { attempt_number: 1, failure_reason: "released during cancellation or shutdown" },
      { attempt_number: 2, failure_reason: null }
    ]);
    await terminate(replacement);
  }, 120_000);
});
