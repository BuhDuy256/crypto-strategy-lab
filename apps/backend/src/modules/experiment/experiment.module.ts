// ExperimentModule backs ARC-EXPERIMENT (Experiment).
//
// Owns immutable experiment specifications, run state/control/stop
// policy, candidate/job lifecycle, dispatch reconciliation,
// deterministic backtest simulation, metric evaluation, ranking
// policy, trades/results, result commit/outbox, leaderboard
// projection, and experiment/provenance queries (see
// architecture-baseline.md). The specification lifecycle is the first
// implemented Experiment capability.
import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { DATASET_SERVICE, MarketModule, type DatasetService } from "../market/index.js";
import {
  CompositeStrategyService,
  StrategyModule,
  StrategyRegistry,
  StrategyGeneratorRegistry
} from "../strategy/index.js";
import { loadConfig } from "../../platform/config.js";
import { createDatabasePool } from "../../platform/database.js";
import { ExperimentSpecificationService } from "./application/experiment-specification-service.js";
import { BacktestRunService } from "./application/backtest-run-service.js";
import { PostgresExperimentSpecificationStore } from "./infrastructure/postgres-experiment-specification-store.js";
import { PostgresBacktestRunStore } from "./infrastructure/postgres-backtest-run-store.js";
import { BacktestResultQuery } from "./application/backtest-result-query.js";
import { PostgresBacktestResultQuery } from "./infrastructure/postgres-backtest-result-query.js";
import { LeaderboardQuery } from "./application/leaderboard-query.js";
import { PostgresLeaderboardQuery } from "./infrastructure/postgres-leaderboard-query.js";
import { ProvenanceQuery } from "./application/provenance-query.js";
import { PostgresProvenanceQuery } from "./infrastructure/postgres-provenance-query.js";
import { SearchAnnotationRecompute } from "./application/search-annotation-recompute.js";
import { PostgresRunSpecLocator } from "./infrastructure/postgres-run-spec-locator.js";
import { RankingPolicyRegistry } from "./application/ranking-policy-registry.js";
import { createBuiltInRankingPolicyRegistry } from "./application/built-in-ranking-policy-registry.js";
import { PostgresSearchRunStore } from "./infrastructure/postgres-search-run-store.js";
import { PostgresLeaderboardProjectionStore } from "./infrastructure/postgres-leaderboard-projection-store.js";
import { SearchCoordinator } from "./application/search-coordinator.js";
import { LeaderboardProjector } from "./application/leaderboard-projector.js";
import { SearchExperimentCreationService } from "./application/search-experiment-creation-service.js";
import { SingleBacktestExperimentCreationService } from "./application/single-backtest-experiment-creation-service.js";
import { BACKTEST_ENGINE } from "./domain/backtester.js";
import type { FreezeProvenance } from "./domain/experiment-specification.js";

// The API process shares the backtest runner's build environment (both load the
// same root env), so it can stamp the provenance a search experiment must carry
// for its candidate results to be accepted. Values mirror the runner's runtime
// identity in backtest-runner.module.ts.
function apiRuntimeProvenance(): FreezeProvenance {
  return {
    engine: BACKTEST_ENGINE,
    nodeRuntimeVersion: process.versions.node,
    dependencyLockHash: process.env.DEPENDENCY_LOCK_HASH ?? "unavailable",
    applicationCommit: process.env.APPLICATION_COMMIT ?? "unavailable",
    workerCommit: process.env.WORKER_COMMIT ?? "unavailable",
    deterministicConfigVersion: process.env.DETERMINISTIC_CONFIG_VERSION ?? "1.0.0"
  };
}

export const EXPERIMENT_DATABASE_POOL = Symbol("EXPERIMENT_DATABASE_POOL");

class ExperimentDatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(EXPERIMENT_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  imports: [MarketModule, StrategyModule],
  providers: [
    {
      provide: EXPERIMENT_DATABASE_POOL,
      useFactory: (): Pool => createDatabasePool(loadConfig().postgres)
    },
    {
      provide: PostgresExperimentSpecificationStore,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresExperimentSpecificationStore(pool)
    },
    {
      provide: ExperimentSpecificationService,
      inject: [
        PostgresExperimentSpecificationStore,
        DATASET_SERVICE,
        StrategyRegistry,
        CompositeStrategyService
      ],
      useFactory: (
        store: PostgresExperimentSpecificationStore,
        datasets: DatasetService,
        strategies: StrategyRegistry,
        composites: CompositeStrategyService
      ) => new ExperimentSpecificationService(store, datasets, strategies, composites)
    },
    {
      provide: PostgresBacktestRunStore,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresBacktestRunStore(pool)
    },
    {
      provide: BacktestRunService,
      inject: [ExperimentSpecificationService, PostgresBacktestRunStore, PostgresBacktestRunStore],
      useFactory: (specifications: ExperimentSpecificationService, runs: PostgresBacktestRunStore, executor: PostgresBacktestRunStore) =>
        new BacktestRunService(specifications, runs, executor)
    },
    {
      provide: BacktestResultQuery,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresBacktestResultQuery(pool)
    },
    {
      provide: LeaderboardQuery,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresLeaderboardQuery(pool)
    },
    {
      provide: ProvenanceQuery,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresProvenanceQuery(pool)
    },
    {
      provide: SearchAnnotationRecompute,
      inject: [
        EXPERIMENT_DATABASE_POOL,
        ExperimentSpecificationService,
        DATASET_SERVICE,
        StrategyRegistry,
        CompositeStrategyService
      ],
      useFactory: (
        pool: Pool,
        specifications: ExperimentSpecificationService,
        datasets: DatasetService,
        strategies: StrategyRegistry,
        composites: CompositeStrategyService
      ) =>
        new SearchAnnotationRecompute(
          new PostgresRunSpecLocator(pool),
          {
            get: async (specId) => {
              const value = await specifications.get(specId);
              if (value.status !== "frozen") throw new Error(`EXPERIMENT_NOT_FROZEN: ${specId}`);
              return value;
            }
          },
          datasets,
          strategies,
          composites
        )
    },
    {
      provide: RankingPolicyRegistry,
      useFactory: createBuiltInRankingPolicyRegistry
    },
    {
      provide: PostgresSearchRunStore,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresSearchRunStore(pool)
    },
    {
      provide: PostgresLeaderboardProjectionStore,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresLeaderboardProjectionStore(pool)
    },
    {
      provide: LeaderboardProjector,
      inject: [PostgresLeaderboardProjectionStore, ExperimentSpecificationService, RankingPolicyRegistry],
      useFactory: (
        store: PostgresLeaderboardProjectionStore,
        specifications: ExperimentSpecificationService,
        rankings: RankingPolicyRegistry
      ) => new LeaderboardProjector(store, specifications, rankings, loadConfig().leaderboard.topK)
    },
    {
      provide: SearchCoordinator,
      inject: [
        ExperimentSpecificationService,
        BacktestRunService,
        StrategyGeneratorRegistry,
        RankingPolicyRegistry,
        PostgresSearchRunStore
      ],
      useFactory: (
        specifications: ExperimentSpecificationService,
        runs: BacktestRunService,
        generators: StrategyGeneratorRegistry,
        rankings: RankingPolicyRegistry,
        store: PostgresSearchRunStore
      ) => new SearchCoordinator(specifications, runs, generators, rankings, store)
    },
    {
      provide: SearchExperimentCreationService,
      inject: [DATASET_SERVICE, ExperimentSpecificationService, StrategyRegistry],
      useFactory: (
        datasets: DatasetService,
        specifications: ExperimentSpecificationService,
        strategies: StrategyRegistry
      ) =>
        new SearchExperimentCreationService(
          datasets,
          specifications,
          strategies,
          apiRuntimeProvenance()
        )
    },
    {
      provide: SingleBacktestExperimentCreationService,
      inject: [DATASET_SERVICE, ExperimentSpecificationService],
      useFactory: (datasets: DatasetService, specifications: ExperimentSpecificationService) =>
        new SingleBacktestExperimentCreationService(
          datasets,
          specifications,
          apiRuntimeProvenance()
        )
    },
    ExperimentDatabaseLifecycle
  ],
  exports: [
    EXPERIMENT_DATABASE_POOL,
    PostgresBacktestRunStore,
    ExperimentSpecificationService,
    BacktestRunService,
    BacktestResultQuery,
    LeaderboardQuery,
    ProvenanceQuery,
    SearchAnnotationRecompute,
    RankingPolicyRegistry,
    SearchCoordinator,
    LeaderboardProjector,
    SearchExperimentCreationService,
    SingleBacktestExperimentCreationService
  ]
})
export class ExperimentModule {}
