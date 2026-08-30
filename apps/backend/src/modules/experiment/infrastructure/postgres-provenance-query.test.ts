// Integration tests for the provenance read against real PostgreSQL.
//
// One behaviour per test: the read returns the full reproducibility checklist and
// the ordered attempt history for a completed result, keyed by run id; an unknown
// run yields undefined so the transport can answer with a clear client error. The
// provenance row is seeded in the exact shape the EXP-06 acceptance transaction
// writes, so the read is exercised without running the real runner.

import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { PostgresProvenanceQuery } from "./postgres-provenance-query.js";

const HEX = "a".repeat(64);

function hex64(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

// The checklist the DurableBacktestResultAcceptor records: seven recorded
// reproducibility inputs, the not-applicable declarations, and the acceptance
// bookkeeping the read must strip. Its keys cover the baseline's ten-item list.
function checklist(): Record<string, unknown> {
  return {
    specification: { status: "recorded", id: "spec-1", hash: HEX },
    dataset: { status: "recorded", value: { ref: { datasetId: "d" }, gaps: [] } },
    strategy: { status: "recorded", value: { id: "rsi", version: "1.0.0", parameters: {} } },
    execution: { status: "recorded", value: { initialCapital: 10000 } },
    metricSet: { status: "recorded", value: { id: "mvp-metrics", version: "1.0.0" } },
    engine: { status: "recorded", value: { id: "backtester", version: "1.0.0" } },
    runtimeAndBuild: { status: "recorded", value: { nodeRuntimeVersion: "20.0.0" } },
    newsInput: { status: "not-applicable" },
    sentimentModel: { status: "not-applicable" },
    randomSeed: { status: "not-applicable" },
    pythonRuntime: { status: "not-applicable" },
    combinationPolicy: { status: "not-applicable" },
    generatorAndSearch: { status: "not-applicable" },
    rankingPolicy: { status: "not-applicable" },
    dataQualityExceptions: { status: "recorded", value: [] },
    attempt: { status: "recorded", value: { number: 1, runnerId: "runner-1" } },
    resultArtifact: { status: "recorded", value: { resultId: "r", tradeContentHash: HEX } }
  };
}

describe("PostgresProvenanceQuery", () => {
  let pool: Pool;
  let query: PostgresProvenanceQuery;

  beforeAll(async () => {
    pool = await resetTestDatabase();
  });
  beforeEach(async () => {
    await pool.query(
      `TRUNCATE experiment.backtest_result_provenance, experiment.backtest_results,
        experiment.backtest_attempts, experiment.backtest_runs,
        experiment.specifications CASCADE`
    );
    query = new PostgresProvenanceQuery(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function seedCompletedResult(): Promise<{ runId: string; resultId: string }> {
    const runId = randomUUID();
    const resultId = randomUUID();
    const specId = randomUUID();
    const idempotencyKey = hex64(`key-${runId}`);
    await pool.query(
      `INSERT INTO experiment.specifications (spec_id, status, content, content_hash, frozen_at)
       VALUES ($1, 'frozen', '{}'::jsonb, $2, now())`,
      [specId, hex64(`spec-${runId}`)]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_runs
         (run_id, spec_id, candidate_id, idempotency_key, status, correlation_id, lease_expires_at)
       VALUES ($1, $2, 'candidate-1', $3, 'completed', 'correlation-1', NULL)`,
      [runId, specId, idempotencyKey]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_attempts
         (run_id, attempt_number, runner_id, correlation_id, claimed_at, lease_expires_at, completed_at)
       VALUES ($1, 1, 'runner-1', 'correlation-1', now(), now(), now())`,
      [runId]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_results
         (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
          execution_assumptions, trade_content_hash)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $6)`,
      [resultId, runId, specId, HEX, idempotencyKey, hex64(`trade-${runId}`)]
    );
    await pool.query(
      "INSERT INTO experiment.backtest_result_provenance (result_id, checklist) VALUES ($1, $2::jsonb)",
      [resultId, JSON.stringify(checklist())]
    );
    return { runId, resultId };
  }

  it("returns the full reproducibility checklist and attempt history for a completed run", async () => {
    const { runId, resultId } = await seedCompletedResult();

    const response = await query.getProvenance(runId);

    expect(response?.runId).toBe(runId);
    expect(response?.resultId).toBe(resultId);
    // Every baseline reproducibility input resolves, and the acceptance-only
    // resultArtifact bookkeeping is not exposed as a checklist item.
    for (const item of [
      "specification", "dataset", "strategy", "execution", "metricSet", "engine",
      "runtimeAndBuild", "combinationPolicy", "generatorAndSearch", "rankingPolicy",
      "randomSeed", "newsInput", "sentimentModel", "dataQualityExceptions", "attempt"
    ]) {
      expect(response?.checklist[item]?.status).toMatch(/recorded|not-applicable/);
    }
    expect(response?.checklist.resultArtifact).toBeUndefined();
    expect(response?.attempts).toEqual([
      expect.objectContaining({ attempt: 1, runnerId: "runner-1", failureReason: null })
    ]);
  });

  it("returns undefined for a run with no accepted result", async () => {
    expect(await query.getProvenance(randomUUID())).toBeUndefined();
  });
});
