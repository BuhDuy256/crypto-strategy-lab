// HTTP query validation for the provider health read seam.

import { IsIn } from "class-validator";

export class ProviderHealthQueryDto {
  @IsIn(["binance"], { message: "provider must be binance in V4" })
  provider!: "binance";
}
