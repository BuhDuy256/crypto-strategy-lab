// Public test for the realtime subscription count endpoint.

import { describe, expect, it } from "vitest";
import type { MarketRealtimeGateway } from "./market-realtime.gateway.js";
import { RealtimeStatusController } from "./realtime-status.controller.js";

function gatewayHolding(count: number): MarketRealtimeGateway {
  return { activeSubscriptionCount: count } as MarketRealtimeGateway;
}

describe("RealtimeStatusController", () => {
  it("reports however many subscriptions the API is holding", () => {
    expect(new RealtimeStatusController(gatewayHolding(0)).getSubscriptions())
      .toEqual({ activeSubscriptions: 0 });
    expect(new RealtimeStatusController(gatewayHolding(4)).getSubscriptions())
      .toEqual({ activeSubscriptions: 4 });
    // Seven is as valid as four. The endpoint reports state, not an expectation.
    expect(new RealtimeStatusController(gatewayHolding(7)).getSubscriptions())
      .toEqual({ activeSubscriptions: 7 });
  });
});
