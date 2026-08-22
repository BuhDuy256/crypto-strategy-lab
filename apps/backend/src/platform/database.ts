// Database connection provider for the backend.
//
// Builds a `pg.Pool` from the typed config in `platform/config.ts`. This is
// the single place that turns `PostgresConfig` into a live connection, so
// migrations, tests, and future NestJS providers all share one connection
// shape instead of each parsing environment variables or building pool
// options on their own.
//
// This module is SQL-first: it hands out a plain `pg.Pool`, never an ORM
// entity manager or model classes. Callers write and run SQL directly.

import { Pool } from "pg";
import type { PostgresConfig } from "./config.js";

/**
 * Creates a new connection pool for the given PostgreSQL config.
 *
 * The caller owns the pool's lifecycle and must call `pool.end()` when done
 * (a short-lived script) or let it live for the process lifetime (a
 * long-running server).
 */
export function createDatabasePool(config: PostgresConfig): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
  });
}
