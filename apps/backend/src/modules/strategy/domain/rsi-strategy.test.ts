import { describe, expect, it } from "vitest";
import { RsiStrategy } from "./rsi-strategy.js";
import type { AnalysisContext, AnalysisInput } from "./strategy.js";

function context(prices: number[]): AnalysisContext {
  return {
    evaluationTime: 1000,
    inputs: [
      {
        kind: "price-bars",
        bars: prices.map((price) => ({
          openTime: 0,
          closeTime: 1000,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 1
        }))
      }
    ]
  };
}

describe("RsiStrategy", () => {
  const strategy = new RsiStrategy();
  const parameters = { period: 3, buyThreshold: 30, sellThreshold: 70, priceSource: "close" };

  it("returns hold during warm-up", () => {
    const result = strategy.evaluate(context([10, 12, 9]), parameters);
    expect(result.signal.action).toBe("hold");
    expect(result.signal.reason).toContain("warming up");
  });

  it("returns buy when oversold", () => {
    // Generate a long downtrend to drop RSI below 30
    const result = strategy.evaluate(context([100, 90, 80, 70, 60]), parameters);
    expect(result.signal.action).toBe("buy");
  });

  it("returns sell when overbought", () => {
    // Generate a long uptrend to raise RSI above 70
    const result = strategy.evaluate(context([100, 110, 120, 130, 140]), parameters);
    expect(result.signal.action).toBe("sell");
  });
});
