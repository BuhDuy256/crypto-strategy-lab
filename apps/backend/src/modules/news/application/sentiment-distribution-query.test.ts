// Pure proportion math for the NEWS-07 sentiment distribution read, tested without a
// database so the rounding/zero-item rules are cheap to verify.

import { describe, expect, it } from "vitest";
import { computeSentimentProportions } from "./sentiment-distribution-query.js";

describe("computeSentimentProportions", () => {
  it("divides each label count by the total item count", () => {
    expect(computeSentimentProportions({ positive: 3, neutral: 1, negative: 0 })).toEqual({
      positive: 0.75,
      neutral: 0.25,
      negative: 0
    });
  });

  it("returns zero for every label when no item falls in the window, never NaN", () => {
    expect(computeSentimentProportions({ positive: 0, neutral: 0, negative: 0 })).toEqual({
      positive: 0,
      neutral: 0,
      negative: 0
    });
  });
});
