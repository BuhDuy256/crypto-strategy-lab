// End-to-end inference lifecycle over real durable state, using fake analyzers only.
//
// Covers success, failure, bounded retry exhaustion, lease recovery, concurrent
// claiming, and analyzer substitutability. No real model is involved anywhere.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import {
  SentimentAnalysisService,
  type SentimentAnalysisPolicy
} from "../application/sentiment-analysis-service.js";
import type { SentimentAnalyzer } from "../application/sentiment-analyzer.js";
import {
  FakeConstantSentimentAnalyzer,
  FakeLexiconSentimentAnalyzer,
  UnavailableFakeSentimentAnalyzer
} from "../testing/fake-sentiment-analyzer.js";
import { newsItemFixture } from "../testing/news-item-fixture.js";
import { PostgresNewsCollectionRepository } from "./postgres-news-collection-repository.js";
import { PostgresSentimentAnalysisRepository } from "./postgres-sentiment-analysis-repository.js";

const COLLECTED_AT = Date.UTC(2026, 7, 30, 1, 0, 0);
const silentLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

interface ItemStateRow {
  id: string;
  analysis_state: string;
  analysis_attempt_count: number;
  analysis_failure_reason: string | null;
  title: string;
  content: string;
}

describe("news sentiment inference lifecycle", () => {
  let pool: Pool;
  let collection: PostgresNewsCollectionRepository;

  function store(leaseSeconds: number): PostgresSentimentAnalysisRepository {
    return new PostgresSentimentAnalysisRepository(pool, { leaseSeconds });
  }

  function stage(
    analyzer: SentimentAnalyzer,
    analyzerId: string,
    policy: SentimentAnalysisPolicy,
    leaseSeconds = 30
  ): SentimentAnalysisService {
    return new SentimentAnalysisService(
      analyzer,
      store(leaseSeconds),
      policy,
      analyzerId,
      silentLogger
    );
  }

  async function collect(count: number): Promise<void> {
    await collection.storeCollectedBatch({
      items: Array.from({ length: count }, (_unused, index) =>
        newsItemFixture({
          url: `https://www.coindesk.com/fixture/item-${index}`,
          title: "Adoption surges as gains lift the market"
        })
      ),
      health: { provider: "coindesk-rss", status: "healthy", checkedAt: COLLECTED_AT }
    });
  }

  async function itemStates(): Promise<ItemStateRow[]> {
    const rows = await pool.query<ItemStateRow>(
      `SELECT id, analysis_state, analysis_attempt_count, analysis_failure_reason, title, content
       FROM news.items ORDER BY id`
    );
    return rows.rows;
  }

  beforeAll(async () => {
    pool = await resetTestDatabase();
    collection = new PostgresNewsCollectionRepository(pool);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE news.sentiment_results, news.sentiment_analysis_attempts, news.items, news.source_health CASCADE"
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("commits the full version set and moves a successful item out of pending", async () => {
    await collect(3);

    const run = await stage(new FakeLexiconSentimentAnalyzer(), "analyzer-a", {
      maxAttempts: 3,
      batchSize: 10
    }).analyzeNextBatch();

    const results = await pool.query(
      `SELECT model_id, model_artifact_id, model_version, input_version, preprocessing_version,
              label, score, status, schema_version
       FROM news.sentiment_results`
    );

    expect(run).toMatchObject({ claimedCount: 3, analyzedCount: 3, degradedCount: 0 });
    expect((await itemStates()).every((row) => row.analysis_state === "analyzed")).toBe(true);
    expect(results.rows).toHaveLength(3);
    expect(results.rows[0]).toEqual({
      model_id: "fake-lexicon",
      model_artifact_id: "sha256:9f2c1a7b4e6d0c85",
      model_version: "1.0.0",
      input_version: "news-item.v1",
      preprocessing_version: "lowercase-word.v1",
      label: "positive",
      score: 1,
      status: "succeeded",
      schema_version: 1
    });
  });

  it("records a failure reason and leaves the item retryable while attempts remain", async () => {
    await collect(1);
    const failing = stage(new UnavailableFakeSentimentAnalyzer("model host is down"), "analyzer-a", {
      maxAttempts: 3,
      batchSize: 10
    });

    const run = await failing.analyzeNextBatch();

    const attempts = await pool.query<{ outcome: string; failure_reason: string }>(
      "SELECT outcome, failure_reason FROM news.sentiment_analysis_attempts"
    );
    const [item] = await itemStates();

    expect(run).toMatchObject({ retryableFailureCount: 1, degradedCount: 0, analyzedCount: 0 });
    expect(item?.analysis_state).toBe("pending");
    expect(item?.analysis_attempt_count).toBe(1);
    expect(item?.title).toBe("Adoption surges as gains lift the market");
    expect(attempts.rows).toEqual([
      { outcome: "failed", failure_reason: "ANALYZER_UNAVAILABLE: model host is down" }
    ]);
  });

  it("leaves a visible degraded state when the bounded retries are exhausted", async () => {
    await collect(1);
    const failing = stage(new UnavailableFakeSentimentAnalyzer("model host is down"), "analyzer-a", {
      maxAttempts: 2,
      batchSize: 10
    });

    const first = await failing.analyzeNextBatch();
    const second = await failing.analyzeNextBatch();
    const third = await failing.analyzeNextBatch();

    const attempts = await pool.query<{ attempt_number: number; outcome: string }>(
      "SELECT attempt_number, outcome FROM news.sentiment_analysis_attempts ORDER BY attempt_number"
    );
    const [item] = await itemStates();

    expect(first.retryableFailureCount).toBe(1);
    expect(second.degradedCount).toBe(1);
    expect(third.claimedCount).toBe(0);
    expect(item?.analysis_state).toBe("degraded");
    expect(item?.analysis_failure_reason).toBe("ANALYZER_UNAVAILABLE: model host is down");
    expect(attempts.rows).toEqual([
      { attempt_number: 1, outcome: "failed" },
      { attempt_number: 2, outcome: "failed" }
    ]);
    await expect(
      pool.query("SELECT 1 FROM news.sentiment_results")
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it("lets another stage reclaim an abandoned lease without duplicating a result", async () => {
    await collect(1);
    const abandoned = await store(0).claimPendingItems("analyzer-dead", 1);

    const recovery = await stage(new FakeLexiconSentimentAnalyzer(), "analyzer-b", {
      maxAttempts: 3,
      batchSize: 10
    }).analyzeNextBatch();

    const attempts = await pool.query<{ attempt_number: number; outcome: string }>(
      "SELECT attempt_number, outcome FROM news.sentiment_analysis_attempts ORDER BY attempt_number"
    );
    const results = await pool.query("SELECT news_item_id FROM news.sentiment_results");

    expect(abandoned).toHaveLength(1);
    expect(recovery).toMatchObject({ claimedCount: 1, analyzedCount: 1 });
    expect(attempts.rows).toEqual([
      { attempt_number: 1, outcome: "lease_expired" },
      { attempt_number: 2, outcome: "succeeded" }
    ]);
    expect(results.rows).toHaveLength(1);
  });

  it("never analyzes the same item twice when two stages run concurrently", async () => {
    await collect(12);
    const policy = { maxAttempts: 3, batchSize: 12 };

    const [runA, runB] = await Promise.all([
      stage(new FakeLexiconSentimentAnalyzer(), "analyzer-a", policy).analyzeNextBatch(),
      stage(new FakeLexiconSentimentAnalyzer(), "analyzer-b", policy).analyzeNextBatch()
    ]);

    const attempts = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM news.sentiment_analysis_attempts"
    );
    const perItem = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM news.sentiment_analysis_attempts
       GROUP BY news_item_id HAVING count(*) > 1`
    );
    const results = await pool.query("SELECT news_item_id FROM news.sentiment_results");

    expect(runA.claimedCount + runB.claimedCount).toBe(12);
    expect(runA.analyzedCount + runB.analyzedCount).toBe(12);
    expect(attempts.rows[0]?.count).toBe("12");
    expect(perItem.rows).toEqual([]);
    expect(results.rows).toHaveLength(12);
    expect((await itemStates()).every((row) => row.analysis_state === "analyzed")).toBe(true);
  });

  it("changes only the analyzer binding to swap in a different fake", async () => {
    const policy = { maxAttempts: 3, batchSize: 10 };
    await collect(1);
    await stage(new FakeLexiconSentimentAnalyzer(), "analyzer-a", policy).analyzeNextBatch();
    const withLexicon = await pool.query<{ model_id: string; label: string }>(
      "SELECT model_id, label FROM news.sentiment_results"
    );

    await pool.query(
      "TRUNCATE news.sentiment_results, news.sentiment_analysis_attempts, news.items, news.source_health CASCADE"
    );
    await collect(1);
    // Only the constructor argument differs; the stage, store, and contract are identical.
    await stage(new FakeConstantSentimentAnalyzer(), "analyzer-a", policy).analyzeNextBatch();
    const withConstant = await pool.query<{ model_id: string; label: string }>(
      "SELECT model_id, label FROM news.sentiment_results"
    );

    expect(withLexicon.rows[0]).toEqual({ model_id: "fake-lexicon", label: "positive" });
    expect(withConstant.rows[0]).toEqual({ model_id: "fake-constant", label: "neutral" });
  });
});
