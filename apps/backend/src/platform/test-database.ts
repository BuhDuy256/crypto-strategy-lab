// Test-only helper for database-backed tests.
//
// Gives a test an isolated, known-clean schema state with no manual steps:
// call `resetTestDatabase()` in a `beforeAll`/`beforeEach`. It refuses to
// reset until both the dedicated database name and a durable, explicit guard
// marker prove that the configured connection is an isolated test database.
//
// Not imported by application code; this file exists only to remove manual
// setup steps from tests.

import type { Pool } from "pg";
import { resetDatabase, runMigrations } from "../migrate/migration-runner.js";
import { loadConfig } from "./config.js";
import { createDatabasePool } from "./database.js";

const TEST_DATABASE_NAME = /^csl_test_[a-z0-9_]+$/;
const TEST_DATABASE_GUARD_KEY = "crypto-strategy-lab.test-database";

interface TestDatabaseGuardRow {
  readonly database_name: string;
  readonly guard_token: string;
}

export interface TestDatabaseResetOptions {
  readonly applyMigrations?: boolean;
}

/**
 * Verifies the two independent preconditions for a destructive test reset.
 * A matching name alone is not enough: the database must also contain the
 * explicitly provisioned token marker for this test run.
 */
export async function assertTestDatabaseGuard(
  pool: Pick<Pool, "query">,
  database: string,
  guardToken: string | undefined
): Promise<void> {
  if (!TEST_DATABASE_NAME.test(database)) {
    throw new Error("TEST_DATABASE_GUARD_DATABASE: configured database is not a dedicated test database");
  }
  if (guardToken === undefined || guardToken.trim() === "") {
    throw new Error("TEST_DATABASE_GUARD_TOKEN: TEST_DATABASE_GUARD_TOKEN must be explicitly configured");
  }
  try {
    const result = await pool.query<TestDatabaseGuardRow>(
      `SELECT current_database() AS database_name, guard_token
       FROM public._test_database_guard
       WHERE guard_key = $1`,
      [TEST_DATABASE_GUARD_KEY]
    );
    const marker = result.rows[0];
    if (
      result.rows.length !== 1 ||
      marker === undefined ||
      marker.database_name !== database ||
      marker.guard_token !== guardToken
    ) {
      throw new Error("TEST_DATABASE_GUARD_UNVERIFIED: durable marker does not match configured test database");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TEST_DATABASE_GUARD_")) {
      throw error;
    }
    throw new Error("TEST_DATABASE_GUARD_UNVERIFIED: durable test-database marker is unavailable");
  }
}

/**
 * Resets the configured database to empty and re-applies every migration,
 * returning an open pool the caller owns and must `end()` when done (for
 * example in `afterAll`).
 */
export async function resetTestDatabase(options: TestDatabaseResetOptions = {}): Promise<Pool> {
  const config = loadConfig();
  const pool = createDatabasePool(config.postgres);
  try {
    await assertTestDatabaseGuard(pool, config.postgres.database, process.env.TEST_DATABASE_GUARD_TOKEN);
    const lock = await pool.connect();
    let locked = false;
    try {
      // Vitest files and process-level E2E fixtures share one dedicated test DB.
      // Serialize destructive reset/migration cycles even if the runner schedules
      // files concurrently; application queries remain unaffected after setup.
      await lock.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
        "crypto-strategy-lab.test-database-reset"
      ]);
      locked = true;
      await resetDatabase(pool);
      if (options.applyMigrations ?? true) {
        await runMigrations(pool);
      }
    } finally {
      if (locked) {
        await lock.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
          "crypto-strategy-lab.test-database-reset"
        ]);
      }
      lock.release();
    }
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
