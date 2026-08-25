// Integration tests for the leaderboard read against real PostgreSQL.
//
// One behaviour per test: the read returns ranked entries with their strategy
// composition and metrics; sorting by a metric reorders the display while the
// stored rank and the projection table are unchanged; an unknown experiment
// yields undefined so the transport can answer with a clear client error. The
// projection is built by the real SEARCH-04 projector over seeded completed
// candidates, so this exercises the read, not the ranking logic.

import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { createBuiltInStrategyRegistry } from "../../strategy/index.js";
import type { DatasetService, DatasetRef } from "../../market/index.js";
import { PostgresExperimentSpecificationStore } from "./postgres-experiment-specification-store.js";
import { PostgresSearchRunStore } from "./postgres-search-run-store.js";
import { PostgresLeaderboardProjectionStore } from "./postgres-leaderboard-projection-store.js";
import { PostgresLeaderboardQuery } from "./postgres-leaderboard-query.js";
import { ExperimentSpecificationService } from "../application/experiment-specification-service.js";
import { createBuiltInRankingPolicyRegistry } from "../application/built-in-ranking-policy-registry.js";
import { LeaderboardProjector } from "../application/leaderboard-projector.js";
import type { ExperimentDraftContent, FreezeProvenance } from "../domain/experiment-specification.js";
import type { SearchConfiguration } from "../domain/search-specification.js";

const HEX = "a".repeat(64);

const datasetRef: DatasetRef = {
  datasetId: "dataset-leaderboard-query-01",
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
  seed: "leaderboard-query-01",
  rankingPolicy: { id: "weighted-return-drawdown", version: "1.0.0" },
  rankingConfiguration: { weights: { totalReturn: 1, maximumDrawdown: -1 }, minTrades: 1 },
  stopConditions: { maxCandidates: 100 },
  maxInFlight: 4
};

function draftContent(): ExperimentDraftContent {
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
    search: searchConfiguration
  };
}

