// Proves a different fake analyzer is a News worker composition change only.

import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import {
  NewsWorkerModule,
  SENTIMENT_ANALYZER
} from "./news-worker.module.js";
import type { SentimentAnalyzer } from "./application/sentiment-analyzer.js";
import { OpenAiResponsesSentimentAnalyzer } from "./infrastructure/openai-responses-sentiment-analyzer.js";
import { FakeConstantSentimentAnalyzer } from "./testing/fake-sentiment-analyzer.js";

describe("NewsWorkerModule analyzer binding", () => {
  it("binds the OpenAI adapter through only the analyzer token", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NewsWorkerModule]
    }).compile();
    try {
      expect(moduleRef.get<SentimentAnalyzer>(SENTIMENT_ANALYZER))
        .toBeInstanceOf(OpenAiResponsesSentimentAnalyzer);
    } finally {
      await moduleRef.close();
    }
  });

  it("binds the second fake through only the analyzer token", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NewsWorkerModule]
    })
      .overrideProvider(SENTIMENT_ANALYZER)
      .useValue(new FakeConstantSentimentAnalyzer())
      .compile();
    try {
      expect(moduleRef.get<SentimentAnalyzer>(SENTIMENT_ANALYZER))
        .toBeInstanceOf(FakeConstantSentimentAnalyzer);
    } finally {
      await moduleRef.close();
    }
  });
});
