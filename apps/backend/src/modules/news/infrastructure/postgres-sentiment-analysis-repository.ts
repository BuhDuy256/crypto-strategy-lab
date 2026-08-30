// PostgreSQL adapter for the News inference lifecycle, reusing the EXP-04 lease pattern.
//
// Claiming is a single `FOR UPDATE SKIP LOCKED` statement, so two analyzer stages
// never take the same item, and an abandoned lease becomes claimable again once it
// expires. Every finishing operation is one transaction that moves the item and
// closes its attempt together.

import type { Pool, PoolClient } from "pg";
import type {
  ClaimedNewsItem,
  SentimentAnalysisFailure,
  SentimentAnalysisStore
} from "../application/sentiment-analysis-store.js";
import type { NewsAnalysisState, NewsItem } from "../domain/news-item.js";
import type { SentimentResult } from "../domain/sentiment-result.js";

export interface SentimentAnalysisLeaseOptions {
  readonly leaseSeconds: number;
}

interface ItemRow {
  id: string;
  title: string;
  content: string;
  source: string;
  published_at: string;
  collected_at: string;
  related_coins: string[];
  url: string;
  analysis_state: NewsAnalysisState;
}

interface ClaimRow extends ItemRow {
  attempt_number: number;
  attempt_lease_expires_at: Date;
}

function mapItem(row: ItemRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    source: row.source,
    publishedAt: Number(row.published_at),
    collectedAt: Number(row.collected_at),
    relatedCoins: row.related_coins,
    url: row.url,
    analysisState: row.analysis_state
  };
}

/** News-owned database adapter. No other module reads or writes the `news` schema. */
export class PostgresSentimentAnalysisRepository implements SentimentAnalysisStore {
  private readonly leaseSeconds: number;

  constructor(private readonly pool: Pool, options: SentimentAnalysisLeaseOptions) {
    this.leaseSeconds = options.leaseSeconds;
  }

  async claimPendingItems(
    analyzerId: string,
    batchSize: number
  ): Promise<readonly ClaimedNewsItem[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<ClaimRow>(
        `
          WITH candidate AS (
            SELECT id FROM news.items
            WHERE analysis_state = 'pending'
               OR (analysis_state = 'analyzing' AND analysis_lease_expires_at <= now())
            ORDER BY collected_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          ), updated AS (
            UPDATE news.items i
            SET analysis_state = 'analyzing',
                analysis_claimed_by = $1,
                analysis_attempt_count = i.analysis_attempt_count + 1,
                analysis_lease_expires_at = now() + ($3 * interval '1 second')
            FROM candidate c WHERE i.id = c.id
            RETURNING i.id, i.title, i.content, i.source, i.published_at, i.collected_at,
                      i.related_coins, i.url, i.analysis_state, i.analysis_attempt_count,
                      i.analysis_lease_expires_at
          ), attempt AS (
            INSERT INTO news.sentiment_analysis_attempts
              (news_item_id, attempt_number, analyzer_id, claimed_at, lease_expires_at)
            SELECT u.id, u.analysis_attempt_count, $1, now(), u.analysis_lease_expires_at
            FROM updated u
            RETURNING news_item_id, attempt_number, lease_expires_at
          )
          SELECT u.id, u.title, u.content, u.source, u.published_at, u.collected_at,
                 u.related_coins, u.url, u.analysis_state,
                 a.attempt_number, a.lease_expires_at AS attempt_lease_expires_at
          FROM updated u JOIN attempt a ON a.news_item_id = u.id
        `,
        [analyzerId, batchSize, this.leaseSeconds]
      );
      // An earlier stage that died still has an open attempt row; close it as expired
      // so attempt history stays a truthful record of what happened.
      for (const row of claimed.rows) {
        if (row.attempt_number > 1) {
          await client.query(
            `UPDATE news.sentiment_analysis_attempts
             SET completed_at = now(), outcome = 'lease_expired',
                 failure_reason = 'NEWS_ANALYSIS_LEASE_EXPIRED'
             WHERE news_item_id = $1 AND attempt_number < $2 AND completed_at IS NULL`,
            [row.id, row.attempt_number]
          );
        }
      }
      await client.query("COMMIT");
      return claimed.rows.map((row) => ({
        item: mapItem(row),
        attempt: row.attempt_number,
        analyzerId,
        leaseExpiresAt: row.attempt_lease_expires_at.toISOString()
      }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async commitResult(claim: ClaimedNewsItem, result: SentimentResult): Promise<void> {
    await this.finishClaim(claim, "analyzed", null, async (client) => {
      await client.query(
        `
          INSERT INTO news.sentiment_results (
            news_item_id, schema_version, label, score, model_id, model_artifact_id,
            model_version, input_version, preprocessing_version, analyzed_at, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          result.newsItemId,
          result.schemaVersion,
          result.label,
          result.score,
          result.model.modelId,
          result.model.modelArtifactId,
          result.model.modelVersion,
          result.model.inputVersion,
          result.model.preprocessingVersion,
          result.analyzedAt,
          result.status
        ]
      );
      await client.query(
        `UPDATE news.sentiment_analysis_attempts
         SET completed_at = now(), outcome = 'succeeded'
         WHERE news_item_id = $1 AND attempt_number = $2`,
        [claim.item.id, claim.attempt]
      );
    });
  }

  async recordFailure(
    claim: ClaimedNewsItem,
    failure: SentimentAnalysisFailure
  ): Promise<void> {
    await this.finishClaim(claim, failure.nextState, failure.reason, async (client) => {
      await client.query(
        `UPDATE news.sentiment_analysis_attempts
         SET completed_at = now(), outcome = 'failed', failure_reason = $3
         WHERE news_item_id = $1 AND attempt_number = $2`,
        [claim.item.id, claim.attempt, failure.reason]
      );
    });
  }

  /**
   * Moves a claimed item to its next state and runs the caller's work in the same
   * transaction. The state change applies only while this claim is still the newest
   * open attempt, so a stage whose lease was taken over cannot write anything.
   */
  private async finishClaim(
    claim: ClaimedNewsItem,
    nextState: Exclude<NewsAnalysisState, "analyzing">,
    failureReason: string | null,
    work: (client: PoolClient) => Promise<void>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `
          UPDATE news.items SET
            analysis_state = $4,
            analysis_failure_reason = $5,
            analysis_claimed_by = NULL,
            analysis_lease_expires_at = NULL
          WHERE id = $1 AND analysis_state = 'analyzing' AND analysis_claimed_by = $3
            AND EXISTS (
              SELECT 1 FROM news.sentiment_analysis_attempts
              WHERE news_item_id = $1 AND attempt_number = $2 AND analyzer_id = $3
                AND completed_at IS NULL
                AND attempt_number = (
                  SELECT max(newest.attempt_number) FROM news.sentiment_analysis_attempts newest
                  WHERE newest.news_item_id = $1
                )
            )
        `,
        [claim.item.id, claim.attempt, claim.analyzerId, nextState, failureReason]
      );
      if (updated.rowCount !== 1) {
        throw new Error(
          `NEWS_ANALYSIS_CLAIM_LOST: ${claim.item.id} attempt ${claim.attempt}`
        );
      }
      await work(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
