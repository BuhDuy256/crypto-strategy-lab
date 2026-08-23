// Behavior tests for the first built-in strategy through the public registry seam.

import { describe, expect, it } from "vitest";
import { StrategyRegistry } from "../application/strategy-registry.js";
import type { AnalysisContext, PriceBar } from "./strategy.js";
import { MAStrategy } from "./ma-strategy.js";

function bars(closes: readonly number[]): readonly PriceBar[] {
  return closes.map((close, index) => ({
    openTime: index * 100,
    closeTime: index * 100 + 99,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1
  }));
}

function context(closes: readonly number[]): AnalysisContext {
  const priceBars = bars(closes);
  return {
    evaluationTime: priceBars.at(-1)?.closeTime ?? 0,
    inputs: [{ kind: "price-bars", bars: priceBars }]
  };
}

function run(closes: readonly number[]) {
  const registry = new StrategyRegistry([new MAStrategy()]);
  return registry.resolve({ id: "moving-average", version: "1.0.0" }).run(context(closes), {
    fastPeriod: 2,
    slowPeriod: 3,
    priceSource: "close"
  });
}

describe("MAStrategy", () => {
  it("declares every period and price source in its descriptor", () => {
    const descriptor = new MAStrategy().descriptor;

    expect(descriptor.parameterSchema.properties).toMatchObject({
      fastPeriod: { type: "integer", default: 10 },
      slowPeriod: { type: "integer", default: 20 },
      priceSource: {
        type: "enum",
        values: ["open", "high", "low", "close"],
        default: "close"
      }
    });
  });

  it("buys when the fast average crosses upward at candle close", () => {
    expect(run([3, 2, 1, 4]).signal).toMatchObject({ action: "buy", effectiveTime: 399 });
  });

  it("sells when the fast average crosses downward at candle close", () => {
    expect(run([1, 2, 3, 0]).signal).toMatchObject({ action: "sell", effectiveTime: 399 });
  });

  it("holds when there is no new crossover", () => {
    expect(run([1, 2, 3, 4]).signal.action).toBe("hold");
  });

  it("holds until a previous and current slow average both exist", () => {
    expect(run([3, 2, 1]).signal.action).toBe("hold");
  });

  it("emits aligned fast and slow line annotations", () => {
    expect(run([3, 2, 1, 4]).annotations).toEqual([
      {
        type: "line",
        id: "fast-average",
        label: "Fast SMA (2)",
        points: [
          { time: 199, value: 2.5 },
          { time: 299, value: 1.5 },
          { time: 399, value: 2.5 }
        ]
      },
      {
        type: "line",
        id: "slow-average",
        label: "Slow SMA (3)",
        points: [
          { time: 299, value: 2 },
          { time: 399, value: 7 / 3 }
        ]
      }
    ]);
  });

  it("rejects a fast period that is not smaller than the slow period", () => {
    const runnable = new StrategyRegistry([new MAStrategy()]).resolve({
      id: "moving-average",
      version: "1.0.0"
    });
    expect(() =>
      runnable.run(context([1, 2, 3, 4]), {
        fastPeriod: 3,
        slowPeriod: 3,
        priceSource: "close"
      })
    ).toThrow("fastPeriod must be smaller than slowPeriod");
  });
});
