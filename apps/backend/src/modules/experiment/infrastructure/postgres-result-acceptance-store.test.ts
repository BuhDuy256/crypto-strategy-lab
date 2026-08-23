// Atomicity, idempotency, and immutability tests for accepted backtest results.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import type { ProvenanceChecklist } from "../application/backtest-result-acceptor.js";
import type { BacktestRunnerOutcome } from "../application/backtest-runner-service.js";
import { PostgresResultAcceptanceStore } from "./postgres-result-acceptance-store.js";
import { PostgresBacktestRunStore } from "./postgres-backtest-run-store.js";

const specId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const key = "b".repeat(64);

const checklist = {
  specification: { status: "recorded", id: specId, hash: "a".repeat(64) },
  dataset: { status: "recorded", value: {} }, strategy: { status: "recorded", value: {} },
  execution: { status: "recorded", value: {} }, metricSet: { status: "recorded", value: {} },
  engine: { status: "recorded", value: {} }, runtimeAndBuild: { status: "recorded", value: {} },
  newsInput: { status: "not-applicable" }, sentimentModel: { status: "not-applicable" },
  randomSeed: { status: "not-applicable" }, pythonRuntime: { status: "not-applicable" },
  combinationPolicy: { status: "not-applicable" },
  generatorAndSearch: { status: "not-applicable" }, rankingPolicy: { status: "not-applicable" },
  dataQualityExceptions: { status: "recorded", value: [] },
  attempt: { status: "recorded", value: { number: 1, runnerId: "runner-1" } }
} as const satisfies ProvenanceChecklist;

const outcome = {
  job: { jobId: runId, runId, specId, candidateId: "candidate", attempt: 1,
    idempotencyKey: key, correlationId: "request-1" },
  claim: {
    job: { jobId: runId, runId, specId, candidateId: "candidate", attempt: 1,
      idempotencyKey: key, correlationId: "request-1" },
    run: { runId }, attempt: 1, runnerId: "runner-1",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z"
  },
  specification: {
    specId, status: "frozen", contentHash: "a".repeat(64),
    content: { execution: { feeRate: 0 }, provenance: {} }
  },
  simulation: {
    initialCapital: 100, finalEquity: 110, annotations: [],
    trades: [{ direction: "long", entryTime: 1, entryPrice: 100, exitTime: 2,
      exitPrice: 110, quantity: 1, entryFee: 0, exitFee: 0, slippage: 0,
      profitAndLoss: 10, exitReason: "final-liquidation" }]
  },
  evaluation: {
    metricSet: { id: "mvp-metrics", version: "1.0.0" },
    values: { totalReturn: 0.1, winRate: 1, maximumDrawdown: 0, numberOfTrades: 1 }
  },
  runtimeIdentity: {
    nodeRuntimeVersion: "22.0.0", dependencyLockHash: "c".repeat(64),
    applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
  },
  datasetManifest: { ref: {}, candleCount: 2, gaps: [] }
} as unknown as BacktestRunnerOutcome;

describe("PostgresResultAcceptanceStore", () => {
  let pool: Pool;
  beforeAll(async () => { pool = await resetTestDatabase(); });
  beforeEach(async () => {
    await pool.query("TRUNCATE experiment.backtest_results, experiment.backtest_runs, experiment.specifications CASCADE");
    await pool.query(`INSERT INTO experiment.specifications
      (spec_id,status,content,content_hash,frozen_at) VALUES ($1,'frozen','{}',$2,now())`,
    [specId, "a".repeat(64)]);
    await pool.query(`INSERT INTO experiment.backtest_runs
      (run_id,spec_id,candidate_id,idempotency_key,status,correlation_id,lease_expires_at)
      VALUES ($1,$2,'candidate',$3,'running','request-1',now()+interval '30 seconds')`,
    [runId, specId, key]);
    await pool.query(`INSERT INTO experiment.backtest_attempts
      (run_id,attempt_number,runner_id,correlation_id,claimed_at,lease_expires_at)
      VALUES ($1,1,'runner-1','request-1',now(),now()+interval '30 seconds')`, [runId]);
  });
  afterAll(async () => { await pool?.end(); });

  it("atomically accepts one immutable result and ordered trade set", async () => {
    const store = new PostgresResultAcceptanceStore(pool);
    const first = await store.accept(outcome, checklist);
    const duplicate = await store.accept(outcome, checklist);
    expect(duplicate).toEqual(first);
    const changed = {
      ...outcome,
      evaluation: { ...outcome.evaluation, values: { ...outcome.evaluation.values, totalReturn: 0.2 } }
    };
    await expect(store.accept(changed, checklist)).rejects.toThrow("result content mismatch");
    expect((await pool.query("SELECT status FROM experiment.backtest_runs WHERE run_id=$1", [runId])).rows[0]).toEqual({ status: "completed" });
    expect((await pool.query("SELECT count(*)::int AS count FROM experiment.backtest_trades")).rows[0]).toEqual({ count: 1 });
    expect(await store.resolveProvenance(first.resultId)).toMatchObject({
      resultId: first.resultId,
      tradeContentHash: first.tradeContentHash,
      checklist: { combinationPolicy: { status: "not-applicable" } },
      attempts: [{ attempt: 1, runnerId: "runner-1", correlationId: "request-1" }]
    });
    await expect(pool.query("UPDATE experiment.backtest_results SET metrics='{}'")).rejects.toThrow("immutable");
  });

  it("rolls back every row when provenance serialization fails after result insertion", async () => {
    const invalid = { ...checklist, runtimeAndBuild: { status: "recorded", value: 1n } } as unknown as ProvenanceChecklist;
    await expect(new PostgresResultAcceptanceStore(pool).accept(outcome, invalid)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM experiment.backtest_results")).rows[0]).toEqual({ count: 0 });
    expect((await pool.query("SELECT status FROM experiment.backtest_runs WHERE run_id=$1", [runId])).rows[0]).toEqual({ status: "running" });
  });

  it("rejects stale claim acceptance after ownership changes", async () => {
    await pool.query("UPDATE experiment.backtest_runs SET lease_expires_at=now()-interval '1 second' WHERE run_id=$1", [runId]);
    const reclaimed = await new PostgresBacktestRunStore(pool).claimNext("runner-2");
    expect(reclaimed?.attempt).toBe(2);
    await expect(new PostgresResultAcceptanceStore(pool).accept(outcome, checklist))
      .rejects.toThrow("BACKTEST_CLAIM_LOST");
    expect((await pool.query("SELECT count(*)::int AS count FROM experiment.backtest_results")).rows[0])
      .toEqual({ count: 0 });
  });
});
