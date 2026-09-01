// Separate-runner orchestration from durable identifiers to an accepted outcome.

import type { DatasetService } from "../../market/index.js";
import type { StrategyDescriptor } from "../../strategy/index.js";
import type { BacktestOutput } from "../domain/backtester.js";
import type { EvaluationResult } from "../domain/evaluator.js";
import type { FrozenExperimentSpecification } from "../domain/experiment-specification.js";
import { BACKTEST_CANCELLED_REASON, type ClaimedBacktestJob } from "./backtest-run-service.js";
import type { BacktestComputation } from "./backtest-computation.js";
import type { SentimentUsageManifest } from "./sentiment-usage-manifest.js";
import type {
  SentimentContextAssembly,
  SentimentContextAssemblyRequest
} from "./sentiment-feature-context-assembler.js";

export interface BacktestWorkQueue {
  claimNext(runnerId: string): Promise<ClaimedBacktestJob | undefined>;
  heartbeat(claim: ClaimedBacktestJob): Promise<boolean>;
  isCancellationRequested(runId: string): Promise<boolean>;
  fail(claim: ClaimedBacktestJob, reason: string): Promise<void>;
  release(claim: ClaimedBacktestJob): Promise<void>;
}

export interface FrozenSpecificationReader {
  get(specId: string): Promise<FrozenExperimentSpecification>;
}

export interface BacktestRunnerOutcome {
  readonly job: ClaimedBacktestJob["job"];
  readonly claim: ClaimedBacktestJob;
  readonly specification: FrozenExperimentSpecification;
  readonly simulation: BacktestOutput;
  readonly evaluation: EvaluationResult;
  readonly runtimeIdentity: RunnerRuntimeIdentity;
  readonly datasetManifest: Awaited<ReturnType<DatasetService["resolveDataset"]>>["manifest"];
  /** Present only when the strategy required `sentiment-series`. */
  readonly sentimentUsage?: SentimentUsageManifest;
}

export interface RunnerRuntimeIdentity {
  readonly nodeRuntimeVersion: string;
  readonly dependencyLockHash: string;
  readonly applicationCommit: string;
  readonly workerCommit: string;
  readonly deterministicConfigVersion: string;
}

export interface BacktestResultAcceptor {
  accept(outcome: BacktestRunnerOutcome): Promise<void>;
}

/** Resolves declared inputs without exposing Strategy implementation details to the runner. */
export interface StrategyInputDescriptorResolver {
  resolve(
    strategy: FrozenExperimentSpecification["content"]["strategy"]
  ): Promise<Pick<StrategyDescriptor, "requiredInputs">>;
}

/** News-aware context assembly is optional at construction and invoked only when declared. */
export interface RunnerSentimentContextAssembler {
  assemble(request: SentimentContextAssemblyRequest): Promise<SentimentContextAssembly>;
}

