// PostgreSQL durable queue adapter for V1-V5, authorized by ADR-010.

import type { Pool } from "pg";
import type {
  BacktestExecutor, BacktestJob, BacktestRun, BacktestRunStatus, BacktestRunStore,
  ClaimedBacktestJob
} from "../application/backtest-run-service.js";

interface RunRow {
  run_id: string; spec_id: string; candidate_id: string; idempotency_key: string;
  status: BacktestRunStatus; failure_reason: string | null; created_at: Date; updated_at: Date;
  correlation_id: string;
}

function map(row: RunRow): BacktestRun {
  return {
    runId: row.run_id, specId: row.spec_id, candidateId: row.candidate_id,
    idempotencyKey: row.idempotency_key, status: row.status,
    ...(row.failure_reason === null ? {} : { failureReason: row.failure_reason }),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
  };
}

const columns = "run_id, spec_id, candidate_id, idempotency_key, status, failure_reason, correlation_id, created_at, updated_at";

export class PostgresBacktestRunStore implements BacktestRunStore, BacktestExecutor {
  constructor(private readonly pool: Pool, private readonly leaseSeconds = 30) {}

  async createOrGet(input: { runId: string; specId: string; candidateId: string; idempotencyKey: string; correlationId: string }): Promise<{ run: BacktestRun; created: boolean }> {
    const inserted = await this.pool.query<RunRow>(
      `INSERT INTO experiment.backtest_runs
       (run_id, spec_id, candidate_id, idempotency_key, status, correlation_id)
       VALUES ($1, $2, $3, $4, 'queued', $5)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING ${columns}`,
      [input.runId, input.specId, input.candidateId, input.idempotencyKey, input.correlationId]
    );
    const row = inserted.rows[0];
    if (row !== undefined) return { run: map(row), created: true };
    const existing = await this.pool.query<RunRow>(`SELECT ${columns} FROM experiment.backtest_runs WHERE idempotency_key = $1`, [input.idempotencyKey]);
    if (existing.rows[0] === undefined) throw new Error("BACKTEST_STORAGE: idempotent run disappeared");
    return { run: map(existing.rows[0]), created: false };
  }

  async enqueue(job: BacktestJob): Promise<void> {
    if (job.attempt !== 1 || job.jobId !== job.runId) {
      throw new Error(`BACKTEST_ENQUEUE: command identity for ${job.runId} is invalid`);
    }
    const result = await this.pool.query(
      `SELECT 1 FROM experiment.backtest_runs
       WHERE run_id = $1 AND spec_id = $2 AND candidate_id = $3
         AND idempotency_key = $4 AND correlation_id = $5`,
      [job.runId, job.specId, job.candidateId, job.idempotencyKey, job.correlationId]
    );
    if (result.rowCount !== 1) throw new Error(`BACKTEST_ENQUEUE: durable run ${job.runId} is missing`);
  }

  async find(runId: string): Promise<BacktestRun | undefined> {
    const result = await this.pool.query<RunRow>(`SELECT ${columns} FROM experiment.backtest_runs WHERE run_id = $1`, [runId]);
    return result.rows[0] === undefined ? undefined : map(result.rows[0]);
  }

