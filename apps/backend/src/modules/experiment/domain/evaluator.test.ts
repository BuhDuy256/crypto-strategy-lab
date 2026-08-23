// Hand-checked fixtures for the versioned MVP evaluation seam.

import { describe, expect, it } from "vitest";
import type { BacktestTrade } from "./backtester.js";
import { Evaluator, MVP_METRIC_SET, type MetricDefinition } from "./evaluator.js";

function trade(profitAndLoss: number): BacktestTrade {
  return {
    direction: "long",
    entryTime: 1,
    entryPrice: 100,
    exitTime: 2,
    exitPrice: 101,
    quantity: 1,
    entryFee: 0,
    exitFee: 0,
    slippage: 0,
    profitAndLoss,
    exitReason: "signal"
  };
}

describe("Evaluator", () => {
  it("matches a hand-checked closed-trade equity fixture", () => {
    const result = new Evaluator().evaluate({
      initialCapital: 100,
      trades: [trade(20), trade(-30), trade(15)]
    });

    expect(result).toEqual({
      metricSet: MVP_METRIC_SET,
      values: {
        totalReturn: 0.05,
        winRate: 2 / 3,
        maximumDrawdown: 0.25,
        numberOfTrades: 3
      }
    });
  });

  it("defines zero-trade metrics as zero", () => {
    expect(new Evaluator().evaluate({ initialCapital: 100, trades: [] }).values).toEqual({
      totalReturn: 0,
      winRate: 0,
      maximumDrawdown: 0,
      numberOfTrades: 0
    });
  });

  it.each([
    [[trade(10), trade(20)], { totalReturn: 0.3, winRate: 1, maximumDrawdown: 0, numberOfTrades: 2 }],
    [[trade(-10), trade(-20)], { totalReturn: -0.3, winRate: 0, maximumDrawdown: 0.3, numberOfTrades: 2 }],
    [[trade(10)], { totalReturn: 0.1, winRate: 1, maximumDrawdown: 0, numberOfTrades: 1 }]
  ])("handles winning, losing, and single-trade edge cases", (trades, expected) => {
    expect(new Evaluator().evaluate({ initialCapital: 100, trades }).values).toEqual(expected);
  });

  it("accepts an added metric without changing the evaluator caller", () => {
    const fifth: MetricDefinition = {
      id: "netProfit",
      calculate: ({ trades }) => trades.reduce((sum, item) => sum + item.profitAndLoss, 0)
    };
    const result = new Evaluator({
      identity: { id: "mvp-metrics-plus-net-profit", version: "1.0.0" },
      metrics: [...Evaluator.mvpDefinitions(), fifth]
    }).evaluate({
      initialCapital: 100,
      trades: [trade(5)]
    });
    expect(result.values.netProfit).toBe(5);
    expect(result.metricSet.id).toBe("mvp-metrics-plus-net-profit");
  });

  it("rejects non-finite trade and metric values", () => {
    expect(() => new Evaluator().evaluate({
      initialCapital: 100,
      trades: [trade(Number.NaN)]
    })).toThrow("EVALUATION_TRADE_PNL");
    expect(() => new Evaluator({
      identity: { id: "invalid", version: "1.0.0" },
      metrics: [{ id: "invalid", calculate: () => Number.POSITIVE_INFINITY }]
    }).evaluate({ initialCapital: 100, trades: [] })).toThrow("EVALUATION_METRIC_VALUE");
  });

  it("rejects empty and duplicate metric identifiers", () => {
    expect(() => new Evaluator({
      identity: { id: "invalid", version: "1.0.0" },
      metrics: [{ id: "", calculate: () => 0 }]
    })).toThrow("must not be empty");
    expect(() => new Evaluator({
      identity: { id: "invalid", version: "1.0.0" },
      metrics: [{ id: "same", calculate: () => 0 }, { id: "same", calculate: () => 1 }]
    })).toThrow("must be unique");
  });

  it("does not count a breakeven trade as a win", () => {
    expect(new Evaluator().evaluate({
      initialCapital: 100,
      trades: [trade(0)]
    }).values).toEqual({
      totalReturn: 0,
      winRate: 0,
      maximumDrawdown: 0,
      numberOfTrades: 1
    });
  });
});