export interface RunnerEventLogger {
  log(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

const silentLogger: RunnerEventLogger = { log: () => undefined, error: () => undefined };

export class BacktestRunnerService {
  constructor(
    private readonly queue: BacktestWorkQueue,
    private readonly specifications: FrozenSpecificationReader,
    private readonly datasets: DatasetService,
    private readonly computation: BacktestComputation,
    private readonly acceptor: BacktestResultAcceptor,
    private readonly runtimeIdentity: RunnerRuntimeIdentity,
    private readonly logger: RunnerEventLogger = silentLogger,
    private readonly heartbeatIntervalMs = 10_000,
    private readonly strategyDescriptors?: StrategyInputDescriptorResolver,
    private readonly sentimentContexts?: RunnerSentimentContextAssembler
  ) {}

  async processNext(runnerId: string, signal?: AbortSignal): Promise<boolean> {
    const claim = await this.queue.claimNext(runnerId);
    if (claim === undefined) return false;
    const context = `run=${claim.job.runId} attempt=${claim.attempt} correlation=${claim.job.correlationId}`;
    this.logger.log("Backtest run claimed", context);
    let computationController: AbortController | undefined;
    const heartbeat = setInterval(() => {
      void this.queue.heartbeat(claim).then((renewed) => {
        if (!renewed) {
          claimLost = true;
          computationController?.abort();
        }
      }).catch((error: unknown) => {
        claimLost = true;
        computationController?.abort();
        const message = error instanceof Error ? error.message : "Unknown heartbeat failure";
        this.logger.error(message, context);
      });
    }, this.heartbeatIntervalMs);
    heartbeat.unref();
    let claimLost = false;
    let stage: "input" | "execution" | "acceptance" = "input";
    try {
      if (await this.cancelled(claim, signal)) return true;
      const specification = await this.specifications.get(claim.job.specId);
      const dataset = await this.datasets.resolveDataset(specification.content.datasetRef);
      if (await this.cancelled(claim, signal)) return true;
      const sentiment = await this.assembleSentimentContext(specification, dataset.candles);
      if (sentiment.entries !== undefined && await this.cancelled(claim, signal)) return true;

      stage = "execution";
      const activeController = new AbortController();
      computationController = activeController;
      const abortComputation = (): void => activeController.abort();
      signal?.addEventListener("abort", abortComputation, { once: true });
      const { simulation, evaluation } = await this.computation.compute(
        {
          specification,
          candles: dataset.candles,
          ...(sentiment.entries === undefined ? {} : { sentimentEntries: sentiment.entries })
        },
        activeController.signal
      ).finally(() => signal?.removeEventListener("abort", abortComputation));
      if (await this.cancelled(claim, signal)) return true;
      if (claimLost) throw new Error(`BACKTEST_CLAIM_LOST: ${claim.job.runId}`);
      stage = "acceptance";
      await this.acceptor.accept({
        job: claim.job,
        claim,
        specification,
        simulation,
        evaluation,
        runtimeIdentity: this.runtimeIdentity,
        datasetManifest: dataset.manifest,
        ...(sentiment.usageManifest === undefined ? {} : { sentimentUsage: sentiment.usageManifest })
      });
      this.logger.log("Backtest run accepted", context);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown runner failure";
      this.logger.error(reason, context);
      if (claimLost || reason.startsWith("BACKTEST_CLAIM_LOST:")) return true;
      if (signal?.aborted) {
        await this.queue.release(claim);
        return true;
      }
      const stableReason = stage === "input"
        ? "BACKTEST_INPUT_RESOLUTION_FAILED"
        : stage === "execution"
          ? "BACKTEST_EXECUTION_FAILED"
          : "BACKTEST_RESULT_ACCEPTANCE_FAILED";
      await this.queue.fail(claim, stableReason);
      return true;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async assembleSentimentContext(
    specification: FrozenExperimentSpecification,
    candles: readonly Awaited<ReturnType<DatasetService["resolveDataset"]>>["candles"][number][]
  ): Promise<{
    readonly entries?: Exclude<SentimentContextAssembly, { readonly status: "technical-only" }> ["entries"];
    readonly usageManifest?: SentimentUsageManifest;
  }> {
    if (this.strategyDescriptors === undefined || this.sentimentContexts === undefined) return {};
    const descriptor = await this.strategyDescriptors.resolve(specification.content.strategy);
    if (!descriptor.requiredInputs.includes("sentiment-series")) return {};
    const sentimentInput = specification.content.sentimentInput;
    if (sentimentInput === undefined) {
      throw new Error("BACKTEST_SENTIMENT_INPUT_REQUIRED");
    }
    const marketSymbol = specification.content.datasetRef.symbols[0];
    if (marketSymbol === undefined) {
      throw new Error("BACKTEST_SENTIMENT_MARKET_SYMBOL_REQUIRED");
    }
    const assembly = await this.sentimentContexts.assemble({
      descriptor,
      marketSymbol,
      evaluationTimes: candles.map((candle) => candle.closeTime),
      sentimentInput
    });
    if (assembly.status === "blocked") {
      throw new Error(`BACKTEST_SENTIMENT_POLICY_BLOCKED: ${assembly.decision.appliedPolicy.state}`);
    }
    if (assembly.status === "technical-only") return {};
    return { entries: assembly.entries, usageManifest: assembly.usageManifest };
  }

  private async cancelled(claim: ClaimedBacktestJob, signal?: AbortSignal): Promise<boolean> {
    if (!(await this.queue.heartbeat(claim))) {
      throw new Error(`BACKTEST_CLAIM_LOST: ${claim.job.runId}`);
    }
    if (signal?.aborted) {
      await this.queue.release(claim);
      return true;
    }
    if (!(await this.queue.isCancellationRequested(claim.job.runId))) return false;
    await this.queue.fail(claim, BACKTEST_CANCELLED_REASON);
    return true;
  }
}
