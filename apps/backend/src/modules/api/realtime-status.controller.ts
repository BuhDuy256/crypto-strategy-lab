// Reports the API's own client subscription state. Subscription state belongs
// to ARC-API, so the API is the only place that can answer this, and answering
// it is what makes per-subscription isolation observable outside a unit test.

import { Controller, Get, Inject } from "@nestjs/common";
import { MarketRealtimeGateway } from "./market-realtime.gateway.js";

export interface RealtimeSubscriptionsResponse {
  /** Active entries right now, across every connected client. */
  readonly activeSubscriptions: number;
}

@Controller("realtime")
export class RealtimeStatusController {
  constructor(
    @Inject(MarketRealtimeGateway) private readonly gateway: MarketRealtimeGateway
  ) {}

  @Get("subscriptions")
  getSubscriptions(): RealtimeSubscriptionsResponse {
    return { activeSubscriptions: this.gateway.activeSubscriptionCount };
  }
}
