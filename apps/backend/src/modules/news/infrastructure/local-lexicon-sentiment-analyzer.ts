// Deterministic English finance-news fallback for the SentimentAnalyzer port.
// It keeps local demos functional without a paid API and records its exact lexicon identity.

import {
  SentimentAnalyzerError,
  type SentimentAnalysisInput,
  type SentimentAnalysisOutput,
  type SentimentAnalyzer
} from "../application/sentiment-analyzer.js";
import {
  NEWS_SENTIMENT_INPUT_VERSION,
  type SentimentLabel,
  type SentimentModelProvenance
} from "../domain/sentiment-result.js";

const POSITIVE_WORDS = new Set([
  "adoption", "advance", "approval", "approved", "bullish", "breakout", "gain", "gains",
  "growth", "high", "launch", "profit", "profits", "rally", "record", "rebound", "recovery",
  "rise", "rises", "rising", "surge", "surges", "upgrade"
]);

const NEGATIVE_WORDS = new Set([
  "attack", "ban", "bearish", "breach", "crash", "decline", "drop", "drops", "fraud", "hack",
  "hacked", "lawsuit", "loss", "losses", "outage", "plunge", "plunges", "risk", "scam",
  "selloff", "slump", "theft", "warning"
]);

const PROVENANCE: SentimentModelProvenance = {
  modelId: "local-lexicon-en",
  modelArtifactId: "local-lexicon-en-v1.0.0",
  modelVersion: "1.0.0",
  inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
  preprocessingVersion: "lowercase-ascii-words.v1"
};

function labelFor(score: number): SentimentLabel {
  if (score > 0.2) return "positive";
  if (score < -0.2) return "negative";
  return "neutral";
}

/** Counts fixed positive and negative terms and returns a bounded, explainable score. */
export class LocalLexiconSentimentAnalyzer implements SentimentAnalyzer {
  async analyze(input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput> {
    if (input.inputVersion !== NEWS_SENTIMENT_INPUT_VERSION) {
      throw new SentimentAnalyzerError(
        "UNSUPPORTED_INPUT_VERSION",
        PROVENANCE.modelId,
        `Input version ${input.inputVersion} is not supported.`
      );
    }

    const words = `${input.item.title} ${input.item.content}`
      .toLowerCase()
      .split(/[^a-z]+/u)
      .filter((word) => word !== "");
    const positiveCount = words.filter((word) => POSITIVE_WORDS.has(word)).length;
    const negativeCount = words.filter((word) => NEGATIVE_WORDS.has(word)).length;
    const matchedCount = positiveCount + negativeCount;
    const score = matchedCount === 0
      ? 0
      : Number(((positiveCount - negativeCount) / matchedCount).toFixed(4));

    return { label: labelFor(score), score, model: PROVENANCE };
  }
}
