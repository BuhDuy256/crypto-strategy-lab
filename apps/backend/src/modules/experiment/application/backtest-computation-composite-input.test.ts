// Regression: a composite's execution descriptor must declare every component input.

import { describe, expect, it } from "vitest";
import type { Candle } from "../../market/index.js";
import {
  createBuiltInCombinationPolicyRegistry,
  createBuiltInStrategyRegistry,
  createCompositeExecutionStrategy,
  type CompositeStrategyDefinition
} from "../../strategy/index.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";
import { computeBacktest } from "./backtest-computation.js";

const definition: CompositeStrategyDefinition = {
  id: "news-plus-ma",
  version: "1.0.0",
  name: "News plus MA",
  description: "Regression fixture",
  components: [
    {
      id: "news-sentiment",
      version: "1.0.0",
      parameters: { positiveThreshold: 0.2, negativeThreshold: -0.2, windowDurationMs: 3_600_000 }
    },
    {
      id: "moving-average",
      version: "1.0.0",
      parameters: { fastPeriod: 2, slowPeriod: 3, priceSource: "close" }
    }
  ],
  policy: { id: "majority-vote", version: "1.0.0", configuration: {} }
};

const specification = {
  specId: "10000000-0000-4000-8000-000000000001",
  status: "frozen",
  contentHash: "a".repeat(64),
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  frozenAt: "2026-09-01T00:00:00.000Z",
  content: {
    schemaVersion: "v1",
    datasetRef: {
      datasetId: "dataset", version: 1, manifestVersion: "v1", provider: "fixture", symbols: ["BTCUSDT"],
      timeframe: "1h", range: { startTime: 0, endTime: 3 * 3_600_000 }, revisionWatermark: 1,
      integrityHash: "b".repeat(64)
    },
    strategy: { id: definition.id, version: definition.version, parameters: {} },
    execution: {
      initialCapital: 1_000, feeRate: 0, slippageRate: 0, signalTiming: "close-of-bar", fillRule: "next-open",
      maxConcurrentPositions: 1, leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
      stopLoss: { enabled: false }, takeProfit: { enabled: false }, sameBarExitPriority: "stop-loss-first",
      finalPositionPolicy: "liquidate-at-final-close", decimalPlaces: 8
    },
    metricSet: { id: "mvp-metrics", version: "1.0.0" },
    provenance: {
      engine: { id: "backtester", version: "1.0.0" }, nodeRuntimeVersion: "22.0.0",
      dependencyLockHash: "c".repeat(64), applicationCommit: "app", workerCommit: "worker",
      deterministicConfigVersion: "1.0.0"
    },
    sentimentInput: {
      windowDurationMs: 3_600_000,
      policy: { maxAgeMs: 60_000, onMissing: { action: "substitute", substituteValue: 0 }, onStale: { action: "degrade" } }
    }
  }
} as FrozenExperimentSpecification;

const candles: readonly Candle[] = [1, 1, 2].map((close, index) => ({
  provider: "fixture", symbol: "BTCUSDT", timeframe: "1h", openTime: index * 3_600_000,
  closeTime: (index + 1) * 3_600_000 - 1, open: close, high: close, low: close, close, volume: 1,
  closed: true, revision: 1
}));

describe("backtest composite input composition", () => {
  it("passes the sentiment series through the computation path for a composite containing news-sentiment", () => {
    const strategies = createBuiltInStrategyRegistry();
    strategies.register(createCompositeExecutionStrategy(
      definition,
      strategies,
      createBuiltInCombinationPolicyRegistry()
    ));

    expect(() => computeBacktest({
      specification,
      candles,
      sentimentEntries: candles.map((candle) => ({
        evaluationTime: candle.closeTime,
        input: { kind: "sentiment-series" as const, points: [{ time: candle.closeTime, score: 0.4 }] }
      }))
    }, strategies)).not.toThrow();
  });
});