function hex64(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

describe("PostgresLeaderboardQuery", () => {
  let pool: Pool;
  let specifications: ExperimentSpecificationService;
  let store: PostgresLeaderboardProjectionStore;
  let query: PostgresLeaderboardQuery;
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
    query = new PostgresLeaderboardQuery(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function createLeaderboard(): Promise<string> {
    const draft = await specifications.createDraft(draftContent());
    const frozen = await specifications.freeze(draft.specId, provenance);
    await new PostgresSearchRunStore(pool).startRun(frozen.specId, "correlation-1");
    return frozen.specId;
  }

  // Seed one completed candidate with a real single-strategy specification and
  // apply it through the projector, so the leaderboard row exists to be read.
  async function seedAndApply(
    leaderboardId: string,
    sequence: number,
    name: string,
    period: number,
    metrics: Record<string, number>
  ): Promise<void> {
    const runId = randomUUID();
    const resultId = randomUUID();
    const derivedSpecId = randomUUID();
    const contentHash = hex64(`content-${name}`);
    const idempotencyKey = hex64(`key-${name}`);
    const candidate = {
      schemaVersion: "v1",
      specification: {
        kind: "single",
        id: "rsi",
        version: "1.0.0",
        parameters: { period, buyThreshold: 30, sellThreshold: 70, priceSource: "close" }
      },
      generator: { id: "random-search", version: "1.0.0", configuration: {}, seed: name },
      contentHash
    };
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
       VALUES ($1, 1, 'runner-1', 'correlation-1', now(), now(), now())`,
      [runId]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_results
         (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
          execution_assumptions, trade_content_hash)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6::jsonb, '{}'::jsonb, $7)`,
      [resultId, runId, derivedSpecId, HEX, idempotencyKey, JSON.stringify(metrics), hex64(`trade-${name}`)]
    );
    await pool.query(
      `INSERT INTO experiment.search_candidates
         (spec_id, content_hash, sequence_number, candidate, derived_spec_id, run_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [leaderboardId, contentHash, sequence, JSON.stringify(candidate), derivedSpecId, runId]
    );
    const projector = new LeaderboardProjector(store, specifications, rankings, 10);
    await projector.apply({ resultId, runId, aggregateVersion: 1, metrics });
  }

  function m(totalReturn: number, winRate: number, numberOfTrades: number): Record<string, number> {
    return { totalReturn, maximumDrawdown: 0, winRate, numberOfTrades };
  }

  it("returns ranked entries with their strategy composition and metrics", async () => {
    const leaderboardId = await createLeaderboard();
    await seedAndApply(leaderboardId, 0, "a", 10, m(0.3, 0.4, 10));
    await seedAndApply(leaderboardId, 1, "b", 20, m(0.2, 0.9, 5));

    const response = await query.getLeaderboard(leaderboardId, "rank");

    expect(response?.sort).toBe("rank");
    expect(response?.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    const top = response?.entries[0];
    expect(top?.strategy).toEqual({
      kind: "single",
      id: "rsi",
      version: "1.0.0",
      parameters: { period: 10, buyThreshold: 30, sellThreshold: 70, priceSource: "close" }
    });
    expect(top?.metrics).toEqual({ totalReturn: 0.3, winRate: 0.4, maximumDrawdown: 0, numberOfTrades: 10 });
    expect(top?.score).toBe(0.3);
  });

  it("reorders the display by a metric while keeping each entry's stored rank", async () => {
    const leaderboardId = await createLeaderboard();
    await seedAndApply(leaderboardId, 0, "a", 10, m(0.3, 0.4, 10));
    await seedAndApply(leaderboardId, 1, "b", 20, m(0.2, 0.9, 5));

    const byWinRate = await query.getLeaderboard(leaderboardId, "winRate");

    // Display order follows win rate: b (0.9) before a (0.4).
    expect(byWinRate?.sort).toBe("winRate");
    expect(byWinRate?.entries.map((entry) => entry.metrics.winRate)).toEqual([0.9, 0.4]);
    // The stored rank still reflects the ranking policy: a is rank 1, b is rank 2.
    expect(byWinRate?.entries.map((entry) => entry.rank)).toEqual([2, 1]);
    // The stored projection order is untouched.
    const stored = await pool.query<{ rank: number }>(
      "SELECT rank FROM experiment.leaderboard_entries WHERE leaderboard_id = $1 ORDER BY rank ASC",
      [leaderboardId]
    );
    expect(stored.rows.map((row) => Number(row.rank))).toEqual([1, 2]);
  });

  it("returns undefined for an experiment that has no search run", async () => {
    const unknown = await query.getLeaderboard(randomUUID(), "rank");
    expect(unknown).toBeUndefined();
  });

  it("surfaces corruption when a projection row has no candidate instead of dropping it", async () => {
    const leaderboardId = await createLeaderboard();
    // A projection row is always written from a candidate; an orphaned entry with
    // no candidate row is corruption and must be reported, not silently omitted.
    // Seed the rows the entry links to, but deliberately no search_candidates row.
    const runId = randomUUID();
    const resultId = randomUUID();
    const derivedSpecId = randomUUID();
    const idempotencyKey = hex64("orphan-key");
    await pool.query(
      "INSERT INTO experiment.specifications (spec_id, status, content, content_hash, frozen_at) VALUES ($1, 'frozen', '{}'::jsonb, $2, now())",
      [derivedSpecId, hex64("orphan-spec")]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_runs
         (run_id, spec_id, candidate_id, idempotency_key, status, correlation_id, lease_expires_at)
       VALUES ($1, $2, 'orphan', $3, 'completed', 'correlation-1', NULL)`,
      [runId, derivedSpecId, idempotencyKey]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_results
         (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
          execution_assumptions, trade_content_hash)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6::jsonb, '{}'::jsonb, $7)`,
      [resultId, runId, derivedSpecId, HEX, idempotencyKey,
        JSON.stringify({ totalReturn: 0.3, winRate: 0.5, maximumDrawdown: 0, numberOfTrades: 5 }),
        hex64("orphan-trade")]
    );
    await pool.query(
      `INSERT INTO experiment.leaderboard_entries
         (leaderboard_id, content_hash, result_id, run_id, derived_spec_id, rank, score, metrics, policy, aggregate_version)
       VALUES ($1, $2, $3, $4, $5, 1, 0.3, $6::jsonb, '{}'::jsonb, 1)`,
      [leaderboardId, hex64("orphan"), resultId, runId, derivedSpecId,
        JSON.stringify({ totalReturn: 0.3, winRate: 0.5, maximumDrawdown: 0, numberOfTrades: 5 })]
    );

    await expect(query.getLeaderboard(leaderboardId, "rank")).rejects.toThrow("LEADERBOARD_QUERY_CORRUPT");
  });
});
