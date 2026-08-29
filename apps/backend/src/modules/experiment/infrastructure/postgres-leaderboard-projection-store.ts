// PostgreSQL adapter for the derived Top-K leaderboard projection.
//
// The projection is not authoritative: every row is rebuildable from backtest
// results, and this store is the only writer. `withLeaderboard` serializes all
// writes to one leaderboard with a transaction-scoped advisory lock, so
// concurrent result acceptances can never corrupt rank (ADR-005 names rank races
// as the risk this closes).

import type { Pool, PoolClient } from "pg";
import type {
  CandidateMembership,
  CompletedCandidateResult,
  EvaluatedResultRef,
  LeaderboardEntry,
  LeaderboardProjectionStore,
  LeaderboardWriteScope
} from "../application/leaderboard-projector.js";

interface EntryRow {
  leaderboard_id: string;
  content_hash: string;
  result_id: string;
  run_id: string;
  derived_spec_id: string;
  rank: string | number;
  score: number;
  metrics: Readonly<Record<string, number>>;
  policy: LeaderboardEntry["policy"];
  aggregate_version: string | number;
}

function mapEntry(row: EntryRow): LeaderboardEntry {
  return {
    leaderboardId: row.leaderboard_id,
    contentHash: row.content_hash,
    resultId: row.result_id,
    runId: row.run_id,
    derivedSpecId: row.derived_spec_id,
    rank: Number(row.rank),
    score: Number(row.score),
    metrics: row.metrics,
    policy: row.policy,
    aggregateVersion: Number(row.aggregate_version)
  };
}

const SELECT_ENTRIES =
  `SELECT leaderboard_id, content_hash, result_id, run_id, derived_spec_id, rank,
     score, metrics, policy, aggregate_version
   FROM experiment.leaderboard_entries
   WHERE leaderboard_id = $1
   ORDER BY rank ASC`;

export class PostgresLeaderboardProjectionStore implements LeaderboardProjectionStore {
  constructor(private readonly pool: Pool) {}

  async findCandidateMemberships(runId: string): Promise<CandidateMembership[]> {
    // Ordered so a run shared by several experiments projects in a stable order.
    const result = await this.pool.query<{ spec_id: string; content_hash: string; derived_spec_id: string }>(
      `SELECT spec_id, content_hash, derived_spec_id
       FROM experiment.search_candidates WHERE run_id = $1
       ORDER BY spec_id ASC`,
      [runId]
    );
    return result.rows.map((row) => ({
      leaderboardId: row.spec_id,
      contentHash: row.content_hash,
      derivedSpecId: row.derived_spec_id
    }));
  }

  async findEvaluatedResult(runId: string): Promise<EvaluatedResultRef | undefined> {
    const result = await this.pool.query<{
      result_id: string;
      aggregate_version: string | number;
      metrics: Readonly<Record<string, number>>;
    }>(
      `SELECT res.result_id, a.attempt_number AS aggregate_version, res.metrics
       FROM experiment.backtest_results res
       JOIN experiment.backtest_runs r ON r.run_id = res.run_id AND r.status = 'completed'
       JOIN experiment.backtest_attempts a ON a.run_id = res.run_id
         AND a.completed_at IS NOT NULL AND a.failure_reason IS NULL
       WHERE res.run_id = $1`,
      [runId]
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          resultId: row.result_id,
          runId,
          aggregateVersion: Number(row.aggregate_version),
          metrics: row.metrics
        };
  }

  async readCompletedCandidateResults(leaderboardId: string): Promise<CompletedCandidateResult[]> {
    // Authoritative source for a rebuild: every candidate whose run completed and
    // whose successful attempt (completed, no failure reason) produced a result.
    const result = await this.pool.query<{
      content_hash: string;
      result_id: string;
      run_id: string;
      derived_spec_id: string;
      aggregate_version: string | number;
      metrics: Readonly<Record<string, number>>;
    }>(
      `SELECT c.content_hash, res.result_id, c.run_id, c.derived_spec_id,
         a.attempt_number AS aggregate_version, res.metrics
       FROM experiment.search_candidates c
       JOIN experiment.backtest_runs r ON r.run_id = c.run_id AND r.status = 'completed'
       JOIN experiment.backtest_results res ON res.run_id = c.run_id
       JOIN experiment.backtest_attempts a ON a.run_id = c.run_id
         AND a.completed_at IS NOT NULL AND a.failure_reason IS NULL
       WHERE c.spec_id = $1`,
      [leaderboardId]
    );
    return result.rows.map((row) => ({
      contentHash: row.content_hash,
      resultId: row.result_id,
      runId: row.run_id,
      derivedSpecId: row.derived_spec_id,
      aggregateVersion: Number(row.aggregate_version),
      metrics: row.metrics
    }));
  }

  async readEntries(leaderboardId: string): Promise<LeaderboardEntry[]> {
    const result = await this.pool.query<EntryRow>(SELECT_ENTRIES, [leaderboardId]);
    return result.rows.map(mapEntry);
  }

  async withLeaderboard<T>(
    leaderboardId: string,
    run: (scope: LeaderboardWriteScope) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize all writers to this leaderboard for the transaction. Distinct
      // leaderboards use distinct lock keys, so they never block each other.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [leaderboardId]);
      const result = await run(this.scope(client, leaderboardId));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private scope(client: PoolClient, leaderboardId: string): LeaderboardWriteScope {
    return {
      loadEntries: async () => {
        const result = await client.query<EntryRow>(SELECT_ENTRIES, [leaderboardId]);
        return result.rows.map(mapEntry);
      },
      replaceEntries: async (entries) => {
        await client.query(
          "DELETE FROM experiment.leaderboard_entries WHERE leaderboard_id = $1",
          [leaderboardId]
        );
        for (const entry of entries) {
          await client.query(
            `INSERT INTO experiment.leaderboard_entries
               (leaderboard_id, content_hash, result_id, run_id, derived_spec_id, rank,
                score, metrics, policy, aggregate_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
            [
              entry.leaderboardId,
              entry.contentHash,
              entry.resultId,
              entry.runId,
              entry.derivedSpecId,
              entry.rank,
              entry.score,
              JSON.stringify(entry.metrics),
              JSON.stringify(entry.policy),
              entry.aggregateVersion
            ]
          );
        }
      },
      appliedVersion: async (contentHash) => {
        const result = await client.query<{ aggregate_version: string | number }>(
          `SELECT aggregate_version FROM experiment.leaderboard_applied_versions
           WHERE leaderboard_id = $1 AND content_hash = $2`,
          [leaderboardId, contentHash]
        );
        const row = result.rows[0];
        return row === undefined ? undefined : Number(row.aggregate_version);
      },
      recordApplied: async (contentHash, aggregateVersion) => {
        await client.query(
          `INSERT INTO experiment.leaderboard_applied_versions
             (leaderboard_id, content_hash, aggregate_version)
           VALUES ($1, $2, $3)
           ON CONFLICT (leaderboard_id, content_hash)
             DO UPDATE SET aggregate_version = EXCLUDED.aggregate_version`,
          [leaderboardId, contentHash, aggregateVersion]
        );
      },
      resetAppliedVersions: async (versions) => {
        await client.query(
          "DELETE FROM experiment.leaderboard_applied_versions WHERE leaderboard_id = $1",
          [leaderboardId]
        );
        for (const version of versions) {
          await client.query(
            `INSERT INTO experiment.leaderboard_applied_versions
               (leaderboard_id, content_hash, aggregate_version)
             VALUES ($1, $2, $3)`,
            [leaderboardId, version.contentHash, version.aggregateVersion]
          );
        }
      }
    };
  }
}
