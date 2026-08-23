// Real Worker Thread execution test for the CPU-isolated backtest seam.

import { describe, expect, it } from "vitest";
import type { BacktestComputationInput } from "../application/backtest-computation.js";
import { WorkerThreadBacktestComputation } from "./worker-thread-backtest-computation.js";

const input = {
  specification: {
    content: {
      strategy: { id: "moving-average", version: "1.0.0",
        parameters: { fastPeriod: 2, slowPeriod: 3, priceSource: "close" } },
      execution: {
        initialCapital: 1000, feeRate: 0, slippageRate: 0,
        signalTiming: "close-of-bar", fillRule: "next-open", maxConcurrentPositions: 1,
        leverage: 1, positionSizing: "available-equity", allowedDirections: ["long", "short"],
        stopLoss: { enabled: false }, takeProfit: { enabled: false },
        sameBarExitPriority: "stop-loss-first", finalPositionPolicy: "liquidate-at-final-close",
        decimalPlaces: 8
      }
    }
  },
  candles: [100, 99, 101, 103].map((close, index) => ({
    provider: "binance", symbol: "BTCUSDT", timeframe: "1h",
    openTime: index * 10, closeTime: index * 10 + 9,
    open: close, high: close + 1, low: close - 1, close, volume: 1,
    closed: true, revision: 1
  }))
} as unknown as BacktestComputationInput;

describe("WorkerThreadBacktestComputation", () => {
  it("runs strategy, backtester, and evaluator outside the orchestration thread", async () => {
    const output = await new WorkerThreadBacktestComputation().compute(input);
    expect(output.evaluation.metricSet).toEqual({ id: "mvp-metrics", version: "1.0.0" });
    expect(output.simulation.annotations.length).toBeGreaterThan(0);
  });

  it("can be terminated through an abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new WorkerThreadBacktestComputation().compute(input, controller.signal))
      .rejects.toThrow("BACKTEST_COMPUTATION_ABORTED");
  });

  it("keeps the orchestration event loop responsive during CPU work", async () => {
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 1);
    const manyCandles = Array.from({ length: 750 }, (_, index) => ({
      ...input.candles[index % input.candles.length]!,
      openTime: index * 10,
      closeTime: index * 10 + 9
    }));
    await new WorkerThreadBacktestComputation().compute({ ...input, candles: manyCandles });
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(0);
  });
});
