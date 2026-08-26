// PROOF-REP-001 evidence: leaderboard reproducibility, end to end against real
// PostgreSQL.
//
// A completed result is accepted with the real deterministic backtester's trades
// and a complete reproducibility checklist. The proof then (1) resolves the full
// checklist back from storage and confirms the build identity is explicit, not a
// mutable default or alias, and (2) reruns the same recorded backtest input and
// shows the canonical trade hash is identical to the stored one. The leaderboard
// read that resolves a Top-1 entry back to its strategy and specification is
// proven separately by postgres-leaderboard-query.test.ts; the cross-process
// determinism of the trade hash is proven by integration/backtester-determinism.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { canonicalSha256 } from "../../../platform/canonical-json.js";
import { Backtester, BACKTEST_ENGINE } from "../domain/backtester.js";
import type { BacktestInput } from "../domain/backtester.js";
import type { ProvenanceChecklist } from "../application/backtest-result-acceptor.js";
import type { BacktestRunnerOutcome } from "../application/backtest-runner-service.js";
import { PostgresResultAcceptanceStore } from "./postgres-result-acceptance-store.js";

const specId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const key = "b".repeat(64);

// A small deterministic backtest input: one buy signal over two candles. The real
// backtester turns it into a fixed trade set, which is what a rerun must reproduce.
const input: BacktestInput = {
  candles: [
    { openTime: 0, closeTime: 9, open: 100, high: 102, low: 99, close: 101, volume: 1 },
    { openTime: 10, closeTime: 19, open: 101, high: 106, low: 100, close: 105, volume: 1 }
  ],
  signals: [{ action: "buy", effectiveTime: 9 }],
  annotations: [],
  execution: {
    initialCapital: 1000, feeRate: 0.001, slippageRate: 0.001,
    signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
    leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
    stopLoss: { enabled: false }, takeProfit: { enabled: false },
    sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close", decimalPlaces: 8
  }
};

// The explicit runtime and build identity a reproducible result must record. No
// field is an alias, a "latest", or an empty default.
const runtimeIdentity = {
  nodeRuntimeVersion: "22.0.0",
  dependencyLockHash: "c".repeat(64),
  applicationCommit: "app-commit-abc123",
  workerCommit: "worker-commit-def456",
  deterministicConfigVersion: "1.0.0"
} as const;

function runTrades() {
  return new Backtester().run(input).trades;
}

function fullChecklist(): ProvenanceChecklist {
  return {
    specification: { status: "recorded", id: specId, hash: "a".repeat(64) },
    dataset: { status: "recorded", value: { ref: { datasetId: "sha256:" + "d".repeat(58) }, gaps: [] } },
    strategy: { status: "recorded", value: { id: "rsi", version: "1.0.0" } },
    execution: { status: "recorded", value: input.execution },
    metricSet: { status: "recorded", value: { id: "mvp-metrics", version: "1.0.0" } },
    engine: { status: "recorded", value: BACKTEST_ENGINE },
    runtimeAndBuild: { status: "recorded", value: runtimeIdentity },
    newsInput: { status: "not-applicable" }, sentimentModel: { status: "not-applicable" },
    randomSeed: { status: "not-applicable" }, pythonRuntime: { status: "not-applicable" },
    combinationPolicy: { status: "not-applicable" },
    generatorAndSearch: { status: "not-applicable" }, rankingPolicy: { status: "not-applicable" },
    dataQualityExceptions: { status: "recorded", value: [] },
    attempt: { status: "recorded", value: { number: 1, runnerId: "runner-1" } }
  } as const satisfies ProvenanceChecklist;
}

