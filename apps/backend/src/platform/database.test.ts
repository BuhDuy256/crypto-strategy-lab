// Smoke test proving the migration-created schemas exist and are queryable,
// and that a test gets clean isolated state with no manual setup.
//
// Requires PostgreSQL reachable using the configured environment variables
// (see .env.example / README.md "Local setup"). Run `docker compose up -d`
// before `pnpm run test`.

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULE_SCHEMAS } from "../migrate/migration-runner.js";
import { resetTestDatabase } from "./test-database.js";

describe("database schemas", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await resetTestDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates exactly the four module-owned schemas", async () => {
    const result = await pool.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1::text[])",
      [MODULE_SCHEMAS]
    );
    const found = result.rows.map((row) => row.schema_name).sort();
    expect(found).toEqual([...MODULE_SCHEMAS].sort());
  });

  it("each module schema is queryable and starts with no tables", async () => {
    for (const schema of MODULE_SCHEMAS) {
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
        [schema]
      );
      expect(result.rows).toEqual([]);
    }
  });
});
