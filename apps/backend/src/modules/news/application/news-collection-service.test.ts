// Application lifecycle and architecture tests for one News collection stage.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CollectedNewsBatch, NewsCollectionStore, StoredNewsBatch } from "./news-collection-store.js";
import { NewsCollectionScheduler, NewsCollectionService } from "./news-collection-service.js";
import { normalizeNewsItem, type NewsItem } from "../domain/news-item.js";
import { FakeNewsProvider } from "../testing/fake-news-provider.js";

const COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);

function item(url: string): NewsItem {
  const result = normalizeNewsItem({
    title: "CoinDesk fixture",
    content: "A fixture RSS summary.",
    source: "coindesk-rss",
    publishedAt: "2026-08-30T00:15:00Z",
    collectedAt: COLLECTED_AT,
    relatedCoins: [],
    url
  });
  if (result.kind === "rejected") throw new Error(`Fixture must be valid: ${result.reason}`);
  return result.item;
}

class InMemoryNewsCollectionStore implements NewsCollectionStore {
  readonly batches: CollectedNewsBatch[] = [];
  readonly identities = new Set<string>();

  async storeCollectedBatch(batch: CollectedNewsBatch): Promise<StoredNewsBatch> {
    this.batches.push(batch);
    let storedCount = 0;
    for (const entry of batch.items) {
      if (!this.identities.has(entry.id)) {
        this.identities.add(entry.id);
        storedCount += 1;
      }
    }
    return { storedCount, skippedCount: batch.items.length - storedCount };
  }
}

class RecordingLogger {
  readonly messages: string[] = [];

  log(message: string): void { this.messages.push(message); }
  warn(message: string): void { this.messages.push(message); }
  error(message: string): void { this.messages.push(message); }
}

describe("NewsCollectionService", () => {
  it("stores new normalized items as pending and reports the stored count", async () => {
    const store = new InMemoryNewsCollectionStore();
    const collector = new NewsCollectionService(
      new FakeNewsProvider({
        providerId: "coindesk-rss",
        items: [item("https://www.coindesk.com/fixture/one")],
        checkedAt: COLLECTED_AT
      }),
      store,
      new RecordingLogger(),
      () => COLLECTED_AT
    );

    await expect(collector.collectNow()).resolves.toEqual({
      status: "healthy",
      provider: "coindesk-rss",
      fetchedCount: 1,
      storedCount: 1,
      skippedCount: 0
    });
    expect(store.batches[0]?.items[0]?.analysisState).toBe("pending");
  });

  it("deduplicates repeated collection runs through the durable collection seam", async () => {
    const store = new InMemoryNewsCollectionStore();
    const collector = new NewsCollectionService(
      new FakeNewsProvider({
        providerId: "coindesk-rss",
        items: [item("https://www.coindesk.com/fixture/duplicate")],
        checkedAt: COLLECTED_AT
      }),
      store,
      new RecordingLogger(),
      () => COLLECTED_AT
    );

    await collector.collectNow();
    await expect(collector.collectNow()).resolves.toMatchObject({
      fetchedCount: 1,
      storedCount: 0,
      skippedCount: 1
    });
  });

  it("records degraded source health and contains a provider failure", async () => {
    const store = new InMemoryNewsCollectionStore();
    const collector = new NewsCollectionService(
      new FakeNewsProvider({
        providerId: "coindesk-rss",
        items: [],
        checkedAt: COLLECTED_AT,
        unavailableReason: "connection refused"
      }),
      store,
      new RecordingLogger(),
      () => COLLECTED_AT
    );

    await expect(collector.collectNow()).resolves.toMatchObject({
      status: "degraded",
      provider: "coindesk-rss",
      fetchedCount: 0,
      storedCount: 0,
      skippedCount: 0
    });
    expect(store.batches).toEqual([
      expect.objectContaining({
        items: [],
        health: expect.objectContaining({ status: "degraded", reason: "connection refused" })
      })
    ]);
  });
});

describe("NewsCollectionScheduler", () => {
  it("supports manual and scheduled collection triggers", async () => {
    const store = new InMemoryNewsCollectionStore();
    const collector = new NewsCollectionService(
      new FakeNewsProvider({
        providerId: "coindesk-rss",
        items: [item("https://www.coindesk.com/fixture/scheduled")],
        checkedAt: COLLECTED_AT
      }),
      store,
      new RecordingLogger(),
      () => COLLECTED_AT
    );
    let scheduled: (() => void) | undefined;
    let cleared = false;
    const scheduler = new NewsCollectionScheduler(collector, 60_000, {
      setInterval: (callback) => {
        scheduled = callback;
        return 1;
      },
      clearInterval: () => { cleared = true; }
    });

    await scheduler.collectManually();
    await scheduler.collectOnSchedule();
    scheduler.start();
    scheduled?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.stop();

    expect(store.batches).toHaveLength(3);
    expect(cleared).toBe(true);
  });
});

describe("NewsCollectionService architecture", () => {
  it("has no analyzer import or reference", () => {
    const source = readFileSync(new URL("./news-collection-service.ts", import.meta.url), "utf8");

    const importSpecifiers = [...source.matchAll(/from\s+["']([^"']+)["']/gu)]
      .map((match) => match[1]);

    expect(importSpecifiers).toEqual([
      "../domain/news-item.js",
      "./news-collection-store.js",
      "./news-provider.js"
    ]);
    expect(source).not.toMatch(/(?:\bSentimentAnalyzer\b|\bimport\s*\()/u);
  });
});
