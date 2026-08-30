// Startup-assembled registry of ranking policies. A new policy or a new version
// of an existing policy is added by registering it here; no consumer changes.

import type { RankingPolicy, RankingPolicyDescriptor } from "../domain/ranking-policy.js";

export interface RankingPolicyRef {
  readonly id: string;
  readonly version: string;
}

function keyOf(ref: RankingPolicyRef): string {
  return `${ref.id}@${ref.version}`;
}

export class RankingPolicyRegistry {
  private readonly policies = new Map<string, RankingPolicy>();

  constructor(policies: readonly RankingPolicy[] = []) {
    for (const policy of policies) {
      this.register(policy);
    }
  }

  register(policy: RankingPolicy): void {
    const key = keyOf(policy.descriptor);
    if (this.policies.has(key)) {
      throw new Error(`RANKING_POLICY_ALREADY_REGISTERED: ${key}`);
    }
    this.policies.set(key, policy);
  }

  list(): readonly RankingPolicyDescriptor[] {
    return [...this.policies.values()].map((policy) => policy.descriptor);
  }

  resolve(ref: RankingPolicyRef): RankingPolicy {
    const policy = this.policies.get(keyOf(ref));
    if (policy === undefined) {
      throw new Error(`RANKING_POLICY_NOT_FOUND: ${keyOf(ref)}`);
    }
    return policy;
  }
}
