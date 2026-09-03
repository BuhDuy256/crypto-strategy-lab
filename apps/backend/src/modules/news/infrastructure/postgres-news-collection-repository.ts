// PostgreSQL adapter that commits one News collection batch and its health atomically.

import type { Pool, PoolClient } from "pg";
import type {
  CollectedNewsBatch,
  NewsCollectionStore,
  StoredNewsBatch
} from "../application/news-collection-store.js";
import type { NewsProviderHealth } from "../application/news-provider.js";
import type { NewsItem } from "../domain/news-item.js";

/** News-owned database adapter. Other modules access News only through exported ports. */
export class PostgresNewsCollectionRepository implements NewsCollectionStore {
  constructor(private readonly pool: Pool) {}

  async storeCollectedBatch(batch: CollectedNewsBatch): Promise<StoredNewsBatch> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let storedCount = 0;
      for (const item of batch.items) {
        if (await this.insertItem(client, item)) {
          storedCount += 1;
        }
      }
      await this.upsertHealth(client, batch.health);
      await client.query("COMMIT");
      return { storedCount, skippedCount: batch.items.length - storedCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertItem(client: PoolClient, item: NewsItem): Promise<boolean> {
    const result = await client.query(
      `
        INSERT INTO news.items (
          id, title, content, source, published_at, collected_at, related_coins, url, analysis_state
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `,
      [
        item.id,
        item.title,
        item.content,
        item.source,
        item.publishedAt,
        item.collectedAt,
        JSON.stringify(item.relatedCoins),
        item.url,
        item.analysisState
      ]
    );
    return result.rowCount === 1;
  }

  private async upsertHealth(client: PoolClient, health: NewsProviderHealth): Promise<void> {
    await client.query(
      `
        INSERT INTO news.source_health (provider, status, reason, changed_at, checked_at)
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (provider) DO UPDATE SET
          status = EXCLUDED.status,
          reason = EXCLUDED.reason,
          changed_at = CASE
            WHEN news.source_health.status IS DISTINCT FROM EXCLUDED.status
              OR news.source_health.reason IS DISTINCT FROM EXCLUDED.reason
            THEN EXCLUDED.changed_at
            ELSE news.source_health.changed_at
          END,
          checked_at = EXCLUDED.checked_at
      `,
      [health.provider, health.status, health.reason ?? null, health.checkedAt]
    );
  }
}
