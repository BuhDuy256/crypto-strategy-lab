// CLI entry point: drops the four module-owned schemas and the migrations
// tracking table, returning the database to an empty state. Run `migrate`
// again afterwards to recreate the schemas.
//
// Usage: pnpm run migrate:reset   (from apps/backend, or via the root pass-through)

import { loadConfig } from "../platform/config.js";
import { createDatabasePool } from "../platform/database.js";
import { loadRootEnvFile } from "../platform/root-env.js";
import { resetDatabase } from "./migration-runner.js";

async function main(): Promise<void> {
  loadRootEnvFile();
  const config = loadConfig();
  const pool = createDatabasePool(config.postgres);
  try {
    await resetDatabase(pool);
    console.log("Reset: database returned to empty state.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Reset failed:", error);
  process.exitCode = 1;
});
