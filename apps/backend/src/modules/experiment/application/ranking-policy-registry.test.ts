// Registry tests: listing, resolution, duplicate rejection, coexisting policy
// versions (AC4), and a second policy implementation registered with no consumer
// change (AC5).

import { describe, expect, it } from "vitest";
import { RankingPolicyRegistry } from "./ranking-policy-registry.js";
import { createBuiltInRankingPolicyRegistry } from "./built-in-ranking-policy-registry.js";
import { WeightedReturnDrawdownPolicy } from "../domain/weighted-return-drawdown-policy.js";
import type { RankedResult, RankingInput, RankingPolicy, RankingPolicyDescriptor } from "../domain/ranking-policy.js";

// A throwaway policy used to prove coexistence and second-implementation support.
class StubPolicy implements RankingPolicy {
  readonly metricDirections = {};
  constructor(readonly descriptor: RankingPolicyDescriptor) {}

  rank(input: RankingInput, configuration: Record<string, unknown>): RankedResult {
    return {
      policy: { id: this.descriptor.id, version: this.descriptor.version, configuration },
      score: 0,
      eligible: true,
      metrics: input.metrics,
      contentHash: input.contentHash
    };
  }

  compare(a: RankedResult, b: RankedResult): number {
    return a.contentHash < b.contentHash ? -1 : a.contentHash > b.contentHash ? 1 : 0;
  }
}

const sampleInput: RankingInput = {
  metrics: { totalReturn: 0.1, maximumDrawdown: 0.02, winRate: 0.5, numberOfTrades: 10 },
  contentHash: "hash"
};

describe("RankingPolicyRegistry", () => {
  it("lists the built-in weighted policy", () => {
    const registry = createBuiltInRankingPolicyRegistry();
    expect(registry.list()).toContainEqual({ id: "weighted-return-drawdown", version: "1.0.0" });
  });

  it("resolves a registered policy by id and version", () => {
    const registry = createBuiltInRankingPolicyRegistry();
    expect(registry.resolve({ id: "weighted-return-drawdown", version: "1.0.0" })).toBeInstanceOf(WeightedReturnDrawdownPolicy);
  });

  it("rejects an unknown policy reference", () => {
    const registry = createBuiltInRankingPolicyRegistry();
    expect(() => registry.resolve({ id: "missing", version: "1.0.0" })).toThrow(/RANKING_POLICY_NOT_FOUND/);
  });

  it("rejects a duplicate registration", () => {
    expect(
      () => new RankingPolicyRegistry([new WeightedReturnDrawdownPolicy(), new WeightedReturnDrawdownPolicy()])
    ).toThrow(/RANKING_POLICY_ALREADY_REGISTERED/);
  });

  it("lets two versions of a policy coexist, each result keeping its own version", () => {
    const v1 = new WeightedReturnDrawdownPolicy();
    const v2 = new StubPolicy({ id: "weighted-return-drawdown", version: "2.0.0" });
    const registry = new RankingPolicyRegistry([v1, v2]);

    const config = { weights: { totalReturn: 1, maximumDrawdown: -1 }, minTrades: 5 };
    const rankedV1 = registry.resolve({ id: "weighted-return-drawdown", version: "1.0.0" }).rank(sampleInput, config);
    const rankedV2 = registry.resolve({ id: "weighted-return-drawdown", version: "2.0.0" }).rank(sampleInput, config);

    expect(rankedV1.policy.version).toBe("1.0.0");
    expect(rankedV2.policy.version).toBe("2.0.0");
  });

  it("accepts a second policy implementation with no consumer change", () => {
    const registry = new RankingPolicyRegistry([new WeightedReturnDrawdownPolicy(), new StubPolicy({ id: "custom-policy", version: "1.0.0" })]);
    const ids = registry.list().map((descriptor) => descriptor.id);
    expect(ids).toEqual(expect.arrayContaining(["weighted-return-drawdown", "custom-policy"]));

    const ranked = registry.resolve({ id: "custom-policy", version: "1.0.0" }).rank(sampleInput, {});
    expect(ranked.policy.id).toBe("custom-policy");
  });
});
