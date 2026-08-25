// Hand-checked score, the minimum-trades gate, explicit metric directions, and
// the total deterministic tie-break for the weighted return/drawdown policy.

import { describe, expect, it } from "vitest";
import { WeightedReturnDrawdownPolicy } from "./weighted-return-drawdown-policy.js";
import type { RankingInput } from "./ranking-policy.js";

const CONFIG = { weights: { totalReturn: 1.0, maximumDrawdown: -1.0 }, minTrades: 5 };

function input(
  metrics: { totalReturn: number; maximumDrawdown: number; winRate: number; numberOfTrades: number },
  contentHash = "hash-a"
): RankingInput {
  return { metrics, contentHash };
}

describe("WeightedReturnDrawdownPolicy", () => {
  const policy = new WeightedReturnDrawdownPolicy();

  it("computes a hand-checkable weighted score", () => {
    const ranked = policy.rank(
      input({ totalReturn: 0.2, maximumDrawdown: 0.08, winRate: 0.6, numberOfTrades: 10 }),
      CONFIG
    );
    // 1.0 * 0.2 + (-1.0) * 0.08 = 0.12
    expect(ranked.score).toBeCloseTo(0.12, 10);
    expect(ranked.eligible).toBe(true);
  });

  it("gates out a candidate below the minimum trades", () => {
    const ranked = policy.rank(
      input({ totalReturn: 0.5, maximumDrawdown: 0.01, winRate: 0.9, numberOfTrades: 4 }),
      CONFIG
    );
    expect(ranked.eligible).toBe(false);
    expect(ranked.score).toBe(Number.NEGATIVE_INFINITY);
  });

  it("does not use win rate in the score", () => {
    const high = policy.rank(input({ totalReturn: 0.2, maximumDrawdown: 0.08, winRate: 0.9, numberOfTrades: 10 }), CONFIG);
    const low = policy.rank(input({ totalReturn: 0.2, maximumDrawdown: 0.08, winRate: 0.1, numberOfTrades: 10 }), CONFIG);
    expect(high.score).toBe(low.score);
  });

  it("records its identifier, version, and configuration on the ranked result", () => {
    const ranked = policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 6 }), CONFIG);
    expect(ranked.policy).toEqual({ id: "weighted-return-drawdown", version: "1.0.0", configuration: CONFIG });
  });

  it("declares each metric direction explicitly", () => {
    expect(policy.metricDirections.totalReturn).toBe("higher-is-better");
    expect(policy.metricDirections.maximumDrawdown).toBe("lower-is-better");
    expect(policy.metricDirections.winRate).toBe("higher-is-better");
    expect(policy.metricDirections.numberOfTrades).toBe("higher-is-better");
  });

  it("orders a higher score ahead of a lower score", () => {
    const better = policy.rank(input({ totalReturn: 0.2, maximumDrawdown: 0.08, winRate: 0.5, numberOfTrades: 10 }, "h1"), CONFIG);
    const worse = policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.05, winRate: 0.5, numberOfTrades: 10 }, "h2"), CONFIG);
    expect(policy.compare(better, worse)).toBeLessThan(0);
    expect(policy.compare(worse, better)).toBeGreaterThan(0);
  });

  it("breaks an equal score by lower maximum drawdown first", () => {
    // Both score 0.08, but A has the lower drawdown.
    const a = policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 }, "h1"), CONFIG);
    const b = policy.rank(input({ totalReturn: 0.12, maximumDrawdown: 0.04, winRate: 0.5, numberOfTrades: 10 }, "h2"), CONFIG);
    expect(a.score).toBeCloseTo(b.score, 10);
    expect(policy.compare(a, b)).toBeLessThan(0);
  });

  it("breaks a full metric tie by win rate before the content hash", () => {
    const a = policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.6, numberOfTrades: 10 }, "h1"), CONFIG);
    const b = policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 }, "h2"), CONFIG);
    expect(policy.compare(a, b)).toBeLessThan(0);
  });

  it("uses the content hash as a strict final tie-break for identical metrics", () => {
    const metrics = { totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 };
    const a = policy.rank(input(metrics, "aaa"), CONFIG);
    const b = policy.rank(input(metrics, "bbb"), CONFIG);
    expect(policy.compare(a, b)).toBeLessThan(0);
    expect(policy.compare(b, a)).toBeGreaterThan(0);
    expect(policy.compare(a, a)).toBe(0);
  });

  it("orders an eligible candidate ahead of a gated-out one", () => {
    const eligible = policy.rank(input({ totalReturn: -0.5, maximumDrawdown: 0.9, winRate: 0.1, numberOfTrades: 10 }, "h1"), CONFIG);
    const gated = policy.rank(input({ totalReturn: 5.0, maximumDrawdown: 0.0, winRate: 1.0, numberOfTrades: 2 }, "h2"), CONFIG);
    expect(policy.compare(eligible, gated)).toBeLessThan(0);
  });

  it("produces a strict total order when sorting", () => {
    const entries = [
      policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 }, "c"), CONFIG),
      policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 }, "a"), CONFIG),
      policy.rank(input({ totalReturn: 0.3, maximumDrawdown: 0.05, winRate: 0.5, numberOfTrades: 10 }, "b"), CONFIG)
    ];
    const sorted = [...entries].sort((x, y) => policy.compare(x, y)).map((entry) => entry.contentHash);
    // Highest score first ("b"), then the two equal entries by content hash asc.
    expect(sorted).toEqual(["b", "a", "c"]);
  });

  it("rejects configuration without valid weights", () => {
    expect(() => policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 }), { minTrades: 5 })).toThrow(/RANKING_POLICY_CONFIG/);
  });

  it("rejects a non-integer minimum trades", () => {
    expect(() =>
      policy.rank(input({ totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 }), {
        weights: { totalReturn: 1, maximumDrawdown: -1 },
        minTrades: 5.5
      })
    ).toThrow(/RANKING_POLICY_CONFIG/);
  });

  it("rejects a metric set missing a required metric", () => {
    expect(() =>
      policy.rank({ metrics: { totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5 }, contentHash: "h" }, CONFIG)
    ).toThrow(/RANKING_POLICY_METRIC/);
  });
});
