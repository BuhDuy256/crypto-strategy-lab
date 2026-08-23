// Single factory used by every process and worker to assemble built-in strategies.

import { MAStrategy } from "../domain/ma-strategy.js";
import { StrategyRegistry } from "./strategy-registry.js";

export function createBuiltInStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry([new MAStrategy()]);
}
