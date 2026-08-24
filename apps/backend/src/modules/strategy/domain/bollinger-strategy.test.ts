import { describe, expect, it } from "vitest";
import { BollingerBandsStrategy } from "./bollinger-strategy.js";
import type { AnalysisContext } from "./strategy.js";

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

describe("BollingerBandsStrategy", () => {
  const strategy = new BollingerBandsStrategy();
  const parameters = { period: 4, deviation: 1, priceSource: "close" }; // 1 std dev

  it("returns hold during warm-up", () => {
    const result = strategy.evaluate(context([10, 12, 10]), parameters);
    expect(result.signal.action).toBe("hold");
    expect(result.signal.reason).toContain("warming up");
  });

  it("returns buy when price drops below lower band", () => {
    // 10, 11, 9, 10. Mean 10. StdDev = sqrt(2/4) = 0.707
    // Lower band = 10 - 0.707 = 9.293.
    // Wait, the next value evaluates on the LAST window.
    // So [10, 11, 9, 10, 10, 10, 10, 10, 10, 5].
    // If [10, 10, 10, 5], mean 8.75. StdDev 2.16. Lower 8.75 - 2.16 = 6.5. 5 is below 6.5!
    const result = strategy.evaluate(context([10, 10, 10, 5]), parameters);
    expect(result.signal.action).toBe("buy");
  });

  it("returns sell when price breaks above upper band", () => {
    // [10, 10, 10, 15], mean 11.25. StdDev 2.16. Upper 11.25 + 2.16 = 13.41. 15 is above 13.41!
    const result = strategy.evaluate(context([10, 10, 10, 15]), parameters);
    expect(result.signal.action).toBe("sell");
  });
});
