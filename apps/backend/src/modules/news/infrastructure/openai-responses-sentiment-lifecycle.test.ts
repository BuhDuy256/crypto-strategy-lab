// Lifecycle tests for adapter availability and persisted result provenance seams.

import { describe, expect, it } from "vitest";
import {
  SentimentAnalysisService,
  type SentimentAnalysisLogger
} from "../application/sentiment-analysis-service.js";
import type {
  ClaimedNewsItem,
  SentimentAnalysisFailure,
  SentimentAnalysisStore
} from "../application/sentiment-analysis-store.js";
import type { SentimentResult } from "../domain/sentiment-result.js";
import { NEWS_SENTIMENT_INPUT_VERSION } from "../domain/sentiment-result.js";
import { newsItemFixture } from "../testing/news-item-fixture.js";
import {
  OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
  OpenAiResponsesSentimentAnalyzer,
  type OpenAiResponsesClient
} from "./openai-responses-sentiment-analyzer.js";

class RecordingStore implements SentimentAnalysisStore {
  readonly committed: SentimentResult[] = [];
  readonly failures: Array<{ claim: ClaimedNewsItem; failure: SentimentAnalysisFailure }> = [];

  constructor(private readonly claims: readonly ClaimedNewsItem[]) {}

  async claimPendingItems(): Promise<readonly ClaimedNewsItem[]> {
    return this.claims;
  }

  async renewLease(claim: ClaimedNewsItem): Promise<ClaimedNewsItem | undefined> {
    return claim;
  }

  async commitResult(_claim: ClaimedNewsItem, result: SentimentResult): Promise<void> {
    this.committed.push(result);
  }

  async recordFailure(claim: ClaimedNewsItem, failure: SentimentAnalysisFailure): Promise<void> {
    this.failures.push({ claim, failure });
  }
}

const logger: SentimentAnalysisLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function claim(): ClaimedNewsItem {
  return {
    item: newsItemFixture(),
    attempt: 1,
    analyzerId: "news-worker-test",
    leaseExpiresAt: "2026-08-30T03:00:00.000Z"
  };
}

function stage(analyzer: OpenAiResponsesSentimentAnalyzer, store: RecordingStore) {
  return new SentimentAnalysisService(
    analyzer,
    store,
    { maxAttempts: 3, batchSize: 1 },
    "news-worker-test",
    logger,
    () => Date.UTC(2026, 7, 30, 2, 0, 0)
  );
}

describe("OpenAI adapter lifecycle", () => {
  it("records missing credential as a retryable durable-stage failure without losing the item", async () => {
    const claimed = claim();
    const store = new RecordingStore([claimed]);

    const run = await stage(new OpenAiResponsesSentimentAnalyzer(undefined), store).analyzeNextBatch();

    expect(run).toMatchObject({
      claimedCount: 1,
      analyzedCount: 0,
      retryableFailureCount: 1,
      degradedCount: 0
    });
    expect(store.committed).toEqual([]);
    expect(store.failures).toEqual([
      {
        claim: claimed,
        failure: {
          nextState: "pending",
          reason: "ANALYZER_UNAVAILABLE: OpenAI credential is missing"
        }
      }
    ]);
  });

  it("passes the full existing provenance set to the durable-store seam", async () => {
    const client: OpenAiResponsesClient = {
      async create() {
        return {
          status: "completed",
          model: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
          outputText: '{"label":"positive","score":0.91}'
        };
      }
    };
    const claimed = claim();
    const store = new RecordingStore([claimed]);

    await stage(new OpenAiResponsesSentimentAnalyzer(client), store).analyzeNextBatch();

    expect(store.committed).toEqual([
      expect.objectContaining({
        newsItemId: claimed.item.id,
        label: "positive",
        score: 0.91,
        model: {
          modelId: "openai-responses",
          modelArtifactId: "openai://responses/gpt-4.1-mini-2025-04-14",
          modelVersion: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
          inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
          preprocessingVersion: "news-sentiment-input-v1"
        },
        status: "succeeded"
      })
    ]);
  });
});
