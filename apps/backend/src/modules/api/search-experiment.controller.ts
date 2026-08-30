// Thin HTTP transport for creating a search experiment. It maps the request to
// the Experiment module's creation service and maps a configuration error to a
// 400. All assembly, defaulting, and provenance stamping live in the Experiment
// module; this controller adds no business logic.

import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import type {
  CreateSearchExperimentRequest,
  CreateSearchExperimentResponse
} from "@crypto-strategy-lab/api-contracts";
import { SearchExperimentCreationService } from "../experiment/index.js";

// Error prefixes that mean the request was invalid rather than the server failing.
const BAD_REQUEST_PREFIXES = [
  "SEARCH_EXPERIMENT_",
  "STRATEGY_NOT_FOUND:",
  "EXPERIMENT_",
  "DATASET_"
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Guard the shape the mapping below dereferences, so a malformed body is a 400
// rather than an unhandled TypeError (500). The service still owns domain-rule
// validation (stop conditions, strategy existence, bounds).
function assertRequestShape(body: unknown): asserts body is CreateSearchExperimentRequest {
  if (
    !isObject(body) ||
    !isObject(body.dataset) ||
    !isObject(body.generator) ||
    !isObject(body.searchSpace) ||
    !Array.isArray((body.searchSpace as Record<string, unknown>).strategies) ||
    !isObject(body.stopConditions)
  ) {
    throw new BadRequestException("SEARCH_EXPERIMENT_REQUEST: malformed search experiment request");
  }
}

@Controller("experiments")
export class SearchExperimentController {
  constructor(
    @Inject(SearchExperimentCreationService)
    private readonly creation: SearchExperimentCreationService
  ) {}

  @Post("search")
  async create(
    @Body() body: CreateSearchExperimentRequest
  ): Promise<CreateSearchExperimentResponse> {
    assertRequestShape(body);
    try {
      return await this.creation.create({
        dataset: {
          provider: body.dataset.provider,
          symbol: body.dataset.symbol,
          timeframe: body.dataset.timeframe,
          range: { startTime: body.dataset.startTime, endTime: body.dataset.endTime }
        },
        generator: {
          id: body.generator.id,
          version: body.generator.version,
          configuration: body.generator.configuration ?? {}
        },
        searchSpace: {
          strategies: body.searchSpace.strategies,
          compositeSizes: body.searchSpace.compositeSizes,
          policies: body.searchSpace.policies
        },
        seed: body.seed,
        stopConditions: body.stopConditions,
        maxInFlight: body.maxInFlight
      });
    } catch (error) {
      if (error instanceof Error && BAD_REQUEST_PREFIXES.some((prefix) => error.message.startsWith(prefix))) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
