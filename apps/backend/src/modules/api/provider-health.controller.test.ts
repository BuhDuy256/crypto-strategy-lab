// Public test for the provider health read seam.

import { describe, expect, it } from "vitest";
import type { ProviderHealth, ProviderHealthQuery } from "../market/index.js";
import { ProviderHealthController } from "./provider-health.controller.js";
import { ProviderHealthQueryDto } from "./provider-health.dto.js";

function queryReturning(state: ProviderHealth | undefined): ProviderHealthQuery {
  return { getHealth: async (): Promise<ProviderHealth | undefined> => state };
}

const binance: ProviderHealthQueryDto = { provider: "binance" };

describe("ProviderHealthController", () => {
  it("reports whatever Market Data recorded, including the degraded reason", async () => {
    const degraded: ProviderHealth = {
      provider: "binance",
      status: "degraded",
      checkedAt: 1700,
      reason: "the provider closed the stream"
    };

    await expect(new ProviderHealthController(queryReturning(degraded)).getProviderHealth(binance))
      .resolves.toStrictEqual(degraded);
  });

  it("reports unavailable, not healthy, when ingest has never reported", async () => {
    const answer = await new ProviderHealthController(queryReturning(undefined))
      .getProviderHealth(binance);

    expect(answer.status).toBe("unavailable");
    expect(answer.reason).toContain("has not reported");
  });
});
