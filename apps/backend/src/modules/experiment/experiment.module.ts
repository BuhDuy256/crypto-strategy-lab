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
import { StrategyModule, StrategyRegistry, StrategyGeneratorRegistry } from "../strategy/index.js";
import { loadConfig } from "../../platform/config.js";
import { createDatabasePool } from "../../platform/database.js";
import { ExperimentSpecificationService } from "./application/experiment-specification-service.js";
import { BacktestRunService } from "./application/backtest-run-service.js";
import { PostgresExperimentSpecificationStore } from "./infrastructure/postgres-experiment-specification-store.js";
import { PostgresBacktestRunStore } from "./infrastructure/postgres-backtest-run-store.js";
import { BacktestResultQuery } from "./application/backtest-result-query.js";
import { PostgresBacktestResultQuery } from "./infrastructure/postgres-backtest-result-query.js";
import { RankingPolicyRegistry } from "./application/ranking-policy-registry.js";
import { createBuiltInRankingPolicyRegistry } from "./application/built-in-ranking-policy-registry.js";
import { PostgresSearchRunStore } from "./infrastructure/postgres-search-run-store.js";
import { PostgresLeaderboardProjectionStore } from "./infrastructure/postgres-leaderboard-projection-store.js";
import { SearchCoordinator } from "./application/search-coordinator.js";
import { LeaderboardProjector } from "./application/leaderboard-projector.js";

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
      inject: [PostgresExperimentSpecificationStore, DATASET_SERVICE, StrategyRegistry],
      useFactory: (
        store: PostgresExperimentSpecificationStore,
        datasets: DatasetService,
        strategies: StrategyRegistry
      ) => new ExperimentSpecificationService(store, datasets, strategies)
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
    ExperimentDatabaseLifecycle
  ],
  exports: [
    EXPERIMENT_DATABASE_POOL,
    PostgresBacktestRunStore,
    ExperimentSpecificationService,
    BacktestRunService,
    BacktestResultQuery,
    RankingPolicyRegistry,
    SearchCoordinator,
    LeaderboardProjector
  ]
})
export class ExperimentModule {}
