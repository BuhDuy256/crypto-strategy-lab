// PostgreSQL adapter for the leaderboard read. It only reads rows the SEARCH-04
// projector persisted, joined to the append-only candidate ledger for the
// candidate's strategy composition. Sorting reorders the display; the stored
// `rank` is always the ranking-policy rank and is never recomputed here.

import type { Pool } from "pg";
import {
  isLeaderboardResponse,
  type ApiLeaderboardEntry,
  type ApiLeaderboardStrategy,
  type BacktestMetrics,
  type LeaderboardResponse,
  type LeaderboardSort
} from "@crypto-strategy-lab/api-contracts";
import { LeaderboardQuery } from "../application/leaderboard-query.js";

interface EntryRow {
  rank: string | number;
  run_id: string;
  result_id: string;
  content_hash: string;
  score: number;
  candidate: { specification?: unknown } | null;
  metrics: Readonly<Record<string, number>>;
}

// Higher is better for every metric except drawdown, where lower is better. The
// stored rank breaks display ties so the order is deterministic.
const SORT_COMPARATORS: Record<
  Exclude<LeaderboardSort, "rank">,
  (a: ApiLeaderboardEntry, b: ApiLeaderboardEntry) => number
> = {
  totalReturn: (a, b) => b.metrics.totalReturn - a.metrics.totalReturn || a.rank - b.rank,
  winRate: (a, b) => b.metrics.winRate - a.metrics.winRate || a.rank - b.rank,
  maximumDrawdown: (a, b) => a.metrics.maximumDrawdown - b.metrics.maximumDrawdown || a.rank - b.rank,
  numberOfTrades: (a, b) => b.metrics.numberOfTrades - a.metrics.numberOfTrades || a.rank - b.rank
};

export class PostgresLeaderboardQuery extends LeaderboardQuery {
  constructor(private readonly pool: Pool) {
    super();
  }

  async getLeaderboard(
    specId: string,
    sort: LeaderboardSort
  ): Promise<LeaderboardResponse | undefined> {
    const run = await this.pool.query(
      "SELECT 1 FROM experiment.search_runs WHERE spec_id = $1",
      [specId]
    );
    if (run.rowCount === 0) return undefined;

    // LEFT JOIN, not INNER: every projection row is written from a candidate, so
    // a missing candidate row is corruption, not a row to drop silently. A null
    // candidate surfaces as LEADERBOARD_QUERY_CORRUPT in toStrategy below.
    const rows = await this.pool.query<EntryRow>(
      `SELECT e.rank, e.run_id, e.result_id, e.content_hash, e.score,
         c.candidate, e.metrics
       FROM experiment.leaderboard_entries e
       LEFT JOIN experiment.search_candidates c
         ON c.spec_id = e.leaderboard_id AND c.content_hash = e.content_hash
       WHERE e.leaderboard_id = $1
       ORDER BY e.rank ASC`,
      [specId]
    );

    const entries = rows.rows.map((row) => this.toEntry(row));
    const ordered = sort === "rank" ? entries : [...entries].sort(SORT_COMPARATORS[sort]);
    const response: unknown = { specId, sort, entries: ordered };
    if (!isLeaderboardResponse(response)) {
      throw new Error(`LEADERBOARD_QUERY_CORRUPT: ${specId} has an invalid entry`);
    }
    return response;
  }

  private toEntry(row: EntryRow): ApiLeaderboardEntry {
    return {
      rank: Number(row.rank),
      runId: row.run_id,
      resultId: row.result_id,
      contentHash: row.content_hash,
      score: Number(row.score),
      strategy: this.toStrategy(row),
      metrics: this.toMetrics(row.metrics)
    };
  }

  private toStrategy(row: EntryRow): ApiLeaderboardStrategy {
    if (row.candidate === null) {
      throw new Error(`LEADERBOARD_QUERY_CORRUPT: entry ${row.content_hash} has no candidate row`);
    }
    const specification = row.candidate.specification;
    if (specification === undefined || specification === null) {
      throw new Error(`LEADERBOARD_QUERY_CORRUPT: candidate for ${row.content_hash} has no specification`);
    }
    return specification as ApiLeaderboardStrategy;
  }

  private toMetrics(metrics: Readonly<Record<string, number>>): BacktestMetrics {
    return {
      totalReturn: metrics.totalReturn ?? 0,
      winRate: metrics.winRate ?? 0,
      maximumDrawdown: metrics.maximumDrawdown ?? 0,
      numberOfTrades: metrics.numberOfTrades ?? 0
    };
  }
}
