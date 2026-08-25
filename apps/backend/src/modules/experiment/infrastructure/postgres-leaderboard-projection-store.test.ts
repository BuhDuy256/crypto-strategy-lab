// Integration tests for the leaderboard projection against real PostgreSQL.
//
// One behaviour per test: a better result enters and displaces the last entry, a
// worse result does not enter, a duplicate and a stale application leave the
// projection unchanged (proved by a projection hash), a rebuild reproduces the
// same content and hash, every row's links resolve, and concurrent applications
// keep a valid Top-K. Completed candidates are seeded directly so the tests
// exercise the projection without running the real backtester.

import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { createBuiltInStrategyRegistry } from "../../strategy/index.js";
import type { DatasetService, DatasetRef } from "../../market/index.js";
import { PostgresExperimentSpecificationStore } from "./postgres-experiment-specification-store.js";
import { PostgresSearchRunStore } from "./postgres-search-run-store.js";
import { PostgresLeaderboardProjectionStore } from "./postgres-leaderboard-projection-store.js";
import { ExperimentSpecificationService } from "../application/experiment-specification-service.js";
import { createBuiltInRankingPolicyRegistry } from "../application/built-in-ranking-policy-registry.js";
import {
  LeaderboardProjector,
  type EvaluatedResultRef
} from "../application/leaderboard-projector.js";
import type { ExperimentDraftContent, FreezeProvenance } from "../domain/experiment-specification.js";
import type { SearchConfiguration } from "../domain/search-specification.js";

const HEX = "a".repeat(64);

const datasetRef: DatasetRef = {
  datasetId: "dataset-leaderboard-01",
  version: 1,
  manifestVersion: "v1",
  provider: "binance",
  symbols: ["BTCUSDT"],
  timeframe: "1h",
  range: { startTime: 1_704_067_200_000, endTime: 1_704_153_600_000 },
  revisionWatermark: 0,
  integrityHash: HEX
};

const provenance: FreezeProvenance = {
  engine: { id: "backtester", version: "1.0.0" },
  nodeRuntimeVersion: process.version.replace("v", ""),
  dependencyLockHash: HEX,
  applicationCommit: "test-commit",
  workerCommit: "test-commit",
  deterministicConfigVersion: "1.0.0"
};

const fakeDatasets: DatasetService = {
  createDataset: () => Promise.reject(new Error("unused")),
  resolveDataset: () =>
    Promise.resolve({ manifest: { gaps: [] }, candles: [] } as unknown as Awaited<
      ReturnType<DatasetService["resolveDataset"]>
    >)
};

const searchConfiguration: SearchConfiguration = {
  generator: { id: "random-search", version: "1.0.0" },
  generatorConfiguration: {},
  searchSpace: { strategies: [{ id: "rsi", version: "1.0.0" }], compositeSizes: [1], policies: [] },
  seed: "leaderboard-01-test",
  rankingPolicy: { id: "weighted-return-drawdown", version: "1.0.0" },
  rankingConfiguration: { weights: { totalReturn: 1, maximumDrawdown: -1 }, minTrades: 1 },
  stopConditions: { maxCandidates: 100 },
  maxInFlight: 4
};

function draftContent(search: SearchConfiguration): ExperimentDraftContent {
  return {
    schemaVersion: "v1",
    datasetRef,
    strategy: {
      id: "rsi",
      version: "1.0.0",
      parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" }
    },
    execution: {
      initialCapital: 10_000,
      feeRate: 0.001,
      slippageRate: 0.0005,
      signalTiming: "close-of-bar",
      fillRule: "next-open",
      maxConcurrentPositions: 1,
      leverage: 1,
      positionSizing: "available-equity",
      allowedDirections: ["long", "short"],
      stopLoss: { enabled: false },
      takeProfit: { enabled: false },
      sameBarExitPriority: "stop-loss-first",
      finalPositionPolicy: "liquidate-at-final-close",
      decimalPlaces: 8
    },
    metricSet: { id: "mvp-metrics", version: "1.0.0" },
    search
  };
}

