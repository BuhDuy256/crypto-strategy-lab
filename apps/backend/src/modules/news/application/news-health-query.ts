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

/** Transport-safe collection categories. Provider identifiers and reasons stay internal. */
export type NewsCollectionHealthMessage = "worker-stale" | "source-degraded" | "source-unavailable";

export interface NewsCollectionHealth {
  readonly status: NewsHealthStatus;
  readonly checkedAt: number;
  readonly message?: NewsCollectionHealthMessage;
}

/** Transport-safe analysis categories. Model and provider failure details stay internal. */
export type NewsAnalysisHealthMessage =
  | "retry-limit-reached"
  | "retryable-failures"
  | "no-completed-analysis";

export interface NewsAnalysisStateCounts {
  readonly pending: number;
  readonly analyzing: number;
  readonly analyzed: number;
  readonly degraded: number;
}

export interface NewsAnalysisHealth {
  readonly status: NewsHealthStatus;
  readonly message?: NewsAnalysisHealthMessage;
  readonly pendingCount: number;
  readonly degradedCount: number;
  readonly checkedAt: number;
}

export interface NewsHealthSnapshot {
  readonly collection: readonly NewsCollectionHealth[];
  readonly analysis: NewsAnalysisHealth;
}

export interface NewsHealthQuery {
  getHealth(): Promise<NewsHealthSnapshot>;
}

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
): NewsCollectionHealth[] {
  return collection.map((source) => {
    if (source.status === "healthy") {
      if (workerHeartbeatAt !== null && now - workerHeartbeatAt < pollIntervalMs) {
        return { status: source.status, checkedAt: source.checkedAt };
      }
      return { status: "degraded", checkedAt: source.checkedAt, message: "worker-stale" };
    }
    return {
      status: source.status,
      checkedAt: source.checkedAt,
      message: source.status === "degraded" ? "source-degraded" : "source-unavailable"
    };
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
      message: "retry-limit-reached",
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  if (retryableFailureCount > 0) {
    return {
      status: "degraded",
      message: "retryable-failures",
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  if (lastCompletedAt === null) {
    return {
      status: "unavailable",
      message: "no-completed-analysis",
      pendingCount,
      degradedCount: counts.degraded,
      checkedAt
    };
  }
  return { status: "healthy", pendingCount, degradedCount: counts.degraded, checkedAt };
}
