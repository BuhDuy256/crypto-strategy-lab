// Deterministic adapter test for the News-owned item list read. Mirrors the mocked-pool
// style of postgres-sentiment-feature-store.test.ts: assert the SQL/params shape and the
// mapped result, without a live database.

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresNewsQueryRepository } from "./postgres-news-query-repository.js";

describe("PostgresNewsQueryRepository.list", () => {
  it("pages through news.items newest-published-first and maps the transport-safe fields", async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          id: "coindesk-rss|https://example.com/a",
          title: "Fixture headline",
          source: "coindesk-rss",
          published_at: "1788177600000",
          related_coins: ["BTC"],
          analysis_state: "analyzed",
          total_count: 3
        }
      ]
    }));
    const repository = new PostgresNewsQueryRepository({ query } as unknown as Pool, 60_000);

    const page = await repository.list({ pageNumber: 2, pageSize: 1 });

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as unknown as [string, readonly unknown[]];
    expect(sql).toContain("ORDER BY published_at DESC");
    expect(sql).toContain("LIMIT $1 OFFSET $2");
    expect(params).toEqual([1, 1]);
    expect(page).toEqual({
      items: [
        {
          id: "coindesk-rss|https://example.com/a",
          title: "Fixture headline",
          source: "coindesk-rss",
          publishedAt: 1_788_177_600_000,
          relatedCoins: ["BTC"],
          analysisState: "analyzed"
        }
      ],
      page: { pageNumber: 2, pageSize: 1, totalCount: 3 }
    });
  });

  it("falls back to a count query when an empty page has no window total", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const repository = new PostgresNewsQueryRepository({ query } as unknown as Pool, 60_000);

    const page = await repository.list({ pageNumber: 1, pageSize: 10 });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("count(*)::int AS count");
    expect(page).toEqual({ items: [], page: { pageNumber: 1, pageSize: 10, totalCount: 0 } });
  });
});

describe("PostgresNewsQueryRepository.getDistribution", () => {
  it("counts analyzed, succeeded items published in the window and derives proportions", async () => {
    const query = vi.fn(async () => ({ rows: [{ positive: 3, neutral: 1, negative: 0 }] }));
    const repository = new PostgresNewsQueryRepository({ query } as unknown as Pool, 60_000);

    const distribution = await repository.getDistribution({ startAt: 1_000, endAt: 2_000 });

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as unknown as [string, readonly unknown[]];
    expect(sql).toContain("i.analysis_state = 'analyzed'");
    expect(sql).toContain("r.status = 'succeeded'");
    expect(sql).toContain("i.published_at >= $1 AND i.published_at <= $2");
    expect(params).toEqual([1_000, 2_000]);
    expect(distribution).toEqual({
      window: { startAt: 1_000, endAt: 2_000 },
      itemCount: 4,
      positive: 0.75,
      neutral: 0.25,
      negative: 0
    });
  });

  it("reports zero proportions for an empty window without dividing by zero", async () => {
    const query = vi.fn(async () => ({ rows: [{ positive: 0, neutral: 0, negative: 0 }] }));
    const repository = new PostgresNewsQueryRepository({ query } as unknown as Pool, 60_000);

    const distribution = await repository.getDistribution({ startAt: 1_000, endAt: 2_000 });

    expect(distribution).toEqual({
      window: { startAt: 1_000, endAt: 2_000 },
      itemCount: 0,
      positive: 0,
      neutral: 0,
      negative: 0
    });
  });
});

describe("PostgresNewsQueryRepository.getHealth", () => {
  it("maps stored provider and failure internals to generic collection and analysis health", async () => {
    const lastCompletedAt = new Date("2026-08-30T00:15:00Z");
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("news.source_health")) {
        return {
          rows: [{ provider: "coindesk-rss", status: "healthy", reason: "provider-private", checked_at: "1788177600000" }]
        };
      }
      if (sql.includes("collection_worker_heartbeat")) return { rows: [{ checked_at: "1788177600000" }] };
      if (sql.includes("GROUP BY analysis_state")) {
        return {
          rows: [
            { analysis_state: "pending", count: 2 },
            { analysis_state: "analyzed", count: 10 },
            { analysis_state: "degraded", count: 1 }
          ]
        };
      }
      return { rows: [{ last_completed_at: lastCompletedAt }] };
    });
    const repository = new PostgresNewsQueryRepository(
      { query } as unknown as Pool,
      60_000,
      () => 1_788_177_659_999
    );

    const health = await repository.getHealth();

    expect(health).toEqual({
      collection: [{ status: "healthy", checkedAt: 1_788_177_600_000 }],
      analysis: {
        status: "degraded",
        message: "retry-limit-reached",
        pendingCount: 2,
        degradedCount: 1,
        checkedAt: lastCompletedAt.getTime()
      }
    });
  });

  it("reports unavailable analysis health and an empty collection list against a fresh schema", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("news.source_health")) return { rows: [] };
      if (sql.includes("GROUP BY analysis_state")) return { rows: [] };
      return { rows: [{ last_completed_at: null }] };
    });
    const repository = new PostgresNewsQueryRepository({ query } as unknown as Pool, 60_000);

    const health = await repository.getHealth();

    expect(health).toEqual({
      collection: [],
      analysis: {
        status: "unavailable",
        message: "no-completed-analysis",
        pendingCount: 0,
        degradedCount: 0,
        checkedAt: 0
      }
    });
  });

  it("surfaces a retryable persisted analyzer failure as degraded without exposing its internal reason", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("news.source_health")) {
        return {
          rows: [{ provider: "coindesk-rss", status: "healthy", reason: null, checked_at: "1788177600000" }]
        };
      }
      if (sql.includes("collection_worker_heartbeat")) return { rows: [{ checked_at: "1788177600000" }] };
      if (sql.includes("GROUP BY analysis_state")) {
        return { rows: [{ analysis_state: "pending", count: 1 }, { analysis_state: "analyzed", count: 10 }] };
      }
      if (sql.includes("analysis_failure_reason")) return { rows: [{ retryable_failure_count: 1 }] };
      return { rows: [{ last_completed_at: new Date("2026-08-30T00:15:00Z") }] };
    });
    const repository = new PostgresNewsQueryRepository(
      { query } as unknown as Pool,
      60_000,
      () => 1_788_177_600_001
    );

    const health = await repository.getHealth();

    expect(health.analysis).toEqual({
      status: "degraded",
      message: "retryable-failures",
      pendingCount: 1,
      degradedCount: 0,
      checkedAt: Date.parse("2026-08-30T00:15:00Z")
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("analysis_failure_reason"))).toBe(true);
  });

  it("reports collection degraded from a stale worker heartbeat even when source health was healthy", async () => {
    const checkedAt = 1_788_177_600_000;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("news.source_health")) {
        return { rows: [{ provider: "coindesk-rss", status: "healthy", reason: null, checked_at: String(checkedAt) }] };
      }
      if (sql.includes("collection_worker_heartbeat")) return { rows: [{ checked_at: String(checkedAt) }] };
      if (sql.includes("GROUP BY analysis_state")) return { rows: [] };
      if (sql.includes("analysis_failure_reason")) return { rows: [{ retryable_failure_count: 0 }] };
      return { rows: [{ last_completed_at: null }] };
    });
    const repository = new PostgresNewsQueryRepository(
      { query } as unknown as Pool,
      60_000,
      () => checkedAt + 60_000
    );

    const health = await repository.getHealth();

    expect(health.collection).toEqual([
      { status: "degraded", checkedAt, message: "worker-stale" }
    ]);
  });
});
