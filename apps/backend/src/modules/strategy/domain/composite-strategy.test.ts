import { describe, expect, it } from "vitest";
import { MajorityVotePolicy, WeightedScorePolicy } from "./combination-policy.js";
import { CompositeStrategy, type CompositeStrategyDefinition } from "./composite-strategy.js";
import type { AnalysisContext, Strategy, StrategyResult } from "./strategy.js";
import type { StrategyParameters } from "./parameter-schema.js";
import type { Annotation } from "./annotation.js";

// Mock strategy for testing
class MockStrategy implements Strategy {
  descriptor = {
    id: "mock", version: "1.0", name: "Mock", description: "", category: "trend" as const,
    capabilities: [], parameterSchema: { properties: {}, required: [] }, requiredInputs: [],
    implementation: { kind: "built-in" as const, key: "mock" }
  };

  constructor(private action: "buy" | "sell" | "hold", private annotationId: string) {}

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    const ann: Annotation = { type: "level", id: this.annotationId, label: "", value: 1 };
    return {
      signal: { action: this.action, effectiveTime: context.evaluationTime },
      annotations: [ann]
    };
  }
}

describe("Combination Policies and CompositeStrategy", () => {
  const context: AnalysisContext = { evaluationTime: 1000, inputs: [] };

  it("Majority vote resolves official source examples", () => {
    const s1 = new MockStrategy("buy", "a1");
    const s2 = new MockStrategy("buy", "a2");
    const s3 = new MockStrategy("hold", "a3");

    const def: CompositeStrategyDefinition = {
      id: "comp1", version: "1.0", name: "", description: "",
      components: [
        { id: "s1", version: "1.0", parameters: {} },
        { id: "s2", version: "1.0", parameters: {} },
        { id: "s3", version: "1.0", parameters: {} }
      ],
      policy: { id: "majority-vote", version: "1.0", configuration: {} }
    };

    const composite = new CompositeStrategy(def, [s1, s2, s3], new MajorityVotePolicy());
    const result = composite.evaluate(context, {});

    expect(result.signal.action).toBe("buy");
    expect(result.annotations).toHaveLength(3);
    expect(result.annotations[0]!.componentId).toBe("s1");
    expect(result.annotations[0]!.id).toBe("a1");
  });

  it("Majority vote tie resolves to hold", () => {
    const s1 = new MockStrategy("buy", "a1");
    const s2 = new MockStrategy("sell", "a2");
    const s3 = new MockStrategy("hold", "a3");

    const def: CompositeStrategyDefinition = {
      id: "comp1", version: "1.0", name: "", description: "",
      components: [
        { id: "s1", version: "1.0", parameters: {} },
        { id: "s2", version: "1.0", parameters: {} },
        { id: "s3", version: "1.0", parameters: {} }
      ],
      policy: { id: "majority-vote", version: "1.0", configuration: {} }
    };

    const composite = new CompositeStrategy(def, [s1, s2, s3], new MajorityVotePolicy());
    const result = composite.evaluate(context, {});

    expect(result.signal.action).toBe("hold");
  });

  it("Weighted score reproduces official worked example", () => {
    // Official example: buy, sell, buy with weights 0.2, 0.3, 0.5. Threshold 0.3.
    // 0.2*(1) + 0.3*(-1) + 0.5*(1) = 0.4 > 0.3 => BUY
    const s1 = new MockStrategy("buy", "a1");
    const s2 = new MockStrategy("sell", "a2");
    const s3 = new MockStrategy("buy", "a3");

    const def: CompositeStrategyDefinition = {
      id: "comp1", version: "1.0", name: "", description: "",
      components: [
        { id: "s1", version: "1.0", parameters: {} },
        { id: "s2", version: "1.0", parameters: {} },
        { id: "s3", version: "1.0", parameters: {} }
      ],
      policy: { id: "weighted-score", version: "1.0", configuration: { weights: [0.2, 0.3, 0.5], threshold: 0.3 } }
    };

    const composite = new CompositeStrategy(def, [s1, s2, s3], new WeightedScorePolicy());
    const result = composite.evaluate(context, {});

    expect(result.signal.action).toBe("buy");
  });

  it("Throws if weights length mismatch", () => {
    const s1 = new MockStrategy("buy", "a1");

    const def: CompositeStrategyDefinition = {
      id: "comp1", version: "1.0", name: "", description: "",
      components: [
        { id: "s1", version: "1.0", parameters: {} },
      ],
      // 2 weights for 1 component
      policy: { id: "weighted-score", version: "1.0", configuration: { weights: [0.2, 0.3], threshold: 0.3 } }
    };

    const composite = new CompositeStrategy(def, [s1], new WeightedScorePolicy());
    expect(() => composite.evaluate(context, {})).toThrow("WEIGHTED_POLICY_CONFIG");
  });
});
