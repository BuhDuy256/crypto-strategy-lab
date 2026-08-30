// Registry tests, including the throwaway-generator rehearsal for
// PROOF-REPLACE-001: a second generator is registered through the same port and
// appears in the catalog with no change to the port or the candidate type.

import { describe, expect, it } from "vitest";
import { StrategyGeneratorRegistry } from "./strategy-generator-registry.js";
import { RandomStrategyGenerator } from "./random-strategy-generator.js";
import { createBuiltInStrategyRegistry } from "./built-in-strategy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "./built-in-combination-policy-registry.js";
import type { CandidateStrategy } from "../domain/candidate-strategy.js";
import type { GenerateRequest, StrategyGenerator } from "../domain/strategy-generator.js";
import { createCandidateStrategy } from "./candidate-strategy-factory.js";

function randomGenerator(): RandomStrategyGenerator {
  return new RandomStrategyGenerator(createBuiltInStrategyRegistry(), createBuiltInCombinationPolicyRegistry());
}

// A throwaway second generator implemented purely against the port.
class FixedStrategyGenerator implements StrategyGenerator {
  readonly descriptor = {
    id: "fixed-single",
    version: "1.0.0",
    name: "Fixed single",
    description: "Always proposes one fixed candidate.",
    configurationSchema: { properties: {}, required: [] }
  };

  *generate(request: GenerateRequest): Generator<CandidateStrategy> {
    yield createCandidateStrategy({
      specification: { kind: "single", id: request.searchSpace.strategies[0]!.id, version: "1.0.0", parameters: {} },
      generator: { id: this.descriptor.id, version: this.descriptor.version, configuration: request.configuration, seed: request.seed }
    });
  }
}

describe("StrategyGeneratorRegistry", () => {
  it("lists the descriptor of every registered generator", () => {
    const registry = new StrategyGeneratorRegistry([randomGenerator()]);
    const ids = registry.list().map((descriptor) => descriptor.id);
    expect(ids).toContain("random-search");
  });

  it("exposes each generator's configuration schema in the catalog", () => {
    const registry = new StrategyGeneratorRegistry([randomGenerator()]);
    const descriptor = registry.list().find((d) => d.id === "random-search");
    expect(descriptor?.configurationSchema.properties.maxConsecutiveDuplicates).toBeDefined();
  });

  it("resolves a registered generator by id and version", () => {
    const registry = new StrategyGeneratorRegistry([randomGenerator()]);
    expect(registry.resolve({ id: "random-search", version: "1.0.0" }).descriptor.name).toBe("Random search");
  });

  it("rejects an unknown generator reference", () => {
    const registry = new StrategyGeneratorRegistry([randomGenerator()]);
    expect(() => registry.resolve({ id: "missing", version: "1.0.0" })).toThrow(/GENERATOR_NOT_FOUND/);
  });

  it("rejects a duplicate registration", () => {
    expect(() => new StrategyGeneratorRegistry([randomGenerator(), randomGenerator()])).toThrow(/GENERATOR_ALREADY_REGISTERED/);
  });

  it("accepts a throwaway second generator that appears in the catalog and is selectable", () => {
    const registry = new StrategyGeneratorRegistry([randomGenerator(), new FixedStrategyGenerator()]);
    const ids = registry.list().map((descriptor) => descriptor.id);
    expect(ids).toEqual(expect.arrayContaining(["random-search", "fixed-single"]));

    const selected = registry.resolve({ id: "fixed-single", version: "1.0.0" });
    const produced = [...selected.generate({ searchSpace: { strategies: [{ id: "rsi", version: "1.0.0" }], compositeSizes: [1], policies: [] }, seed: 1, configuration: {} })];
    expect(produced).toHaveLength(1);
    expect(produced[0]!.generator.id).toBe("fixed-single");
  });
});
