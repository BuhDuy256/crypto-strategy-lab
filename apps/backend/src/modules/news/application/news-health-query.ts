// News-owned collection and analysis health read for the NEWS-07 query surface.
//
// Collection health is stored state (news.source_health, one row per configured
// provider). Analysis has no equivalent table: its health is derived here from
// news.items state counts plus the most recent completed attempt, so a fresh or
// stopped worker reads as "unavailable" rather than throwing.

export type NewsHealthStatus = "healthy" | "degraded" | "unavailable";

export interface NewsSourceHealth {
  readonly provider: string;
  readonly status: NewsHealthStatus;
  readonly checkedAt: number;
  readonly reason?: string;
}

export interface NewsAnalysisStateCounts {
  readonly pending: number;
  readonly analyzing: number;
  readonly analyzed: number;
  readonly degraded: number;
}

export interface NewsAnalysisHealth {
  readonly status: NewsHealthStatus;
  readonly reason?: string;
  readonly pendingCount: number;
  readonly degradedCount: number;
  readonly checkedAt: number;
}

export interface NewsHealthSnapshot {
  readonly collection: readonly NewsSourceHealth[];
  readonly analysis: NewsAnalysisHealth;
}

export interface NewsHealthQuery {
  getHealth(): Promise<NewsHealthSnapshot>;
}

/** Pure so the status rules are cheap to verify without a database. */
export function deriveAnalysisHealth(
  counts: NewsAnalysisStateCounts,
  lastCompletedAt: number | null
): NewsAnalysisHealth {
  const pendingCount = counts.pending + counts.analyzing;
  const checkedAt = lastCompletedAt ?? 0;

  if (lastCompletedAt === null) {
    return {
      status: "unavailable",
      reason: "analysis has not completed any item yet",
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  if (counts.degraded > 0) {
    return {
      status: "degraded",
      reason: `${counts.degraded} item(s) exhausted retries and could not be analyzed`,
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  return { status: "healthy", pendingCount, degradedCount: counts.degraded, checkedAt };
}