  async claimNext(runnerId: string): Promise<ClaimedBacktestJob | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<RunRow & { attempt_number: number; lease_expires_at: Date }>(
        `WITH candidate AS (
           SELECT run_id FROM experiment.backtest_runs
           WHERE cancellation_requested = false
             AND (status = 'queued' OR (status = 'running' AND lease_expires_at <= now()))
           ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
         ), updated AS (
           UPDATE experiment.backtest_runs r SET status = 'running', updated_at = now(),
             lease_expires_at = now() + ($2 * interval '1 second')
           FROM candidate c WHERE r.run_id = c.run_id
           RETURNING r.*
         ), attempt AS (
           INSERT INTO experiment.backtest_attempts
             (run_id, attempt_number, runner_id, correlation_id, claimed_at, lease_expires_at)
           SELECT u.run_id, COALESCE((SELECT max(a.attempt_number) FROM experiment.backtest_attempts a WHERE a.run_id = u.run_id), 0) + 1,
             $1, u.correlation_id, now(), u.lease_expires_at FROM updated u
           RETURNING attempt_number, lease_expires_at
         ) SELECT u.${columns.split(", ").join(", u.")}, a.attempt_number, a.lease_expires_at FROM updated u CROSS JOIN attempt a`,
        [runnerId, this.leaseSeconds]
      );
      const row = claimed.rows[0];
      if (row !== undefined && row.attempt_number > 1) {
        await client.query(
          `UPDATE experiment.backtest_attempts
           SET completed_at = now(), failure_reason = 'BACKTEST_LEASE_EXPIRED'
           WHERE run_id = $1 AND attempt_number < $2 AND completed_at IS NULL`,
          [row.run_id, row.attempt_number]
        );
      }
      await client.query("COMMIT");
      return row === undefined ? undefined : {
        run: map(row),
        job: {
          jobId: row.run_id,
          runId: row.run_id,
          specId: row.spec_id,
          candidateId: row.candidate_id,
          attempt: row.attempt_number,
          idempotencyKey: row.idempotency_key,
          correlationId: row.correlation_id
        },
        attempt: row.attempt_number,
        leaseExpiresAt: row.lease_expires_at.toISOString(),
        runnerId
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async heartbeat(claim: ClaimedBacktestJob): Promise<boolean> {
    const result = await this.pool.query(
      `WITH renewed AS (
         UPDATE experiment.backtest_runs SET lease_expires_at = now() + ($4 * interval '1 second'),
           updated_at = now()
         WHERE run_id = $1 AND status = 'running'
           AND EXISTS (SELECT 1 FROM experiment.backtest_attempts
             WHERE run_id = $1 AND attempt_number = $2 AND runner_id = $3
               AND completed_at IS NULL AND attempt_number =
                 (SELECT max(current.attempt_number) FROM experiment.backtest_attempts current
                  WHERE current.run_id = $1))
         RETURNING lease_expires_at
       ) UPDATE experiment.backtest_attempts a SET lease_expires_at = r.lease_expires_at
         FROM renewed r WHERE a.run_id = $1 AND a.attempt_number = $2`,
      [claim.job.runId, claim.attempt, claim.runnerId, this.leaseSeconds]
    );
    return result.rowCount === 1;
  }

  async isCancellationRequested(runId: string): Promise<boolean> {
    const result = await this.pool.query<{ cancellation_requested: boolean }>(
      "SELECT cancellation_requested FROM experiment.backtest_runs WHERE run_id = $1",
      [runId]
    );
    return result.rows[0]?.cancellation_requested ?? false;
  }

  async fail(claim: ClaimedBacktestJob, reason: string): Promise<void> {
    await this.finishClaim(claim, "failed", reason);
  }

  async release(claim: ClaimedBacktestJob): Promise<void> {
    await this.finishClaim(claim, "queued", "released during cancellation or shutdown");
  }

  private async finishClaim(
    claim: ClaimedBacktestJob,
    status: "queued" | "failed",
    reason: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE experiment.backtest_runs SET status = $4,
           failure_reason = CASE WHEN $4 = 'failed' THEN $5 ELSE NULL END,
           lease_expires_at = NULL, updated_at = now()
         WHERE run_id = $1 AND status = 'running'
           AND EXISTS (SELECT 1 FROM experiment.backtest_attempts
             WHERE run_id = $1 AND attempt_number = $2 AND runner_id = $3
               AND completed_at IS NULL AND attempt_number =
                 (SELECT max(current.attempt_number) FROM experiment.backtest_attempts current
                  WHERE current.run_id = $1))`,
        [claim.job.runId, claim.attempt, claim.runnerId, status, reason]
      );
      if (updated.rowCount !== 1) {
        throw new Error(`BACKTEST_CLAIM_LOST: ${claim.job.runId} attempt ${claim.attempt}`);
      }
      await client.query(
        `UPDATE experiment.backtest_attempts SET completed_at = now(), failure_reason = $4
         WHERE run_id = $1 AND attempt_number = $2 AND runner_id = $3`,
        [claim.job.runId, claim.attempt, claim.runnerId, reason]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
