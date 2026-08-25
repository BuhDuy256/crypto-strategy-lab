// Single factory used by every process to assemble the built-in generators.

import { RandomStrategyGenerator } from "./random-strategy-generator.js";
import { StrategyGeneratorRegistry } from "./strategy-generator-registry.js";
import type { StrategyRegistry } from "./strategy-registry.js";
import type { CombinationPolicyRegistry } from "./combination-policy-registry.js";

export function createBuiltInStrategyGeneratorRegistry(
  strategies: StrategyRegistry,
  policies: CombinationPolicyRegistry
): StrategyGeneratorRegistry {
  return new StrategyGeneratorRegistry([new RandomStrategyGenerator(strategies, policies)]);
}
