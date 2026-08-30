// Thin provider health transport. The state itself belongs to Market Data, so
// the API only reads a query port and never decides what healthy means.
//
// The SPA needs this to show a degraded indicator during an outage. It is a
// read seam on purpose: nothing here can repair a gap or reach a provider.

import { Controller, Get, Inject, Query, ValidationPipe } from "@nestjs/common";
import {
  PROVIDER_HEALTH_QUERY,
  type ProviderHealth,
  type ProviderHealthQuery
} from "../market/index.js";
import { ProviderHealthQueryDto } from "./provider-health.dto.js";

@Controller("market/provider-health")
export class ProviderHealthController {
  constructor(
    @Inject(PROVIDER_HEALTH_QUERY) private readonly health: ProviderHealthQuery
  ) {}

  @Get()
  async getProviderHealth(
    // `expectedType` preserves the same standard ValidationPipe path under tsx/Vitest,
    // whose transform does not emit route parameter type metadata.
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        expectedType: ProviderHealthQueryDto
      })
    )
    query: ProviderHealthQueryDto
  ): Promise<ProviderHealth> {
    const state = await this.health.getHealth(query.provider);
    if (state !== undefined) return state;
    // No record means ingest has never reported, which is not the same as
    // healthy. Saying so is what keeps a stopped ingest process visible.
    return {
      provider: query.provider,
      status: "unavailable",
      checkedAt: 0,
      reason: "market ingest has not reported provider health yet"
    };
  }
}
