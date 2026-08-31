// News-owned collection and analysis health read for the NEWS-07 query surface.
//
// Collection status comes from provider-owned source state plus the normal worker's
// independent heartbeat. Analysis has no equivalent table: its health is derived
// here from item state, retryable failures, and the most recent completed attempt.

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

const STALE_COLLECTION_REASON = "collection worker has not reported within the configured poll interval";

/**
 * `workerHeartbeatAt` is recorded independently of provider collection. A healthy
 * source without a heartbeat in one configured interval means the worker missed its
 * next opportunity to report, while a provider-reported failure keeps its own state.
 */
export function deriveCollectionHealth(
  collection: readonly NewsSourceHealth[],
  workerHeartbeatAt: number | null,
  pollIntervalMs: number,
  now: number
): NewsSourceHealth[] {
  return collection.map((source) => {
    if (
      source.status !== "healthy" ||
      (workerHeartbeatAt !== null && now - workerHeartbeatAt < pollIntervalMs)
    ) return source;
    return { ...source, status: "degraded", reason: STALE_COLLECTION_REASON };
  });
}

/** Pure so the status rules are cheap to verify without a database. */
export function deriveAnalysisHealth(
  counts: NewsAnalysisStateCounts,
  lastCompletedAt: number | null,
  retryableFailureCount: number = 0
): NewsAnalysisHealth {
  const pendingCount = counts.pending + counts.analyzing;
  const checkedAt = lastCompletedAt ?? 0;

  if (counts.degraded > 0) {
    return {
      status: "degraded",
      reason: `${counts.degraded} item(s) exhausted retries and could not be analyzed`,
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  if (retryableFailureCount > 0) {
    return {
      status: "degraded",
      reason: "analysis has retryable failures",
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  if (lastCompletedAt === null) {
    return {
      status: "unavailable",
      reason: "analysis has not completed any item yet",
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  return { status: "healthy", pendingCount, degradedCount: counts.degraded, checkedAt };
}
