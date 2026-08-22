// StrategyModule backs ARC-STRATEGY (Strategy).
//
// Owns strategy contracts and implementations, normalized signals,
// descriptors/semantic versions, parameter schemas, registry, composite
// definitions, combination policies, and StrategyGenerator
// implementations/contracts (see architecture-baseline.md). Empty in
// this slice: composition boundary only, no business logic yet.
import { Module } from "@nestjs/common";

@Module({})
export class StrategyModule {}
