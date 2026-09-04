// NEWS-06: declared-input strategy over Experiment-supplied sentiment series.

import type { StrategyParameters } from "./parameter-schema.js";
import type { AnalysisContext, SentimentSeriesInput, Strategy, StrategyDescriptor, StrategyResult } from "./strategy.js";

export const NEWS_SENTIMENT_STRATEGY_DESCRIPTOR: StrategyDescriptor = {
  id: "news-sentiment",
  version: "1.0.0",
  name: "News sentiment",
  description: "Signals from the latest declared sentiment score in a configured News window.",
  category: "sentiment",
  capabilities: ["long", "short", "sentiment"],
  parameterSchema: {
    properties: {
      positiveThreshold: {
        type: "number",
        label: "Positive threshold",
        description: "Buy only when sentiment is strictly above this positive score.",
        minimum: 0.0001,
        maximum: 1,
        default: 0.2
      },
      negativeThreshold: {
        type: "number",
        label: "Negative threshold",
        description: "Sell only when sentiment is strictly below this negative score.",
        minimum: -1,
        maximum: -0.0001,
        default: -0.2
      },
      windowDurationMs: {
        type: "integer",
        label: "Sentiment window",
        description: "News aggregation window in milliseconds, frozen with the experiment input policy.",
        minimum: 60_000,
        maximum: 604_800_000,
        default: 3_600_000
      }
    },
    required: ["positiveThreshold", "negativeThreshold", "windowDurationMs"]
  },
  requiredInputs: ["sentiment-series"],
  implementation: { kind: "built-in", key: "news-sentiment" }
};

function numberParameter(parameters: StrategyParameters, name: string): number {
  const value = parameters[name];
  if (typeof value !== "number") {
    throw new Error(`STRATEGY_PARAMETER_TYPE: field ${name} must be a number`);
  }
  return value;
}

function sentimentInput(context: AnalysisContext): SentimentSeriesInput {
  const input = context.inputs.find((candidate) => candidate.kind === "sentiment-series");
  if (input === undefined) {
    throw new Error("STRATEGY_INPUT_REQUIRED: missing input sentiment-series");
  }
  return input;
}

export class NewsSentimentStrategy implements Strategy {
  readonly descriptor = NEWS_SENTIMENT_STRATEGY_DESCRIPTOR;

  validateParameters(parameters: StrategyParameters): void {
    const positiveThreshold = numberParameter(parameters, "positiveThreshold");
    const negativeThreshold = numberParameter(parameters, "negativeThreshold");
    const windowDurationMs = numberParameter(parameters, "windowDurationMs");
    if (positiveThreshold <= 0 || negativeThreshold >= 0 || windowDurationMs <= 0) {
      throw new Error("STRATEGY_PARAMETER_RELATION: sentiment thresholds and window must have their declared signs");
    }
  }

  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult {
    this.validateParameters(parameters);
    const positiveThreshold = numberParameter(parameters, "positiveThreshold");
    const negativeThreshold = numberParameter(parameters, "negativeThreshold");
    const points = sentimentInput(context).points.filter((point) => point.time <= context.evaluationTime);
    const latest = points.at(-1);
    if (latest === undefined) {
      return {
        signal: { action: "hold", effectiveTime: context.evaluationTime, reason: "No sentiment observation at this time" },
        annotations: []
      };
    }
    if (latest.score > positiveThreshold) {
      return {
        signal: { action: "buy", effectiveTime: context.evaluationTime, reason: "Sentiment is above the positive threshold" },
        annotations: []
      };
    }
    if (latest.score < negativeThreshold) {
      return {
        signal: { action: "sell", effectiveTime: context.evaluationTime, reason: "Sentiment is below the negative threshold" },
        annotations: []
      };
    }
    return {
      signal: { action: "hold", effectiveTime: context.evaluationTime, reason: "Sentiment is within the thresholds" },
      annotations: []
    };
  }
}
