// HTTP query validation for the NEWS-07 read seams.

import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class NewsItemListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;
}

export class NewsSentimentDistributionQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  startAt!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  endAt!: number;
}
