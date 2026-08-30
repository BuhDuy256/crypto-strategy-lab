import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { CompositeStrategyService } from "./composite-strategy.service.js";
import { PostgresCompositeRepository } from "../infrastructure/postgres-composite-repository.js";
import { createBuiltInStrategyRegistry } from "./built-in-strategy-registry.js";
import { createBuiltInCombinationPolicyRegistry } from "./built-in-combination-policy-registry.js";
import { resetTestDatabase } from "../../../platform/test-database.js";
import type { Pool } from "pg";

describe("CompositeStrategyService", () => {
  let pool: Pool;
  let service: CompositeStrategyService;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    const repo = new PostgresCompositeRepository(pool);
    const stratReg = createBuiltInStrategyRegistry();
    const polReg = createBuiltInCombinationPolicyRegistry();
    service = new CompositeStrategyService(repo, stratReg, polReg);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("saves a valid composite", async () => {
    const def = await service.save("Valid", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20, priceSource: "close" } },
      { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } }
    ], {
      id: "majority-vote", version: "1.0.0", configuration: {}
    });
    
    expect(def.id).toMatch(/^composite-/);
    const loaded = await service.load(def.id);
    expect(loaded.name).toBe("Valid");
    const result = await service.evaluate(def.id, {
      evaluationTime: 4,
      inputs: [{
        kind: "price-bars",
        bars: [1, 2, 3, 4].map((close, index) => ({
          openTime: index,
          closeTime: index + 1,
          open: close,
          high: close,
          low: close,
          close,
          volume: 1
        }))
      }]
    });
    expect(result.signal.action).toMatch(/buy|sell|hold/);
    expect(result.annotations.some((annotation) => annotation.componentId === "moving-average")).toBe(true);
    expect(result.annotations.some((annotation) => annotation.componentId === "rsi")).toBe(true);
  });

  it("rejects an invalid composite component", async () => {
    await expect(service.save("Invalid", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: -1, slowPeriod: 20, priceSource: "close" } },
      { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } }
    ], { id: "majority-vote", version: "1.0.0", configuration: {} }))
      .rejects.toThrow(/COMPONENT_INVALID: component moving-average failed validation - STRATEGY_PARAMETER_MINIMUM/);
  });

  it("rejects an unknown policy", async () => {
    await expect(service.save("Invalid Policy", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20, priceSource: "close" } },
      { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } }
    ], { id: "unknown-policy", version: "1.0.0", configuration: {} }))
      .rejects.toThrow(/POLICY_NOT_FOUND: unknown-policy@1.0.0/);
  });

  it("rejects component parameters that only fail at strategy execution", async () => {
    await expect(service.save("Invalid relation", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 20, slowPeriod: 10, priceSource: "close" } },
      { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } }
    ], { id: "majority-vote", version: "1.0.0", configuration: {} }))
      .rejects.toThrow(/COMPONENT_INVALID: component moving-average failed validation - STRATEGY_PARAMETER_RELATION/);
  });

  it("rejects a weighted composite that cannot be evaluated", async () => {
    await expect(service.save("Invalid weights", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20, priceSource: "close" } },
      { id: "rsi", version: "1.0.0", parameters: { period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "close" } }
    ], {
      id: "weighted-score",
      version: "1.0.0",
      configuration: { weights: { "comp-0": 1 }, threshold: 0.3 }
    }))
      .rejects.toThrow(/WEIGHTED_POLICY_CONFIG/);
  });
});
