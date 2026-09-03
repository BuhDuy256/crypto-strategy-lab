// Reusable conformance suite for every NewsProvider adapter.
// Production and fake adapters cross the same normalized News Intelligence seam.
import { describe, expect, it } from "vitest";
import { assertNewsItemCollection, type NewsItem } from "../domain/news-item.js";
import type { NewsProvider } from "../application/news-provider.js";

export interface NewsProviderContractScenario {
  readonly createAvailableProvider: () => NewsProvider;
  readonly createUnavailableProvider: () => NewsProvider;
}

export async function verifyNewsProviderResponse(
  provider: NewsProvider
): Promise<readonly NewsItem[]> {
  const items = await provider.fetchLatest();
  assertNewsItemCollection(items);

  const health = await provider.getHealth();
  if (health.provider.trim() === "") {
    throw new Error("NEWS_PROVIDER_HEALTH_PROVIDER: provider must not be empty");
  }
  if (!Number.isSafeInteger(health.checkedAt) || health.checkedAt < 0) {
    throw new Error("NEWS_PROVIDER_HEALTH_TIME: checkedAt must be a UTC epoch millisecond");
  }
  if (!(["healthy", "degraded", "unavailable"] as const).includes(health.status)) {
    throw new Error("NEWS_PROVIDER_HEALTH_STATUS: provider status is invalid");
  }

  return items;
}

export function defineNewsProviderContract(
  adapterName: string,
  createScenario: () => NewsProviderContractScenario
): void {
  describe(`${adapterName} news provider contract`, () => {
    it("returns unique, normalized NewsItem values", async () => {
      const { createAvailableProvider } = createScenario();
      const items = await verifyNewsProviderResponse(createAvailableProvider());

      expect(items.length).toBeGreaterThan(0);
    });

    it("returns a stable provider health shape", async () => {
      const { createAvailableProvider } = createScenario();
      const health = await createAvailableProvider().getHealth();

      expect(health.provider).not.toBe("");
      expect(["healthy", "degraded", "unavailable"]).toContain(health.status);
      expect(Number.isSafeInteger(health.checkedAt)).toBe(true);
    });

    it("reports an unreachable provider with the stable error code and health", async () => {
      const { createUnavailableProvider } = createScenario();
      const provider = createUnavailableProvider();

      await expect(provider.fetchLatest()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
      await expect(provider.getHealth()).resolves.toMatchObject({ status: "unavailable" });
    });
  });
}
