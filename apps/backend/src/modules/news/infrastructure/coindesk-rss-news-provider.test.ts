// Fixture-backed contract and failure tests for the CoinDesk RSS NewsProvider adapter.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defineNewsProviderContract } from "../testing/news-provider-contract.js";
import { CoinDeskRssNewsProvider } from "./coindesk-rss-news-provider.js";

const COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);
const RSS_FIXTURE = readFileSync(
  new URL("../testing/fixtures/coindesk-rss.xml", import.meta.url),
  "utf8"
);

function successfulResponse(body = RSS_FIXTURE) {
  return { ok: true, status: 200, text: async () => body };
}

function createAvailableProvider(): CoinDeskRssNewsProvider {
  return new CoinDeskRssNewsProvider({
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    requestTimeoutMs: 1_000,
    retryCount: 0,
    retryDelayMs: 1,
    fetch: async () => successfulResponse(),
    now: () => COLLECTED_AT
  });
}

function createUnavailableProvider(): CoinDeskRssNewsProvider {
  return new CoinDeskRssNewsProvider({
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    requestTimeoutMs: 1_000,
    retryCount: 0,
    retryDelayMs: 1,
    fetch: async () => { throw new Error("connection refused"); },
    now: () => COLLECTED_AT
  });
}

defineNewsProviderContract("CoinDeskRssNewsProvider", () => ({
  createAvailableProvider,
  createUnavailableProvider
}));

describe("CoinDeskRssNewsProvider", () => {
  it("maps only the RSS title, summary, canonical link, and published time", async () => {
    const items = await createAvailableProvider().fetchLatest();

    expect(items).toEqual([
      {
        id: "coindesk-rss|https://www.coindesk.com/markets/fixture-story/",
        title: "Bitcoin RSS update",
        content: "A short RSS summary.",
        source: "coindesk-rss",
        publishedAt: Date.UTC(2026, 7, 30, 0, 15, 0),
        collectedAt: COLLECTED_AT,
        relatedCoins: [],
        url: "https://www.coindesk.com/markets/fixture-story/",
        analysisState: "pending"
      }
    ]);
  });

  it("rejects malformed RSS without returning partially normalized data", async () => {
    const provider = new CoinDeskRssNewsProvider({
      feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
      requestTimeoutMs: 1_000,
      retryCount: 0,
      retryDelayMs: 1,
      fetch: async () => successfulResponse("<rss><channel><item><title>broken</title>"),
      now: () => COLLECTED_AT
    });

    await expect(provider.fetchLatest()).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA"
    });
  });

  it("deduplicates repeated RSS entries by the NEWS-01 identity", async () => {
    const repeated = RSS_FIXTURE.replace(
      "</channel>",
      `<item>
        <title>Later title</title>
        <description>Later RSS summary.</description>
        <link>https://www.coindesk.com/markets/fixture-story/#duplicate</link>
        <pubDate>Sun, 30 Aug 2026 00:15:00 GMT</pubDate>
      </item></channel>`
    );
    const provider = new CoinDeskRssNewsProvider({
      feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
      requestTimeoutMs: 1_000,
      retryCount: 0,
      retryDelayMs: 1,
      fetch: async () => successfulResponse(repeated),
      now: () => COLLECTED_AT
    });

    await expect(provider.fetchLatest()).resolves.toHaveLength(1);
  });

  it("bounds retries and reports an unreachable source", async () => {
    let requests = 0;
    const provider = new CoinDeskRssNewsProvider({
      feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
      requestTimeoutMs: 1_000,
      retryCount: 2,
      retryDelayMs: 1,
      fetch: async () => {
        requests += 1;
        throw new Error("connection refused");
      },
      sleep: async () => undefined,
      now: () => COLLECTED_AT
    });

    await expect(provider.fetchLatest()).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE"
    });
    await expect(provider.getHealth()).resolves.toMatchObject({ status: "unavailable" });
    expect(requests).toBe(3);
  });

  it("aborts a request at the configured timeout", async () => {
    const provider = new CoinDeskRssNewsProvider({
      feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
      requestTimeoutMs: 1,
      retryCount: 0,
      retryDelayMs: 1,
      fetch: async (_url, request) => new Promise((resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      }),
      now: () => COLLECTED_AT
    });

    await expect(provider.fetchLatest()).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE"
    });
  });
});
