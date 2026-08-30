import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { StrategyController } from "./strategy.controller.js";
import { StrategyRegistry, CompositeStrategyService } from "../strategy/index.js";
import { MARKET_DATA_QUERY } from "../market/index.js";
import type { Strategy, StrategyResult } from "../strategy/index.js";

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

  evaluate(): StrategyResult {
    return { signal: { action: "hold", effectiveTime: 0 }, annotations: [] };
  }
}

describe("StrategyController", () => {
  it("returns registered strategies in the catalog without controller changes", async () => {
    // Injecting a registry with a fake strategy
    const registry = new StrategyRegistry([new FakeStrategy()]);
    
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StrategyController],
      providers: [
        { provide: StrategyRegistry, useValue: registry },
        { provide: CompositeStrategyService, useValue: { save: vi.fn(), findById: vi.fn(), findAll: vi.fn() } },
        { provide: MARKET_DATA_QUERY, useValue: { getCandles: vi.fn() } }
      ]
    }).compile();

    const controller = module.get<StrategyController>(StrategyController);
    
    const response = controller.getStrategies();
    
    expect(response.strategies).toHaveLength(1);
    expect(response.strategies[0]!.id).toBe("fake-strategy");
    expect(response.strategies[0]!.name).toBe("Fake Strategy");
  });

  it("returns the Strategy-owned descriptor for a saved composite", async () => {
    const definition = {
      id: "composite-real",
      version: "1.0.0",
      name: "Real composite",
      description: "Saved definition",
      components: [],
      policy: { id: "majority-vote", version: "1.0.0", configuration: {} }
    };
    const descriptor = {
      id: definition.id,
      version: definition.version,
      name: definition.name,
      description: definition.description,
      category: "composite" as const,
      capabilities: ["long", "short", "annotations"] as const,
      parameterSchema: { properties: {}, required: [] },
      requiredInputs: ["price-bars"] as const,
      implementation: { kind: "built-in" as const, key: "composite" }
    };
    const module = await Test.createTestingModule({
      controllers: [StrategyController],
      providers: [
        { provide: StrategyRegistry, useValue: new StrategyRegistry([new FakeStrategy()]) },
        {
          provide: CompositeStrategyService,
          useValue: {
            list: vi.fn(async () => [definition]),
            resolve: vi.fn(async () => ({ descriptor }))
          }
        },
        { provide: MARKET_DATA_QUERY, useValue: { getCandles: vi.fn() } }
      ]
    }).compile();

    const response = await module.get(StrategyController).listComposites();

    expect(response[0]?.descriptor).toEqual({
      id: descriptor.id,
      version: descriptor.version,
      name: descriptor.name,
      description: descriptor.description,
      category: descriptor.category,
      capabilities: descriptor.capabilities,
      parameterSchema: descriptor.parameterSchema,
      requiredInputs: descriptor.requiredInputs
    });
  });

  it("keeps an unresolvable legacy composite from breaking the runnable catalog", async () => {
    const runnable = {
      id: "composite-runnable",
      version: "1.0.0",
      name: "Runnable composite",
      description: "Uses registered components",
      components: [],
      policy: { id: "majority-vote", version: "1.0.0", configuration: {} }
    };
    const legacy = { ...runnable, id: "composite-legacy", name: "Legacy composite" };
    const descriptor = new FakeStrategy().descriptor;
    const module = await Test.createTestingModule({
      controllers: [StrategyController],
      providers: [
        { provide: StrategyRegistry, useValue: new StrategyRegistry([new FakeStrategy()]) },
        {
          provide: CompositeStrategyService,
          useValue: {
            list: vi.fn(async () => [runnable, legacy]),
            resolve: vi.fn(async (id: string) => {
              if (id === legacy.id) throw new Error("STRATEGY_NOT_FOUND: ma@1.0.0");
              return { descriptor: { ...descriptor, id: runnable.id } };
            })
          }
        },
        { provide: MARKET_DATA_QUERY, useValue: { getCandles: vi.fn() } }
      ]
    }).compile();

    const response = await module.get(StrategyController).listComposites();

    expect(response.map((entry) => entry.id)).toEqual([runnable.id]);
  });
});
