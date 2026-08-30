// Both fake analyzers cross the same port, so swapping them is a binding change only.
import { describe, expect, it } from "vitest";
import {
  FakeConstantSentimentAnalyzer,
  FakeLexiconSentimentAnalyzer,
  UnavailableFakeSentimentAnalyzer
} from "./fake-sentiment-analyzer.js";
import { defineSentimentAnalyzerContract } from "./sentiment-analyzer-contract.js";
import { newsItemFixture } from "./news-item-fixture.js";
import { NEWS_SENTIMENT_INPUT_VERSION } from "../domain/sentiment-result.js";

defineSentimentAnalyzerContract("FakeLexiconSentimentAnalyzer", () => ({
  createAvailableAnalyzer: () => new FakeLexiconSentimentAnalyzer(),
  createUnavailableAnalyzer: () => new UnavailableFakeSentimentAnalyzer("fake analyzer is offline")
}));

defineSentimentAnalyzerContract("FakeConstantSentimentAnalyzer", () => ({
  createAvailableAnalyzer: () => new FakeConstantSentimentAnalyzer(),
  createUnavailableAnalyzer: () => new UnavailableFakeSentimentAnalyzer("fake analyzer is offline")
}));

describe("fake sentiment analyzers", () => {
  it("disagree on the same input, so a swap is observable", async () => {
    const input = {
      item: newsItemFixture({ title: "Adoption surges as gains lift the market" }),
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION
    };

    const lexicon = await new FakeLexiconSentimentAnalyzer().analyze(input);
    const constant = await new FakeConstantSentimentAnalyzer().analyze(input);

    expect(lexicon.label).toBe("positive");
    expect(constant.label).toBe("neutral");
    expect(lexicon.model.modelId).not.toBe(constant.model.modelId);
  });
});
