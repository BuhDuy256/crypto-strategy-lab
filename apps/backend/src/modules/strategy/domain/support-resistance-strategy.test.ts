import { describe, expect, it } from "vitest";
import { SupportResistanceStrategy } from "./support-resistance-strategy.js";
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

describe("SupportResistanceStrategy", () => {
  const strategy = new SupportResistanceStrategy();
  const parameters = { period: 4, proximity: 5 }; // 5%

  it("returns hold during warm-up", () => {
    const result = strategy.evaluate(context([10, 12, 11]), parameters);
    expect(result.signal.action).toBe("hold");
    expect(result.signal.reason).toContain("warming up");
  });

  it("returns buy when price drops near support", () => {
    // period 4. window: [100, 150, 140, 102]
    // min is 100, max is 150.
    // current close is 102.
    // 102 <= 100 * 1.05 (105). So buy!
    const result = strategy.evaluate(context([100, 150, 140, 102]), parameters);
    expect(result.signal.action).toBe("buy");
  });

  it("returns sell when price rises near resistance", () => {
    // period 4. window: [100, 150, 110, 148]
    // max is 150. current close is 148.
    // 148 >= 150 * 0.95 (142.5). So sell!
    const result = strategy.evaluate(context([100, 150, 110, 148]), parameters);
    expect(result.signal.action).toBe("sell");
  });
});
