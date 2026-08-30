// PostgreSQL adapter for durable search-run state and the append-only candidate
// ledger. All search progress and control state is authoritative here, so a
// coordinator restart reads the truth rather than trusting in-memory state.

import type { Pool } from "pg";
import type {
  CandidateOutcome,
  RecordCandidateInput,
  SearchProgress,
  SearchRunState,
  SearchRunStatus,
  SearchRunStore,
  SearchStopReason
} from "../application/search-coordinator.js";
import { BACKTEST_CANCELLED_REASON, type BacktestRunStatus } from "../application/backtest-run-service.js";

interface RunRow {
  spec_id: string;
  status: SearchRunStatus;
  stop_reason: SearchStopReason | null;
  correlation_id: string;
  best_score: number | null;
  no_improvement_count: number;
  folded_sequence: string | number;
  started_at: Date;
}

function mapRun(row: RunRow): SearchRunState {
  return {
    specId: row.spec_id,
    status: row.status,
    stopReason: row.stop_reason,
    correlationId: row.correlation_id,
    bestScore: row.best_score,
    noImprovementCount: row.no_improvement_count,
    foldedSequence: Number(row.folded_sequence),
    startedAt: row.started_at.toISOString()
  };
}

export class PostgresSearchRunStore implements SearchRunStore {
  constructor(private readonly pool: Pool) {}

  async startRun(specId: string, correlationId: string): Promise<{ started: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO experiment.search_runs (spec_id, status, correlation_id)
       VALUES ($1, 'running', $2)
       ON CONFLICT (spec_id) DO NOTHING
       RETURNING spec_id`,
      [specId, correlationId]
    );
    return { started: result.rowCount === 1 };
  }

  async findRun(specId: string): Promise<SearchRunState | undefined> {
    const result = await this.pool.query<RunRow>(
      `SELECT spec_id, status, stop_reason, correlation_id, best_score,
         no_improvement_count, folded_sequence, started_at
       FROM experiment.search_runs WHERE spec_id = $1`,
      [specId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRun(row);
  }

  async candidateCount(specId: string): Promise<number> {
    const result = await this.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM experiment.search_candidates WHERE spec_id = $1",
      [specId]
    );
    return result.rows[0]?.count ?? 0;
  }

  async recordCandidate(input: RecordCandidateInput): Promise<{ recorded: boolean }> {
    const result = await this.pool.query(
      `INSERT INTO experiment.search_candidates
         (spec_id, content_hash, sequence_number, candidate, derived_spec_id, run_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (spec_id, content_hash) DO NOTHING
       RETURNING content_hash`,
      [
        input.specId,
        input.contentHash,
        input.sequenceNumber,
        JSON.stringify(input.candidate),
        input.derivedSpecId,
        input.runId
      ]
    );
    return { recorded: result.rowCount === 1 };
  }

  async inFlightCount(specId: string): Promise<number> {
    const result = await this.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM experiment.search_candidates c
       JOIN experiment.backtest_runs r ON r.run_id = c.run_id
       WHERE c.spec_id = $1 AND r.status IN ('queued', 'running')`,
      [specId]
    );
    return result.rows[0]?.count ?? 0;
  }

  async readOutcomesAfter(specId: string, afterSequence: number): Promise<CandidateOutcome[]> {
    const result = await this.pool.query<{
      sequence_number: string | number;
      content_hash: string;
      status: BacktestRunStatus;
      metrics: Readonly<Record<string, number>> | null;
    }>(
      `SELECT c.sequence_number, c.content_hash, r.status, res.metrics
       FROM experiment.search_candidates c
       JOIN experiment.backtest_runs r ON r.run_id = c.run_id
       LEFT JOIN experiment.backtest_results res ON res.run_id = c.run_id
       WHERE c.spec_id = $1 AND c.sequence_number > $2
       ORDER BY c.sequence_number ASC
       LIMIT 1000`,
      [specId, afterSequence]
    );
    return result.rows.map((row) => ({
      sequenceNumber: Number(row.sequence_number),
      contentHash: row.content_hash,
      runStatus: row.status,
      metrics: row.metrics
    }));
  }