function hex64(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

function metrics(totalReturn: number, maximumDrawdown: number, numberOfTrades = 5): Record<string, number> {
  return { totalReturn, maximumDrawdown, winRate: 0.5, numberOfTrades };
}

describe("PostgresLeaderboardProjectionStore", () => {
  let pool: Pool;
  let specifications: ExperimentSpecificationService;
  let store: PostgresLeaderboardProjectionStore;
  const strategies = createBuiltInStrategyRegistry();
  const rankings = createBuiltInRankingPolicyRegistry();

  beforeAll(async () => {
    pool = await resetTestDatabase();
  });
  beforeEach(async () => {
    await pool.query(
      `TRUNCATE experiment.leaderboard_applied_versions, experiment.leaderboard_entries,
        experiment.search_candidate_dispositions, experiment.search_candidates,
        experiment.search_runs, experiment.backtest_result_provenance,
        experiment.backtest_annotations, experiment.backtest_trades,
        experiment.backtest_results, experiment.backtest_attempts,
        experiment.backtest_runs, experiment.specifications CASCADE`
    );
    const specStore = new PostgresExperimentSpecificationStore(pool);
    specifications = new ExperimentSpecificationService(specStore, fakeDatasets, strategies);
    store = new PostgresLeaderboardProjectionStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  function projector(topK: number): LeaderboardProjector {
    return new LeaderboardProjector(store, specifications, rankings, topK);
  }

  // Create the base search experiment and its run row (the leaderboard).
  async function createLeaderboard(): Promise<string> {
    const draft = await specifications.createDraft(draftContent(searchConfiguration));
    const frozen = await specifications.freeze(draft.specId, provenance);
    await new PostgresSearchRunStore(pool).startRun(frozen.specId, "correlation-1");
    return frozen.specId;
  }

  // Seed one completed candidate result under a leaderboard and return the ref
  // the projector consumes.
  async function seedCandidate(
    leaderboardId: string,
    sequence: number,
    name: string,
    values: Record<string, number>,
    aggregateVersion = 1
  ): Promise<EvaluatedResultRef> {
    const runId = randomUUID();
    const resultId = randomUUID();
    const derivedSpecId = randomUUID();
    const contentHash = hex64(`content-${name}`);
    const idempotencyKey = hex64(`key-${name}`);
    await pool.query(
      `INSERT INTO experiment.specifications (spec_id, status, content, content_hash, frozen_at)
       VALUES ($1, 'frozen', '{}'::jsonb, $2, now())`,
      [derivedSpecId, hex64(`spec-${name}`)]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_runs
         (run_id, spec_id, candidate_id, idempotency_key, status, correlation_id, lease_expires_at)
       VALUES ($1, $2, $3, $4, 'completed', 'correlation-1', NULL)`,
      [runId, derivedSpecId, `candidate-${name}`, idempotencyKey]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_attempts
         (run_id, attempt_number, runner_id, correlation_id, claimed_at, lease_expires_at, completed_at)
       VALUES ($1, $2, 'runner-1', 'correlation-1', now(), now(), now())`,
      [runId, aggregateVersion]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_results
         (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
          execution_assumptions, trade_content_hash)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6::jsonb, '{}'::jsonb, $7)`,
      [resultId, runId, derivedSpecId, HEX, idempotencyKey, JSON.stringify(values), hex64(`trade-${name}`)]
    );
    await pool.query(
      `INSERT INTO experiment.search_candidates
         (spec_id, content_hash, sequence_number, candidate, derived_spec_id, run_id)
       VALUES ($1, $2, $3, '{}'::jsonb, $4, $5)`,
      [leaderboardId, contentHash, sequence, derivedSpecId, runId]
    );
    return { resultId, runId, aggregateVersion, metrics: values };
  }

  async function scores(leaderboardId: string): Promise<Array<{ rank: number; score: number }>> {
    const result = await pool.query<{ rank: number; score: number }>(
      "SELECT rank, score FROM experiment.leaderboard_entries WHERE leaderboard_id = $1 ORDER BY rank ASC",
      [leaderboardId]
    );
    return result.rows.map((row) => ({ rank: Number(row.rank), score: Number(row.score) }));
  }

  it("lets a better result enter a full board and displaces the previous last entry", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    await board.apply(await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0)));
    await board.apply(await seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)));
    const last = await seedCandidate(leaderboardId, 2, "c", metrics(0.1, 0));
    await board.apply(last);
    const outcome = await board.apply(await seedCandidate(leaderboardId, 3, "d", metrics(0.25, 0)));

    expect(outcome).toEqual({ applied: true, rank: 2 });
    expect(await scores(leaderboardId)).toEqual([
      { rank: 1, score: 0.3 },
      { rank: 2, score: 0.25 },
      { rank: 3, score: 0.2 }
    ]);
    const evicted = await pool.query(
      "SELECT 1 FROM experiment.leaderboard_entries WHERE run_id = $1",
      [last.runId]
    );
    expect(evicted.rowCount).toBe(0);
  });

  it("does not enter a result worse than the current last place", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    await board.apply(await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0)));
    await board.apply(await seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)));
    await board.apply(await seedCandidate(leaderboardId, 2, "c", metrics(0.1, 0)));
    const outcome = await board.apply(await seedCandidate(leaderboardId, 3, "e", metrics(0.05, 0)));

    expect(outcome).toEqual({ applied: false, reason: "unchanged" });
    expect(await scores(leaderboardId)).toEqual([
      { rank: 1, score: 0.3 },
      { rank: 2, score: 0.2 },
      { rank: 3, score: 0.1 }
    ]);
  });

  it("leaves the projection hash unchanged when the same result is applied twice", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    const a = await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0));
    await board.apply(a);
    await board.apply(await seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)));
    const before = await board.projectionHash(leaderboardId);
    const outcome = await board.apply(a);
    const after = await board.projectionHash(leaderboardId);

    expect(outcome).toEqual({ applied: false, reason: "stale-or-duplicate" });
    expect(after).toBe(before);
  });

  it("ignores a stale aggregate version even when it would change the ranking", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    // The authoritative candidate at version 2.
    await board.apply(await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0), 2));
    const before = await board.projectionHash(leaderboardId);
    // A stale message about version 1 of the same candidate carrying a better
    // score. It must not change the projection.
    const stale: EvaluatedResultRef = {
      resultId: randomUUID(),
      runId: (
        await pool.query<{ run_id: string }>(
          "SELECT run_id FROM experiment.search_candidates WHERE spec_id = $1 AND sequence_number = 0",
          [leaderboardId]
        )
      ).rows[0]!.run_id,
      aggregateVersion: 1,
      metrics: metrics(0.99, 0)
    };
    const outcome = await board.apply(stale);
    const after = await board.projectionHash(leaderboardId);

    expect(outcome).toEqual({ applied: false, reason: "stale-or-duplicate" });
    expect(after).toBe(before);
  });

  it("ignores a stale application of a candidate already displaced from the board", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    await board.apply(await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0)));
    await board.apply(await seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)));
    const c = await seedCandidate(leaderboardId, 2, "c", metrics(0.1, 0), 2);
    await board.apply(c);
    // A better candidate pushes "c" off the Top-K.
    await board.apply(await seedCandidate(leaderboardId, 3, "d", metrics(0.25, 0)));
    const before = await board.projectionHash(leaderboardId);
    // A stale message about "c" at an older version, carrying a top score. The
    // applied-version record still guards it even though "c" has no board row.
    const stale: EvaluatedResultRef = {
      resultId: c.resultId,
      runId: c.runId,
      aggregateVersion: 1,
      metrics: metrics(0.99, 0)
    };
    const outcome = await board.apply(stale);

    expect(outcome).toEqual({ applied: false, reason: "stale-or-duplicate" });
    expect(await board.projectionHash(leaderboardId)).toBe(before);
    const cRow = await pool.query(
      "SELECT 1 FROM experiment.leaderboard_entries WHERE run_id = $1",
      [c.runId]
    );
    expect(cRow.rowCount).toBe(0);
  });

  it("reproduces the same content and hash after a delete and rebuild", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    const inputs = [
      await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0)),
      await seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)),
      await seedCandidate(leaderboardId, 2, "c", metrics(0.1, 0)),
      await seedCandidate(leaderboardId, 3, "d", metrics(0.25, 0)),
      await seedCandidate(leaderboardId, 4, "e", metrics(0.05, 0))
    ];
    for (const input of inputs) await board.apply(input);
    const incrementalHash = await board.projectionHash(leaderboardId);
    const incrementalScores = await scores(leaderboardId);

    await board.rebuild(leaderboardId);

    expect(await board.projectionHash(leaderboardId)).toBe(incrementalHash);
    expect(await scores(leaderboardId)).toEqual(incrementalScores);
  });

  it("links every row to a result and a frozen specification that both resolve", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    await board.apply(await seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0)));
    await board.apply(await seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)));

    const resolved = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM experiment.leaderboard_entries e
       JOIN experiment.backtest_results r ON r.result_id = e.result_id
       JOIN experiment.specifications s ON s.spec_id = e.derived_spec_id AND s.status = 'frozen'
       WHERE e.leaderboard_id = $1`,
      [leaderboardId]
    );
    expect(resolved.rows[0]?.count).toBe(2);
  });

  it("keeps a valid Top-K with unique contiguous ranks under concurrent updates", async () => {
    const leaderboardId = await createLeaderboard();
    const board = projector(3);
    const inputs = await Promise.all([
      seedCandidate(leaderboardId, 0, "a", metrics(0.3, 0)),
      seedCandidate(leaderboardId, 1, "b", metrics(0.2, 0)),
      seedCandidate(leaderboardId, 2, "c", metrics(0.1, 0)),
      seedCandidate(leaderboardId, 3, "d", metrics(0.25, 0)),
      seedCandidate(leaderboardId, 4, "e", metrics(0.15, 0)),
      seedCandidate(leaderboardId, 5, "f", metrics(0.05, 0))
    ]);
    await Promise.all(inputs.map((input) => board.apply(input)));

    expect(await scores(leaderboardId)).toEqual([
      { rank: 1, score: 0.3 },
      { rank: 2, score: 0.25 },
      { rank: 3, score: 0.2 }
    ]);
    const ranks = await pool.query<{ rank: number }>(
      "SELECT rank FROM experiment.leaderboard_entries WHERE leaderboard_id = $1 ORDER BY rank",
      [leaderboardId]
    );
    expect(ranks.rows.map((row) => Number(row.rank))).toEqual([1, 2, 3]);
  });
});
