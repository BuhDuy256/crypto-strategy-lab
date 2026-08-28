// Transport validation for creating one versioned single-backtest specification.

import { Type } from "class-transformer";
import {
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Max,
  Min,
  ValidateNested
} from "class-validator";
import type {
  ApiStrategyParameters,
  ApiTimeframe
} from "@crypto-strategy-lab/api-contracts";
import { API_TIMEFRAMES } from "@crypto-strategy-lab/api-contracts";

class SpecificationDatasetDto {
  @Equals("binance")
  provider!: "binance";

  @Equals("BTCUSDT")
  symbol!: "BTCUSDT";

  @IsIn(API_TIMEFRAMES)
  timeframe!: ApiTimeframe;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  startTime!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  endTime!: number;
}

class SpecificationStrategyDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  version!: string;

  @IsObject()
  parameters!: ApiStrategyParameters;
}

export class CreateSpecificationDto {
  @Equals("v1")
  schemaVersion!: "v1";

  @ValidateNested()
  @Type(() => SpecificationDatasetDto)
  dataset!: SpecificationDatasetDto;

  @ValidateNested()
  @Type(() => SpecificationStrategyDto)
  strategy!: SpecificationStrategyDto;
}
