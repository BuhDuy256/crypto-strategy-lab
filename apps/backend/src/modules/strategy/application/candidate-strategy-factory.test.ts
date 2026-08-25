// Contract tests for the candidate strategy factory: stable canonical hashing,
// completeness validation, and immutability. Uses fixed in-memory inputs only.

import { describe, expect, it } from "vitest";
import { createCandidateStrategy } from "./candidate-strategy-factory.js";
import type { CreateCandidateInput } from "./candidate-strategy-factory.js";
import type { CandidateStrategy, CandidateCompositeStrategySpecification } from "../domain/candidate-strategy.js";

function singleInput(): CreateCandidateInput {
  return {
    specification: {
      kind: "single",
      id: "moving-average",
      version: "1.0.0",
      parameters: { fastPeriod: 10, slowPeriod: 20, priceSource: "close" }
    },
    generator: {
      id: "random-search",
      version: "1.0.0",
      configuration: { maxComponents: 3, allowed: ["moving-average", "rsi"] },
      seed: 42
    }
  };
}

function compositeInput(): CreateCandidateInput {
  const specification: CandidateCompositeStrategySpecification = {
    kind: "composite",
    composite: {
      id: "composite-a",
      version: "1.0.0",
      name: "Composite A",
      description: "Two component composite",
      components: [
        { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20, priceSource: "close" } },
        { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70 } }
      ],
      policy: { id: "weighted-score", version: "1.0.0", configuration: { weights: [0.4, 0.6], threshold: 0.3 } }
    }
  };
  return {
    specification,
    generator: { id: "random-search", version: "1.0.0", configuration: {}, seed: "seed-1" }
  };
}

describe("createCandidateStrategy", () => {
  it("hashes the same candidate twice to the same value", () => {
    const a = createCandidateStrategy(singleInput());
    const b = createCandidateStrategy(singleInput());
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes a candidate rebuilt from its own serialized form to the same value", () => {
    const original = createCandidateStrategy(compositeInput());
    const serialized = JSON.parse(JSON.stringify(original)) as CandidateStrategy;
    const rebuilt = createCandidateStrategy({
      specification: serialized.specification,
      generator: serialized.generator
    });
    expect(rebuilt.contentHash).toBe(original.contentHash);
  });

  it("ignores the key order of unordered fields", () => {
    const base = singleInput();
    // Same fields, different key insertion order in an unordered object.
    const reordered: CreateCandidateInput = {
      generator: {
        version: "1.0.0",
        seed: 42,
        id: "random-search",
        configuration: { allowed: ["moving-average", "rsi"], maxComponents: 3 }
      },
      specification: {
        version: "1.0.0",
        parameters: { slowPeriod: 20, priceSource: "close", fastPeriod: 10 },
        kind: "single",
        id: "moving-average"
      }
    };
    expect(createCandidateStrategy(reordered).contentHash).toBe(createCandidateStrategy(base).contentHash);
  });

  it("changes the hash when component order changes", () => {
    const forward = createCandidateStrategy(compositeInput());
    const swapped = compositeInput();
    const swappedComposite = swapped.specification as CandidateCompositeStrategySpecification;
    const reversedComponents = [...swappedComposite.composite.components].reverse();
    const swappedInput: CreateCandidateInput = {
      ...swapped,
      specification: {
        kind: "composite",
        composite: { ...swappedComposite.composite, components: reversedComponents }
      }
    };
    expect(createCandidateStrategy(swappedInput).contentHash).not.toBe(forward.contentHash);
  });

  it("changes the hash when a component parameter changes", () => {
    const baseline = createCandidateStrategy(compositeInput()).contentHash;
    const changed = compositeInput();
    const changedComposite = (changed.specification as CandidateCompositeStrategySpecification).composite;
    const withNewParameter = {
      ...changedComposite,
      components: [
        { ...changedComposite.components[0]!, parameters: { fastPeriod: 11, slowPeriod: 20, priceSource: "close" } },
        changedComposite.components[1]!
      ]
    };
    expect(
      createCandidateStrategy({ ...changed, specification: { kind: "composite", composite: withNewParameter } }).contentHash
    ).not.toBe(baseline);
  });

  it("changes the hash when a component version changes", () => {
    const baseline = createCandidateStrategy(compositeInput()).contentHash;
    const changed = compositeInput();
    const cv = changed.specification as CandidateCompositeStrategySpecification;
    const bumped = { ...cv.composite, version: "1.0.1" };
    expect(
      createCandidateStrategy({ ...changed, specification: { kind: "composite", composite: bumped } }).contentHash
    ).not.toBe(baseline);
  });

  it("changes the hash when the combination policy changes", () => {
    const baseline = createCandidateStrategy(compositeInput()).contentHash;
    const changed = compositeInput();
    const cp = changed.specification as CandidateCompositeStrategySpecification;
    const newPolicy = { ...cp.composite, policy: { ...cp.composite.policy, id: "majority-vote" } };
    expect(
      createCandidateStrategy({ ...changed, specification: { kind: "composite", composite: newPolicy } }).contentHash
    ).not.toBe(baseline);
  });

  it("changes the hash when the generator seed changes", () => {
    const baseline = createCandidateStrategy(compositeInput()).contentHash;
    const changed = compositeInput();
    expect(
      createCandidateStrategy({ ...changed, generator: { ...changed.generator, seed: "seed-2" } }).contentHash
    ).not.toBe(baseline);
  });

  it("records generator identifier, version, configuration, and seed", () => {
    const candidate = createCandidateStrategy(singleInput());
    expect(candidate.generator).toEqual({
      id: "random-search",
      version: "1.0.0",
      configuration: { maxComponents: 3, allowed: ["moving-average", "rsi"] },
      seed: 42
    });
  });

  it("freezes the candidate so it cannot be mutated", () => {
    const candidate = createCandidateStrategy(singleInput());
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.generator)).toBe(true);
    expect(Object.isFrozen(candidate.specification)).toBe(true);
    expect(() => {
      (candidate as { contentHash: string }).contentHash = "tampered";
    }).toThrow();
  });

  it("rejects a candidate whose version is a latest alias", () => {
    const latest = singleInput();
    expect(() =>
      createCandidateStrategy({ ...latest, specification: { ...latest.specification, version: "latest" } as CreateCandidateInput["specification"] })
    ).toThrow(/CANDIDATE_VERSION/);
  });

  it("rejects a candidate with a missing generator seed", () => {
    const missingSeed = singleInput();
    expect(() =>
      createCandidateStrategy({ ...missingSeed, generator: { ...missingSeed.generator, seed: "" } })
    ).toThrow(/CANDIDATE_GENERATOR/);
  });

  it("rejects a candidate with a missing strategy id", () => {
    const missingId = singleInput();
    expect(() =>
      createCandidateStrategy({ ...missingId, specification: { ...missingId.specification, id: "" } as CreateCandidateInput["specification"] })
    ).toThrow(/CANDIDATE_/);
  });
});
