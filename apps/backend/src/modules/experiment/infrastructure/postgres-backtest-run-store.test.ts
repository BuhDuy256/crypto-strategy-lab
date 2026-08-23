// PostgreSQL concurrency and lease-recovery tests for the V1 durable executor.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { PostgresBacktestRunStore } from "./postgres-backtest-run-store.js";

describe("PostgresBacktestRunStore", () => {
  let pool: Pool;
  beforeAll(async () => { pool = await resetTestDatabase(); });
  beforeEach(async () => {
    await pool.query("TRUNCATE experiment.backtest_attempts, experiment.backtest_runs, experiment.specifications CASCADE");
    await pool.query(`INSERT INTO experiment.specifications (spec_id, status, content, content_hash, frozen_at)
      VALUES ('10000000-0000-4000-8000-000000000001', 'frozen', '{}'::jsonb, $1, now())`, ["a".repeat(64)]);
  });
  afterAll(async () => { await pool?.end(); });

  it("claims different queued runs concurrently and records attempt one", async () => {
    const store = new PostgresBacktestRunStore(pool);
    for (let index = 1; index <= 2; index += 1) {
      await store.createOrGet({
        runId: `20000000-0000-4000-8000-00000000000${index}`,
        specId: "10000000-0000-4000-8000-000000000001", candidateId: `candidate-${index}`,
        idempotencyKey: String(index).repeat(64), correlationId: `request-${index}`
      });
    }
    const [first, second] = await Promise.all([store.claimNext("runner-a"), store.claimNext("runner-b")]);
    expect(first?.run.runId).not.toBe(second?.run.runId);
    expect(first?.attempt).toBe(1);
    expect(second?.attempt).toBe(1);
  });

  it("reclaims an expired lease as a new recorded attempt", async () => {
    const store = new PostgresBacktestRunStore(pool, 1);
    const created = await store.createOrGet({
      runId: "20000000-0000-4000-8000-000000000001",
      specId: "10000000-0000-4000-8000-000000000001", candidateId: "candidate",
      idempotencyKey: "b".repeat(64), correlationId: "request"
    });
    await store.claimNext("runner-a");
    await pool.query("UPDATE experiment.backtest_runs SET lease_expires_at = now() - interval '1 second' WHERE run_id = $1", [created.run.runId]);
    const reclaimed = await store.claimNext("runner-b");
    expect(reclaimed).toMatchObject({ attempt: 2, run: { runId: created.run.runId } });
    expect(reclaimed?.job).toMatchObject({ attempt: 2, correlationId: "request" });
    const history = await pool.query("SELECT attempt_number, runner_id, completed_at IS NOT NULL AS completed, failure_reason FROM experiment.backtest_attempts WHERE run_id = $1 ORDER BY attempt_number", [created.run.runId]);
    expect(history.rows).toEqual([
      { attempt_number: 1, runner_id: "runner-a", completed: true, failure_reason: "BACKTEST_LEASE_EXPIRED" },
      { attempt_number: 2, runner_id: "runner-b", completed: false, failure_reason: null }
    ]);
    const firstAttempt = {
      ...reclaimed!,
      attempt: 1,
      runnerId: "runner-a",
      job: { ...reclaimed!.job, attempt: 1 }
    };
    await expect(store.heartbeat(firstAttempt)).resolves.toBe(false);
    await expect(store.fail(firstAttempt, "stale")).rejects.toThrow("BACKTEST_CLAIM_LOST");
    await expect(store.heartbeat(reclaimed!)).resolves.toBe(true);
  });
});
