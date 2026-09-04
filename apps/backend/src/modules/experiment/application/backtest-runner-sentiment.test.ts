// NEWS-06 runner seam: only declared sentiment strategies resolve News and persist its usage.

import { describe, expect, it, vi } from "vitest";
import type { DatasetService } from "../../market/index.js";
import { SentimentFeatureService } from "../../news/index.js";
import { createBuiltInStrategyRegistry, type StrategyDescriptor } from "../../strategy/index.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";
import type { ClaimedBacktestJob } from "./backtest-run-service.js";
import {
  BacktestRunnerService,
  type BacktestResultAcceptor,
  type BacktestWorkQueue,
  type RunnerSentimentContextAssembler,
  type StrategyInputDescriptorResolver
} from "./backtest-runner-service.js";
import type { BacktestComputation } from "./backtest-computation.js";
import type { SentimentContextAssembly } from "./sentiment-feature-context-assembler.js";
import { ExperimentSentimentContextAssembler } from "./sentiment-feature-context-assembler.js";
import { DurableBacktestResultAcceptor } from "./backtest-result-acceptor.js";

const bars = [
  { provider: "fixture", symbol: "BTCUSDT", timeframe: "1h" as const, openTime: 0,
    closeTime: 3_600_000, open: 100, high: 100, low: 100, close: 100, volume: 1,
    closed: true as const, revision: 1 }
];

function specification(strategyId: string): FrozenExperimentSpecification {
  return {
    specId: "10000000-0000-4000-8000-000000000001", status: "frozen", contentHash: "a".repeat(64),
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", frozenAt: "2026-09-01T00:00:00.000Z",
    content: {
      schemaVersion: "v1",
      datasetRef: {
        datasetId: "dataset", version: 1, manifestVersion: "v1", provider: "fixture", symbols: ["BTCUSDT"],
        timeframe: "1h", range: { startTime: 0, endTime: 3_600_000 }, revisionWatermark: 0, integrityHash: "hash"
      },
      strategy: { id: strategyId, version: "1.0.0", parameters: {} },
      execution: {
        initialCapital: 1000, feeRate: 0, slippageRate: 0, signalTiming: "close-of-bar", fillRule: "next-open",
        maxConcurrentPositions: 1, leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
        stopLoss: { enabled: false }, takeProfit: { enabled: false }, sameBarExitPriority: "stop-loss-first",
        finalPositionPolicy: "liquidate-at-final-close", decimalPlaces: 8
      },
      metricSet: { id: "mvp", version: "1.0.0" },
      provenance: {
        engine: { id: "backtester", version: "1.0.0" }, nodeRuntimeVersion: "22.0.0", dependencyLockHash: "b".repeat(64),
        applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0"
      },
      ...(strategyId === "news-sentiment" ? {
        sentimentInput: {
          windowDurationMs: 3_600_000,
          policy: { maxAgeMs: 60_000, onMissing: { action: "substitute" as const, substituteValue: 0 }, onStale: { action: "degrade" as const } }
        }
      } : {})
    }
  };
}

const claim = {
  run: { runId: "20000000-0000-4000-8000-000000000001" },
  job: {
    jobId: "20000000-0000-4000-8000-000000000001", runId: "20000000-0000-4000-8000-000000000001",
    specId: "10000000-0000-4000-8000-000000000001", candidateId: "candidate", attempt: 1,
    idempotencyKey: "c".repeat(64), correlationId: "request"
  }, attempt: 1, leaseExpiresAt: "2026-09-01T00:01:00.000Z", runnerId: "runner"
} as ClaimedBacktestJob;

function runner(input: {
  readonly specification: FrozenExperimentSpecification;
  readonly descriptors: StrategyInputDescriptorResolver;
  readonly sentiment: RunnerSentimentContextAssembler;
  readonly computation: BacktestComputation;
  readonly acceptor: BacktestResultAcceptor;
}): BacktestRunnerService {
  const queue: BacktestWorkQueue = {
    claimNext: vi.fn(async () => claim), heartbeat: vi.fn(async () => true),
    isCancellationRequested: vi.fn(async () => false), fail: vi.fn(), release: vi.fn()
  };
  return new BacktestRunnerService(
    queue,
    { get: vi.fn(async () => input.specification) },
    { resolveDataset: vi.fn(async () => ({ manifest: {}, candles: bars })) } as unknown as DatasetService,
    input.computation,
    input.acceptor,
    { nodeRuntimeVersion: "22.0.0", dependencyLockHash: "b".repeat(64), applicationCommit: "app", workerCommit: "worker", deterministicConfigVersion: "1.0.0" },
    undefined,
    10_000,
    input.descriptors,
    input.sentiment
  );
}

const result = { simulation: { initialCapital: 1000, trades: [], annotations: [] }, evaluation: { values: {} } } as never;

