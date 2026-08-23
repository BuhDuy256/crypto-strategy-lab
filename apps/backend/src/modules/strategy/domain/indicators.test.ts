// Worked examples for reusable, framework-free indicator calculations.

import { describe, expect, it } from "vitest";
import { simpleMovingAverage } from "./indicators.js";

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
