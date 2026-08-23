// Thin normalized candle HTTP transport delegating all reads to MarketDataQuery.

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  ValidationPipe
} from "@nestjs/common";
import type { CandleHistoryResponse } from "@crypto-strategy-lab/api-contracts";
import {
  MARKET_DATA_QUERY,
  timeframeDurationMs,
  type MarketDataQuery
} from "../market/index.js";
import { CandleHistoryQueryDto } from "./candle-history.dto.js";

const MAX_CANDLE_COUNT = 10_000;

@Controller("market/candles")
export class CandleHistoryController {
  constructor(@Inject(MARKET_DATA_QUERY) private readonly marketData: MarketDataQuery) {}

  @Get()
  async getCandles(
    // `expectedType` preserves the same standard ValidationPipe path under tsx/Vitest,
    // whose transform does not emit route parameter type metadata.
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        expectedType: CandleHistoryQueryDto
      })
    )
    query: CandleHistoryQueryDto
  ): Promise<CandleHistoryResponse> {
    const duration = timeframeDurationMs(query.timeframe);
    if (query.startTime > query.endTime) {
      throw new BadRequestException("startTime must be less than or equal to endTime");
    }
    if (query.startTime % duration !== 0 || query.endTime % duration !== 0) {
      throw new BadRequestException(`startTime and endTime must align to ${query.timeframe} candle opens`);
    }
    const requestedCount = (query.endTime - query.startTime) / duration + 1;
    if (requestedCount > MAX_CANDLE_COUNT) {
      throw new BadRequestException(`requested candle count must not exceed ${MAX_CANDLE_COUNT}`);
    }
    const candles = await this.marketData.getCandles(query);
    return { candles };
  }
}
