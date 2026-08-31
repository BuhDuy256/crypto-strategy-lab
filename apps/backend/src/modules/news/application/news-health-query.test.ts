// Pure analysis-health derivation for the NEWS-07 health read, tested without a database.
// There is no dedicated analysis-health table (unlike collection's news.source_health), so
// this status is derived from news.items state counts plus the last completed attempt.

import { describe, expect, it } from "vitest";
import { deriveAnalysisHealth } from "./news-health-query.js";

describe("deriveAnalysisHealth", () => {
  it("reports unavailable when no analysis attempt has ever completed", () => {
    const health = deriveAnalysisHealth({ pending: 5, analyzing: 0, analyzed: 0, degraded: 0 }, null);
    expect(health).toEqual({
      status: "unavailable",
      reason: "analysis has not completed any item yet",
      pendingCount: 5,
      degradedCount: 0,
      checkedAt: 0
    });
  });

  it("reports degraded with a count-bearing reason when items exhausted retries", () => {
    const health = deriveAnalysisHealth(
      { pending: 1, analyzing: 0, analyzed: 10, degraded: 2 },
      1_788_177_600_000
    );
    expect(health).toEqual({
      status: "degraded",
      reason: "2 item(s) exhausted retries and could not be analyzed",
      pendingCount: 1,
      degradedCount: 2,
      checkedAt: 1_788_177_600_000
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
