// Contract proof for additive strategy registration, guarded execution, and generic annotations.

import { describe, expect, it } from "vitest";
import type { Annotation } from "../domain/annotation.js";
import type {
  AnalysisContext,
  Strategy,
  StrategyDescriptor,
  StrategyResult
} from "../domain/strategy.js";
import { StrategyRegistry } from "./strategy-registry.js";

const descriptor: StrategyDescriptor = {
  id: "throwaway-trend",
  version: "1.0.0",
  name: "Throwaway trend",
  description: "Contract-test strategy",
  category: "trend",
  capabilities: ["long", "annotations"],
  requiredInputs: ["price-bars"],
  parameterSchema: {
    properties: {
      period: { type: "integer", label: "Period", minimum: 2, maximum: 200 },
      source: { type: "enum", label: "Source", values: ["open", "close"] },
      enabled: { type: "boolean", label: "Enabled" }
    },
    required: ["period", "source"]
  },
  implementation: { kind: "built-in", key: "throwaway-trend" }
};

function context(): AnalysisContext {
  return {
    evaluationTime: 10,
    inputs: [
      { kind: "price-bars", bars: [] },
      { kind: "sentiment-series", points: [{ time: 10, score: 0.9 }] }
    ]
  };
}

class ThrowawayStrategy implements Strategy {
  readonly descriptor = descriptor;
  receivedContext: AnalysisContext | undefined;

  evaluate(received: AnalysisContext): StrategyResult {
    this.receivedContext = received;
    return {
      signal: { action: "buy", effectiveTime: received.evaluationTime, confidence: 0.8 },
      annotations: [
        { type: "marker", id: "entry", label: "Entry", time: received.evaluationTime, direction: "up" }
      ]
    };
  }
}

describe("StrategyRegistry", () => {
  it("registers and runs a throwaway strategy without changing registry code", () => {
    const strategy = new ThrowawayStrategy();
    const registry = new StrategyRegistry();
    registry.register(strategy);

    const result = registry.resolve({ id: descriptor.id, version: descriptor.version }).run(context(), {
      period: 20,
      source: "close"
    });

    expect(result.signal.action).toBe("buy");
    expect(registry.list()).toEqual([descriptor]);
    expect(strategy.receivedContext?.inputs.map((input) => input.kind)).toEqual(["price-bars"]);
  });

  it("rejects an unknown strategy identifier or version clearly", () => {
    const registry = new StrategyRegistry([new ThrowawayStrategy()]);
    expect(() => registry.resolve({ id: "missing", version: "1.0.0" })).toThrow(
      "STRATEGY_NOT_FOUND: missing@1.0.0"
    );
    expect(() => registry.resolve({ id: descriptor.id, version: "2.0.0" })).toThrow(
      "STRATEGY_NOT_FOUND: throwaway-trend@2.0.0"
    );
  });

  it.each([
    [{ source: "close" }, "period"],
    [{ period: 1, source: "close" }, "period"],
    [{ period: 20.5, source: "close" }, "period"],
    [{ period: 20, source: "median" }, "source"],
    [{ period: 20, source: "close", surprise: true }, "surprise"]
  ])("rejects invalid parameters and names the field", (parameters, field) => {
    const runnable = new StrategyRegistry([new ThrowawayStrategy()]).resolve({
      id: descriptor.id,
      version: descriptor.version
    });
    expect(() => runnable.run(context(), parameters)).toThrow(field);
  });

  it("rejects a missing declared analysis input", () => {
    const runnable = new StrategyRegistry([new ThrowawayStrategy()]).resolve({
      id: descriptor.id,
      version: descriptor.version
    });
    expect(() =>
      runnable.run({ evaluationTime: 10, inputs: [] }, { period: 20, source: "close" })
    ).toThrow("STRATEGY_INPUT_REQUIRED: missing input price-bars");
  });

  it("defines all five closed generic annotation primitives", () => {
    const annotations: readonly Annotation[] = [
      { type: "line", id: "l", label: "Line", points: [{ time: 1, value: 2 }] },
      {
        type: "band",
        id: "b",
        label: "Band",
        upper: [{ time: 1, value: 3 }],
        lower: [{ time: 1, value: 1 }]
      },
      { type: "zone", id: "z", label: "Zone", startTime: 1, endTime: 2, lower: 1, upper: 3 },
      { type: "level", id: "v", label: "Level", value: 2 },
      { type: "marker", id: "m", label: "Marker", time: 1, direction: "neutral" }
    ];
    expect(annotations.map((annotation) => annotation.type)).toEqual([
      "line",
      "band",
      "zone",
      "level",
      "marker"
    ]);
  });
});
