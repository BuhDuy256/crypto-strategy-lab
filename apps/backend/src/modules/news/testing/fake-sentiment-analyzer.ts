// Deterministic in-memory SentimentAnalyzer implementations for contract and lifecycle tests.
//
// These are test doubles only. They exist so the inference lifecycle can be proven
// before any real model is chosen; no real model, service, or runtime is involved.

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

function assertSupportedInputVersion(analyzer: string, input: SentimentAnalysisInput): void {
  if (input.inputVersion !== NEWS_SENTIMENT_INPUT_VERSION) {
    throw new SentimentAnalyzerError(
      "UNSUPPORTED_INPUT_VERSION",
      analyzer,
      `Input version ${input.inputVersion} is not supported.`
    );
  }
}

const POSITIVE_WORDS = ["adoption", "surge", "surges", "gain", "gains", "lift", "rally", "record"];
const NEGATIVE_WORDS = ["crash", "plunge", "hack", "ban", "loss", "losses", "fraud", "outage"];

const LEXICON_PROVENANCE: SentimentModelProvenance = {
  modelId: "fake-lexicon",
  modelArtifactId: "sha256:9f2c1a7b4e6d0c85",
  modelVersion: "1.0.0",
  inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
  preprocessingVersion: "lowercase-word.v1"
};

/** Scores by counting fixed words, so its output is deterministic and explainable. */
export class FakeLexiconSentimentAnalyzer implements SentimentAnalyzer {
  async analyze(input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput> {
    assertSupportedInputVersion(LEXICON_PROVENANCE.modelId, input);

    const words = `${input.item.title} ${input.item.content}`
      .toLowerCase()
      .split(/[^a-z]+/u)
      .filter((word) => word !== "");
    const positive = words.filter((word) => POSITIVE_WORDS.includes(word)).length;
    const negative = words.filter((word) => NEGATIVE_WORDS.includes(word)).length;
    const total = positive + negative;
    const score = total === 0 ? 0 : Number(((positive - negative) / total).toFixed(4));

    return { label: labelFor(score), score, model: LEXICON_PROVENANCE };
  }
}

const CONSTANT_PROVENANCE: SentimentModelProvenance = {
  modelId: "fake-constant",
  modelArtifactId: "sha256:11d4e0aa72b3f608",
  modelVersion: "2.1.3",
  inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
  preprocessingVersion: "identity.v1"
};

/** A second, differently behaving fake, used to prove analyzer substitutability. */
export class FakeConstantSentimentAnalyzer implements SentimentAnalyzer {
  async analyze(input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput> {
    assertSupportedInputVersion(CONSTANT_PROVENANCE.modelId, input);

    return { label: "neutral", score: 0, model: CONSTANT_PROVENANCE };
  }
}

/** Always fails, so the lifecycle's failure, retry, and degraded paths are testable. */
export class UnavailableFakeSentimentAnalyzer implements SentimentAnalyzer {
  constructor(private readonly reason: string) {}

  async analyze(input: SentimentAnalysisInput): Promise<SentimentAnalysisOutput> {
    void input;
    throw new SentimentAnalyzerError("ANALYZER_UNAVAILABLE", "fake-unavailable", this.reason);
  }
}

function labelFor(score: number): SentimentLabel {
  if (score > 0.2) return "positive";
  if (score < -0.2) return "negative";
  return "neutral";
}
