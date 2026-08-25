// The ranking policy port. A policy turns an evaluated metric set into a single
// comparable score plus a total, deterministic tie-break. It is pure: it never
// reads trades, runs a strategy, or touches the database. Its identifier,
// version, and configuration travel on every result it ranks, so a changed
// weight becomes a new recorded version and never silently reinterprets history.

export interface RankingPolicyDescriptor {
  readonly id: string;
  readonly version: string;
}

// The declared direction of a metric, stated explicitly rather than implied by a
// weight's sign, so the intent survives a configuration change.
export type MetricDirection = "higher-is-better" | "lower-is-better";

export interface RankingInput {
  // Metric values as produced by the evaluator (keyed by metric id).
  readonly metrics: Readonly<Record<string, number>>;
  // The candidate content hash, used as the final always-decisive tie-break.
  readonly contentHash: string;
}

export interface RankedResult {
  readonly policy: {
    readonly id: string;
    readonly version: string;
    readonly configuration: Record<string, unknown>;
  };
  // -Infinity when the candidate is gated out (ineligible for the Top-K).
  readonly score: number;
  readonly eligible: boolean;
  readonly metrics: Readonly<Record<string, number>>;
  readonly contentHash: string;
}

export interface RankingPolicy {
  readonly descriptor: RankingPolicyDescriptor;
  // Explicit direction of every metric the policy reasons about (AC6).
  readonly metricDirections: Readonly<Record<string, MetricDirection>>;
  rank(input: RankingInput, configuration: Record<string, unknown>): RankedResult;
  // Total, deterministic order: returns < 0 when `a` ranks ahead of (is better
  // than) `b`, > 0 when behind, and 0 only when the two are the same candidate.
  compare(a: RankedResult, b: RankedResult): number;
}
