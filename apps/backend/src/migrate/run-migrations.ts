// CLI entry point: applies every pending migration under
// `apps/backend/migrations/`. Safe to run repeatedly.
//
// Usage: pnpm run migrate   (from apps/backend, or via the root pass-through)

import { loadConfig } from "../platform/config.js";
import { createDatabasePool } from "../platform/database.js";
import { runMigrations } from "./migration-runner.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createDatabasePool(config.postgres);
  try {
    const { applied } = await runMigrations(pool);
    if (applied.length === 0) {
      console.log("Migrate: nothing to apply, database already up to date.");
    } else {
      console.log(`Migrate: applied ${applied.length} migration(s): ${applied.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migrate failed:", error);
  process.exitCode = 1;
});
