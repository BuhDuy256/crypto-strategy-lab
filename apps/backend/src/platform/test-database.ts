// Test-only helper for database-backed tests.
//
// Gives a test an isolated, known-clean schema state with no manual steps:
// call `resetTestDatabase()` in a `beforeAll`/`beforeEach`, and it drops and
// recreates the four module-owned schemas against whatever database
// `platform/config.ts` resolves from the environment (point `.env` at a
// dedicated test database to keep this fully separate from dev data).
//
// Not imported by application code; this file exists only to remove manual
// setup steps from tests.

import type { Pool } from "pg";
import { resetDatabase, runMigrations } from "../migrate/migration-runner.js";
import { loadConfig } from "./config.js";
import { createDatabasePool } from "./database.js";

/**
 * Resets the configured database to empty and re-applies every migration,
 * returning an open pool the caller owns and must `end()` when done (for
 * example in `afterAll`).
 */
export async function resetTestDatabase(): Promise<Pool> {
  const config = loadConfig();
  const pool = createDatabasePool(config.postgres);
  const lock = await pool.connect();
  try {
    // Vitest files and process-level E2E fixtures share one dedicated test DB.
    // Serialize destructive reset/migration cycles even if the runner schedules
    // files concurrently; application queries remain unaffected after setup.
    await lock.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      "crypto-strategy-lab.test-database-reset"
    ]);
    await resetDatabase(pool);
    await runMigrations(pool);
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
      "crypto-strategy-lab.test-database-reset"
    ]);
    lock.release();
  }
  return pool;
}
