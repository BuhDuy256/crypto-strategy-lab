// Pure analysis-health derivation for the NEWS-07 health read, tested without a database.
// There is no dedicated analysis-health table (unlike collection's news.source_health), so
// this status is derived from news.items state counts plus the last completed attempt.

import { describe, expect, it } from "vitest";
import { deriveAnalysisHealth, deriveCollectionHealth } from "./news-health-query.js";

describe("deriveCollectionHealth", () => {
  const checkedAt = 1_788_177_600_000;
  const pollIntervalMs = 60_000;

  it("reports a healthy source as degraded after the worker misses a heartbeat interval", () => {
    const collection = deriveCollectionHealth(
      [{ provider: "coindesk-rss", status: "healthy", checkedAt }],
      checkedAt,
      pollIntervalMs,
      checkedAt + pollIntervalMs
    );

    expect(collection).toEqual([
      {
        status: "degraded",
        checkedAt,
        message: "worker-stale"
      }
    ]);
  });

  it("keeps a source healthy while a fresh worker heartbeat reports an in-flight collection", () => {
    const collection = deriveCollectionHealth(
      [
        { provider: "coindesk-rss", status: "healthy", checkedAt },
        {
          provider: "other-source",
          status: "unavailable",
          checkedAt: checkedAt - pollIntervalMs,
          reason: "source request failed"
        }
      ],
      checkedAt + pollIntervalMs,
      pollIntervalMs,
      checkedAt + (pollIntervalMs * 2) - 1
    );

    expect(collection).toEqual([
      { status: "healthy", checkedAt },
      {
        status: "unavailable",
        checkedAt: checkedAt - pollIntervalMs,
        message: "source-unavailable"
      }
    ]);
  });
});

describe("deriveAnalysisHealth", () => {
  it("reports unavailable when no analysis attempt has ever completed", () => {
    const health = deriveAnalysisHealth({ pending: 5, analyzing: 0, analyzed: 0, degraded: 0 }, null);
    expect(health).toEqual({
      status: "unavailable",
      message: "no-completed-analysis",
      pendingCount: 5,
      degradedCount: 0,
      checkedAt: 0
    });
  });

  it("reports degraded with a generic category when items exhausted retries", () => {
    const health = deriveAnalysisHealth(
      { pending: 1, analyzing: 0, analyzed: 10, degraded: 2 },
      1_788_177_600_000
    );
    expect(health).toEqual({
      status: "degraded",
      message: "retry-limit-reached",
      pendingCount: 1,
      degradedCount: 2,
      checkedAt: 1_788_177_600_000
    });
  });

  it("reports degraded for a retryable analyzer failure and recovers after the failure is cleared", () => {
    const counts = { pending: 1, analyzing: 0, analyzed: 10, degraded: 0 };
    const checkedAt = 1_788_177_600_000;

    expect(deriveAnalysisHealth(counts, checkedAt, 1)).toEqual({
      status: "degraded",
      message: "retryable-failures",
      pendingCount: 1,
      degradedCount: 0,
      checkedAt
    });
    expect(deriveAnalysisHealth({ ...counts, pending: 0, analyzed: 11 }, checkedAt, 0)).toEqual({
      status: "healthy",
      pendingCount: 0,
      degradedCount: 0,
      checkedAt
    });
  });

  it("reports healthy once analysis has run and nothing is degraded", () => {
    const health = deriveAnalysisHealth(
      { pending: 0, analyzing: 0, analyzed: 10, degraded: 0 },
      1_788_177_600_000
    );
    expect(health).toEqual({
      status: "healthy",
      pendingCount: 0,
      degradedCount: 0,
      checkedAt: 1_788_177_600_000
    });
  });
});
