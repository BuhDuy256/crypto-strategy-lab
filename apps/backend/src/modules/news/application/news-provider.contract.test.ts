// Exercises the reusable NewsProvider contract through a provider-independent seam.
import { describe, expect, it } from "vitest";
import {
  MAX_NEWS_CONTENT_LENGTH,
  normalizeNewsItem,
  type NewsItem
} from "../domain/news-item.js";
import {
  defineNewsProviderContract,
  verifyNewsProviderResponse
} from "../testing/news-provider-contract.js";
import { NewsProviderError, type NewsProvider } from "./news-provider.js";

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

function createAvailableProvider(): NewsProvider {
  const item = createNewsItem();
  return {
    async fetchLatest() {
      return [item];
    },
    async getHealth() {
      return { provider: "inline-fake", status: "healthy", checkedAt: COLLECTED_AT };
    }
  };
}

function createUnavailableProvider(): NewsProvider {
  return {
    async fetchLatest() {
      throw new NewsProviderError(
        "PROVIDER_UNAVAILABLE",
        "inline-fake",
        "The provider cannot be reached."
      );
    },
    async getHealth() {
      return {
        provider: "inline-fake",
        status: "unavailable",
        checkedAt: COLLECTED_AT,
        reason: "The provider cannot be reached."
      };
    }
  };
}

defineNewsProviderContract("inline fake", () => ({
  createAvailableProvider,
  createUnavailableProvider
}));

describe("verifyNewsProviderResponse", () => {
  it.each([
    ["NEWS_ITEM_CONTENT_REQUIRED", { content: " \u0000 " }],
    ["NEWS_ITEM_CONTENT_NORMALIZED", { content: "x".repeat(MAX_NEWS_CONTENT_LENGTH + 1) }],
    ["NEWS_ITEM_PUBLISHED_AT_INVALID", { publishedAt: COLLECTED_AT + 0.5 }]
  ] as const)("rejects provider output with %s", async (rule, change) => {
    const provider: NewsProvider = {
      async fetchLatest() {
        return [{ ...createNewsItem(), ...change }];
      },
      async getHealth() {
        return { provider: "broken", status: "healthy", checkedAt: COLLECTED_AT };
      }
    };

    await expect(verifyNewsProviderResponse(provider)).rejects.toThrow(rule);
  });
});
