// StrategyModule backs ARC-STRATEGY (Strategy).
//
// Owns strategy contracts and implementations, normalized signals,
// descriptors/semantic versions, parameter schemas, registry, composite
// definitions, combination policies, and StrategyGenerator
// implementations/contracts (see architecture-baseline.md). The startup registry
// is assembled here from built-in strategy implementations.
import { Module } from "@nestjs/common";
import { StrategyRegistry } from "./application/strategy-registry.js";
import { createBuiltInStrategyRegistry } from "./application/built-in-strategy-registry.js";

@Module({
  providers: [
    {
      provide: StrategyRegistry,
      useFactory: createBuiltInStrategyRegistry
    }
  ],
  exports: [StrategyRegistry]
})
export class StrategyModule {}
