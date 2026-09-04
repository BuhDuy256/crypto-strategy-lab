// Proves the collection-only process graph has no sentiment-analysis dependency.

import { readFileSync } from "node:fs";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import {
  NewsCollectionWorkerModule,
  NewsCollectionWorkerRuntime
} from "./news-collection-worker.module.js";
import { SentimentAnalysisService } from "./application/sentiment-analysis-service.js";
import { SENTIMENT_ANALYZER } from "./news-worker.module.js";

describe("NewsCollectionWorkerModule", () => {
  it("provides manual collection without registering analyzer dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NewsCollectionWorkerModule]
    }).compile();
    try {
      expect(moduleRef.get(NewsCollectionWorkerRuntime)).toBeInstanceOf(NewsCollectionWorkerRuntime);
      expect(() => moduleRef.get(SENTIMENT_ANALYZER, { strict: false })).toThrow();
      expect(() => moduleRef.get(SentimentAnalysisService, { strict: false })).toThrow();
    } finally {
      await moduleRef.close();
    }
  });

  it("routes --once to a source graph with no analyzer implementation", () => {
    const entry = readFileSync(new URL("../../main.news-worker.ts", import.meta.url), "utf8");
    const collectionModule = readFileSync(
      new URL("./news-collection-worker.module.ts", import.meta.url),
      "utf8"
    );

    expect(entry).toContain("collectionOnly ? NewsCollectionWorkerModule : NewsWorkerModule");
    expect(collectionModule).not.toMatch(
      new RegExp(
        [
          "SENTIMENT_ANALYZER",
          "SentimentAnalysis(?:Scheduler|Service)",
          "OpenAiResponsesSentimentAnalyzer",
          "createOpenAiResponsesClient"
        ].join("|"),
        "u"
      )
    );
  });
});
