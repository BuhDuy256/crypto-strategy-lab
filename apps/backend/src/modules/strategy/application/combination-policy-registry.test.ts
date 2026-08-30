import { describe, expect, it } from "vitest";
import { CombinationPolicyRegistry } from "./combination-policy-registry.js";
import type { CombinationPolicy } from "../domain/combination-policy.js";

class ThrowawayPolicy implements CombinationPolicy {
  descriptor = { id: "throwaway", version: "1.0.0" };
  combine() {
    return { signal: { action: "hold" as const, effectiveTime: 0 }, annotations: [] };
  }
}

describe("CombinationPolicyRegistry", () => {
  it("registers and resolves policies", () => {
    const registry = new CombinationPolicyRegistry();
    const policy = new ThrowawayPolicy();
    
    registry.register(policy);
    
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]!.id).toBe("throwaway");
    
    const resolved = registry.resolve({ id: "throwaway", version: "1.0.0" });
    expect(resolved).toBe(policy);
  });

  it("throws when policy is not found", () => {
    const registry = new CombinationPolicyRegistry();
    expect(() => registry.resolve({ id: "unknown", version: "1.0.0" })).toThrow("POLICY_NOT_FOUND: unknown@1.0.0");
  });

  it("throws when policy is already registered", () => {
    const registry = new CombinationPolicyRegistry([new ThrowawayPolicy()]);
    expect(() => registry.register(new ThrowawayPolicy())).toThrow("POLICY_ALREADY_REGISTERED: throwaway@1.0.0");
  });
});
