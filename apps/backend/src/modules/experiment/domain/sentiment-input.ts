// Experiment-owned configuration for the News feature an input-dependent candidate uses.

import { assertSentimentFeaturePolicy, type SentimentFeaturePolicy } from "../../news/index.js";

export interface SentimentInputConfiguration {
  readonly windowDurationMs: number;
  readonly policy: SentimentFeaturePolicy;
}

/** Validates the immutable candidate configuration before an Experiment freezes it. */
export function assertSentimentInputConfiguration(value: SentimentInputConfiguration): void {
  if (!Number.isSafeInteger(value.windowDurationMs) || value.windowDurationMs <= 0) {
    throw new Error("EXPERIMENT_SENTIMENT_WINDOW: windowDurationMs must be a positive integer milliseconds value");
  }
  assertSentimentFeaturePolicy(value.policy);
}
