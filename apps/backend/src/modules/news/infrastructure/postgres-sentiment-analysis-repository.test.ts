// PostgreSQL integration tests for News-owned claiming, results, and attempt history.

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../platform/test-database.js";
import {
  NEWS_SENTIMENT_INPUT_VERSION,
  SENTIMENT_RESULT_SCHEMA_VERSION,
  type SentimentResult
} from "../domain/sentiment-result.js";
import { newsItemFixture } from "../testing/news-item-fixture.js";
import { PostgresNewsCollectionRepository } from "./postgres-news-collection-repository.js";
import { PostgresSentimentAnalysisRepository } from "./postgres-sentiment-analysis-repository.js";
import type { ClaimedNewsItem } from "../application/sentiment-analysis-store.js";

const ANALYZED_AT = Date.UTC(2026, 7, 30, 3, 0, 0);

function resultFor(claim: ClaimedNewsItem): SentimentResult {
  return {
    schemaVersion: SENTIMENT_RESULT_SCHEMA_VERSION,
    newsItemId: claim.item.id,
    label: "positive",
    score: 0.5,
    model: {
      modelId: "fake-lexicon",
      modelArtifactId: "sha256:9f2c1a7b4e6d0c85",
      modelVersion: "1.0.0",
      inputVersion: NEWS_SENTIMENT_INPUT_VERSION,
      preprocessingVersion: "lowercase-word.v1"
    },
    analyzedAt: ANALYZED_AT,
    status: "succeeded"
  };
}

