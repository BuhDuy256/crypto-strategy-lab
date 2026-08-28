import { Controller, Get, Post, Param, Body, Inject, HttpCode, BadRequestException, NotFoundException } from "@nestjs/common";
import { StrategyRegistry } from "../strategy/index.js";
import { CompositeStrategyService } from "../strategy/index.js";
import type {
  ComponentStrategyReference,
  StrategyDescriptor,
  StrategyParameters
} from "../strategy/index.js";
import { MARKET_DATA_QUERY, type MarketDataQuery } from "../market/index.js";
import type { 
  StrategyCatalogResponse, 
  CreateCompositeRequest, 
  CreateCompositeResponse,
  ApiCompositeCatalogEntry,
  ApiStrategyDescriptor,
  EvaluateCompositeRequest,
  EvaluateCompositeResponse
} from "@crypto-strategy-lab/api-contracts";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown strategy error";
}

function toStrategyParameters(parameters: Record<string, unknown>): StrategyParameters {
  for (const [field, value] of Object.entries(parameters)) {
    if (
      typeof value !== "string" &&
      typeof value !== "boolean" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error(`STRATEGY_PARAMETER_TYPE: field ${field} must be a string, boolean, or finite number`);
    }
  }
  return parameters as StrategyParameters;
}

function toComponentReferences(
  components: CreateCompositeRequest["components"]
): readonly ComponentStrategyReference[] {
  return components.map((component) => ({
    id: component.id,
    version: component.version,
    parameters: toStrategyParameters(component.parameters)
  }));
}

function toApiDescriptor(descriptor: StrategyDescriptor): ApiStrategyDescriptor {
  return {
    id: descriptor.id,
    version: descriptor.version,
    name: descriptor.name,
    description: descriptor.description,
    category: descriptor.category,
    capabilities: descriptor.capabilities,
    parameterSchema: {
      properties: Object.fromEntries(
        Object.entries(descriptor.parameterSchema.properties).map(([key, property]) => [key, { ...property }])
      ),
      required: [...descriptor.parameterSchema.required]
    },
    requiredInputs: descriptor.requiredInputs
  };
}

@Controller("strategies")
export class StrategyController {
  constructor(
    @Inject(StrategyRegistry) private readonly strategyRegistry: StrategyRegistry,
    @Inject(CompositeStrategyService) private readonly compositeService: CompositeStrategyService,
    @Inject(MARKET_DATA_QUERY) private readonly marketData: MarketDataQuery
  ) {}

  @Get()
  getStrategies(): StrategyCatalogResponse {
    const descriptors = this.strategyRegistry.list();
    return {
      strategies: descriptors.map(toApiDescriptor)
    };
  }

  @Post("composites")
  @HttpCode(201)
  async createComposite(@Body() req: CreateCompositeRequest): Promise<CreateCompositeResponse> {
    try {
      const def = await this.compositeService.save(
        req.name,
        req.description,
        toComponentReferences(req.components),
        req.policy
      );
      return { id: def.id, version: def.version };
    } catch (error: unknown) {
      throw new BadRequestException(errorMessage(error));
    }
  }

  @Get("composites")
  async listComposites(): Promise<ApiCompositeCatalogEntry[]> {
    const list = await this.compositeService.list();
    return Promise.all(list.map(async (definition) => ({
      ...definition,
      descriptor: toApiDescriptor(
        (await this.compositeService.resolve(definition.id, definition.version)).descriptor
      )
    })));
  }

  @Get("composites/:id")
  async getComposite(@Param("id") id: string): Promise<ApiCompositeCatalogEntry> {
    try {
      const def = await this.compositeService.load(id);
      return {
        ...def,
        descriptor: toApiDescriptor(
          (await this.compositeService.resolve(def.id, def.version)).descriptor
        )
      };
    } catch (error: unknown) {
      throw new NotFoundException(errorMessage(error));
    }
  }

  @Post("composites/:id/evaluate")
  @HttpCode(200)
  async evaluateComposite(
    @Param("id") id: string,
    @Body() req: EvaluateCompositeRequest
  ): Promise<EvaluateCompositeResponse> {
    try {
      const candles = await this.marketData.getCandles(req);
      const lastCandle = candles.at(-1);
      if (lastCandle === undefined) {
        throw new Error("COMPOSITE_DATA_WINDOW_EMPTY: no candles exist in the requested window");
      }
      const result = await this.compositeService.evaluate(id, {
        evaluationTime: lastCandle.closeTime,
        inputs: [{ kind: "price-bars", bars: candles }]
      });
      return { action: result.signal.action, effectiveTime: result.signal.effectiveTime };
    } catch (error: unknown) {
      throw new BadRequestException(errorMessage(error));
    }
  }
}
