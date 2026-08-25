// Thin HTTP transport for starting a search experiment and reading its progress.
// All control and ranking logic lives in the Experiment module; this controller
// only maps requests to the search host and domain errors to HTTP status codes.

import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post
} from "@nestjs/common";
import type { SearchProgressResponse } from "@crypto-strategy-lab/api-contracts";
import { SearchExperimentHost, type SearchProgress } from "../experiment/index.js";
import { getRequestId } from "../../platform/request-context.js";

@Controller("experiments")
export class SearchController {
  constructor(@Inject(SearchExperimentHost) private readonly host: SearchExperimentHost) {}

  @Post(":specId/search/start")
  async start(
    @Param("specId", new ParseUUIDPipe()) specId: string
  ): Promise<SearchProgressResponse> {
    try {
      const progress = await this.host.begin(specId, getRequestId() ?? "unavailable");
      return this.toResponse(specId, progress);
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  @Get(":specId/search/progress")
  async progress(
    @Param("specId", new ParseUUIDPipe()) specId: string
  ): Promise<SearchProgressResponse> {
    try {
      const progress = await this.host.progress(specId);
      return this.toResponse(specId, progress);
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  private toResponse(specId: string, progress: SearchProgress): SearchProgressResponse {
    return {
      specId,
      status: progress.status,
      stopReason: progress.stopReason,
      generated: progress.generated,
      submitted: progress.submitted,
      completed: progress.completed,
      failed: progress.failed,
      inFlight: progress.inFlight
    };
  }

  private toHttp(error: unknown): Error {
    if (!(error instanceof Error)) return new Error("Unknown search error");
    if (error.message.startsWith("SEARCH_ALREADY_STARTED:")) return new ConflictException(error.message);
    if (
      error.message.startsWith("SEARCH_NOT_CONFIGURED:") ||
      error.message.startsWith("SEARCH_CONFIG:") ||
      error.message.startsWith("EXPERIMENT_NOT_FROZEN:")
    ) {
      return new BadRequestException(error.message);
    }
    if (
      error.message.startsWith("EXPERIMENT_NOT_FOUND:") ||
      error.message.startsWith("SEARCH_RUN_NOT_FOUND:")
    ) {
      return new NotFoundException(error.message);
    }
    return error;
  }
}