describe("PostgresSentimentAnalysisRepository", () => {
  let pool: Pool;
  let collection: PostgresNewsCollectionRepository;
  let analysis: PostgresSentimentAnalysisRepository;

  beforeAll(async () => {
    pool = await resetTestDatabase();
    collection = new PostgresNewsCollectionRepository(pool);
    analysis = new PostgresSentimentAnalysisRepository(pool, { leaseSeconds: 30 });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE news.sentiment_results, news.sentiment_analysis_attempts, news.items, news.source_health CASCADE"
    );
    await collection.storeCollectedBatch({
      items: [
        newsItemFixture({ url: "https://www.coindesk.com/fixture/first" }),
        newsItemFixture({ url: "https://www.coindesk.com/fixture/second" })
      ],
      health: { provider: "coindesk-rss", status: "healthy", checkedAt: ANALYZED_AT }
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("claims pending items under a lease and opens one attempt each", async () => {
    const claims = await analysis.claimPendingItems("analyzer-a", 10);

    const rows = await pool.query<{ analysis_state: string; analysis_claimed_by: string }>(
      "SELECT analysis_state, analysis_claimed_by FROM news.items"
    );
    const attempts = await pool.query<{ attempt_number: number; outcome: string | null }>(
      "SELECT attempt_number, outcome FROM news.sentiment_analysis_attempts"
    );

    expect(claims).toHaveLength(2);
    expect(claims.every((claim) => claim.attempt === 1)).toBe(true);
    expect(rows.rows.every((row) => row.analysis_state === "analyzing")).toBe(true);
    expect(rows.rows.every((row) => row.analysis_claimed_by === "analyzer-a")).toBe(true);
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows.every((row) => row.outcome === null)).toBe(true);
  });

  it("commits a result and the analyzed transition together", async () => {
    const [claim] = await analysis.claimPendingItems("analyzer-a", 1);
    if (claim === undefined) throw new Error("expected one claim");

    await analysis.commitResult(claim, resultFor(claim));

    const item = await pool.query<{
      analysis_state: string;
      analysis_lease_expires_at: Date | null;
    }>(
      "SELECT analysis_state, analysis_lease_expires_at FROM news.items WHERE id = $1",
      [claim.item.id]
    );
    const result = await pool.query(
      "SELECT * FROM news.sentiment_results WHERE news_item_id = $1",
      [claim.item.id]
    );
    const attempt = await pool.query<{ outcome: string }>(
      "SELECT outcome FROM news.sentiment_analysis_attempts WHERE news_item_id = $1",
      [claim.item.id]
    );

    expect(item.rows[0]).toEqual({ analysis_state: "analyzed", analysis_lease_expires_at: null });
    expect(result.rows[0]).toMatchObject({
      schema_version: SENTIMENT_RESULT_SCHEMA_VERSION,
      label: "positive",
      model_id: "fake-lexicon",
      model_artifact_id: "sha256:9f2c1a7b4e6d0c85",
      model_version: "1.0.0",
      input_version: NEWS_SENTIMENT_INPUT_VERSION,
      preprocessing_version: "lowercase-word.v1",
      status: "succeeded"
    });
    expect(attempt.rows[0]?.outcome).toBe("succeeded");
  });

  it("rolls the whole commit back when the result cannot be stored", async () => {
    const [claim] = await analysis.claimPendingItems("analyzer-a", 1);
    if (claim === undefined) throw new Error("expected one claim");
    await pool.query(
      `INSERT INTO news.sentiment_results
         (news_item_id, schema_version, label, score, model_id, model_artifact_id,
          model_version, input_version, preprocessing_version, analyzed_at, status)
       VALUES ($1, $2, 'neutral', 0, 'other-fake', 'sha256:aa', '9.9.9', $3, 'identity.v1', $4, 'succeeded')`,
      [claim.item.id, SENTIMENT_RESULT_SCHEMA_VERSION, NEWS_SENTIMENT_INPUT_VERSION, ANALYZED_AT]
    );

    await expect(analysis.commitResult(claim, resultFor(claim))).rejects.toThrow();

    const item = await pool.query<{ analysis_state: string }>(
      "SELECT analysis_state FROM news.items WHERE id = $1",
      [claim.item.id]
    );
    const results = await pool.query<{ model_id: string }>(
      "SELECT model_id FROM news.sentiment_results WHERE news_item_id = $1",
      [claim.item.id]
    );

    expect(item.rows[0]?.analysis_state).toBe("analyzing");
    expect(results.rows).toEqual([{ model_id: "other-fake" }]);
  });

  it("records a durable failed attempt and leaves the item intact and retryable", async () => {
    const [claim] = await analysis.claimPendingItems("analyzer-a", 1);
    if (claim === undefined) throw new Error("expected one claim");

    await analysis.recordFailure(claim, {
      reason: "ANALYZER_UNAVAILABLE: offline",
      nextState: "pending"
    });

    const item = await pool.query<{
      analysis_state: string;
      title: string;
      content: string;
      analysis_failure_reason: string;
      analysis_claimed_by: string | null;
    }>(
      `SELECT analysis_state, title, content, analysis_failure_reason, analysis_claimed_by
       FROM news.items WHERE id = $1`,
      [claim.item.id]
    );
    const attempt = await pool.query<{ outcome: string; failure_reason: string }>(
      "SELECT outcome, failure_reason FROM news.sentiment_analysis_attempts WHERE news_item_id = $1",
      [claim.item.id]
    );

    expect(item.rows[0]).toEqual({
      analysis_state: "pending",
      title: claim.item.title,
      content: claim.item.content,
      analysis_failure_reason: "ANALYZER_UNAVAILABLE: offline",
      analysis_claimed_by: null
    });
    expect(attempt.rows[0]).toEqual({
      outcome: "failed",
      failure_reason: "ANALYZER_UNAVAILABLE: offline"
    });
    await expect(analysis.claimPendingItems("analyzer-a", 1)).resolves.toHaveLength(1);
  });

  it("records a degraded state that is no longer claimable", async () => {
    const [claim] = await analysis.claimPendingItems("analyzer-a", 1);
    if (claim === undefined) throw new Error("expected one claim");

    await analysis.recordFailure(claim, { reason: "retries exhausted", nextState: "degraded" });

    const claimable = await analysis.claimPendingItems("analyzer-a", 10);
    const item = await pool.query<{ analysis_state: string }>(
      "SELECT analysis_state FROM news.items WHERE id = $1",
      [claim.item.id]
    );

    expect(item.rows[0]?.analysis_state).toBe("degraded");
    expect(claimable.map((next) => next.item.id)).not.toContain(claim.item.id);
  });

  it("refuses to finish a claim that another analyzer has taken over", async () => {
    const expiring = new PostgresSentimentAnalysisRepository(pool, { leaseSeconds: 0 });
    const [stale] = await expiring.claimPendingItems("analyzer-dead", 1);
    if (stale === undefined) throw new Error("expected one claim");
    const [fresh] = await expiring.claimPendingItems("analyzer-b", 1);
    if (fresh === undefined) throw new Error("expected a reclaim");

    await expect(analysis.commitResult(stale, resultFor(stale))).rejects.toThrow(
      /NEWS_ANALYSIS_CLAIM_LOST/u
    );
    expect(fresh.item.id).toBe(stale.item.id);
    expect(fresh.attempt).toBe(2);
  });
});
