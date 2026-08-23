// Pure, extensible metric evaluation over deterministic simulation output.

import type { BacktestTrade } from "./backtester.js";

export const MVP_METRIC_SET = {
  id: "mvp-metrics",
  version: "1.0.0"
} as const;

export interface EvaluationInput {
  readonly initialCapital: number;
  readonly trades: readonly BacktestTrade[];
}

export interface MetricDefinition {
  readonly id: string;
  calculate(input: EvaluationInput): number;
}

export interface EvaluationResult {
  readonly metricSet: MetricSetIdentity;
  readonly values: Readonly<Record<string, number>>;
}

export interface MetricSetIdentity {
  readonly id: string;
  readonly version: string;
}

export interface MetricSetDefinition {
  readonly identity: MetricSetIdentity;
  readonly metrics: readonly MetricDefinition[];
}

function finalEquity(input: EvaluationInput): number {
  return input.trades.reduce(
    (equity, trade) => equity + trade.profitAndLoss,
    input.initialCapital
  );
}

const definitions: readonly MetricDefinition[] = [
  {
    id: "totalReturn",
    // (final closed-trade equity - initial capital) / initial capital; zero trades is zero.
    calculate: (input) => (finalEquity(input) - input.initialCapital) / input.initialCapital
  },
  {
    id: "winRate",
    // Strictly positive realized trades / all closed trades; breakeven is not a win.
    calculate: (input) => input.trades.length === 0
      ? 0
      : input.trades.filter((trade) => trade.profitAndLoss > 0).length / input.trades.length
  },
  {
    id: "maximumDrawdown",
    calculate: (input) => {
      // V1 drawdown is peak-to-trough on equity after each closed trade; open-position
      // mark-to-market movement is deliberately not part of this metric version.
      let equity = input.initialCapital;
      let peak = equity;
      let maximum = 0;
      for (const trade of input.trades) {
        equity += trade.profitAndLoss;
        peak = Math.max(peak, equity);
        maximum = Math.max(maximum, peak === 0 ? 0 : (peak - equity) / peak);
      }
      return maximum;
    }
  },
  {
    id: "numberOfTrades",
    // Count every closed trade; zero trades is zero.
    calculate: (input) => input.trades.length
  }
];

const mvpMetricSet: MetricSetDefinition = {
  identity: MVP_METRIC_SET,
  metrics: definitions
};

export class Evaluator {
  constructor(private readonly definition: MetricSetDefinition = mvpMetricSet) {
    const ids = definition.metrics.map((metric) => metric.id);
    if (ids.some((id) => id.trim() === "")) {
      throw new Error("EVALUATION_METRIC_ID: metric identifiers must not be empty");
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error("EVALUATION_METRIC_ID: metric identifiers must be unique");
    }
  }

  static mvpDefinitions(): readonly MetricDefinition[] {
    return definitions;
  }

  evaluate(input: EvaluationInput): EvaluationResult {
    if (!Number.isFinite(input.initialCapital) || input.initialCapital <= 0) {
      throw new Error("EVALUATION_CAPITAL: initialCapital must be positive");
    }
    const invalidTrade = input.trades.find(
      (trade) => !Number.isFinite(trade.profitAndLoss)
    );
    if (invalidTrade !== undefined) {
      throw new Error(`EVALUATION_TRADE_PNL: trade at ${invalidTrade.entryTime} must be finite`);
    }
    const values = Object.fromEntries(
      this.definition.metrics.map((metric) => {
        const value = metric.calculate(input);
        if (!Number.isFinite(value)) {
          throw new Error(`EVALUATION_METRIC_VALUE: ${metric.id} must produce a finite number`);
        }
        return [metric.id, value];
      })
    );
    return {
      metricSet: this.definition.identity,
      values
    };
  }
}
