// Behavior tests for the deterministic local fallback behind SentimentAnalyzer.

import { describe, expect, it } from "vitest";
import { NEWS_SENTIMENT_INPUT_VERSION } from "../domain/sentiment-result.js";
import { newsItemFixture } from "../testing/news-item-fixture.js";
import { LocalLexiconSentimentAnalyzer } from "./local-lexicon-sentiment-analyzer.js";

describe("LocalLexiconSentimentAnalyzer", () => {
  it("scores positive and negative finance terms deterministically", async () => {
    const analyzer = new LocalLexiconSentimentAnalyzer();
    const positive = await analyzer.analyze({
      item: newsItemFixture({ title: "Bitcoin rally gains after ETF approval", content: "Adoption surges." }),
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION
    });
    const negative = await analyzer.analyze({
      item: newsItemFixture({ title: "Crypto crash after exchange hack", content: "Losses plunge." }),
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION
    });

    expect(positive).toMatchObject({ label: "positive", score: 1 });
    expect(negative).toMatchObject({ label: "negative", score: -1 });
    expect(positive.model.modelId).toBe("local-lexicon-en");
    expect(await analyzer.analyze({
      item: newsItemFixture({ title: "Bitcoin rally gains after ETF approval", content: "Adoption surges." }),
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION
    })).toEqual(positive);
  });

  it("returns neutral when no known sentiment term is present", async () => {
    const result = await new LocalLexiconSentimentAnalyzer().analyze({
      item: newsItemFixture({ title: "Bitcoin market update", content: "The report was published today." }),
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION
    });

    expect(result).toMatchObject({ label: "neutral", score: 0 });
  });
});
