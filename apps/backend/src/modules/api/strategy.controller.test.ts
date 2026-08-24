import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { StrategyController } from "./strategy.controller.js";
import { StrategyRegistry } from "../strategy/application/strategy-registry.js";
import type { Strategy, StrategyResult, AnalysisContext } from "../strategy/domain/strategy.js";
import type { StrategyParameters } from "../strategy/domain/parameter-schema.js";

class FakeStrategy implements Strategy {
  descriptor = {
    id: "fake-strategy",
    version: "1.0.0",
    name: "Fake Strategy",
    description: "A throwaway strategy for testing catalog output",
    category: "trend" as const,
    capabilities: ["long"] as const,
    parameterSchema: { properties: {}, required: [] },
    requiredInputs: ["price-bars"] as const,
    implementation: { kind: "built-in" as const, key: "fake-strategy" }
  };

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    return { signal: { action: "hold", effectiveTime: 0 }, annotations: [] };
  }
}

describe("StrategyController", () => {
  it("returns registered strategies in the catalog without controller changes", async () => {
    // Injecting a registry with a fake strategy
    const registry = new StrategyRegistry([new FakeStrategy()]);
    
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StrategyController],
      providers: [{ provide: StrategyRegistry, useValue: registry }]
    }).compile();

    const controller = module.get<StrategyController>(StrategyController);
    
    const response = controller.getStrategies();
    
    expect(response.strategies).toHaveLength(1);
    expect(response.strategies[0]!.id).toBe("fake-strategy");
    expect(response.strategies[0]!.name).toBe("Fake Strategy");
  });
});
