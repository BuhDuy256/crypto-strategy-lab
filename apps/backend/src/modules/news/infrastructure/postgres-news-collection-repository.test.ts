// PostgreSQL integration tests for News-owned batch collection persistence.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import { NewsCollectionService } from "../application/news-collection-service.js";
import { normalizeNewsItem, type NewsItem } from "../domain/news-item.js";
import { FakeNewsProvider } from "../testing/fake-news-provider.js";
import { PostgresNewsCollectionRepository } from "./postgres-news-collection-repository.js";

const COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);

function newsItem(url: string, title = "CoinDesk fixture"): NewsItem {
  const result = normalizeNewsItem({
    title,
    content: "A recorded RSS summary.",
    source: "coindesk-rss",
    publishedAt: "2026-08-30T00:15:00Z",
    collectedAt: COLLECTED_AT,
    relatedCoins: [],
    url
  });
  if (result.kind === "rejected") throw new Error(`Fixture must be valid: ${result.reason}`);
  return result.item;
}

describe("PostgresNewsCollectionRepository", () => {
  let pool: Pool;
  let repository: PostgresNewsCollectionRepository;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    repository = new PostgresNewsCollectionRepository(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE news.items, news.source_health");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("commits one collected batch with pending analysis state and healthy source state", async () => {
    const result = await repository.storeCollectedBatch({
      items: [
        newsItem("https://www.coindesk.com/fixture/first"),
        newsItem("https://www.coindesk.com/fixture/second")
      ],
      health: { provider: "coindesk-rss", status: "healthy", checkedAt: COLLECTED_AT }
    });
    const items = await pool.query<{
      id: string;
      analysis_state: string;
      published_at: string;
      collected_at: string;
      source: string;
      url: string;
    }>("SELECT id, analysis_state, published_at, collected_at, source, url FROM news.items ORDER BY url");
    const health = await pool.query<{
      provider: string;
      status: string;
      checked_at: string;
    }>("SELECT provider, status, checked_at FROM news.source_health");

    expect(result).toEqual({ storedCount: 2, skippedCount: 0 });
    expect(items.rows).toEqual([
      {
        id: "coindesk-rss|https://www.coindesk.com/fixture/first",
        analysis_state: "pending",
        published_at: String(Date.UTC(2026, 7, 30, 0, 15, 0)),
        collected_at: String(COLLECTED_AT),
        source: "coindesk-rss",
        url: "https://www.coindesk.com/fixture/first"
      },
      {
        id: "coindesk-rss|https://www.coindesk.com/fixture/second",
        analysis_state: "pending",
        published_at: String(Date.UTC(2026, 7, 30, 0, 15, 0)),
        collected_at: String(COLLECTED_AT),
        source: "coindesk-rss",
        url: "https://www.coindesk.com/fixture/second"
      }
    ]);
    expect(health.rows).toEqual([
      { provider: "coindesk-rss", status: "healthy", checked_at: String(COLLECTED_AT) }
    ]);
  });

  it("keeps the first deterministic identity and reports an already-seen item as skipped", async () => {
    const first = newsItem("https://www.coindesk.com/fixture/duplicate", "First title");
    await repository.storeCollectedBatch({
      items: [first],
      health: { provider: "coindesk-rss", status: "healthy", checkedAt: COLLECTED_AT }
    });
    const repeated = await repository.storeCollectedBatch({
      items: [{ ...first, title: "Later title", collectedAt: COLLECTED_AT + 60_000 }],
      health: { provider: "coindesk-rss", status: "healthy", checkedAt: COLLECTED_AT + 60_000 }
    });
    const stored = await pool.query<{ title: string; collected_at: string }>(
      "SELECT title, collected_at FROM news.items WHERE id = $1",
      [first.id]
    );

    expect(repeated).toEqual({ storedCount: 0, skippedCount: 1 });
    expect(stored.rows).toEqual([{ title: "First title", collected_at: String(COLLECTED_AT) }]);
  });

  it("rolls back items when the batch health write fails", async () => {
    await expect(
      repository.storeCollectedBatch({
        items: [newsItem("https://www.coindesk.com/fixture/rollback")],
        health: {
          provider: "coindesk-rss",
          status: "not-valid" as "healthy",
          checkedAt: COLLECTED_AT
        }
      })
    ).rejects.toThrow();
    const items = await pool.query<{ count: string }>("SELECT count(*) FROM news.items");
    const health = await pool.query<{ count: string }>("SELECT count(*) FROM news.source_health");

    expect(items.rows[0]?.count).toBe("0");
    expect(health.rows[0]?.count).toBe("0");
  });

  it("persists a collector run once and marks its source degraded when the provider fails", async () => {
    const logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
    const available = new NewsCollectionService(
      new FakeNewsProvider({
        providerId: "coindesk-rss",
        items: [newsItem("https://www.coindesk.com/fixture/collector")],
        checkedAt: COLLECTED_AT
      }),
      repository,
      logger,
      () => COLLECTED_AT
    );

    await expect(available.collectNow()).resolves.toMatchObject({ storedCount: 1, skippedCount: 0 });
    await expect(available.collectNow()).resolves.toMatchObject({ storedCount: 0, skippedCount: 1 });

    const unavailable = new NewsCollectionService(
      new FakeNewsProvider({
        providerId: "coindesk-rss",
        items: [],
        checkedAt: COLLECTED_AT,
        unavailableReason: "connection refused"
      }),
      repository,
      logger,
      () => COLLECTED_AT + 60_000
    );
    await expect(unavailable.collectNow()).resolves.toMatchObject({ status: "degraded" });
    const stored = await pool.query<{ count: string }>("SELECT count(*) FROM news.items");
    const health = await pool.query<{ status: string; reason: string }>(
      "SELECT status, reason FROM news.source_health WHERE provider = 'coindesk-rss'"
    );

    expect(stored.rows[0]?.count).toBe("1");
    expect(health.rows).toEqual([{ status: "degraded", reason: "connection refused" }]);
  });
});
