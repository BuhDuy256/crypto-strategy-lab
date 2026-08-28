// Thin HTTP transport for creating the frozen specification of one single
// backtest. It maps the request to the Experiment module's creation service and
// maps a configuration error to a 400. All assembly, defaulting, dataset
// resolution, and provenance stamping live in the Experiment module; this
// controller adds no business logic.
//
// Counterpart contract: `CreateSpecificationRequest` in
// `packages/api-contracts/src/index.ts`.

import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  ValidationPipe
} from "@nestjs/common";
import type { CreateSpecificationResponse } from "@crypto-strategy-lab/api-contracts";
import { SingleBacktestExperimentCreationService } from "../experiment/index.js";
import { CreateSpecificationDto } from "./specification.dto.js";

// Error prefixes that mean the request was invalid rather than the server failing.
const BAD_REQUEST_PREFIXES = [
  "DATASET_RANGE:",
  "DATASET_RANGE_ALIGNMENT:",
  "EXPERIMENT_VERSION:",
  "STRATEGY_NOT_FOUND:",
  "COMPOSITE_NOT_FOUND:",
  "COMPOSITE_VERSION_MISMATCH:",
  "STRATEGY_VERSION_MISMATCH:",
  "STRATEGY_PARAMETER_"
];

@Controller("specifications")
export class SpecificationController {
  constructor(
    @Inject(SingleBacktestExperimentCreationService)
    private readonly creation: SingleBacktestExperimentCreationService
  ) {}

  @Post()
  async create(
    // expectedType preserves the standard ValidationPipe path under tsx/Vitest,
    // whose transform does not emit route parameter type metadata.
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        expectedType: CreateSpecificationDto
      })
    )
    body: CreateSpecificationDto
  ): Promise<CreateSpecificationResponse> {
    try {
      return await this.creation.create({
        dataset: {
          provider: body.dataset.provider,
          symbol: body.dataset.symbol,
          timeframe: body.dataset.timeframe,
          range: { startTime: body.dataset.startTime, endTime: body.dataset.endTime }
        },
        strategy: {
          id: body.strategy.id,
          version: body.strategy.version,
          parameters: body.strategy.parameters
        }
      });
    } catch (error) {
      if (
        error instanceof Error &&
        BAD_REQUEST_PREFIXES.some((prefix) => error.message.startsWith(prefix))
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
