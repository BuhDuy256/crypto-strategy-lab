import { MajorityVotePolicy, WeightedScorePolicy } from "../domain/combination-policy.js";
import { CombinationPolicyRegistry } from "./combination-policy-registry.js";

export function createBuiltInCombinationPolicyRegistry(): CombinationPolicyRegistry {
  return new CombinationPolicyRegistry([
    new MajorityVotePolicy(),
    new WeightedScorePolicy()
  ]);
}
