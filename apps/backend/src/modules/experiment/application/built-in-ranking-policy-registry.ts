// Single factory used by every process to assemble the built-in ranking policies.

import { WeightedReturnDrawdownPolicy } from "../domain/weighted-return-drawdown-policy.js";
import { RankingPolicyRegistry } from "./ranking-policy-registry.js";

export function createBuiltInRankingPolicyRegistry(): RankingPolicyRegistry {
  return new RankingPolicyRegistry([new WeightedReturnDrawdownPolicy()]);
}
