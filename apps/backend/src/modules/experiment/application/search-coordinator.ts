// The search coordinator: the assignment's Module 9.
//
// Starting a search experiment runs a durable, controlled loop. Each tick asks
// the configured generator for the next candidate, derives a per-candidate frozen
// specification from the experiment's dataset, execution model, and metric set,
// submits it through the BacktestExecutor (from EXP-04), and records it in the
// append-only candidate ledger. The loop folds completed candidate outcomes into
// a no-improvement tracker and stops on any configured stop condition. All run
// state lives in PostgreSQL, so losing the coordinator process does not lose the
// run: a new coordinator resumes from the ledger without duplicating candidates.
//
// The coordinator owns "when and how many"; the generator owns only "what a
// candidate looks like"; the executor owns "how it runs". This split is fixed by
// the architecture, and this slice implements it rather than rearranging it.

import { setTimeout as delay } from "node:timers/promises";
import type { GenerateRequest, CandidateStrategy } from "../../strategy/index.js";
import type { GeneratorRef, StrategyGenerator } from "../../strategy/index.js";
import type { RankingPolicy } from "../domain/ranking-policy.js";
import type { RankingPolicyRef } from "./ranking-policy-registry.js";
import type {
  DraftExperimentSpecification,
  ExperimentDraftContent,
  ExperimentSpecification,
  FreezeProvenance,
  FrozenExperimentSpecification
} from "../domain/experiment-specification.js";
import type { SearchConfiguration } from "../domain/search-specification.js";
import type { BacktestRun, BacktestRunStatus } from "./backtest-run-service.js";

export type SearchStopReason = "max-candidates" | "max-duration" | "no-improvement" | "exhausted";

// Durable run state plus the folded no-improvement tracker.
export interface SearchRunState {
  readonly specId: string;
  readonly status: "running" | "stopped";
  readonly stopReason: SearchStopReason | null;
  readonly correlationId: string;
  readonly bestScore: number | null;
  readonly noImprovementCount: number;
  readonly foldedSequence: number;
  readonly startedAt: string;
}

// One candidate's durable outcome, joined from its backtest run and, when the run
// has completed, its accepted result metrics.
export interface CandidateOutcome {
  readonly sequenceNumber: number;
  readonly contentHash: string;
  readonly runStatus: BacktestRunStatus;
  readonly metrics: Readonly<Record<string, number>> | null;
}

// Complete progress snapshot, queryable at any time (acceptance criterion 7).
export interface SearchProgress {
  readonly status: "running" | "stopped";
  readonly stopReason: SearchStopReason | null;
  readonly generated: number;
  readonly submitted: number;
  readonly completed: number;
  readonly failed: number;
  readonly inFlight: number;
}

export interface RecordCandidateInput {
  readonly specId: string;
  readonly contentHash: string;
  readonly sequenceNumber: number;
  readonly candidate: CandidateStrategy;
  readonly derivedSpecId: string;
  readonly runId: string;
}

export interface SearchRunStore {
  startRun(specId: string, correlationId: string): Promise<{ started: boolean }>;
  findRun(specId: string): Promise<SearchRunState | undefined>;
  candidateCount(specId: string): Promise<number>;
  recordCandidate(input: RecordCandidateInput): Promise<{ recorded: boolean }>;
  inFlightCount(specId: string): Promise<number>;
  // All candidates after `afterSequence` in ascending sequence order, with their
  // current run status and result metrics; the coordinator folds the contiguous
  // terminal prefix.
  readOutcomesAfter(specId: string, afterSequence: number): Promise<CandidateOutcome[]>;
  saveTracker(
    specId: string,
    tracker: { bestScore: number | null; noImprovementCount: number; foldedSequence: number }
  ): Promise<void>;
  stopRun(specId: string, reason: SearchStopReason): Promise<void>;
  progress(specId: string): Promise<SearchProgress>;
  listRunning(): Promise<readonly string[]>;
}

// Narrow ports the coordinator needs. The concrete Experiment and Strategy
// services satisfy these structurally, so production passes them directly.
export interface SearchSpecifications {
  get(specId: string): Promise<ExperimentSpecification>;
  createDraft(content: ExperimentDraftContent): Promise<DraftExperimentSpecification>;
  freeze(specId: string, provenance: FreezeProvenance): Promise<FrozenExperimentSpecification>;
}

export interface SearchBacktestSubmitter {
  start(specId: string, correlationId: string): Promise<BacktestRun>;
}

export interface SearchGenerators {
  resolve(ref: GeneratorRef): StrategyGenerator;
}

export interface SearchRankings {
  resolve(ref: RankingPolicyRef): RankingPolicy;
}

export type TickOutcome =
  | { readonly kind: "submitted"; readonly contentHash: string }
  | { readonly kind: "waited" }
  | { readonly kind: "stopped"; readonly stopReason: SearchStopReason };

