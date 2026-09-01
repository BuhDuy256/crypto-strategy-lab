// PostgreSQL adapter for the News inference lifecycle, reusing the EXP-04 lease pattern.
//
// A claim uses `FOR UPDATE SKIP LOCKED` plus a session advisory lock. The row lock
// makes claims atomic and the session lock fences a live external inference without
// holding a transaction open. A disconnected worker releases the session lock, so a
// later stage can recover the expired lease. Every finishing operation is one
// transaction that moves the item and closes its attempt together.

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

interface HeldExecutionLock {
  readonly client: PoolClient;
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
  /**
   * A session advisory lock fences a live external inference without holding a
   * transaction open. The lock dies with its database session on process loss.
   */
  private readonly executionLocks = new Map<string, HeldExecutionLock>();

  constructor(private readonly pool: Pool, options: SentimentAnalysisLeaseOptions) {
    this.leaseSeconds = options.leaseSeconds;
  }

  async claimPendingItems(
    analyzerId: string,
    batchSize: number
  ): Promise<readonly ClaimedNewsItem[]> {
    const client = await this.pool.connect();
    const acquiredLockIds: string[] = [];
    const claimedRows: ClaimRow[] = [];
    let retained = false;
    try {
      await client.query("BEGIN");
      const candidates = await client.query<ItemRow>(
        `
          SELECT id, title, content, source, published_at, collected_at, related_coins, url, analysis_state
          FROM news.items
          WHERE analysis_state = 'pending'
             OR (analysis_state = 'analyzing' AND analysis_lease_expires_at <= now())
          ORDER BY collected_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        `,
        [batchSize]
      );
      for (const candidate of candidates.rows) {
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
          [candidate.id]
        );
        if (lock.rows[0]?.acquired !== true) continue;
        acquiredLockIds.push(candidate.id);
        const updated = await client.query<ClaimRow>(
          `
            UPDATE news.items
            SET analysis_state = 'analyzing',
                analysis_claimed_by = $2,
                analysis_attempt_count = analysis_attempt_count + 1,
                analysis_lease_expires_at = now() + ($3 * interval '1 second')
            WHERE id = $1
            RETURNING id, title, content, source, published_at, collected_at, related_coins, url,
                      analysis_state, analysis_attempt_count AS attempt_number,
                      analysis_lease_expires_at AS attempt_lease_expires_at
          `,
          [candidate.id, analyzerId, this.leaseSeconds]
        );
        const row = updated.rows[0];
        if (row === undefined) {
          throw new Error(`NEWS_ANALYSIS_CLAIM: candidate ${candidate.id} disappeared during claim`);
        }
        await client.query(
          `INSERT INTO news.sentiment_analysis_attempts
             (news_item_id, attempt_number, analyzer_id, claimed_at, lease_expires_at)
           VALUES ($1, $2, $3, now(), $4)`,
          [row.id, row.attempt_number, analyzerId, row.attempt_lease_expires_at]
        );
        // An earlier stage that died has no advisory session lock. Closing its
        // attempt on the new durable claim keeps history truthful.
        if (row.attempt_number > 1) {
          await client.query(
            `UPDATE news.sentiment_analysis_attempts
             SET completed_at = now(), outcome = 'lease_expired',
                 failure_reason = 'NEWS_ANALYSIS_LEASE_EXPIRED'
             WHERE news_item_id = $1 AND attempt_number < $2 AND completed_at IS NULL`,
            [row.id, row.attempt_number]
          );
        }
        claimedRows.push(row);
      }
      await client.query("COMMIT");
      for (const row of claimedRows) {
        this.executionLocks.set(this.claimKey(row.id, row.attempt_number, analyzerId), { client });
      }
      retained = claimedRows.length > 0;
      return claimedRows.map((row) => ({
        item: mapItem(row),
        attempt: row.attempt_number,
        analyzerId,
        leaseExpiresAt: row.attempt_lease_expires_at.toISOString()
      }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      if (!retained) {
        for (const itemId of acquiredLockIds) {
          await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [itemId])
            .catch(() => undefined);
        }
        client.release();
      }
    }
  }

  async renewLease(claim: ClaimedNewsItem): Promise<ClaimedNewsItem | undefined> {
    const held = this.executionLocks.get(this.claimKey(claim.item.id, claim.attempt, claim.analyzerId));
    if (held === undefined) return undefined;
    try {
      const renewed = await held.client.query<{ lease_expires_at: Date }>(
        `
          UPDATE news.items SET analysis_lease_expires_at = now() + ($4 * interval '1 second')
          WHERE id = $1
            AND analysis_state = 'analyzing'
            AND analysis_claimed_by = $3
            AND EXISTS (
              SELECT 1 FROM news.sentiment_analysis_attempts
              WHERE news_item_id = $1 AND attempt_number = $2 AND analyzer_id = $3
                AND completed_at IS NULL
                AND attempt_number = (
                  SELECT max(newest.attempt_number) FROM news.sentiment_analysis_attempts newest
                  WHERE newest.news_item_id = $1
                )
              )
          RETURNING analysis_lease_expires_at AS lease_expires_at
        `,
        [claim.item.id, claim.attempt, claim.analyzerId, this.leaseSeconds]
      );
      const row = renewed.rows[0];
      if (row === undefined) {
        await this.releaseExecutionLock(claim);
        return undefined;
      }
      return {
        ...claim,
        leaseExpiresAt: row.lease_expires_at.toISOString()
      };
    } catch (error) {
      await this.releaseExecutionLock(claim);
      throw error;
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

  /** Closes only this adapter's held execution sessions during worker shutdown. */
  async close(): Promise<void> {
    const clients = new Set([...this.executionLocks.values()].map((held) => held.client));
    this.executionLocks.clear();
    for (const client of clients) {
      client.release(true);
    }
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
    const held = this.executionLocks.get(this.claimKey(claim.item.id, claim.attempt, claim.analyzerId));
    if (held === undefined) {
      throw new Error(`NEWS_ANALYSIS_CLAIM_LOST: ${claim.item.id} attempt ${claim.attempt}`);
    }
    const client = held.client;
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
      await this.releaseExecutionLock(claim);
    }
  }

  private claimKey(itemId: string, attempt: number, analyzerId: string): string {
    return `${itemId}|${attempt}|${analyzerId}`;
  }

  private async releaseExecutionLock(claim: ClaimedNewsItem): Promise<void> {
    const key = this.claimKey(claim.item.id, claim.attempt, claim.analyzerId);
    const held = this.executionLocks.get(key);
    if (held === undefined) return;
    this.executionLocks.delete(key);
    let connectionBroken = false;
    try {
      await held.client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [claim.item.id]);
    } catch {
      connectionBroken = true;
    }
    const isStillHeld = [...this.executionLocks.values()].some((entry) => entry.client === held.client);
    if (!isStillHeld) held.client.release(connectionBroken);
  }
}
