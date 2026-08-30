// Proves the analysis-state widening applies to a database that already holds pending rows.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, resetDatabase } from "../../../migrate/migration-runner.js";
import { loadConfig } from "../../../platform/config.js";
import { createDatabasePool } from "../../../platform/database.js";

const WIDENING_MIGRATION = "0017_add_news_sentiment_analysis.sql";
const COLLECTION_MIGRATION = "0016_create_news_collection.sql";

async function applyMigration(pool: Pool, file: string): Promise<void> {
  await pool.query(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
}

async function applyMigrationsThrough(pool: Pool, lastFile: string): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => name <= lastFile);
  for (const file of files) {
    await applyMigration(pool, file);
  }
}

async function insertCollectedItem(pool: Pool, url: string): Promise<void> {
  await pool.query(
    `INSERT INTO news.items
       (id, title, content, source, published_at, collected_at, related_coins, url, analysis_state)
     VALUES ($1, 'Existing headline', 'Existing summary.', 'coindesk-rss', 1, 2, '[]'::jsonb, $2, 'pending')`,
    [`coindesk-rss|${url}`, url]
  );
}

describe("news sentiment analysis migration", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createDatabasePool(loadConfig().postgres);
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, COLLECTION_MIGRATION);
    await insertCollectedItem(pool, "https://www.coindesk.com/existing/first");
    await insertCollectedItem(pool, "https://www.coindesk.com/existing/second");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("rejects any state other than pending before the widening migration", async () => {
    await expect(
      pool.query("UPDATE news.items SET analysis_state = 'analyzing'")
    ).rejects.toThrow();
  });

  it("applies over existing pending rows without rewriting them", async () => {
    await applyMigration(pool, WIDENING_MIGRATION);

    const rows = await pool.query<{
      id: string;
      title: string;
      analysis_state: string;
      analysis_attempt_count: number;
      analysis_claimed_by: string | null;
      analysis_lease_expires_at: Date | null;
    }>(
      `SELECT id, title, analysis_state, analysis_attempt_count, analysis_claimed_by,
              analysis_lease_expires_at
       FROM news.items ORDER BY id`
    );

    expect(rows.rows).toEqual([
      {
        id: "coindesk-rss|https://www.coindesk.com/existing/first",
        title: "Existing headline",
        analysis_state: "pending",
        analysis_attempt_count: 0,
        analysis_claimed_by: null,
        analysis_lease_expires_at: null
      },
      {
        id: "coindesk-rss|https://www.coindesk.com/existing/second",
        title: "Existing headline",
        analysis_state: "pending",
        analysis_attempt_count: 0,
        analysis_claimed_by: null,
        analysis_lease_expires_at: null
      }
    ]);
  });

  it("permits exactly the four lifecycle states afterwards", async () => {
    for (const state of ["analyzing", "analyzed", "degraded", "pending"]) {
      await pool.query("UPDATE news.items SET analysis_state = $1 WHERE id = $2", [
        state,
        "coindesk-rss|https://www.coindesk.com/existing/first"
      ]);
    }

    await expect(
      pool.query("UPDATE news.items SET analysis_state = 'skipped' WHERE id = $1", [
        "coindesk-rss|https://www.coindesk.com/existing/first"
      ])
    ).rejects.toThrow();
  });

  it("is safe to apply twice", async () => {
    await expect(applyMigration(pool, WIDENING_MIGRATION)).resolves.toBeUndefined();
  });
});
