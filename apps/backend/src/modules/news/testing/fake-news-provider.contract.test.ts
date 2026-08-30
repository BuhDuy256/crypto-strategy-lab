// Proves that the reusable NewsProvider suite accepts a valid fake and rejects a broken one.
import { describe, expect, it } from "vitest";
import { normalizeNewsItem, type NewsItem } from "../domain/news-item.js";
import {
  defineNewsProviderContract,
  verifyNewsProviderResponse
} from "./news-provider-contract.js";
import { FakeNewsProvider } from "./fake-news-provider.js";
import type { NewsProvider, NewsProviderHealth } from "../application/news-provider.js";

const COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);

function createNewsItem(): NewsItem {
  const result = normalizeNewsItem({
    title: "Bitcoin update",
    content: "The provider returned normalized content.",
    source: "crypto-news",
    publishedAt: "2026-08-30T00:15:00Z",
    collectedAt: COLLECTED_AT,
    relatedCoins: ["BTC"],
    url: "https://example.com/news/bitcoin"
  });
  if (result.kind === "rejected") {
    throw new Error(`Expected a valid fixture, got ${result.reason}.`);
  }
  return result.item;
}

defineNewsProviderContract("FakeNewsProvider", () => ({
  createAvailableProvider: () =>
    new FakeNewsProvider({
      providerId: "fake-news",
      items: [createNewsItem()],
      checkedAt: COLLECTED_AT
    }),
  createUnavailableProvider: () =>
    new FakeNewsProvider({
      providerId: "fake-news",
      items: [],
      checkedAt: COLLECTED_AT,
      unavailableReason: "The source cannot be reached."
    })
}));

/** Deliberately violates the port by returning the same deterministic identity twice. */
class BrokenFakeNewsProvider implements NewsProvider {
  private readonly health: NewsProviderHealth = {
    provider: "broken-news",
    status: "healthy",
    checkedAt: COLLECTED_AT
  };

  async fetchLatest(): Promise<readonly NewsItem[]> {
    const item = createNewsItem();
    return [item, { ...item, collectedAt: COLLECTED_AT + 60_000 }];
  }

  async getHealth(): Promise<NewsProviderHealth> {
    return this.health;
  }
}

describe("BrokenFakeNewsProvider", () => {
  it("is rejected by the reusable suite for duplicate article output", async () => {
    await expect(verifyNewsProviderResponse(new BrokenFakeNewsProvider())).rejects.toThrow(
      "NEWS_ITEM_DUPLICATE"
    );
  });
});
