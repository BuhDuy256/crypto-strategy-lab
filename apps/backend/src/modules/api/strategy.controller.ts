import { Controller, Get, Post, Param, Body, Inject, HttpCode, BadRequestException, NotFoundException } from "@nestjs/common";
import { StrategyRegistry } from "../strategy/index.js";
import { CompositeStrategyService } from "../strategy/index.js";
import { CombinationPolicyRegistry } from "../strategy/index.js";
import type { 
  StrategyCatalogResponse, 
  CreateCompositeRequest, 
  CreateCompositeResponse,
  ApiCompositeStrategyDefinition,
  EvaluatePolicyRequest,
  EvaluatePolicyResponse
} from "@crypto-strategy-lab/api-contracts";
import type { ComponentResult } from "../strategy/index.js";

@Controller("strategies")
export class StrategyController {
  constructor(
    @Inject(StrategyRegistry) private readonly strategyRegistry: StrategyRegistry,
    @Inject(CompositeStrategyService) private readonly compositeService: CompositeStrategyService,
    @Inject(CombinationPolicyRegistry) private readonly policyRegistry: CombinationPolicyRegistry
  ) {}

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

  @Post("composites")
  @HttpCode(201)
  async createComposite(@Body() req: CreateCompositeRequest): Promise<CreateCompositeResponse> {
    try {
      const def = await this.compositeService.save(req.name, req.description, req.components, req.policy);
      return { id: def.id, version: def.version };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Get("composites")
  async listComposites(): Promise<ApiCompositeStrategyDefinition[]> {
    const list = await this.compositeService.list();
    return list.map(l => l as ApiCompositeStrategyDefinition);
  }

  @Get("composites/:id")
  async getComposite(@Param("id") id: string): Promise<ApiCompositeStrategyDefinition> {
    try {
      const def = await this.compositeService.load(id);
      return def as ApiCompositeStrategyDefinition;
    } catch (err: any) {
      throw new NotFoundException(err.message);
    }
  }

  @Post("composites/evaluate-policy")
  @HttpCode(200)
  evaluatePolicy(@Body() req: EvaluatePolicyRequest): EvaluatePolicyResponse {
    try {
      const policy = this.policyRegistry.resolve({ id: req.policy.id, version: req.policy.version });
      
      const componentResults: ComponentResult[] = req.signals.map((sig, idx) => ({
        componentId: `comp-${idx}`,
        result: {
          signal: { action: sig, effectiveTime: 0 },
          annotations: []
        }
      }));

      const result = policy.combine(componentResults, req.policy.configuration);
      return { action: result.signal.action };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }
}
