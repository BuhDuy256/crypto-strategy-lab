// PostgreSQL projection adapter; it only reads values persisted by EXP-04/EXP-06.

import type { Pool } from "pg";
import {
  isBacktestResultResponse,
  isBacktestTradesResponse,
  type BacktestResultResponse,
  type BacktestTradePageResponse,
  type CompletedBacktestResultResponse
} from "@crypto-strategy-lab/api-contracts";
import { BacktestResultQuery, type TradePageRequest } from "../application/backtest-result-query.js";

interface ResultRow {
  run_id: string; status: "queued" | "running" | "completed" | "failed";
  failure_reason: string | null; created_at: Date; updated_at: Date;
  result_id: string | null; spec_id: string; spec_hash: string | null;
  completed_at: Date | null; metric_set: unknown; metrics: unknown;
  execution_assumptions: unknown; annotations: unknown;
}

interface TradeRow { sequence_number: number; trade: unknown; total_count: number }

export class PostgresBacktestResultQuery extends BacktestResultQuery {
  constructor(private readonly pool: Pool) { super(); }

  async getResult(runId: string): Promise<BacktestResultResponse | undefined> {
    const result = await this.pool.query<ResultRow>(
      `SELECT run.run_id, run.status, run.failure_reason, run.created_at, run.updated_at,
         result.result_id, run.spec_id, result.spec_hash, result.completed_at,
         result.metric_set, result.metrics, result.execution_assumptions,
         ann.annotations
       FROM experiment.backtest_runs run
       LEFT JOIN experiment.backtest_results result ON result.run_id = run.run_id
       LEFT JOIN experiment.backtest_annotations ann ON ann.result_id = result.result_id
       WHERE run.run_id = $1`, [runId]
    );
    const row = result.rows[0];
    if (row === undefined) return undefined;
    const base = {
      runId: row.run_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
    };
    if (row.status === "failed") {
      if (row.failure_reason === null) throw new Error(`BACKTEST_QUERY_CORRUPT: failed run ${runId}`);
      return { ...base, status: "failed", failureReason: row.failure_reason };
    }
    if (row.status !== "completed") return { ...base, status: row.status };
    if (row.result_id === null || row.spec_hash === null || row.completed_at === null) {
      throw new Error(`BACKTEST_QUERY_CORRUPT: completed run ${runId} has no result`);
    }
    const response: unknown = {
      ...base, status: "completed", resultId: row.result_id, specId: row.spec_id,
      specificationHash: row.spec_hash, completedAt: row.completed_at.toISOString(),
      metricSet: row.metric_set as CompletedBacktestResultResponse["metricSet"],
      metrics: row.metrics as CompletedBacktestResultResponse["metrics"],
      executionAssumptions: row.execution_assumptions as CompletedBacktestResultResponse["executionAssumptions"],
      annotations: (row.annotations ?? []) as CompletedBacktestResultResponse["annotations"]
    };
    if (!isBacktestResultResponse(response) || response.status !== "completed") {
      throw new Error(`BACKTEST_QUERY_CORRUPT: completed result ${row.result_id} has invalid content`);
    }
    return response;
  }

  async getTrades(
    result: CompletedBacktestResultResponse,
    page: TradePageRequest
  ): Promise<BacktestTradePageResponse> {
    const offset = (page.pageNumber - 1) * page.pageSize;
    const rows = await this.pool.query<TradeRow>(
      `SELECT sequence_number, trade,
         count(*) OVER ()::int AS total_count
       FROM experiment.backtest_trades
       WHERE result_id = $1 ORDER BY sequence_number ASC LIMIT $2 OFFSET $3`,
      [result.resultId, page.pageSize, offset]
    );
    const total = rows.rows[0]?.total_count ?? (await this.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM experiment.backtest_trades WHERE result_id = $1",
      [result.resultId]
    )).rows[0]?.count ?? 0;
    const response: unknown = {
      runId: result.runId, status: "completed",
      trades: rows.rows.map((row) => ({
        ...(row.trade as Omit<BacktestTradePageResponse["trades"][number], "sequenceNumber">),
        sequenceNumber: row.sequence_number
      })),
      page: { pageNumber: page.pageNumber, pageSize: page.pageSize, totalCount: total }
    };
    if (!isBacktestTradesResponse(response) || response.status !== "completed") {
      throw new Error(`BACKTEST_QUERY_CORRUPT: result ${result.resultId} has invalid trades`);
    }
    return response;
  }
}
