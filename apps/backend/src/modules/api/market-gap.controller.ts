// Thin transport over the Market gap query.
//
// This endpoint is how "no unresolved known gap remains" is checked from
// outside the ingest process, by an operator or by a test. It reports; it never
// repairs, and the user interface never repairs either.

import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  ValidationPipe
} from "@nestjs/common";
import {
  MARKET_GAP_QUERY,
  timeframeDurationMs,
  type MarketGapQuery,
  type MarketGapReport
} from "../market/index.js";
import { MarketGapQueryDto } from "./market-gap.dto.js";

/** Same ceiling the candle-history endpoint uses; a gap query scans the same rows. */
const MAX_CANDLE_COUNT = 10_000;

@Controller("market/gaps")
export class MarketGapController {
  constructor(@Inject(MARKET_GAP_QUERY) private readonly gaps: MarketGapQuery) {}

  @Get()
  async getGaps(
    // `expectedType` preserves the same standard ValidationPipe path under tsx/Vitest,
    // whose transform does not emit route parameter type metadata.
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        expectedType: MarketGapQueryDto
      })
    )
    query: MarketGapQueryDto
  ): Promise<MarketGapReport> {
    const duration = timeframeDurationMs(query.timeframe);
    if (query.startTime > query.endTime) {
      throw new BadRequestException("startTime must be less than or equal to endTime");
    }
    if (query.startTime % duration !== 0 || query.endTime % duration !== 0) {
      throw new BadRequestException(
        `startTime and endTime must align to ${query.timeframe} candle opens`
      );
    }
    if ((query.endTime - query.startTime) / duration + 1 > MAX_CANDLE_COUNT) {
      throw new BadRequestException(`requested candle count must not exceed ${MAX_CANDLE_COUNT}`);
    }
    return this.gaps.findGaps(query);
  }
}
