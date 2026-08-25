// Read-only catalog of registered strategy generators. The response is derived
// entirely from generator descriptors, so a newly registered generator appears
// with no change to this controller or to the frontend.

import { Controller, Get, Inject } from "@nestjs/common";
import { StrategyGeneratorRegistry } from "../strategy/index.js";
import type { ParameterSchema } from "../strategy/index.js";
import type { GeneratorCatalogResponse, ApiParameterSchema, ApiParameterProperty } from "@crypto-strategy-lab/api-contracts";

// Maps the domain parameter schema to its transport shape by copying only the
// fields each parameter kind actually carries. This keeps the boundary honest
// without an unchecked cast.
function toApiParameterSchema(schema: ParameterSchema): ApiParameterSchema {
  const properties: Record<string, ApiParameterProperty> = {};
  for (const [name, definition] of Object.entries(schema.properties)) {
    properties[name] = {
      type: definition.type,
      label: definition.label,
      ...(definition.description !== undefined ? { description: definition.description } : {}),
      ...((definition.type === "number" || definition.type === "integer") && definition.minimum !== undefined
        ? { minimum: definition.minimum }
        : {}),
      ...((definition.type === "number" || definition.type === "integer") && definition.maximum !== undefined
        ? { maximum: definition.maximum }
        : {}),
      ...(definition.type === "enum" ? { values: definition.values } : {}),
      ...(definition.default !== undefined ? { default: definition.default } : {})
    };
  }
  return { properties, required: schema.required };
}

@Controller("generators")
export class GeneratorController {
  constructor(
    @Inject(StrategyGeneratorRegistry) private readonly generatorRegistry: StrategyGeneratorRegistry
  ) {}

  @Get()
  getGenerators(): GeneratorCatalogResponse {
    return {
      generators: this.generatorRegistry.list().map((descriptor) => ({
        id: descriptor.id,
        version: descriptor.version,
        name: descriptor.name,
        description: descriptor.description,
        configurationSchema: toApiParameterSchema(descriptor.configurationSchema)
      }))
    };
  }
}
