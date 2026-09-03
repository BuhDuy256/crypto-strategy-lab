// Defines the expected provider-neutral NewsItem normalization and deduplication behavior.
import { describe, expect, it } from "vitest";
import {
  MAX_NEWS_CONTENT_LENGTH,
  deduplicateNewsItems,
  normalizeNewsItem,
  type NewsItem
} from "./news-item.js";

const COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);

function acceptedItem(candidate: unknown): NewsItem {
  const result = normalizeNewsItem(candidate);
  if (result.kind === "rejected") {
    throw new Error(`Expected an accepted item, got ${result.reason}.`);
  }
  return result.item;
}

describe("normalizeNewsItem", () => {
  it("normalizes source provenance, timestamps, related coins, and stable identity", () => {
    const item = acceptedItem({
      title: "  Bitcoin   rises after institutional adoption  ",
      content: "  Buyers responded to the announcement.  ",
      source: "  CRYPTO-NEWS  ",
      publishedAt: "2026-08-30T07:15:00+07:00",
      collectedAt: COLLECTED_AT,
      relatedCoins: ["eth", " BTC ", "ETH"],
      url: "HTTPS://Example.com/news/bitcoin#overview"
    });

    expect(item).toEqual({
      id: "crypto-news|https://example.com/news/bitcoin",
      title: "Bitcoin rises after institutional adoption",
      content: "Buyers responded to the announcement.",
      source: "crypto-news",
      publishedAt: Date.UTC(2026, 7, 30, 0, 15, 0),
      collectedAt: COLLECTED_AT,
      relatedCoins: ["BTC", "ETH"],
      url: "https://example.com/news/bitcoin",
      analysisState: "pending"
    });
  });

  it("rejects a timestamp without an explicit timezone", () => {
    const result = normalizeNewsItem({
      title: "Bitcoin update",
      content: "The provider omitted the offset.",
      source: "crypto-news",
      publishedAt: "2026-08-30T07:15:00",
      collectedAt: COLLECTED_AT,
      relatedCoins: ["BTC"],
      url: "https://example.com/news/bitcoin"
    });

    expect(result).toEqual({ kind: "rejected", reason: "PUBLISHED_AT_TIMEZONE_REQUIRED" });
  });

  it("truncates oversized content and rejects missing content without throwing", () => {
    const oversized = acceptedItem({
      title: "Bitcoin update",
      content: "a".repeat(MAX_NEWS_CONTENT_LENGTH + 1),
      source: "crypto-news",
      publishedAt: "2026-08-30T00:15:00Z",
      collectedAt: COLLECTED_AT,
      relatedCoins: ["BTC"],
      url: "https://example.com/news/bitcoin"
    });
    const malformed = normalizeNewsItem({
      title: "Bitcoin update",
      content: " \u0000 ",
      source: "crypto-news",
      publishedAt: "2026-08-30T00:15:00Z",
      collectedAt: COLLECTED_AT,
      relatedCoins: ["BTC"],
      url: "https://example.com/news/bitcoin"
    });

    expect(oversized.content).toHaveLength(MAX_NEWS_CONTENT_LENGTH);
    expect(malformed).toEqual({ kind: "rejected", reason: "CONTENT_REQUIRED" });
  });
});

describe("deduplicateNewsItems", () => {
  it("keeps one stable identity when the same article is collected twice", () => {
    const first = acceptedItem({
      title: "Bitcoin update",
      content: "The article content.",
      source: "crypto-news",
      publishedAt: "2026-08-30T00:15:00Z",
      collectedAt: COLLECTED_AT,
      relatedCoins: ["BTC"],
      url: "https://example.com/news/bitcoin"
    });
    const duplicate = { ...first, collectedAt: COLLECTED_AT + 60_000 };

    expect(deduplicateNewsItems([first, duplicate])).toEqual([first]);
  });
});