function outcomeWith(trades: unknown): BacktestRunnerOutcome {
  return {
    job: { jobId: runId, runId, specId, candidateId: "candidate", attempt: 1, idempotencyKey: key, correlationId: "request-1" },
    claim: {
      job: { jobId: runId, runId, specId, candidateId: "candidate", attempt: 1, idempotencyKey: key, correlationId: "request-1" },
      run: { runId }, attempt: 1, runnerId: "runner-1", leaseExpiresAt: "2099-01-01T00:00:00.000Z"
    },
    specification: { specId, status: "frozen", contentHash: "a".repeat(64), content: { execution: input.execution, provenance: {} } },
    simulation: { initialCapital: 1000, finalEquity: 1050, annotations: [], trades },
    evaluation: { metricSet: { id: "mvp-metrics", version: "1.0.0" }, values: { totalReturn: 0.05, winRate: 1, maximumDrawdown: 0, numberOfTrades: 1 } },
    runtimeIdentity,
    datasetManifest: { ref: {}, candleCount: 2, gaps: [] }
  } as unknown as BacktestRunnerOutcome;
}

describe("PROOF-REP-001 leaderboard reproducibility", () => {
  let pool: Pool;
  beforeAll(async () => { pool = await resetTestDatabase(); });
  beforeEach(async () => {
    await pool.query("TRUNCATE experiment.backtest_results, experiment.backtest_runs, experiment.specifications CASCADE");
    await pool.query(
      "INSERT INTO experiment.specifications (spec_id,status,content,content_hash,frozen_at) VALUES ($1,'frozen','{}',$2,now())",
      [specId, "a".repeat(64)]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_runs (run_id,spec_id,candidate_id,idempotency_key,status,correlation_id,lease_expires_at)
       VALUES ($1,$2,'candidate',$3,'running','request-1',now()+interval '30 seconds')`,
      [runId, specId, key]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_attempts (run_id,attempt_number,runner_id,correlation_id,claimed_at,lease_expires_at)
       VALUES ($1,1,'runner-1','request-1',now(),now()+interval '30 seconds')`,
      [runId]
    );
  });
  afterAll(async () => { await pool?.end(); });

  it("reruns the recorded backtest and reproduces the stored canonical trade hash", async () => {
    const store = new PostgresResultAcceptanceStore(pool);
    const trades = runTrades();
    const accepted = await store.accept(outcomeWith(trades), fullChecklist());

    // A rerun of the same recorded input reproduces the exact canonical trades,
    // so the stored trade content hash matches the freshly computed one.
    const rerun = runTrades();
    expect(canonicalSha256(rerun)).toBe(accepted.tradeContentHash);
    expect(rerun).toEqual(trades);

    const storedTrades = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM experiment.backtest_trades WHERE result_id=$1",
      [accepted.resultId]
    );
    expect(storedTrades.rows[0]?.count).toBe(trades.length);
  });

  it("resolves the full reproducibility checklist with an explicit, non-alias build identity", async () => {
    const store = new PostgresResultAcceptanceStore(pool);
    const accepted = await store.accept(outcomeWith(runTrades()), fullChecklist());

    const provenance = (await store.resolveProvenance(accepted.resultId)) as {
      readonly checklist: Record<string, { readonly status: string; readonly value?: unknown }>;
    };
    const checklist = provenance.checklist;

    // Every baseline checklist item is present (recorded or explicitly not-applicable).
    for (const item of Object.values(checklist)) {
      expect(["recorded", "not-applicable"]).toContain(item.status);
    }
    expect(Object.keys(checklist).length).toBeGreaterThanOrEqual(10);

    // The build identity is the explicit recorded value, never a mutable default.
    expect(checklist.runtimeAndBuild?.value).toEqual(runtimeIdentity);
    expect(runtimeIdentity.dependencyLockHash).toMatch(/^[0-9a-f]{64}$/);
    for (const value of [runtimeIdentity.applicationCommit, runtimeIdentity.workerCommit]) {
      expect(value).not.toBe("");
      expect(value).not.toBe("latest");
    }
    expect(checklist.engine?.value).toEqual(BACKTEST_ENGINE);
  });
});
