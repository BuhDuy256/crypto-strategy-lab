import type { CombinationPolicy, CombinationPolicyDescriptor } from "../domain/combination-policy.js";

export interface PolicyRef {
  readonly id: string;
  readonly version: string;
}

function keyOf(ref: PolicyRef): string {
  return `${ref.id}@${ref.version}`;
}

export class CombinationPolicyRegistry {
  private readonly policies = new Map<string, CombinationPolicy>();

  constructor(policies: readonly CombinationPolicy[] = []) {
    for (const policy of policies) {
      this.register(policy);
    }
  }

  register(policy: CombinationPolicy): void {
    const key = keyOf(policy.descriptor);
    if (this.policies.has(key)) {
      throw new Error(`POLICY_ALREADY_REGISTERED: ${key}`);
    }
    this.policies.set(key, policy);
  }

  list(): readonly CombinationPolicyDescriptor[] {
    return [...this.policies.values()].map((policy) => policy.descriptor);
  }

  resolve(ref: PolicyRef): CombinationPolicy {
    const policy = this.policies.get(keyOf(ref));
    if (policy === undefined) {
      throw new Error(`POLICY_NOT_FOUND: ${keyOf(ref)}`);
    }
    return policy;
  }
}
