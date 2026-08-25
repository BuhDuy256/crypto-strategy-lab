// Integration tests for the search coordinator against real PostgreSQL.
//
// One behaviour per test: each stop condition ends the run, the backpressure
// bound holds, a restarted coordinator resumes without duplicating candidates,
// progress is queryable, and the candidate ledger is append-only. Candidate
// completion is simulated by seeding an accepted result directly, so these tests
// exercise the coordinator's control logic without running the real backtester.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import {
  createBuiltInStrategyRegistry,
  createBuiltInStrategyGeneratorRegistry,
  CombinationPolicyRegistry
} from "../../strategy/index.js";
import type { DatasetService, DatasetRef } from "../../market/index.js";
import { PostgresExperimentSpecificationStore } from "../infrastructure/postgres-experiment-specification-store.js";
import { PostgresBacktestRunStore } from "../infrastructure/postgres-backtest-run-store.js";
import { PostgresSearchRunStore } from "../infrastructure/postgres-search-run-store.js";
import { ExperimentSpecificationService } from "./experiment-specification-service.js";
import { BacktestRunService } from "./backtest-run-service.js";
import { createBuiltInRankingPolicyRegistry } from "./built-in-ranking-policy-registry.js";
import { SearchCoordinator } from "./search-coordinator.js";
import type { GenerateRequest } from "../../strategy/index.js";
import type { ExperimentDraftContent, FreezeProvenance } from "../domain/experiment-specification.js";
import type { SearchConfiguration, SearchStopConditions } from "../domain/search-specification.js";

const HEX = "a".repeat(64);
const TRADE_HASH = "b".repeat(64);

