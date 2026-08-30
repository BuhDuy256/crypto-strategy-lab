// The first ranking policy: a weighted score over total return and maximum
// drawdown, with a minimum-trades gate and a total tie-break.
//
// score = weights.totalReturn * totalReturn + weights.maximumDrawdown * maximumDrawdown
// A candidate with fewer than `minTrades` closed trades is gated out: its score
// is -Infinity and it is ineligible for the Top-K. Win rate is deliberately not
// part of the score; it is used only as a tie-break. Weights and the gate live in
// the configuration carried on the frozen specification, so changing them is a new
// recorded version rather than a silent reinterpretation of old results.

import type {
  MetricDirection,
  RankedResult,
  RankingInput,
  RankingPolicy,
  RankingPolicyDescriptor
} from "./ranking-policy.js";

const REQUIRED_METRICS = ["totalReturn", "maximumDrawdown", "winRate", "numberOfTrades"] as const;

interface WeightedConfiguration {
  readonly weightTotalReturn: number;
  readonly weightMaximumDrawdown: number;
  readonly minTrades: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Ascending comparison of two finite numbers.
function ascending(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class WeightedReturnDrawdownPolicy implements RankingPolicy {
  readonly descriptor: RankingPolicyDescriptor = {
    id: "weighted-return-drawdown",
    version: "1.0.0"
  };

  readonly metricDirections: Readonly<Record<string, MetricDirection>> = {
    totalReturn: "higher-is-better",
    maximumDrawdown: "lower-is-better",
    winRate: "higher-is-better",
    numberOfTrades: "higher-is-better"
  };

  rank(input: RankingInput, configuration: Record<string, unknown>): RankedResult {
    const metrics = this.requireMetrics(input.metrics);
    const config = this.readConfiguration(configuration);
    const eligible = metrics.numberOfTrades >= config.minTrades;
    const score = eligible
      ? config.weightTotalReturn * metrics.totalReturn + config.weightMaximumDrawdown * metrics.maximumDrawdown
      : Number.NEGATIVE_INFINITY;

    return {
      policy: { id: this.descriptor.id, version: this.descriptor.version, configuration },
      score,
      eligible,
      metrics: input.metrics,
      contentHash: input.contentHash
    };
  }

  // Total, deterministic order per the accepted V1 tie-break:
  // score desc, maximumDrawdown asc, totalReturn desc, winRate desc,
  // numberOfTrades desc, contentHash asc.
  compare(a: RankedResult, b: RankedResult): number {
    const byScore = -ascending(a.score, b.score);
    if (byScore !== 0) return byScore;

    const byDrawdown = ascending(a.metrics.maximumDrawdown ?? 0, b.metrics.maximumDrawdown ?? 0);
    if (byDrawdown !== 0) return byDrawdown;

    const byReturn = -ascending(a.metrics.totalReturn ?? 0, b.metrics.totalReturn ?? 0);
    if (byReturn !== 0) return byReturn;

    const byWinRate = -ascending(a.metrics.winRate ?? 0, b.metrics.winRate ?? 0);
    if (byWinRate !== 0) return byWinRate;

    const byTrades = -ascending(a.metrics.numberOfTrades ?? 0, b.metrics.numberOfTrades ?? 0);
    if (byTrades !== 0) return byTrades;

    return a.contentHash < b.contentHash ? -1 : a.contentHash > b.contentHash ? 1 : 0;
  }

  private requireMetrics(
    metrics: Readonly<Record<string, number>>
  ): { totalReturn: number; maximumDrawdown: number; winRate: number; numberOfTrades: number } {
    for (const id of REQUIRED_METRICS) {
      const value = metrics[id];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`RANKING_POLICY_METRIC: metric ${id} must be a finite number`);
      }
    }
    return {
      totalReturn: metrics.totalReturn!,
      maximumDrawdown: metrics.maximumDrawdown!,
      winRate: metrics.winRate!,
      numberOfTrades: metrics.numberOfTrades!
    };
  }

  private readConfiguration(configuration: Record<string, unknown>): WeightedConfiguration {
    const weights = configuration.weights;
    if (!isRecord(weights)) {
      throw new Error("RANKING_POLICY_CONFIG: weights must be an object with totalReturn and maximumDrawdown");
    }
    const weightTotalReturn = weights.totalReturn;
    const weightMaximumDrawdown = weights.maximumDrawdown;
    if (typeof weightTotalReturn !== "number" || !Number.isFinite(weightTotalReturn)) {
      throw new Error("RANKING_POLICY_CONFIG: weights.totalReturn must be a finite number");
    }
    if (typeof weightMaximumDrawdown !== "number" || !Number.isFinite(weightMaximumDrawdown)) {
      throw new Error("RANKING_POLICY_CONFIG: weights.maximumDrawdown must be a finite number");
    }
    const minTrades = configuration.minTrades;
    if (typeof minTrades !== "number" || !Number.isInteger(minTrades) || minTrades < 0) {
      throw new Error("RANKING_POLICY_CONFIG: minTrades must be a non-negative integer");
    }
    return { weightTotalReturn, weightMaximumDrawdown, minTrades };
  }
}
