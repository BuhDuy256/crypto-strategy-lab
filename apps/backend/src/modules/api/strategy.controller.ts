import { Controller, Get, Inject } from "@nestjs/common";
import { StrategyRegistry } from "../strategy/application/strategy-registry.js";
import type { StrategyCatalogResponse } from "@crypto-strategy-lab/api-contracts";

@Controller("strategies")
export class StrategyController {
  constructor(@Inject(StrategyRegistry) private readonly strategyRegistry: StrategyRegistry) {}

  @Get()
  getStrategies(): StrategyCatalogResponse {
    const descriptors = this.strategyRegistry.list();
    return {
      strategies: descriptors.map(desc => ({
        id: desc.id,
        version: desc.version,
        name: desc.name,
        description: desc.description,
        category: desc.category,
        capabilities: desc.capabilities,
        parameterSchema: desc.parameterSchema as any,
        requiredInputs: desc.requiredInputs
      }))
    };
  }
}