describe("BacktestRunnerService sentiment execution", () => {
  it("passes declared sentiment inputs to the worker computation and records the exact usage manifest", async () => {
    const usageManifest = {
      schemaVersion: "sentiment-feature-usage.v1" as const,
      snapshots: [{
        window: { id: "window", startAt: 0, endAt: 3_600_000, aggregationVersion: "signed-mean-v1" as const },
        resultIds: ["news-1"], modelVersions: ["1.0.0"], quality: "degraded" as const,
        freshness: { state: "stale" as const, ageMs: 60_001 },
        appliedPolicy: { state: "applied" as const, reason: "stale" as const, action: "degrade" }
      }]
    };
    const descriptors: StrategyInputDescriptorResolver = {
      resolve: vi.fn(async () => ({ requiredInputs: ["sentiment-series"] } as Pick<StrategyDescriptor, "requiredInputs">))
    };
    const sentiment: RunnerSentimentContextAssembler = {
      assemble: vi.fn(async (): Promise<SentimentContextAssembly> => ({
        status: "ready",
        entries: [{ evaluationTime: 3_600_000, input: { kind: "sentiment-series", points: [{ time: 3_600_000, score: 0.4 }] } }],
        usageManifest
      }))
    };
    const computation: BacktestComputation = { compute: vi.fn(async () => result) };
    const acceptor: BacktestResultAcceptor = { accept: vi.fn(async () => undefined) };

    await expect(runner({ specification: specification("news-sentiment"), descriptors, sentiment, computation, acceptor })
      .processNext("runner")).resolves.toBe(true);

    expect(sentiment.assemble).toHaveBeenCalledWith(expect.objectContaining({
      marketSymbol: "BTCUSDT", evaluationTimes: [3_600_000],
      sentimentInput: expect.objectContaining({ windowDurationMs: 3_600_000 })
    }));
    expect(computation.compute).toHaveBeenCalledWith(expect.objectContaining({
      sentimentEntries: [{ evaluationTime: 3_600_000, input: { kind: "sentiment-series", points: [{ time: 3_600_000, score: 0.4 }] } }]
    }), expect.any(AbortSignal));
    expect(acceptor.accept).toHaveBeenCalledWith(expect.objectContaining({ sentimentUsage: usageManifest }));
  });

  it("does not resolve the sentiment assembler for a technical-only strategy", async () => {
    const descriptors: StrategyInputDescriptorResolver = {
      resolve: vi.fn(async () => ({ requiredInputs: ["price-bars"] } as Pick<StrategyDescriptor, "requiredInputs">))
    };
    const sentiment: RunnerSentimentContextAssembler = {
      assemble: vi.fn(async () => { throw new Error("technical-only must not query News"); })
    };
    const computation: BacktestComputation = { compute: vi.fn(async () => result) };
    const acceptor: BacktestResultAcceptor = { accept: vi.fn(async () => undefined) };

    await expect(runner({ specification: specification("moving-average"), descriptors, sentiment, computation, acceptor })
      .processNext("runner")).resolves.toBe(true);

    expect(sentiment.assemble).not.toHaveBeenCalled();
    expect(computation.compute).toHaveBeenCalledWith(expect.not.objectContaining({ sentimentEntries: expect.anything() }), expect.any(AbortSignal));
    expect(acceptor.accept).toHaveBeenCalledWith(expect.not.objectContaining({ sentimentUsage: expect.anything() }));
  });

  it("records the NEWS-05 missing substitute policy and freshness for the registered sentiment strategy", async () => {
    const strategies = createBuiltInStrategyRegistry();
    const featureStore = { findInWindow: vi.fn(async () => []) };
    const feature = new SentimentFeatureService(featureStore);
    const sentiment = new ExperimentSentimentContextAssembler({ resolve: () => feature });
    const descriptors: StrategyInputDescriptorResolver = {
      resolve: async (strategy) => strategies.resolve(strategy).descriptor
    };
    const acceptedStore = { accept: vi.fn(async () => ({ resultId: "result", runId: "run" })) };
    const acceptor = new DurableBacktestResultAcceptor(acceptedStore as never);
    const completeResult = {
      simulation: { initialCapital: 1000, trades: [], annotations: [] },
      evaluation: { metricSet: { id: "mvp", version: "1.0.0" }, values: {} }
    } as never;

    await expect(runner({
      specification: specification("news-sentiment"),
      descriptors,
      sentiment,
      computation: { compute: vi.fn(async () => completeResult) },
      acceptor
    }).processNext("runner")).resolves.toBe(true);

    expect(featureStore.findInWindow).toHaveBeenCalledOnce();
    expect(acceptedStore.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        sentimentUsage: expect.objectContaining({
          snapshots: [expect.objectContaining({
            freshness: { state: "missing", ageMs: null },
            quality: "substituted",
            appliedPolicy: { state: "applied", reason: "missing", action: "substitute" }
          })]
        })
      }),
      expect.objectContaining({
        newsInput: expect.objectContaining({ status: "recorded" }),
        sentimentModel: { status: "recorded", value: [] }
      })
    );
  });
});
