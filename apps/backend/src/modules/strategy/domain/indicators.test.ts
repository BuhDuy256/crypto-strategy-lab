import { describe, expect, it } from "vitest";
import { simpleMovingAverage, bollingerBands, relativeStrengthIndex } from "./indicators.js";

describe("simpleMovingAverage", () => {
  it("matches hand-computed complete windows", () => {
    expect(simpleMovingAverage([2, 4, 6, 8], 2)).toEqual([3, 5, 7]);
    expect(simpleMovingAverage([2, 4, 6, 8], 3)).toEqual([4, 6]);
  });

  it("returns no partial value before the period is satisfied", () => {
    expect(simpleMovingAverage([2, 4], 3)).toEqual([]);
  });

  it.each([0, 1.5, -2])("rejects invalid period %s", (period) => {
    expect(() => simpleMovingAverage([1, 2], period)).toThrow("SMA_PERIOD");
  });
});

describe("bollingerBands", () => {
  it("computes bollinger bands correctly", () => {
    const { middle, upper, lower } = bollingerBands([2, 4, 6, 8], 2, 2);
    expect(middle).toEqual([3, 5, 7]);
    // stddev of [2,4] = 1, upper = 3 + 2 = 5, lower = 3 - 2 = 1
    // stddev of [4,6] = 1, upper = 5 + 2 = 7, lower = 5 - 2 = 3
    // stddev of [6,8] = 1, upper = 7 + 2 = 9, lower = 7 - 2 = 5
    expect(upper).toEqual([5, 7, 9]);
    expect(lower).toEqual([1, 3, 5]);
  });
});

describe("relativeStrengthIndex", () => {
  it("computes RSI correctly", () => {
    // Values: 10, 12, 9, 15, 14
    // period: 3
    // Gains: 10->12: 2. 12->9: 0. 9->15: 6.
    // Losses: 10->12: 0. 12->9: 3. 9->15: 0.
    // Init avgGain (i=1..3): (2 + 0 + 6) / 3 = 2.66
    // Init avgLoss: (0 + 3 + 0) / 3 = 1
    // RS = 2.66, RSI = 100 - (100 / 3.66) = 72.72
    const values = [10, 12, 9, 15, 14];
    const rsi = relativeStrengthIndex(values, 3);
    expect(rsi[0]).toBeCloseTo(72.727, 2);
    // next change: 15->14 = -1
    // avgGain = (2.66 * 2 + 0) / 3 = 1.777
    // avgLoss = (1 * 2 + 1) / 3 = 1
    // RS = 1.777, RSI = 64
    expect(rsi[1]).toBeCloseTo(64.0, 2);
  });
});
