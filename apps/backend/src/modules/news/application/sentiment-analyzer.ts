// News Intelligence's inference seam.
//
// This port maps one normalized news item and one input version to a versioned
// sentiment output. It deliberately names no model, no library, no vendor, no
// transport, and no runtime language, so replacing the implementation behind it
// is a binding change and nothing else.

import type { NewsItem } from "../domain/news-item.js";
import type { SentimentLabel, SentimentModelProvenance } from "../domain/sentiment-result.js";

export interface SentimentAnalysisInput {
  readonly item: NewsItem;
  /** The input contract version the caller is handing over. */
  readonly inputVersion: string;
}

export interface SentimentAnalysisOutput {
  readonly label: SentimentLabel;
  /** Bounded to the closed interval from -1 to 1. */
  readonly score: number;
  /** The exact identity that produced this output; aliases are rejected downstream. */
  readonly model: SentimentModelProvenance;
}

export type SentimentAnalyzerErrorCode =
  | "ANALYZER_UNAVAILABLE"
  | "INVALID_ANALYZER_RESULT"
  | "UNSUPPORTED_INPUT_VERSION";

export class SentimentAnalyzerError extends Error {
  override readonly name = "SentimentAnalyzerError";

  constructor(
    readonly code: SentimentAnalyzerErrorCode,
    readonly analyzer: string,
    message: string
  ) {
    super(message);
  }
}

export interface SentimentAnalyzer {
  /** Returns one sentiment output, or throws SentimentAnalyzerError. */
  analyze(input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput>;
}
