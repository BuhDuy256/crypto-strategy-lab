// Narrow composition root for the separate backtest runner process only.

import { Module } from "@nestjs/common";
import type { Pool } from "pg";
import { DATASET_SERVICE, MarketModule, type DatasetService } from "../market/index.js";
import {
  compositeExecutionDescriptor,
  createBuiltInCombinationPolicyRegistry,
  CompositeStrategyService,
  instantiateCompositeStrategy,
  StrategyModule,
  StrategyRegistry
} from "../strategy/index.js";
import { NewsModule, SENTIMENT_FEATURE, type SentimentFeature } from "../news/index.js";
import { loadConfig } from "../../platform/config.js";
import { StructuredLogger } from "../../platform/logger.js";
import { DurableBacktestResultAcceptor } from "./application/backtest-result-acceptor.js";
import { BacktestRunnerRuntime } from "./application/backtest-runner-runtime.js";
import { BacktestRunnerService } from "./application/backtest-runner-service.js";
import { ExperimentSentimentContextAssembler } from "./application/sentiment-feature-context-assembler.js";
import { ExperimentSpecificationService } from "./application/experiment-specification-service.js";
import { LeaderboardProjector } from "./application/leaderboard-projector.js";
import { RankingPolicyRegistry } from "./application/ranking-policy-registry.js";
import { EXPERIMENT_DATABASE_POOL, ExperimentModule } from "./experiment.module.js";
import { PostgresBacktestRunStore } from "./infrastructure/postgres-backtest-run-store.js";
import { PostgresLeaderboardProjectionStore } from "./infrastructure/postgres-leaderboard-projection-store.js";
import { PostgresResultAcceptanceStore } from "./infrastructure/postgres-result-acceptance-store.js";
import { WorkerThreadBacktestComputation } from "./infrastructure/worker-thread-backtest-computation.js";

@Module({
  imports: [ExperimentModule, MarketModule, StrategyModule, NewsModule],
  providers: [
    {
      provide: PostgresResultAcceptanceStore,
      inject: [EXPERIMENT_DATABASE_POOL],
      useFactory: (pool: Pool) => new PostgresResultAcceptanceStore(pool)
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
      provide: DurableBacktestResultAcceptor,
      inject: [PostgresResultAcceptanceStore, LeaderboardProjector],
      useFactory: (store: PostgresResultAcceptanceStore, projection: LeaderboardProjector) =>
        new DurableBacktestResultAcceptor(store, projection, new StructuredLogger("leaderboard-projection"))
    },
    {
      provide: WorkerThreadBacktestComputation,
      inject: [StrategyRegistry, CompositeStrategyService],
      useFactory: (strategies: StrategyRegistry, composites: CompositeStrategyService) =>
        new WorkerThreadBacktestComputation(strategies, composites)
    },
    {
      provide: BacktestRunnerService,
      inject: [PostgresBacktestRunStore, ExperimentSpecificationService, DATASET_SERVICE,
        WorkerThreadBacktestComputation, DurableBacktestResultAcceptor,
        StrategyRegistry, CompositeStrategyService, SENTIMENT_FEATURE],
      useFactory: (
        queue: PostgresBacktestRunStore,
        specifications: ExperimentSpecificationService,
        datasets: DatasetService,
        computation: WorkerThreadBacktestComputation,
        acceptor: DurableBacktestResultAcceptor,
        strategies: StrategyRegistry,
        composites: CompositeStrategyService,
        sentimentFeature: SentimentFeature
      ) => new BacktestRunnerService(
        queue,
        { get: async (specId) => {
          const value = await specifications.get(specId);
          if (value.status !== "frozen") throw new Error(`EXPERIMENT_NOT_FROZEN: ${specId}`);
          return value;
        } },
        datasets,
        computation,
        acceptor,
        {
          nodeRuntimeVersion: process.versions.node,
          dependencyLockHash: process.env.DEPENDENCY_LOCK_HASH ?? "unavailable",
          applicationCommit: process.env.APPLICATION_COMMIT ?? "unavailable",
          workerCommit: process.env.WORKER_COMMIT ?? "unavailable",
          deterministicConfigVersion: process.env.DETERMINISTIC_CONFIG_VERSION ?? "unavailable"
        },
        new StructuredLogger("backtest-runner"),
        undefined,
        {
          resolve: async (strategy, compositeDefinition) => {
            // A generated composite carries its definition inline; prefer it over
            // a saved-store lookup so required-input resolution never depends on
            // a saved-composite record existing.
            if (compositeDefinition !== undefined) {
              const composite = instantiateCompositeStrategy(
                compositeDefinition, strategies, createBuiltInCombinationPolicyRegistry()
              );
              return compositeExecutionDescriptor(
                composite.descriptor,
                composite.definition.components.map((reference) => strategies.resolve(reference).descriptor)
              );
            }
            try {
              return strategies.resolve(strategy).descriptor;
            } catch (error) {
              if (!(error instanceof Error) || !error.message.startsWith("STRATEGY_NOT_FOUND:")) {
                throw error;
              }
              const composite = await composites.resolve(strategy.id, strategy.version);
              return compositeExecutionDescriptor(
                composite.descriptor,
                composite.definition.components.map((reference) => strategies.resolve(reference).descriptor)
              );
            }
          }
        },
        new ExperimentSentimentContextAssembler({ resolve: () => sentimentFeature })
      )
    },
    {
      provide: BacktestRunnerRuntime,
      inject: [BacktestRunnerService],
      useFactory: (runner: BacktestRunnerService) => new BacktestRunnerRuntime(
        runner,
        new StructuredLogger("backtest-runner"),
        loadConfig().backtestRunner.concurrency
      )
    }
  ],
  exports: [BacktestRunnerRuntime]
})
export class BacktestRunnerModule {}
