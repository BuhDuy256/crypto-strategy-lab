// Smoke test proving the migration-created schemas exist and are queryable,
// and that a test gets the complete migrated schema state with no manual setup.
//
// Requires PostgreSQL reachable using the configured environment variables
// (see .env.example / README.md "Local setup"). Run `docker compose up -d`
// before `pnpm run test`.

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULE_SCHEMAS } from "../migrate/migration-runner.js";
import { resetTestDatabase } from "./test-database.js";

describe("database schemas", () => {
  let pool: Pool | undefined;

  beforeAll(async () => {
    pool = await resetTestDatabase();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates exactly the four module-owned schemas", async () => {
    if (pool === undefined) {
      throw new Error("Database test pool was not initialized");
    }
    const result = await pool.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1::text[])",
      [MODULE_SCHEMAS]
    );
    const found = result.rows.map((row) => row.schema_name).sort();
    expect(found).toEqual([...MODULE_SCHEMAS].sort());
  });

  it("creates only the tables currently owned by each module", async () => {
    if (pool === undefined) {
      throw new Error("Database test pool was not initialized");
    }
    const expectedTables: Readonly<Record<(typeof MODULE_SCHEMAS)[number], readonly string[]>> = {
      market: ["candles", "datasets"],
      strategy: [],
      experiment: [
        "backtest_annotations",
        "backtest_attempts",
        "backtest_result_provenance",
        "backtest_results",
        "backtest_runs",
        "backtest_trades",
        "specifications"
      ],
      news: []
    };
    for (const schema of MODULE_SCHEMAS) {
      const result = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
        [schema]
      );
      expect(result.rows.map((row) => row.table_name)).toEqual(expectedTables[schema]);
    }
  });
});
