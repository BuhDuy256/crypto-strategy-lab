// HTTP query validation for the Market gap read seam.

import { Type } from "class-transformer";
import { IsIn, IsInt, Max, Min } from "class-validator";
import { SUPPORTED_TIMEFRAMES, type Timeframe } from "../market/index.js";

export class MarketGapQueryDto {
  @IsIn(["binance"], { message: "provider must be binance in V4" })
  provider!: "binance";

  @IsIn(["BTCUSDT"], { message: "symbol must be BTCUSDT in V4" })
  symbol!: "BTCUSDT";

  @IsIn(SUPPORTED_TIMEFRAMES, { message: `timeframe must be one of ${SUPPORTED_TIMEFRAMES.join(", ")}` })
  timeframe!: Timeframe;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  startTime!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  endTime!: number;
}