export class SearchCoordinator {
  // One live generator iterator per active experiment in this process. On a fresh
  // coordinator (a restart) the map is empty and each iterator is rebuilt and
  // fast-forwarded past already-recorded candidates.
  private readonly iterators = new Map<string, Iterator<CandidateStrategy>>();

  constructor(
    private readonly specifications: SearchSpecifications,
    private readonly runs: SearchBacktestSubmitter,
    private readonly generators: SearchGenerators,
    private readonly rankings: SearchRankings,
    private readonly store: SearchRunStore,
    private readonly now: () => number = Date.now,
    private readonly pollMilliseconds = 250
  ) {}

  // Freeze intent to search: validate the experiment carries search fields, then
  // create the durable run row. A second start for the same experiment is rejected
  // (acceptance criterion 8).
  async start(specId: string, correlationId: string): Promise<void> {
    const specification = await this.specifications.get(specId);
    if (specification.status !== "frozen") {
      throw new Error(`EXPERIMENT_NOT_FROZEN: ${specId}`);
    }
    if (specification.content.search === undefined) {
      throw new Error(`SEARCH_NOT_CONFIGURED: ${specId}`);
    }
    this.assertSearchConfiguration(specification.content.search);
    const { started } = await this.store.startRun(specId, correlationId);
    if (!started) {
      throw new Error(`SEARCH_ALREADY_STARTED: ${specId}`);
    }
  }