const datasetRef: DatasetRef = {
  datasetId: "dataset-search-01",
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

function searchConfiguration(stopConditions: SearchStopConditions, maxInFlight: number): SearchConfiguration {
  return {
    generator: { id: "random-search", version: "1.0.0" },
    generatorConfiguration: {},
    searchSpace: {
      strategies: [{ id: "rsi", version: "1.0.0" }],
      compositeSizes: [1],
      policies: []
    },
    seed: "search-01-test",
    rankingPolicy: { id: "weighted-return-drawdown", version: "1.0.0" },
    rankingConfiguration: { weights: { totalReturn: 1, maximumDrawdown: -1 }, minTrades: 1 },
    stopConditions,
    maxInFlight
  };
}

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

describe("SearchCoordinator", () => {
  let pool: Pool;
  let specifications: ExperimentSpecificationService;
  let runs: BacktestRunService;
  let searchStore: PostgresSearchRunStore;
  const strategies = createBuiltInStrategyRegistry();
  const policies = new CombinationPolicyRegistry();
  const generators = createBuiltInStrategyGeneratorRegistry(strategies, policies);
  const rankings = createBuiltInRankingPolicyRegistry();

  beforeAll(async () => {
    pool = await resetTestDatabase();
  });
  beforeEach(async () => {
    await pool.query(
      `TRUNCATE experiment.search_candidates, experiment.search_runs,
        experiment.backtest_result_provenance, experiment.backtest_annotations,
        experiment.backtest_trades, experiment.backtest_results,
        experiment.backtest_attempts, experiment.backtest_runs,
        experiment.specifications CASCADE`
    );
    const specStore = new PostgresExperimentSpecificationStore(pool);
    specifications = new ExperimentSpecificationService(specStore, fakeDatasets, strategies);
    const runStore = new PostgresBacktestRunStore(pool);
    runs = new BacktestRunService(specifications, runStore, runStore);
    searchStore = new PostgresSearchRunStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  function newCoordinator(now: () => number = Date.now): SearchCoordinator {
    return new SearchCoordinator(specifications, runs, generators, rankings, searchStore, now);
  }

  async function createExperiment(search: SearchConfiguration): Promise<string> {
    const draft = await specifications.createDraft(draftContent(search));
    const frozen = await specifications.freeze(draft.specId, provenance);
    return frozen.specId;
  }

  async function runIdAt(specId: string, sequence: number): Promise<string> {
    const result = await pool.query<{ run_id: string }>(
      "SELECT run_id FROM experiment.search_candidates WHERE spec_id = $1 AND sequence_number = $2",
      [specId, sequence]
    );
    const runId = result.rows[0]?.run_id;
    if (runId === undefined) throw new Error(`no candidate at sequence ${sequence}`);
    return runId;
  }

  async function markCompleted(runId: string, metrics: Record<string, number>): Promise<void> {
    const run = await pool.query<{ spec_id: string; idempotency_key: string }>(
      "SELECT spec_id, idempotency_key FROM experiment.backtest_runs WHERE run_id = $1",
      [runId]
    );
    const { spec_id, idempotency_key } = run.rows[0]!;
    await pool.query(
      `INSERT INTO experiment.backtest_results
         (result_id, run_id, spec_id, spec_hash, idempotency_key, metric_set, metrics,
          execution_assumptions, trade_content_hash)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, '{}'::jsonb, $5::jsonb, '{}'::jsonb, $6)`,
      [runId, spec_id, HEX, idempotency_key, JSON.stringify(metrics), TRADE_HASH]
    );
    await pool.query(
      "UPDATE experiment.backtest_runs SET status = 'completed', lease_expires_at = NULL, updated_at = now() WHERE run_id = $1",
      [runId]
    );
  }

  it("rejects a second start for the same experiment", async () => {
    const specId = await createExperiment(searchConfiguration({ maxCandidates: 5 }, 4));
    const coordinator = newCoordinator();
    await coordinator.start(specId, "request-1");
    await expect(coordinator.start(specId, "request-2")).rejects.toThrow("SEARCH_ALREADY_STARTED");
  });

  it("submits generated candidates and reports progress", async () => {
    const specId = await createExperiment(searchConfiguration({ maxCandidates: 10 }, 10));
    const coordinator = newCoordinator();
    await coordinator.start(specId, "request-1");

    const first = await coordinator.tick(specId);
    const second = await coordinator.tick(specId);
    expect(first.kind).toBe("submitted");
    expect(second.kind).toBe("submitted");

    const progress = await coordinator.progress(specId);
    expect(progress).toMatchObject({
      status: "running",
      generated: 2,
      submitted: 2,
      completed: 0,
      failed: 0,
      inFlight: 2
    });

    const hashes = await pool.query<{ content_hash: string }>(
      "SELECT content_hash FROM experiment.search_candidates WHERE spec_id = $1",
      [specId]
    );
    expect(new Set(hashes.rows.map((row) => row.content_hash)).size).toBe(2);
  });

  it("resumes from durable state after a coordinator restart without duplicating candidates", async () => {
    const search = searchConfiguration({ maxCandidates: 10 }, 10);
    const specId = await createExperiment(search);
    const first = newCoordinator();
    await first.start(specId, "request-1");
    await first.tick(specId);
    await first.tick(specId);

    // An independent generator is the source of truth for the deterministic
    // sequence: the third unique candidate is what an uninterrupted run submits next.
    const request: GenerateRequest = {
      searchSpace: search.searchSpace,
      seed: search.seed,
      configuration: search.generatorConfiguration
    };
    const oracle = generators.resolve(search.generator).generate(request)[Symbol.iterator]();
    const expectedThird = [oracle.next(), oracle.next(), oracle.next()][2]!.value.contentHash;

    // A fresh coordinator instance simulates the process being killed and restarted.
    const resumed = newCoordinator();
    const outcome = await resumed.tick(specId);
    expect(outcome).toEqual({ kind: "submitted", contentHash: expectedThird });

    const count = await searchStore.candidateCount(specId);
    expect(count).toBe(3);
    const runIds = await pool.query<{ run_id: string }>(
      "SELECT DISTINCT run_id FROM experiment.search_candidates WHERE spec_id = $1",
      [specId]
    );
    expect(runIds.rowCount).toBe(3);
  });

  it("bounds in-flight work by the configured limit and waits", async () => {
    const specId = await createExperiment(searchConfiguration({ maxCandidates: 100 }, 2));
    const coordinator = newCoordinator();
    await coordinator.start(specId, "request-1");

    await coordinator.tick(specId);
    await coordinator.tick(specId);
    const waited = await coordinator.tick(specId);
    expect(waited.kind).toBe("waited");
    expect(await searchStore.candidateCount(specId)).toBe(2);

    await markCompleted(await runIdAt(specId, 0), {
      totalReturn: 0.1,
      maximumDrawdown: 0.1,
      winRate: 0.5,
      numberOfTrades: 5
    });
    const resumed = await coordinator.tick(specId);
    expect(resumed.kind).toBe("submitted");
    expect(await searchStore.candidateCount(specId)).toBe(3);
  });

  it("stops after the maximum candidate count", async () => {
    const specId = await createExperiment(searchConfiguration({ maxCandidates: 2 }, 10));
    const coordinator = newCoordinator();
    await coordinator.start(specId, "request-1");

    await coordinator.tick(specId);
    await coordinator.tick(specId);
    const stopped = await coordinator.tick(specId);
    expect(stopped).toEqual({ kind: "stopped", stopReason: "max-candidates" });
    expect(await searchStore.candidateCount(specId)).toBe(2);
    const progress = await coordinator.progress(specId);
    expect(progress).toMatchObject({ status: "stopped", stopReason: "max-candidates" });
  });

  it("stops after the maximum duration", async () => {
    const specId = await createExperiment(searchConfiguration({ maxCandidates: 100, maxDurationMs: 1000 }, 10));
    let clock = Date.now();
    const coordinator = newCoordinator(() => clock);
    await coordinator.start(specId, "request-1");

    const submitted = await coordinator.tick(specId);
    expect(submitted.kind).toBe("submitted");
    clock += 5000;
    const stopped = await coordinator.tick(specId);
    expect(stopped).toEqual({ kind: "stopped", stopReason: "max-duration" });
    expect(await searchStore.candidateCount(specId)).toBe(1);
  });

  it("stops after no improvement for the configured number of iterations", async () => {
    const specId = await createExperiment(
      searchConfiguration({ maxCandidates: 100, noImprovementIterations: 2 }, 10)
    );
    const coordinator = newCoordinator();
    await coordinator.start(specId, "request-1");

    // Best result first, then two that do not improve on it.
    await coordinator.tick(specId);
    await markCompleted(await runIdAt(specId, 0), {
      totalReturn: 0.5,
      maximumDrawdown: 0.1,
      winRate: 0.6,
      numberOfTrades: 5
    });
    await coordinator.tick(specId);
    await markCompleted(await runIdAt(specId, 1), {
      totalReturn: 0.2,
      maximumDrawdown: 0.1,
      winRate: 0.5,
      numberOfTrades: 5
    });
    await coordinator.tick(specId);
    await markCompleted(await runIdAt(specId, 2), {
      totalReturn: 0.1,
      maximumDrawdown: 0.1,
      winRate: 0.5,
      numberOfTrades: 5
    });
    const stopped = await coordinator.tick(specId);
    expect(stopped).toEqual({ kind: "stopped", stopReason: "no-improvement" });
    expect(await searchStore.candidateCount(specId)).toBe(3);
  });

  it("keeps stored candidates append-only", async () => {
    const specId = await createExperiment(searchConfiguration({ maxCandidates: 10 }, 10));
    const coordinator = newCoordinator();
    await coordinator.start(specId, "request-1");
    await coordinator.tick(specId);

    await expect(
      pool.query("UPDATE experiment.search_candidates SET sequence_number = 99 WHERE spec_id = $1", [specId])
    ).rejects.toThrow("append-only");
    await expect(
      pool.query("DELETE FROM experiment.search_candidates WHERE spec_id = $1", [specId])
    ).rejects.toThrow("append-only");
  });
});
