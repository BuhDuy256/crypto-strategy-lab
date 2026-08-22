// Small hand-rolled SQL migration runner.
//
// Deliberately not an ORM: migrations are plain `.sql` files under
// `apps/backend/migrations/`, applied in filename order. Applied migrations
// are tracked in a `public._migrations` table (not one of the four
// module-owned schemas) so re-running the migrate command is a no-op for
// migrations already applied, and each migration file additionally uses
// `IF NOT EXISTS`-style SQL so it is also safe on its own.
//
// This keeps the database layer SQL-first: no entity classes, no ORM
// models, nothing exported that a module could leak into its domain code.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Directory holding the plain `.sql` migration files. */
export const MIGRATIONS_DIR = join(__dirname, "../../migrations");

/**
 * The four module-owned PostgreSQL schemas created by this migration set.
 * Kept in one place so the migration runner, the reset command, and tests
 * agree on the exact schema names without repeating the literal list.
 */
export const MODULE_SCHEMAS = ["market", "strategy", "experiment", "news"] as const;

const MIGRATIONS_TABLE = "public._migrations";

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

async function appliedMigrationIds(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ id: string }>(`SELECT id FROM ${MIGRATIONS_TABLE}`);
  return new Set(result.rows.map((row) => row.id));
}

/**
 * Applies every migration file not yet recorded as applied, in filename
 * order, each inside its own transaction. Safe to call repeatedly: already
 * applied migrations are skipped.
 */
export async function runMigrations(pool: Pool): Promise<{ applied: string[] }> {
  await ensureMigrationsTable(pool);
  const files = await listMigrationFiles();
  const applied = await appliedMigrationIds(pool);

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      newlyApplied.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { applied: newlyApplied };
}

/**
 * Drops the four module-owned schemas (and everything in them) plus the
 * migrations tracking table, returning the database to an empty state.
 * Call `runMigrations` again afterwards to recreate the schemas.
 */
export async function resetDatabase(pool: Pool): Promise<void> {
  for (const schema of MODULE_SCHEMAS) {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  }
  await pool.query(`DROP TABLE IF EXISTS ${MIGRATIONS_TABLE}`);
}
