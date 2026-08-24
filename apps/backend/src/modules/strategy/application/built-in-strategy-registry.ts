// Single factory used by every process and worker to assemble built-in strategies.

import { MAStrategy } from "../domain/ma-strategy.js";
import { RsiStrategy } from "../domain/rsi-strategy.js";
import { BollingerBandsStrategy } from "../domain/bollinger-strategy.js";
import { SupportResistanceStrategy } from "../domain/support-resistance-strategy.js";
import { StrategyRegistry } from "./strategy-registry.js";

export function createBuiltInStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry([
    new MAStrategy(),
    new RsiStrategy(),
    new BollingerBandsStrategy(),
    new SupportResistanceStrategy()
  ]);
}
