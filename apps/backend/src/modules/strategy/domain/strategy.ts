// Pure Strategy contract, normalized signal, descriptor, and declared analysis inputs.

import type { Annotation } from "./annotation.js";
import type { ParameterSchema, StrategyParameters } from "./parameter-schema.js";

export interface PriceBar {
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface PriceBarsInput {
  readonly kind: "price-bars";
  readonly bars: readonly PriceBar[];
}

export interface SentimentPoint {
  readonly time: number;
  readonly score: number;
}

export interface SentimentSeriesInput {
  readonly kind: "sentiment-series";
  readonly points: readonly SentimentPoint[];
}

export type AnalysisInput = PriceBarsInput | SentimentSeriesInput;
export type AnalysisInputKind = AnalysisInput["kind"];

export interface AnalysisContext {
  readonly evaluationTime: number;
  readonly inputs: readonly AnalysisInput[];
}

export type SignalAction = "buy" | "sell" | "hold";

export interface Signal {
  readonly action: SignalAction;
  readonly effectiveTime: number;
  readonly confidence?: number;
  readonly reason?: string;
}

export interface StrategyResult {
  readonly signal: Signal;
  readonly annotations: readonly Annotation[];
}

export type StrategyCategory = "trend" | "momentum" | "volatility" | "structure" | "sentiment" | "composite";
export type StrategyCapability = "long" | "short" | "annotations" | "sentiment";

export interface StrategyDescriptor {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly category: StrategyCategory;
  readonly capabilities: readonly StrategyCapability[];
  readonly parameterSchema: ParameterSchema;
  readonly requiredInputs: readonly AnalysisInputKind[];
  readonly metadata?: Record<string, string>;
  readonly implementation: {
    readonly kind: "built-in";
    readonly key: string;
  };
}

export interface Strategy {
  readonly descriptor: StrategyDescriptor;
  evaluate(context: AnalysisContext, parameters: StrategyParameters): StrategyResult;
}
