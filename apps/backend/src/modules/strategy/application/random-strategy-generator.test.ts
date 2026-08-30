// Behaviour tests for the random search generator: validity, determinism,
// search-space compliance, and duplicate avoidance. Uses the built-in strategy
// and policy registries with fixed seeds only.

import { describe, expect, it } from "vitest";
import { RandomStrategyGenerator } from "./random-strategy-generator.js";
import { createBuiltInStrategyRegistry } from "./built-in-strategy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "./built-in-combination-policy-registry.js";
import type { StrategyRegistry } from "./strategy-registry.js";
import type { CandidateStrategy } from "../domain/candidate-strategy.js";
import type { StrategyParameters } from "../domain/parameter-schema.js";
import type { GenerateRequest, SearchSpace } from "../domain/strategy-generator.js";

const strategyRegistry = createBuiltInStrategyRegistry();
const policyRegistry = createBuiltInCombinationPolicyRegistry();

function makeGenerator(): RandomStrategyGenerator {
  return new RandomStrategyGenerator(strategyRegistry, policyRegistry);
}

const fullSpace: SearchSpace = {
  strategies: [
    { id: "moving-average", version: "1.0.0" },
    { id: "rsi", version: "1.0.0" },
    { id: "bollinger-bands", version: "1.0.0" },
    { id: "support-resistance", version: "1.0.0" }
  ],
  compositeSizes: [1, 2, 3],
  policies: [
    { id: "weighted-score", version: "1.0.0" },
    { id: "majority-vote", version: "1.0.0" }
  ]
};

function request(seed: number | string, overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return { searchSpace: fullSpace, seed, configuration: {}, ...overrides };
}

function take<T>(iterable: Iterable<T>, count: number): T[] {
  const out: T[] = [];
  for (const item of iterable) {
    out.push(item);
    if (out.length >= count) break;
  }
  return out;
}

function components(candidate: CandidateStrategy): readonly { id: string; version: string; parameters: StrategyParameters }[] {
  if (candidate.specification.kind === "single") {
    const { id, version, parameters } = candidate.specification;
    return [{ id, version, parameters }];
  }
  return candidate.specification.composite.components;
}

function validate(candidate: CandidateStrategy, registry: StrategyRegistry): void {
  for (const component of components(candidate)) {
    registry.resolve({ id: component.id, version: component.version }).validateParameters(component.parameters);
  }
}

describe("RandomStrategyGenerator", () => {
  it("produces candidates that all pass parameter validation", () => {
    const candidates = take(makeGenerator().generate(request(1)), 40);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(() => validate(candidate, strategyRegistry)).not.toThrow();
    }
  });

  it("produces the same candidate sequence for the same seed and search space", () => {
    const first = take(makeGenerator().generate(request(7)), 25).map((c) => c.contentHash);
    const second = take(makeGenerator().generate(request(7)), 25).map((c) => c.contentHash);
    expect(second).toEqual(first);
  });

  it("produces different sequences for different seeds", () => {
    const first = take(makeGenerator().generate(request(7)), 25).map((c) => c.contentHash);
    const other = take(makeGenerator().generate(request(8)), 25).map((c) => c.contentHash);
    expect(other).not.toEqual(first);
  });

  it("honours the allowed strategies and composite sizes", () => {
    const allowedIds = new Set(fullSpace.strategies.map((s) => s.id));
    const candidates = take(makeGenerator().generate(request(3)), 60);
    for (const candidate of candidates) {
      const parts = components(candidate);
      expect(fullSpace.compositeSizes).toContain(parts.length);
      for (const part of parts) {
        expect(allowedIds.has(part.id)).toBe(true);
      }
    }
  });

  it("restricts generation to a single allowed strategy when the space is narrowed", () => {
    const narrow: SearchSpace = { strategies: [{ id: "rsi", version: "1.0.0" }], compositeSizes: [1], policies: [] };
    const candidates = take(makeGenerator().generate(request(3, { searchSpace: narrow })), 20);
    for (const candidate of candidates) {
      expect(candidate.specification.kind).toBe("single");
      for (const part of components(candidate)) {
        expect(part.id).toBe("rsi");
      }
    }
  });

  it("honours a parameter range override from the search space", () => {
    const narrow: SearchSpace = {
      strategies: [{ id: "rsi", version: "1.0.0" }],
      compositeSizes: [1],
      policies: [],
      parameterRanges: { rsi: { period: { minimum: 5, maximum: 9 } } }
    };
    const candidates = take(makeGenerator().generate(request(11, { searchSpace: narrow })), 30);
    for (const candidate of candidates) {
      const period = components(candidate)[0]!.parameters.period as number;
      expect(period).toBeGreaterThanOrEqual(5);
      expect(period).toBeLessThanOrEqual(9);
    }
  });

  it("rejects a parameter range that widens below the strategy minimum", () => {
    const bad: SearchSpace = {
      strategies: [{ id: "rsi", version: "1.0.0" }],
      compositeSizes: [1],
      policies: [],
      parameterRanges: { rsi: { period: { minimum: 1, maximum: 9 } } } // rsi.period schema minimum is 2
    };
    expect(() => take(makeGenerator().generate(request(1, { searchSpace: bad })), 1)).toThrow(/GENERATOR_PARAMETER_RANGE/);
  });

  it("rejects a parameter range that widens above the strategy maximum", () => {
    const bad: SearchSpace = {
      strategies: [{ id: "rsi", version: "1.0.0" }],
      compositeSizes: [1],
      policies: [],
      parameterRanges: { rsi: { buyThreshold: { minimum: 0, maximum: 150 } } } // rsi.buyThreshold schema maximum is 100
    };
    expect(() => take(makeGenerator().generate(request(1, { searchSpace: bad })), 1)).toThrow(/GENERATOR_PARAMETER_RANGE/);
  });

  it("rejects a parameter range on an unknown parameter", () => {
    const bad: SearchSpace = {
      strategies: [{ id: "rsi", version: "1.0.0" }],
      compositeSizes: [1],
      policies: [],
      parameterRanges: { rsi: { nope: { minimum: 1, maximum: 2 } } }
    };
    expect(() => take(makeGenerator().generate(request(1, { searchSpace: bad })), 1)).toThrow(/GENERATOR_PARAMETER_RANGE/);
  });

  it("emits no duplicate candidates in a sequence", () => {
    const hashes = take(makeGenerator().generate(request(2)), 50).map((c) => c.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("ends the sequence when the space is too small to yield new unique candidates", () => {
    // One strategy, size 1, all numeric params fixed to their defaults, and only
    // the enum priceSource varies (4 values), so at most 4 unique candidates exist.
    const tiny: SearchSpace = { strategies: [{ id: "moving-average", version: "1.0.0" }], compositeSizes: [1], policies: [] };
    const candidates = take(makeGenerator().generate(request(5, { searchSpace: tiny })), 1000);
    expect(candidates.length).toBeLessThanOrEqual(4);
    expect(new Set(candidates.map((c) => c.contentHash)).size).toBe(candidates.length);
  });

  it("rejects a composite size larger than the number of strategies", () => {
    const bad: SearchSpace = { strategies: [{ id: "rsi", version: "1.0.0" }], compositeSizes: [2], policies: [{ id: "majority-vote", version: "1.0.0" }] };
    expect(() => take(makeGenerator().generate(request(1, { searchSpace: bad })), 1)).toThrow(/GENERATOR_SEARCH_SPACE/);
  });
});
