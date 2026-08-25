// Atomic result-acceptance contract and complete reproducibility checklist.

import type { BacktestRunnerOutcome, BacktestResultAcceptor } from "./backtest-runner-service.js";
import type { EvaluatedResultRef } from "./leaderboard-projector.js";
import { BACKTEST_ENGINE } from "../domain/backtester.js";

// The leaderboard projection, seen from the acceptance path. In V3 acceptance
// calls it directly and synchronously; in V6 an event consumer will call the same
// projector. Kept as a narrow port so the acceptor does not depend on the
// projector's concrete class.
export interface LeaderboardProjectionSink {
  apply(result: EvaluatedResultRef): Promise<unknown>;
}

export interface ResultAcceptanceLogger {
  error(message: string, context?: string): void;
}

export interface ProvenanceChecklist {
  readonly specification: { readonly status: "recorded"; readonly id: string; readonly hash: string };
  readonly dataset: { readonly status: "recorded"; readonly value: unknown };
  readonly strategy: { readonly status: "recorded"; readonly value: unknown };
  readonly execution: { readonly status: "recorded"; readonly value: unknown };
  readonly metricSet: { readonly status: "recorded"; readonly value: unknown };
  readonly engine: { readonly status: "recorded"; readonly value: unknown };
  readonly runtimeAndBuild: { readonly status: "recorded"; readonly value: unknown };
  readonly newsInput: { readonly status: "not-applicable" };
  readonly sentimentModel: { readonly status: "not-applicable" };
  readonly randomSeed: { readonly status: "not-applicable" };
  readonly pythonRuntime: { readonly status: "not-applicable" };
  readonly combinationPolicy: { readonly status: "not-applicable" };
  readonly generatorAndSearch: { readonly status: "not-applicable" };
  readonly rankingPolicy: { readonly status: "not-applicable" };
  readonly dataQualityExceptions: { readonly status: "recorded"; readonly value: unknown };
  readonly attempt: { readonly status: "recorded"; readonly value: unknown };
}

export interface AcceptedBacktestResult {
  readonly resultId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly tradeContentHash: string;
  readonly completedAt: string;
}

export interface ResultAcceptanceStore {
  accept(outcome: BacktestRunnerOutcome, checklist: ProvenanceChecklist): Promise<AcceptedBacktestResult>;
}

export class DurableBacktestResultAcceptor implements BacktestResultAcceptor {
  constructor(
    private readonly store: ResultAcceptanceStore,
    private readonly projection?: LeaderboardProjectionSink,
    private readonly logger?: ResultAcceptanceLogger
  ) {}

  accept(outcome: BacktestRunnerOutcome): Promise<void> {
    const provenance = outcome.specification.content.provenance;
    if (provenance.workerCommit.trim() === "" || provenance.applicationCommit.trim() === "") {
      throw new Error("BACKTEST_PROVENANCE: build identities must be explicit");
    }
    for (const field of [
      "nodeRuntimeVersion",
      "dependencyLockHash",
      "applicationCommit",
      "workerCommit",
      "deterministicConfigVersion"
    ] as const) {
      if (provenance[field] !== outcome.runtimeIdentity[field]) {
        throw new Error(`BACKTEST_PROVENANCE_MISMATCH: ${field}`);
      }
    }
    if (outcome.specification.content.metricSet.id !== outcome.evaluation.metricSet.id ||
      outcome.specification.content.metricSet.version !== outcome.evaluation.metricSet.version) {
      throw new Error("BACKTEST_PROVENANCE_MISMATCH: metricSet");
    }
    if (provenance.engine.id !== BACKTEST_ENGINE.id ||
      provenance.engine.version !== BACKTEST_ENGINE.version) {
      throw new Error("BACKTEST_PROVENANCE_MISMATCH: engine");
    }
    const checklist: ProvenanceChecklist = {
      specification: { status: "recorded", id: outcome.specification.specId, hash: outcome.specification.contentHash },
      dataset: {
        status: "recorded",
        value: { ref: outcome.specification.content.datasetRef, gaps: outcome.datasetManifest.gaps }
      },
      strategy: { status: "recorded", value: outcome.specification.content.strategy },
      execution: { status: "recorded", value: outcome.specification.content.execution },
      metricSet: { status: "recorded", value: outcome.evaluation.metricSet },
      engine: { status: "recorded", value: provenance.engine },
      runtimeAndBuild: { status: "recorded", value: outcome.runtimeIdentity },
      newsInput: { status: "not-applicable" }, sentimentModel: { status: "not-applicable" },
      randomSeed: { status: "not-applicable" }, pythonRuntime: { status: "not-applicable" },
      combinationPolicy: { status: "not-applicable" },
      generatorAndSearch: { status: "not-applicable" },
      rankingPolicy: { status: "not-applicable" },
      dataQualityExceptions: { status: "recorded", value: outcome.datasetManifest.gaps },
      attempt: {
        status: "recorded",
        value: { number: outcome.claim.attempt, runnerId: outcome.claim.runnerId }
      }
    };
    return this.store.accept(outcome, checklist).then((accepted) => this.project(accepted, outcome));
  }

  // Update the derived leaderboard synchronously, right after the authoritative
  // result is committed. The projection is rebuildable, so a projection failure
  // must never un-accept the result: this mirrors the V6 event-consumer path,
  // where a consumer error does not roll back the committed result. A missed
  // update is recovered by the rebuild command. Every backtest passes through
  // here; the projector itself ignores a result that is not a search candidate.
  private async project(accepted: AcceptedBacktestResult, outcome: BacktestRunnerOutcome): Promise<void> {
    if (this.projection === undefined) return;
    try {
      await this.projection.apply({
        resultId: accepted.resultId,
        runId: accepted.runId,
        aggregateVersion: outcome.claim.attempt,
        metrics: outcome.evaluation.values
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "leaderboard projection failed";
      this.logger?.error(message, `run=${outcome.job.runId}`);
    }
  }
}
