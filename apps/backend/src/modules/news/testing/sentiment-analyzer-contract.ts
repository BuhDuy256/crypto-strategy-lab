// Reusable conformance suite every SentimentAnalyzer adapter must pass.
// It checks the port contract only: no adapter may be recognized by name here.
import { describe, expect, it } from "vitest";
import {
  SentimentAnalyzerError,
  type SentimentAnalyzer,
  type SentimentAnalysisOutput
} from "../application/sentiment-analyzer.js";
import {
  NEWS_SENTIMENT_INPUT_VERSION,
  SENTIMENT_RESULT_SCHEMA_VERSION,
  normalizeSentimentResult
} from "../domain/sentiment-result.js";
import { newsItemFixture } from "./news-item-fixture.js";

export interface SentimentAnalyzerContractScenario {
  readonly createAvailableAnalyzer: () => SentimentAnalyzer;
  readonly createUnavailableAnalyzer: () => SentimentAnalyzer;
}

/**
 * Validates one analyzer output against the versioned result contract by placing it
 * in a result exactly as the inference lifecycle would.
 */
export function verifySentimentAnalyzerOutput(
  output: SentimentAnalysisOutput,
  newsItemId: string,
  requestedInputVersion: string
): void {
  const normalized = normalizeSentimentResult({
    schemaVersion: SENTIMENT_RESULT_SCHEMA_VERSION,
    newsItemId,
    label: output.label,
    score: output.score,
    model: output.model,
    analyzedAt: Date.UTC(2026, 7, 30, 2, 0, 0),
    status: "succeeded"
  });
  if (normalized.kind === "rejected") {
    throw new Error(`SENTIMENT_ANALYZER_OUTPUT: ${normalized.reason}`);
  }
  if (output.model.inputVersion !== requestedInputVersion) {
    throw new Error(
      "SENTIMENT_ANALYZER_INPUT_VERSION: recorded input version must match the requested one"
    );
  }
}

export function defineSentimentAnalyzerContract(
  adapterName: string,
  createScenario: () => SentimentAnalyzerContractScenario
): void {
  describe(`${adapterName} sentiment analyzer contract`, () => {
    it("returns a label, a bounded score, and complete alias-free provenance", async () => {
      const item = newsItemFixture();
      const output = await createScenario().createAvailableAnalyzer().analyze({
        item,
        inputVersion: NEWS_SENTIMENT_INPUT_VERSION
      });

      verifySentimentAnalyzerOutput(output, item.id, NEWS_SENTIMENT_INPUT_VERSION);
      expect(["positive", "neutral", "negative"]).toContain(output.label);
    });

    it("returns the same output for the same input and input version", async () => {
      const analyzer = createScenario().createAvailableAnalyzer();
      const input = { item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION };

      expect(await analyzer.analyze(input)).toEqual(await analyzer.analyze(input));
    });

    it("handles hostile and empty-looking content without throwing", async () => {
      const analyzer = createScenario().createAvailableAnalyzer();
      const item = newsItemFixture({ content: "<script>alert(1)</script> ????" });

      const output = await analyzer.analyze({
        item,
        inputVersion: NEWS_SENTIMENT_INPUT_VERSION
      });

      verifySentimentAnalyzerOutput(output, item.id, NEWS_SENTIMENT_INPUT_VERSION);
    });

    it("reports an unusable analyzer with the stable error code", async () => {
      const analyzer = createScenario().createUnavailableAnalyzer();

      await expect(
        analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
      ).rejects.toBeInstanceOf(SentimentAnalyzerError);
      await expect(
        analyzer.analyze({ item: newsItemFixture(), inputVersion: NEWS_SENTIMENT_INPUT_VERSION })
      ).rejects.toMatchObject({ code: "ANALYZER_UNAVAILABLE" });
    });

    it("rejects an input version it was not built for", async () => {
      const analyzer = createScenario().createAvailableAnalyzer();

      await expect(
        analyzer.analyze({ item: newsItemFixture(), inputVersion: "news-item.v0" })
      ).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT_VERSION" });
    });
  });
}
