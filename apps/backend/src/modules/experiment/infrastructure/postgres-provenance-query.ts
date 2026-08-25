// PostgreSQL adapter for the provenance read. It reads the checklist and the
// attempt history recorded by the EXP-06 result-acceptance transaction, keyed by
// run id to match the EXP-10 result and trades reads. It writes nothing and
// computes nothing.

import type { Pool } from "pg";
import {
  isProvenanceResponse,
  type ProvenanceResponse
} from "@crypto-strategy-lab/api-contracts";
import { ProvenanceQuery } from "../application/provenance-query.js";

interface ProvenanceRow {
  run_id: string;
  result_id: string;
  completed_at: Date;
  trade_content_hash: string;
  checklist: Readonly<Record<string, unknown>>;
  attempts: unknown;
}

export class PostgresProvenanceQuery extends ProvenanceQuery {
  constructor(private readonly pool: Pool) {
    super();
  }

  async getProvenance(runId: string): Promise<ProvenanceResponse | undefined> {
    const result = await this.pool.query<ProvenanceRow>(
      `SELECT r.run_id, r.result_id, r.completed_at, r.trade_content_hash, p.checklist,
         COALESCE(jsonb_agg(jsonb_build_object(
           'attempt', a.attempt_number,
           'runnerId', a.runner_id,
           'correlationId', a.correlation_id,
           'claimedAt', a.claimed_at,
           'leaseExpiresAt', a.lease_expires_at,
           'completedAt', a.completed_at,
           'failureReason', a.failure_reason
         ) ORDER BY a.attempt_number) FILTER (WHERE a.run_id IS NOT NULL), '[]'::jsonb) AS attempts
       FROM experiment.backtest_results r
       JOIN experiment.backtest_result_provenance p ON p.result_id = r.result_id
       LEFT JOIN experiment.backtest_attempts a ON a.run_id = r.run_id
       WHERE r.run_id = $1
       GROUP BY r.run_id, r.result_id, r.completed_at, r.trade_content_hash, p.checklist`,
      [runId]
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;

    // Drop the acceptance-only bookkeeping field so the response is the checklist
    // itself; the result artifact is already exposed as resultId and hash.
    const checklist = Object.fromEntries(
      Object.entries(row.checklist).filter(([key]) => key !== "resultArtifact")
    );
    const response: unknown = {
      runId: row.run_id,
      resultId: row.result_id,
      completedAt: row.completed_at.toISOString(),
      tradeContentHash: row.trade_content_hash,
      checklist,
      attempts: this.normalizeAttempts(row.attempts)
    };
    if (!isProvenanceResponse(response)) {
      throw new Error(`PROVENANCE_QUERY_CORRUPT: ${runId} has an invalid checklist`);
    }
    return response;
  }

  // jsonb_build_object renders timestamps as ISO strings already; this only
  // narrows the unknown aggregate to the response's array shape.
  private normalizeAttempts(attempts: unknown): ProvenanceResponse["attempts"] {
    return (attempts as ProvenanceResponse["attempts"]) ?? [];
  }
}
