// PostgreSQL adapter for durable search-run state and the append-only candidate
// ledger. All search progress and control state is authoritative here, so a
// coordinator restart reads the truth rather than trusting in-memory state.

import type { Pool } from "pg";
import type {
  CandidateOutcome,
  RecordCandidateInput,
  SearchProgress,
  SearchRunState,
  SearchRunStore,
  SearchStopReason
} from "../application/search-coordinator.js";
import type { BacktestRunStatus } from "../application/backtest-run-service.js";

interface RunRow {
  spec_id: string;
  status: "running" | "stopped";
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
      status: "running" | "stopped";
      stop_reason: SearchStopReason | null;
      submitted: number;
      completed: number;
      failed: number;
      in_flight: number;
    }>(
      `SELECT sr.status, sr.stop_reason,
         count(c.content_hash)::int AS submitted,
         count(*) FILTER (WHERE r.status = 'completed')::int AS completed,
         count(*) FILTER (WHERE r.status = 'failed')::int AS failed,
         count(*) FILTER (WHERE r.status IN ('queued', 'running'))::int AS in_flight
       FROM experiment.search_runs sr
       LEFT JOIN experiment.search_candidates c ON c.spec_id = sr.spec_id
       LEFT JOIN experiment.backtest_runs r ON r.run_id = c.run_id
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
      inFlight: row.in_flight
    };
  }

  async listRunning(): Promise<readonly string[]> {
    const result = await this.pool.query<{ spec_id: string }>(
      "SELECT spec_id FROM experiment.search_runs WHERE status = 'running'"
    );
    return result.rows.map((row) => row.spec_id);
  }
}