  async saveTracker(
    specId: string,
    tracker: { bestScore: number | null; noImprovementCount: number; foldedSequence: number }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE experiment.search_runs
       SET best_score = $2, no_improvement_count = $3, folded_sequence = $4
       WHERE spec_id = $1 AND status = 'running'`,
      [specId, tracker.bestScore, tracker.noImprovementCount, tracker.foldedSequence]
    );
  }

  async stopRun(specId: string, reason: SearchStopReason): Promise<void> {
    await this.pool.query(
      `UPDATE experiment.search_runs
       SET status = 'stopped', stop_reason = $2, stopped_at = now()
       WHERE spec_id = $1 AND status = 'running'`,
      [specId, reason]
    );
  }

  async progress(specId: string): Promise<SearchProgress> {
    const result = await this.pool.query<{
      status: SearchRunStatus;
      stop_reason: SearchStopReason | null;
      submitted: number;
      completed: number;
      failed: number;
      cancelled: number;
      in_flight: number;
    }>(
      // `cancelled` comes from the search's own disposition ledger, and a
      // cancelled candidate is excluded from `failed` even though its backtest job
      // status is 'failed', so the two are never conflated.
      `SELECT sr.status, sr.stop_reason,
         count(c.content_hash)::int AS submitted,
         count(*) FILTER (WHERE r.status = 'completed')::int AS completed,
         count(*) FILTER (WHERE r.status = 'failed' AND d.content_hash IS NULL)::int AS failed,
         count(d.content_hash)::int AS cancelled,
         count(*) FILTER (WHERE r.status IN ('queued', 'running'))::int AS in_flight
       FROM experiment.search_runs sr
       LEFT JOIN experiment.search_candidates c ON c.spec_id = sr.spec_id
       LEFT JOIN experiment.backtest_runs r ON r.run_id = c.run_id
       LEFT JOIN experiment.search_candidate_dispositions d
         ON d.spec_id = c.spec_id AND d.content_hash = c.content_hash
       WHERE sr.spec_id = $1
       GROUP BY sr.status, sr.stop_reason`,
      [specId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`);
    }
    return {
      status: row.status,
      stopReason: row.stop_reason,
      generated: row.submitted,
      submitted: row.submitted,
      completed: row.completed,
      failed: row.failed,
      cancelled: row.cancelled,
      inFlight: row.in_flight
    };
  }

  async listActive(): Promise<readonly string[]> {
    const result = await this.pool.query<{ spec_id: string }>(
      `SELECT spec_id FROM experiment.search_runs
       WHERE status IN ('running', 'pausing', 'cancelling')`
    );
    return result.rows.map((row) => row.spec_id);
  }

  async status(specId: string): Promise<SearchRunStatus | undefined> {
    const result = await this.pool.query<{ status: SearchRunStatus }>(
      "SELECT status FROM experiment.search_runs WHERE spec_id = $1",
      [specId]
    );
    return result.rows[0]?.status;
  }

  async transition(
    specId: string,
    from: readonly SearchRunStatus[],
    to: SearchRunStatus
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE experiment.search_runs SET status = $3
       WHERE spec_id = $1 AND status = ANY($2::text[])`,
      [specId, from as string[], to]
    );
    return result.rowCount === 1;
  }

  async markCancelled(specId: string): Promise<void> {
    await this.pool.query(
      `UPDATE experiment.search_runs
       SET status = 'cancelled', stopped_at = now()
       WHERE spec_id = $1 AND status = 'cancelling'`,
      [specId]
    );
  }

  async cancelPendingRuns(specId: string): Promise<void> {
    // Signal cancellation on every in-flight candidate run so a running one stops
    // at the runner's cooperative checkpoint (EXP-05) and a queued one is no
    // longer claimable.
    await this.pool.query(
      `UPDATE experiment.backtest_runs r
       SET cancellation_requested = true, updated_at = now()
       FROM experiment.search_candidates c
       WHERE c.run_id = r.run_id AND c.spec_id = $1
         AND r.status IN ('queued', 'running') AND r.cancellation_requested = false`,
      [specId]
    );
    // Record the durable 'cancelled' disposition for each pending (queued)
    // candidate before its job is failed, so the search layer marks the work
    // cancelled first-class even though the backtest job status can only be
    // 'failed'. Append-only and idempotent.
    await this.pool.query(
      `INSERT INTO experiment.search_candidate_dispositions (spec_id, content_hash, disposition)
       SELECT c.spec_id, c.content_hash, 'cancelled'
       FROM experiment.search_candidates c
       JOIN experiment.backtest_runs r ON r.run_id = c.run_id
       WHERE c.spec_id = $1 AND r.status = 'queued'
       ON CONFLICT (spec_id, content_hash) DO NOTHING`,
      [specId]
    );
    // Terminate pending (queued, never-claimed) runs directly: they will never be
    // claimed once signalled, so the coordinator ends them with the shared reason.
    await this.pool.query(
      `UPDATE experiment.backtest_runs r
       SET status = 'failed', failure_reason = $2, lease_expires_at = NULL, updated_at = now()
       FROM experiment.search_candidates c
       WHERE c.run_id = r.run_id AND c.spec_id = $1 AND r.status = 'queued'`,
      [specId, BACKTEST_CANCELLED_REASON]
    );
  }

  async sweepStaleClaims(specId: string): Promise<number> {
    const result = await this.pool.query<{ swept: number }>(
      `WITH stale AS (
         SELECT r.run_id
         FROM experiment.backtest_runs r
         JOIN experiment.search_candidates c ON c.run_id = r.run_id
         WHERE c.spec_id = $1 AND r.status = 'running'
           AND r.lease_expires_at IS NOT NULL AND r.lease_expires_at <= now()
         FOR UPDATE OF r SKIP LOCKED
       ), closed AS (
         UPDATE experiment.backtest_attempts a
         SET completed_at = now(), failure_reason = 'BACKTEST_LEASE_EXPIRED'
         FROM stale s WHERE a.run_id = s.run_id AND a.completed_at IS NULL
         RETURNING a.run_id
       ), requeued AS (
         UPDATE experiment.backtest_runs r
         SET status = 'queued', lease_expires_at = NULL, updated_at = now()
         FROM stale s WHERE r.run_id = s.run_id
         RETURNING r.run_id
       )
       SELECT count(*)::int AS swept FROM requeued`,
      [specId]
    );
    return result.rows[0]?.swept ?? 0;
  }
}
