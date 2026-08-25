// Tests for on-demand annotation recompute against real PostgreSQL.
//
// AC5: recomputing a search result's annotations reproduces "the same annotations
// the original run produced, proved by comparison against a stored single-run
// result." Here the stored annotations are persisted by the real EXP-06
// acceptance transaction (PostgresResultAcceptanceStore.accept, which downsamples
// and stores them), and the recompute must reproduce that exact stored row by
// resolving the run's specification and dataset independently. If the acceptance
// path's downsampling ever diverged from the recompute pipeline, this would
// catch it. An unknown run yields undefined.

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { createBuiltInStrategyRegistry } from "../../strategy/index.js";
import type { Candle, DatasetService } from "../../market/index.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";
import { computeBacktest } from "./backtest-computation.js";
import type { ProvenanceChecklist } from "./backtest-result-acceptor.js";
import type { BacktestRunnerOutcome } from "./backtest-runner-service.js";
import { PostgresResultAcceptanceStore } from "../infrastructure/postgres-result-acceptance-store.js";
import { PostgresRunSpecLocator } from "../infrastructure/postgres-run-spec-locator.js";
import {
  SearchAnnotationRecompute,
  type BacktestRunSpecLocator
} from "./search-annotation-recompute.js";
import type { FrozenSpecificationReader } from "./backtest-runner-service.js";

const strategies = createBuiltInStrategyRegistry();
const HEX = "a".repeat(64);

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => ({
    provider: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h" as const,
    openTime: index * 10,
    closeTime: index * 10 + 9,
    open: 100 + index,
    high: 105 + index,
    low: 95 + index,
    close: 100 + (index % 5) * 2,
    volume: 1,
    closed: true as const,
    revision: 1
  }));
}

function specification(specId: string): FrozenExperimentSpecification {
  return {
    specId,
    status: "frozen",
    contentHash: HEX,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    frozenAt: "2026-01-01T00:00:00.000Z",
    content: {
      schemaVersion: "v1",
      datasetRef: { datasetId: "dataset-recompute" } as FrozenExperimentSpecification["content"]["datasetRef"],
      strategy: {
        id: "moving-average",
        version: "1.0.0",
        parameters: { fastPeriod: 3, slowPeriod: 5, priceSource: "close" }
      },
      execution: {
        initialCapital: 10_000,
        feeRate: 0,
        slippageRate: 0,
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
      provenance: {
        engine: { id: "backtester", version: "1.0.0" },
        nodeRuntimeVersion: "20.0.0",
        dependencyLockHash: "b".repeat(64),
        applicationCommit: "commit",
        workerCommit: "commit",
        deterministicConfigVersion: "1.0.0"
      }
    }
  };
}

const checklist = {
  specification: { status: "recorded", id: "spec", hash: HEX },
  dataset: { status: "recorded", value: {} }, strategy: { status: "recorded", value: {} },
  execution: { status: "recorded", value: {} }, metricSet: { status: "recorded", value: {} },
  engine: { status: "recorded", value: {} }, runtimeAndBuild: { status: "recorded", value: {} },
  newsInput: { status: "not-applicable" }, sentimentModel: { status: "not-applicable" },
  randomSeed: { status: "not-applicable" }, pythonRuntime: { status: "not-applicable" },
  combinationPolicy: { status: "not-applicable" },
  generatorAndSearch: { status: "not-applicable" }, rankingPolicy: { status: "not-applicable" },
  dataQualityExceptions: { status: "recorded", value: [] },
  attempt: { status: "recorded", value: { number: 1, runnerId: "runner-1" } }
} as const satisfies ProvenanceChecklist;

function recompute(pool: Pool, spec: FrozenExperimentSpecification, bars: Candle[]): SearchAnnotationRecompute {
  const locator: BacktestRunSpecLocator = new PostgresRunSpecLocator(pool);
  const specifications: FrozenSpecificationReader = { get: () => Promise.resolve(spec) };
  const datasets = {
    createDataset: () => Promise.reject(new Error("unused")),
    resolveDataset: () =>
      Promise.resolve({ manifest: { gaps: [] }, candles: bars } as unknown as Awaited<
        ReturnType<DatasetService["resolveDataset"]>
      >)
  } as DatasetService;
  return new SearchAnnotationRecompute(locator, specifications, datasets, strategies);
}

describe("SearchAnnotationRecompute", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await resetTestDatabase();
  });
  beforeEach(async () => {
    await pool.query(
      `TRUNCATE experiment.backtest_annotations, experiment.backtest_result_provenance,
        experiment.backtest_trades, experiment.backtest_results, experiment.backtest_attempts,
        experiment.backtest_runs, experiment.specifications CASCADE`
    );
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("reproduces the annotations the acceptance path stored for the same run", async () => {
    const specId = randomUUID();
    const runId = randomUUID();
    const key = "b".repeat(64);
    const bars = candles(12);
    const spec = specification(specId);
    const { simulation, evaluation } = computeBacktest({ specification: spec, candles: bars }, strategies);

    // Seed the durable run in the exact state the acceptance transaction requires.
    await pool.query(
      "INSERT INTO experiment.specifications (spec_id,status,content,content_hash,frozen_at) VALUES ($1,'frozen','{}',$2,now())",
      [specId, HEX]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_runs
         (run_id,spec_id,candidate_id,idempotency_key,status,correlation_id,lease_expires_at)
       VALUES ($1,$2,'candidate',$3,'running','request-1',now()+interval '30 seconds')`,
      [runId, specId, key]
    );
    await pool.query(
      `INSERT INTO experiment.backtest_attempts
         (run_id,attempt_number,runner_id,correlation_id,claimed_at,lease_expires_at)
       VALUES ($1,1,'runner-1','request-1',now(),now()+interval '30 seconds')`,
      [runId]
    );

    const outcome = {
      job: { jobId: runId, runId, specId, candidateId: "candidate", attempt: 1, idempotencyKey: key, correlationId: "request-1" },
      claim: {
        job: { jobId: runId, runId, specId, candidateId: "candidate", attempt: 1, idempotencyKey: key, correlationId: "request-1" },
        run: { runId }, attempt: 1, runnerId: "runner-1", leaseExpiresAt: "2099-01-01T00:00:00.000Z"
      },
      specification: spec,
      simulation,
      evaluation,
      runtimeIdentity: {
        nodeRuntimeVersion: "20.0.0", dependencyLockHash: "b".repeat(64),
        applicationCommit: "commit", workerCommit: "commit", deterministicConfigVersion: "1.0.0"
      },
      datasetManifest: { ref: {}, candleCount: bars.length, gaps: [] }
    } as unknown as BacktestRunnerOutcome;

    const accepted = await new PostgresResultAcceptanceStore(pool).accept(outcome, checklist);
    const storedRow = await pool.query<{ annotations: unknown }>(
      "SELECT annotations FROM experiment.backtest_annotations WHERE result_id = $1",
      [accepted.resultId]
    );
    const stored = storedRow.rows[0]?.annotations as unknown[];
    expect(stored.length).toBeGreaterThan(0);

    const recomputed = await recompute(pool, spec, bars).recompute(runId);

    expect(recomputed).toEqual(stored);
  });

  it("returns undefined for an unknown run", async () => {
    const result = await recompute(pool, specification(randomUUID()), candles(12)).recompute(randomUUID());
    expect(result).toBeUndefined();
  });
});
