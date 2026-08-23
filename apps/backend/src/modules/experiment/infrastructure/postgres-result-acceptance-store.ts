// PostgreSQL transaction that accepts one immutable result and closes its attempt.

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type {
  AcceptedBacktestResult,
  ProvenanceChecklist,
  ResultAcceptanceStore
} from "../application/backtest-result-acceptor.js";
import type { BacktestRunnerOutcome } from "../application/backtest-runner-service.js";

interface ResultRow {
  result_id: string;
  run_id: string;
  idempotency_key: string;
  trade_content_hash: string;
  completed_at: Date;
  spec_id: string;
  spec_hash: string;
  metric_set: unknown;
  metrics: unknown;
  execution_assumptions: unknown;
  checklist: unknown;
}

function map(row: ResultRow): AcceptedBacktestResult {
  return {
    resultId: row.result_id,
    runId: row.run_id,
    idempotencyKey: row.idempotency_key,
    tradeContentHash: row.trade_content_hash,
    completedAt: row.completed_at.toISOString()
  };
}

export class PostgresResultAcceptanceStore implements ResultAcceptanceStore {
  constructor(private readonly pool: Pool) {}

  async accept(
    outcome: BacktestRunnerOutcome,
    checklist: ProvenanceChecklist
  ): Promise<AcceptedBacktestResult> {
    const tradeHash = canonicalSha256(outcome.simulation.trades);
    const existing = await this.findByKey(outcome.job.idempotencyKey);
    if (existing !== undefined) return this.assertDuplicate(existing, outcome, tradeHash, checklist);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        `SELECT 1 FROM experiment.backtest_runs r
         JOIN experiment.backtest_attempts a ON a.run_id = r.run_id
         WHERE r.run_id = $1 AND r.status = 'running' AND r.lease_expires_at > now()
           AND a.attempt_number = $2 AND a.runner_id = $3 AND a.completed_at IS NULL
           AND a.attempt_number = (SELECT max(current.attempt_number)
             FROM experiment.backtest_attempts current WHERE current.run_id = r.run_id)
         FOR UPDATE OF r, a`,
        [outcome.job.runId, outcome.claim.attempt, outcome.claim.runnerId]
      );
      if (owned.rowCount !== 1) {
        throw new Error(`BACKTEST_CLAIM_LOST: ${outcome.job.runId}`);
      }
      const resultId = randomUUID();
      const inserted = await client.query<ResultRow>(
        `INSERT INTO experiment.backtest_results
         (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
          execution_assumptions, trade_content_hash)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING result_id, run_id, spec_id, spec_hash, idempotency_key,
           trade_content_hash, completed_at, metric_set, metrics, execution_assumptions,
           NULL::jsonb AS checklist`,
        [resultId, outcome.job.runId, outcome.job.specId, outcome.specification.contentHash,
          outcome.job.idempotencyKey, JSON.stringify(outcome.evaluation.metricSet),
          JSON.stringify(outcome.evaluation.values), JSON.stringify(outcome.specification.content.execution),
          tradeHash]
      );
      const row = inserted.rows[0];
      if (row === undefined) {
        await client.query("ROLLBACK");
        const duplicate = await this.findByKey(outcome.job.idempotencyKey);
        if (duplicate === undefined) throw new Error("BACKTEST_RESULT_CONFLICT: result disappeared");
        return this.assertDuplicate(duplicate, outcome, tradeHash, checklist);
      }
      await client.query(
        "INSERT INTO experiment.backtest_result_provenance (result_id, checklist) VALUES ($1,$2::jsonb)",
        [resultId, JSON.stringify({
          ...checklist,
          resultArtifact: { status: "recorded", value: { resultId, tradeContentHash: tradeHash } }
        })]
      );
      for (const [sequence, trade] of outcome.simulation.trades.entries()) {
        await client.query(
          "INSERT INTO experiment.backtest_trades (result_id, sequence_number, trade) VALUES ($1,$2,$3::jsonb)",
          [resultId, sequence, JSON.stringify(trade)]
        );
      }
      const completed = await client.query(
        `UPDATE experiment.backtest_runs SET status = 'completed', lease_expires_at = NULL,
           updated_at = now() WHERE run_id = $1 AND status = 'running'`,
        [outcome.job.runId]
      );
      if (completed.rowCount !== 1) throw new Error(`BACKTEST_CLAIM_LOST: ${outcome.job.runId}`);
      await client.query(
        `UPDATE experiment.backtest_attempts SET completed_at = now()
         WHERE run_id = $1 AND attempt_number = $2 AND runner_id = $3 AND completed_at IS NULL`,
        [outcome.job.runId, outcome.claim.attempt, outcome.claim.runnerId]
      );
      await client.query("COMMIT");
      return map(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async resolveProvenance(resultId: string): Promise<unknown | undefined> {
    const result = await this.pool.query(
      `SELECT jsonb_build_object(
         'resultId', r.result_id, 'completedAt', r.completed_at,
         'tradeContentHash', r.trade_content_hash, 'checklist', p.checklist,
         'attempts', COALESCE(jsonb_agg(jsonb_build_object(
           'attempt', a.attempt_number, 'runnerId', a.runner_id,
           'correlationId', a.correlation_id, 'claimedAt', a.claimed_at,
           'leaseExpiresAt', a.lease_expires_at,
           'completedAt', a.completed_at, 'failureReason', a.failure_reason
         ) ORDER BY a.attempt_number) FILTER (WHERE a.run_id IS NOT NULL), '[]'::jsonb)
       ) AS provenance
       FROM experiment.backtest_results r
       JOIN experiment.backtest_result_provenance p ON p.result_id = r.result_id
       LEFT JOIN experiment.backtest_attempts a ON a.run_id = r.run_id
       WHERE r.result_id = $1 GROUP BY r.result_id, p.checklist`,
      [resultId]
    );
    return result.rows[0]?.provenance;
  }

  private async findByKey(key: string): Promise<ResultRow | undefined> {
    const result = await this.pool.query<ResultRow>(
      `SELECT r.result_id, r.run_id, r.spec_id, r.spec_hash, r.idempotency_key,
         r.trade_content_hash, r.completed_at, r.metric_set, r.metrics,
         r.execution_assumptions, p.checklist
       FROM experiment.backtest_results r
       JOIN experiment.backtest_result_provenance p ON p.result_id = r.result_id
       WHERE r.idempotency_key = $1`,
      [key]
    );
    return result.rows[0];
  }

  private assertDuplicate(
    row: ResultRow,
    outcome: BacktestRunnerOutcome,
    tradeHash: string,
    checklist?: ProvenanceChecklist
  ): AcceptedBacktestResult {
    if (row.run_id !== outcome.job.runId || row.spec_id !== outcome.job.specId ||
      row.spec_hash !== outcome.specification.contentHash || row.trade_content_hash !== tradeHash) {
      throw new Error(`BACKTEST_RESULT_CONFLICT: idempotency content mismatch for ${outcome.job.idempotencyKey}`);
    }
    if (canonicalSha256({ metricSet: row.metric_set, metrics: row.metrics,
      execution: row.execution_assumptions }) !== canonicalSha256({
      metricSet: outcome.evaluation.metricSet,
      metrics: outcome.evaluation.values,
      execution: outcome.specification.content.execution
    })) {
      throw new Error(`BACKTEST_RESULT_CONFLICT: result content mismatch for ${outcome.job.idempotencyKey}`);
    }
    if (checklist !== undefined && row.checklist !== null) {
      const stored = row.checklist as Record<string, unknown>;
      const storedChecklist = Object.fromEntries(
        Object.entries(stored).filter(([key]) => key !== "resultArtifact")
      );
      if (canonicalSha256(storedChecklist) !== canonicalSha256(checklist)) {
        throw new Error(`BACKTEST_RESULT_CONFLICT: provenance mismatch for ${outcome.job.idempotencyKey}`);
      }
    }
    return map(row);
  }
}
