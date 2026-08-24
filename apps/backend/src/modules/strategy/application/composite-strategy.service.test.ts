import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { CompositeStrategyService } from "./composite-strategy.service.js";
import { StrategyRegistry } from "./strategy-registry.js";
import { CombinationPolicyRegistry } from "./combination-policy-registry.js";
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
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20 } }
    ], {
      id: "majority-vote", version: "1.0.0", configuration: {}
    });
    
    expect(def.id).toMatch(/^composite-/);
    const loaded = await service.load(def.id);
    expect(loaded.name).toBe("Valid");
  });

  it("rejects an invalid composite component", async () => {
    await expect(service.save("Invalid", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: -1, slowPeriod: 20 } } // -1 is invalid
    ], { id: "majority-vote", version: "1.0.0", configuration: {} }))
      .rejects.toThrow(/COMPONENT_INVALID: component moving-average failed validation - STRATEGY_PARAMETER_MINIMUM/);
  });

  it("rejects an unknown policy", async () => {
    await expect(service.save("Invalid Policy", "Desc", [
      { id: "moving-average", version: "1.0.0", parameters: { fastPeriod: 10, slowPeriod: 20 } }
    ], { id: "unknown-policy", version: "1.0.0", configuration: {} }))
      .rejects.toThrow(/POLICY_NOT_FOUND: unknown-policy@1.0.0/);
  });
});
