import { describe, expect, it, vi } from "vitest";
import type { Candle } from "../../market/index.js";
import { createBuiltInStrategyRegistry } from "../../strategy/index.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";
import { computeBacktest } from "./backtest-computation.js";
import { DurableBacktestResultAcceptor } from "./backtest-result-acceptor.js";
import type { BacktestRunnerOutcome } from "./backtest-runner-service.js";

const runtimeIdentity = {
  nodeRuntimeVersion: "22.0.0",
  dependencyLockHash: "a".repeat(64),
  applicationCommit: "proof-build",
  workerCommit: "proof-build",
  deterministicConfigVersion: "1.0.0"
};

const macd = {
  id: "macd",
  version: "1.0.0",
  parameters: { fastPeriod: 2, slowPeriod: 3, signalPeriod: 2, priceSource: "close" }
} as const;

const specification = {
  specId: "10000000-0000-4000-8000-000000000001",
  status: "frozen",
  contentHash: "b".repeat(64),
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  frozenAt: "2026-08-29T00:00:00.000Z",
  content: {
    schemaVersion: "v1",
    datasetRef: {
      datasetId: "20000000-0000-4000-8000-000000000001",
      version: 1,
      manifestVersion: "v1",
      provider: "proof-provider",
      symbols: ["BTCUSDT"],
      timeframe: "1h",
      range: { startTime: 0, endTime: 6 * 3_600_000 },
      revisionWatermark: 1,
      integrityHash: "c".repeat(64)
    },
    strategy: macd,
    execution: {
      initialCapital: 1_000,
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
      ...runtimeIdentity
    }
  }
} as FrozenExperimentSpecification;

function candles(closes: readonly number[]): readonly Candle[] {
  return closes.map((close, index) => ({
    provider: "proof-provider",
    symbol: "BTCUSDT",
    timeframe: "1h",
    openTime: index * 3_600_000,
    closeTime: (index + 1) * 3_600_000 - 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
    revision: 1
  }));
}

describe("PROOF-EXT-001 representative MACD backtest", () => {
  it("runs through the unchanged backtest path and stores exact strategy provenance", async () => {
    const dataset = candles([1, 1, 1, 1, 2, 2]);
    const computed = computeBacktest(
      { specification, candles: dataset },
      createBuiltInStrategyRegistry()
    );
    const store = {
      accept: vi.fn(async () => ({
        resultId: "result-1",
        runId: "run-1",
        idempotencyKey: "d".repeat(64),
        tradeContentHash: "e".repeat(64),
        completedAt: "2026-08-29T00:00:01.000Z"
      }))
    };
    const outcome = {
      job: { runId: "run-1" },
      claim: { attempt: 1, runnerId: "runner-1" },
      specification,
      simulation: computed.simulation,
      evaluation: computed.evaluation,
      runtimeIdentity,
      datasetManifest: { gaps: [] }
    } as unknown as BacktestRunnerOutcome;

    await new DurableBacktestResultAcceptor(store).accept(outcome);

    expect(computed.simulation.trades).toHaveLength(1);
    expect(computed.evaluation.values.numberOfTrades).toBe(1);
    expect(store.accept).toHaveBeenCalledWith(
      expect.objectContaining({ specification, simulation: computed.simulation }),
      expect.objectContaining({ strategy: { status: "recorded", value: macd } })
    );
  });
});
