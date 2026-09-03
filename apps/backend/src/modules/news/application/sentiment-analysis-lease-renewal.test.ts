// Normal-path lease-renewal regression: a slow external inference keeps exclusive ownership.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SentimentAnalysisService,
  type SentimentAnalysisLogger
} from "./sentiment-analysis-service.js";
import type {
  ClaimedNewsItem,
  SentimentAnalysisStore
} from "./sentiment-analysis-store.js";
import type { SentimentAnalyzer } from "./sentiment-analyzer.js";
import { newsItemFixture } from "../testing/news-item-fixture.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function analysisOutput() {
  return {
    label: "positive" as const,
    score: 0.75,
    model: {
      modelId: "fake-lexicon",
      modelArtifactId: "sha256:9f2c1a7b4e6d0c85",
      modelVersion: "1.0.0",
      inputVersion: "news-item.v1",
      preprocessingVersion: "lowercase-word.v1"
    }
  };
}

const logger: SentimentAnalysisLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function claim(analyzerId: string, expiresAt: number): ClaimedNewsItem {
  return {
    item: newsItemFixture({ url: "https://www.coindesk.com/fixture/slow-inference" }),
    attempt: 1,
    analyzerId,
    leaseExpiresAt: new Date(expiresAt).toISOString()
  };
}

describe("SentimentAnalysisService lease renewal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a slow inference exclusively claimed beyond its original lease, so a second stage makes no external call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    const firstClaim = claim("analyzer-a", Date.now() + 100);
    const slowResult = deferred<ReturnType<typeof analysisOutput>>();
    let activeClaim: ClaimedNewsItem | undefined;
    const committed: ClaimedNewsItem[] = [];
    const store: SentimentAnalysisStore = {
      claimPendingItems: vi.fn(async (analyzerId) => {
        if (activeClaim === undefined && analyzerId === "analyzer-a") {
          activeClaim = firstClaim;
          return [firstClaim];
        }
        if (
          activeClaim !== undefined &&
          Date.parse(activeClaim.leaseExpiresAt) <= Date.now() &&
          analyzerId === "analyzer-b"
        ) {
          const reclaimed = { ...activeClaim, analyzerId, attempt: 2 };
          activeClaim = reclaimed;
          return [reclaimed];
        }
        return [];
      }),
      renewLease: vi.fn(async (active) => {
        const renewed = { ...active, leaseExpiresAt: new Date(Date.now() + 100).toISOString() };
        activeClaim = renewed;
        return renewed;
      }),
      commitResult: vi.fn(async (active) => { committed.push(active); }),
      recordFailure: vi.fn(async () => undefined)
    };
    const firstAnalyzer: SentimentAnalyzer = { analyze: vi.fn(async () => slowResult.promise) };
    const secondAnalyzer: SentimentAnalyzer = { analyze: vi.fn(async () => analysisOutput()) };
    const first = new SentimentAnalysisService(firstAnalyzer, store, { maxAttempts: 3, batchSize: 1 }, "analyzer-a", logger);
    const second = new SentimentAnalysisService(secondAnalyzer, store, { maxAttempts: 3, batchSize: 1 }, "analyzer-b", logger);

    const firstRun = first.analyzeNextBatch();
    await vi.advanceTimersByTimeAsync(250);
    const secondRun = await second.analyzeNextBatch();

    expect(store.renewLease).toHaveBeenCalled();
    expect(secondRun.claimedCount).toBe(0);
    expect(secondAnalyzer.analyze).not.toHaveBeenCalled();

    slowResult.resolve(analysisOutput());
    await expect(firstRun).resolves.toMatchObject({ analyzedCount: 1, lostClaimCount: 0 });
    expect(committed).toEqual([firstClaim]);
  });

  it("does not commit or record a result after renewal reports that ownership was lost", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    const activeClaim = claim("analyzer-a", Date.now() + 100);
    const slowResult = deferred<ReturnType<typeof analysisOutput>>();
    const store: SentimentAnalysisStore = {
      claimPendingItems: vi.fn(async () => [activeClaim]),
      renewLease: vi.fn(async () => undefined),
      commitResult: vi.fn(),
      recordFailure: vi.fn()
    };
    const analyzer: SentimentAnalyzer = { analyze: vi.fn(async () => slowResult.promise) };
    const stage = new SentimentAnalysisService(analyzer, store, { maxAttempts: 3, batchSize: 1 }, "analyzer-a", logger);

    const run = stage.analyzeNextBatch();
    await vi.advanceTimersByTimeAsync(50);
    slowResult.resolve(analysisOutput());

    await expect(run).resolves.toMatchObject({ analyzedCount: 0, lostClaimCount: 1 });
    expect(store.commitResult).not.toHaveBeenCalled();
    expect(store.recordFailure).not.toHaveBeenCalled();
  });
});
