// Thin HTTP transport for durable backtest submission and status polling.

import { BadRequestException, Body, Controller, DefaultValuePipe, Get, Inject, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { BacktestResultResponse, BacktestRunResponse, BacktestTradesResponse } from "@crypto-strategy-lab/api-contracts";
import { BacktestResultQuery, BacktestRunService } from "../experiment/index.js";
import { getRequestId } from "../../platform/request-context.js";
import { StartBacktestDto } from "./backtest.dto.js";

@Controller("backtests")
export class BacktestController {
  constructor(
    @Inject(BacktestRunService) private readonly runs: BacktestRunService,
    @Inject(BacktestResultQuery) private readonly results: BacktestResultQuery
  ) {}

  @Post()
  async start(@Body() body: StartBacktestDto): Promise<BacktestRunResponse> {
    return this.runs.start(body.specId, getRequestId() ?? "unavailable");
  }

  @Get(":runId")
  async get(@Param("runId", new ParseUUIDPipe()) runId: string): Promise<BacktestRunResponse> {
    try { return await this.runs.get(runId); }
    catch (error) {
      if (error instanceof Error && error.message.startsWith("BACKTEST_RUN_NOT_FOUND:")) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get(":runId/result")
  async getResult(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<BacktestResultResponse> {
    const result = await this.results.getResult(runId);
    if (result === undefined) throw new NotFoundException(`BACKTEST_RUN_NOT_FOUND: ${runId}`);
    if (result.status === "queued" || result.status === "running") response.status(202);
    return result;
  }

  @Get(":runId/trades")
  async getTrades(
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) pageNumber: number,
    @Query("pageSize", new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
    @Res({ passthrough: true }) response: Response
  ): Promise<BacktestTradesResponse> {
    const result = await this.results.getResult(runId);
    if (result === undefined) throw new NotFoundException(`BACKTEST_RUN_NOT_FOUND: ${runId}`);
    if (result.status !== "completed") {
      if (result.status === "queued" || result.status === "running") response.status(202);
      return result;
    }
    const offset = (pageNumber - 1) * pageSize;
    if (!Number.isSafeInteger(pageNumber) || !Number.isSafeInteger(pageSize) ||
      pageNumber < 1 || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger(offset)) {
      throw new BadRequestException("page must be at least 1 and pageSize must be between 1 and 100");
    }
    return this.results.getTrades(result, { pageNumber, pageSize });
  }
}