  // One unit of controlled work. Deterministic and side-effect-bounded so tests
  // can drive a run step by step and simulate a restart by using a new instance.
  async tick(specId: string): Promise<TickOutcome> {
    const run = await this.store.findRun(specId);
    if (run === undefined) {
      throw new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`);
    }
    if (run.status !== "running") {
      return { kind: "stopped", stopReason: run.stopReason ?? "exhausted" };
    }
    const specification = await this.frozen(specId);
    const search = specification.content.search;
    if (search === undefined) {
      throw new Error(`SEARCH_NOT_CONFIGURED: ${specId}`);
    }

    // Fold terminal candidate outcomes into the no-improvement tracker before any
    // stop decision, so the decision sees the latest durable state.
    await this.fold(specId, run, search);

    const stop = await this.evaluateStop(specId, search);
    if (stop !== undefined) {
      await this.store.stopRun(specId, stop);
      this.iterators.delete(specId);
      return { kind: "stopped", stopReason: stop };
    }

    // Backpressure: wait rather than growing the backlog without limit.
    const inFlight = await this.store.inFlightCount(specId);
    if (inFlight >= search.maxInFlight) {
      return { kind: "waited" };
    }

    const iterator = await this.iterator(specId, search);
    const next = iterator.next();
    if (next.done === true) {
      await this.store.stopRun(specId, "exhausted");
      this.iterators.delete(specId);
      return { kind: "stopped", stopReason: "exhausted" };
    }
    await this.submit(specId, specification, run.correlationId, next.value);
    return { kind: "submitted", contentHash: next.value.contentHash };
  }

  // Drive a run to its terminal state. Hosted by the API process and used for the
  // manual demo; tests use tick() directly for determinism.
  async runToCompletion(specId: string, signal?: AbortSignal): Promise<void> {
    while (signal?.aborted !== true) {
      const outcome = await this.tick(specId);
      if (outcome.kind === "stopped") {
        return;
      }
      await delay(this.pollMilliseconds, undefined, { signal }).catch(() => undefined);
    }
  }

  progress(specId: string): Promise<SearchProgress> {
    return this.store.progress(specId);
  }

  // Experiments still marked running in durable state. A restarted host resumes
  // each one's loop from this list.
  listRunning(): Promise<readonly string[]> {
    return this.store.listRunning();
  }

  private async fold(specId: string, run: SearchRunState, search: SearchConfiguration): Promise<void> {
    const outcomes = await this.store.readOutcomesAfter(specId, run.foldedSequence);
    if (outcomes.length === 0) {
      return;
    }
    const policy = this.rankings.resolve(search.rankingPolicy);
    let bestScore = run.bestScore;
    let noImprovementCount = run.noImprovementCount;
    let foldedSequence = run.foldedSequence;
    let expected = foldedSequence + 1;
    let changed = false;
    for (const outcome of outcomes) {
      // Only the contiguous terminal prefix is folded; a still-running earlier
      // candidate blocks the ones behind it so the iteration order stays stable.
      if (outcome.sequenceNumber !== expected) break;
      if (outcome.runStatus !== "completed" && outcome.runStatus !== "failed") break;
      if (outcome.runStatus === "completed" && outcome.metrics !== null) {
        const ranked = policy.rank(
          { metrics: outcome.metrics, contentHash: outcome.contentHash },
          search.rankingConfiguration
        );
        if (ranked.eligible && (bestScore === null || ranked.score > bestScore)) {
          bestScore = ranked.score;
          noImprovementCount = 0;
        } else {
          noImprovementCount += 1;
        }
      } else {
        // A failed run, or a completed run with no metrics, is not an improvement.
        noImprovementCount += 1;
      }
      foldedSequence = outcome.sequenceNumber;
      expected += 1;
      changed = true;
    }
    if (changed) {
      await this.store.saveTracker(specId, { bestScore, noImprovementCount, foldedSequence });
    }
  }

  private async evaluateStop(
    specId: string,
    search: SearchConfiguration
  ): Promise<SearchStopReason | undefined> {
    const conditions = search.stopConditions;
    if (conditions.maxCandidates !== undefined) {
      const submitted = await this.store.candidateCount(specId);
      if (submitted >= conditions.maxCandidates) return "max-candidates";
    }
    // Re-read the run for the freshest tracker and start time after folding.
    const run = await this.store.findRun(specId);
    if (run === undefined) {
      throw new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`);
    }
    if (conditions.maxDurationMs !== undefined) {
      if (this.now() - Date.parse(run.startedAt) >= conditions.maxDurationMs) return "max-duration";
    }
    if (conditions.noImprovementIterations !== undefined) {
      if (run.noImprovementCount >= conditions.noImprovementIterations) return "no-improvement";
    }
    return undefined;
  }

  private async submit(
    specId: string,
    baseSpecification: FrozenExperimentSpecification,
    correlationId: string,
    candidate: CandidateStrategy
  ): Promise<void> {
    const specification = candidate.specification;
    if (specification.kind !== "single") {
      // V3's search space is single-strategy; running a composite candidate would
      // need the computation path to resolve composites, which is out of this
      // slice's change surface.
      throw new Error(`SEARCH_COMPOSITE_UNSUPPORTED: ${candidate.contentHash}`);
    }
    const derivedContent: ExperimentDraftContent = {
      schemaVersion: baseSpecification.content.schemaVersion,
      datasetRef: baseSpecification.content.datasetRef,
      strategy: {
        id: specification.id,
        version: specification.version,
        parameters: specification.parameters
      },
      execution: baseSpecification.content.execution,
      metricSet: baseSpecification.content.metricSet
    };
    const draft = await this.specifications.createDraft(derivedContent);
    await this.specifications.freeze(draft.specId, baseSpecification.content.provenance);
    // The run is idempotent by its content-derived key: a replayed candidate after
    // a crash returns the same run rather than enqueuing a duplicate.
    const run = await this.runs.start(draft.specId, correlationId);
    const sequenceNumber = await this.store.candidateCount(specId);
    await this.store.recordCandidate({
      specId,
      contentHash: candidate.contentHash,
      sequenceNumber,
      candidate,
      derivedSpecId: run.specId,
      runId: run.runId
    });
  }

  private async iterator(
    specId: string,
    search: SearchConfiguration
  ): Promise<Iterator<CandidateStrategy>> {
    const existing = this.iterators.get(specId);
    if (existing !== undefined) {
      return existing;
    }
    const generator = this.generators.resolve(search.generator);
    const request: GenerateRequest = {
      searchSpace: search.searchSpace,
      seed: search.seed,
      configuration: search.generatorConfiguration
    };
    const iterator = generator.generate(request)[Symbol.iterator]();
    // Fast-forward past the already-recorded prefix so a resumed coordinator
    // continues the same deterministic sequence without re-submitting candidates.
    const already = await this.store.candidateCount(specId);
    for (let index = 0; index < already; index += 1) {
      if (iterator.next().done === true) break;
    }
    this.iterators.set(specId, iterator);
    return iterator;
  }

  private async frozen(specId: string): Promise<FrozenExperimentSpecification> {
    const specification = await this.specifications.get(specId);
    if (specification.status !== "frozen") {
      throw new Error(`EXPERIMENT_NOT_FROZEN: ${specId}`);
    }
    return specification;
  }

  private assertSearchConfiguration(search: SearchConfiguration): void {
    if (!Number.isInteger(search.maxInFlight) || search.maxInFlight < 1) {
      throw new Error("SEARCH_CONFIG: maxInFlight must be a positive integer");
    }
    const conditions = search.stopConditions;
    const hasCondition =
      conditions.maxCandidates !== undefined ||
      conditions.maxDurationMs !== undefined ||
      conditions.noImprovementIterations !== undefined;
    if (!hasCondition) {
      throw new Error("SEARCH_CONFIG: at least one stop condition is required");
    }
    for (const [field, value] of [
      ["maxCandidates", conditions.maxCandidates],
      ["maxDurationMs", conditions.maxDurationMs],
      ["noImprovementIterations", conditions.noImprovementIterations]
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
        throw new Error(`SEARCH_CONFIG: ${field} must be a positive integer when set`);
      }
    }
  }
}
