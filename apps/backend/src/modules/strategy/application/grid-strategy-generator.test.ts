// PROOF-REPLACE-001 evidence at the generator seam: a second search method
// (grid-search) implemented purely through the StrategyGenerator port produces
// valid, deterministic candidates and appears in the shared catalog, with no
// change to the candidate type or any downstream consumer.

import { describe, expect, it } from "vitest";
import {
  createBuiltInStrategyRegistry,
  createBuiltInStrategyGeneratorRegistry,
  CombinationPolicyRegistry,
  GridStrategyGenerator
} from "../../strategy/index.js";
import type { GenerateRequest, SearchSpace } from "../domain/strategy-generator.js";

const strategies = createBuiltInStrategyRegistry();
const generator = new GridStrategyGenerator(strategies);

const searchSpace: SearchSpace = {
  strategies: [{ id: "rsi", version: "1.0.0" }],
  compositeSizes: [1],
  policies: []
};

function request(configuration: Record<string, unknown> = {}): GenerateRequest {
  return { searchSpace, seed: "unused-by-grid", configuration };
}

describe("GridStrategyGenerator", () => {
  it("is registered in the shared catalog next to random-search", () => {
    const registry = createBuiltInStrategyGeneratorRegistry(strategies, new CombinationPolicyRegistry());
    const ids = registry.list().map((descriptor) => descriptor.id);
    expect(ids).toEqual(expect.arrayContaining(["random-search", "grid-search"]));
  });

  it("produces only valid single-strategy candidates", () => {
    const candidates = [...generator.generate(request())];
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      const spec = candidate.specification;
      expect(spec.kind).toBe("single");
      if (spec.kind === "single") {
        expect(() =>
          strategies.resolve({ id: spec.id, version: spec.version }).validateParameters(spec.parameters)
        ).not.toThrow();
      }
    }
  });

  it("yields the same sequence every run (deterministic, no seed dependence)", () => {
    // Same request (same configuration) must reproduce the same candidate order.
    const first = [...generator.generate(request({ pointsPerParameter: 3 }))].map((c) => c.contentHash);
    const second = [...generator.generate(request({ pointsPerParameter: 3 }))].map((c) => c.contentHash);
    expect(first).toEqual(second);
  });

  it("emits no duplicate candidate content", () => {
    const hashes = [...generator.generate(request())].map((c) => c.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("samples more finely as pointsPerParameter grows", () => {
    const coarse = [...generator.generate(request({ pointsPerParameter: 2 }))].length;
    const fine = [...generator.generate(request({ pointsPerParameter: 4 }))].length;
    expect(fine).toBeGreaterThan(coarse);
  });

  it("rejects an invalid grid configuration", () => {
    expect(() => [...generator.generate(request({ pointsPerParameter: 1 }))]).toThrow(
      "GENERATOR_CONFIGURATION"
    );
  });
});
