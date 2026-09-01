// Transport validation for creating one versioned single-backtest specification.

import { Type } from "class-transformer";
import {
  Equals,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsObject,
  IsString,
  Max,
  Min,
  ValidateIf,
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

export class SentimentPolicyActionDto {
  @IsIn(["block", "degrade", "substitute"])
  action!: "block" | "degrade" | "substitute";

  @ValidateIf((value: SentimentPolicyActionDto) => value.action === "substitute")
  @IsNumber()
  @Min(-1)
  @Max(1)
  substituteValue?: number;
}

class SentimentPolicyDto {
  @IsInt()
  @Min(1)
  maxAgeMs!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => SentimentPolicyActionDto)
  onMissing!: SentimentPolicyActionDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => SentimentPolicyActionDto)
  onStale!: SentimentPolicyActionDto;
}

class SentimentInputDto {
  @IsInt()
  @Min(1)
  windowDurationMs!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => SentimentPolicyDto)
  policy!: SentimentPolicyDto;
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

  @ValidateIf((_object, value) => value !== undefined)
  @IsDefined()
  @ValidateNested()
  @Type(() => SentimentInputDto)
  sentimentInput?: SentimentInputDto;
}
