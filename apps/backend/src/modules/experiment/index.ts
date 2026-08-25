// Public surface of the experiment module. Nothing else in this module
// is importable from outside it.
export { ExperimentModule } from "./experiment.module.js";
export { BacktestRunnerModule } from "./backtest-runner.module.js";
export { ExperimentSpecificationService } from "./application/experiment-specification-service.js";
export { BacktestRunService } from "./application/backtest-run-service.js";
export { BacktestResultQuery } from "./application/backtest-result-query.js";
export { BacktestRunnerRuntime } from "./application/backtest-runner-runtime.js";
export type {
  BacktestExecutor,
  BacktestJob,
  BacktestRun,
  BacktestRunStatus,
  ClaimedBacktestJob
} from "./application/backtest-run-service.js";
export { Backtester } from "./domain/backtester.js";
export type { BacktestInput, BacktestOutput, BacktestTrade } from "./domain/backtester.js";
export { Evaluator, MVP_METRIC_SET } from "./domain/evaluator.js";
export type {
  EvaluationInput,
  EvaluationResult,
  MetricDefinition,
  MetricSetDefinition,
  MetricSetIdentity
} from "./domain/evaluator.js";
export { SearchCoordinator } from "./application/search-coordinator.js";
export type {
  SearchProgress,
  SearchRunState,
  SearchRunStatus,
  SearchStopReason,
  TickOutcome
} from "./application/search-coordinator.js";
export { SearchExperimentHost } from "./application/search-experiment-host.js";
export type { SearchHostLogger } from "./application/search-experiment-host.js";
export type { SearchConfiguration, SearchStopConditions } from "./domain/search-specification.js";
export { WeightedReturnDrawdownPolicy } from "./domain/weighted-return-drawdown-policy.js";
export { RankingPolicyRegistry } from "./application/ranking-policy-registry.js";
export type { RankingPolicyRef } from "./application/ranking-policy-registry.js";
export { createBuiltInRankingPolicyRegistry } from "./application/built-in-ranking-policy-registry.js";
export type {
  RankingPolicy,
  RankingPolicyDescriptor,
  RankingInput,
  RankedResult,
  MetricDirection
} from "./domain/ranking-policy.js";
export type {
  DraftExperimentSpecification,
  ExecutionModelConfiguration,
  ExperimentDraftContent,
  ExperimentSpecification,
  FreezeProvenance,
  FrozenExperimentContent,
  FrozenExperimentSpecification
} from "./domain/experiment-specification.js";
