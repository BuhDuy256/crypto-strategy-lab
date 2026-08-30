// Human-facing CLI that rebuilds one leaderboard projection from authoritative
// results. The projection is derived, so deleting and rebuilding it loses
// nothing; this command is the operator's way to run that rebuild.

import { runMigrations } from "../../../migrate/migration-runner.js";
import { loadConfig } from "../../../platform/config.js";
import { createDatabasePool } from "../../../platform/database.js";
import { loadRootEnvFile } from "../../../platform/root-env.js";
import { LeaderboardProjector, type ProjectionSpecifications } from "../application/leaderboard-projector.js";
import { createBuiltInRankingPolicyRegistry } from "../application/built-in-ranking-policy-registry.js";
import { PostgresExperimentSpecificationStore } from "./postgres-experiment-specification-store.js";
import { PostgresLeaderboardProjectionStore } from "./postgres-leaderboard-projection-store.js";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing required --${name} argument`);
  }
  return value;
}

async function run(): Promise<void> {
  loadRootEnvFile();
  const leaderboardId = argument("experiment");

  const config = loadConfig();
  const pool = createDatabasePool(config.postgres);
  try {
    await runMigrations(pool);
    const specStore = new PostgresExperimentSpecificationStore(pool);
    const specifications: ProjectionSpecifications = {
      get: async (specId) => {
        const specification = await specStore.find(specId);
        if (specification === undefined) {
          throw new Error(`EXPERIMENT_NOT_FOUND: ${specId}`);
        }
        return specification;
      }
    };
    const projector = new LeaderboardProjector(
      new PostgresLeaderboardProjectionStore(pool),
      specifications,
      createBuiltInRankingPolicyRegistry(),
      config.leaderboard.topK
    );
    await projector.rebuild(leaderboardId);
    console.log(`Rebuilt leaderboard for experiment ${leaderboardId}.`);
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
