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
  FrozenExperimentSpecification,
  StrategyConfiguration
} from "../domain/experiment-specification.js";
import type { SearchConfiguration } from "../domain/search-specification.js";
import type { BacktestRun, BacktestRunStatus } from "./backtest-run-service.js";

export type SearchStopReason = "max-candidates" | "max-duration" | "no-improvement" | "exhausted";

// The durable control state of a search run. The requested state (pausing,
// cancelling) is recorded before the coordinator converges toward the settled
// state (paused, cancelled), so a control request survives a restart and the
// transition is observable while it is in progress.
//   running    - generating and submitting candidates.
//   pausing    - a pause was requested; new submission has stopped and in-flight
//                work is draining. Not yet paused.
//   paused     - convergence reached; no work in flight and none being submitted.
//                Resumable back to running.
//   cancelling - a cancel was requested; pending work is being terminated and
//                in-flight work is draining. Not yet cancelled.
//   cancelled  - terminal; all work terminated, completed results kept auditable.
//   stopped    - terminal; ended by a natural stop condition (SEARCH-01).
// Mirrored for the HTTP boundary as `SearchRunStatus` in
// `packages/api-contracts/src/index.ts`; keep the two in sync.
export type SearchRunStatus =
  | "running"
  | "pausing"
  | "paused"
  | "cancelling"
  | "cancelled"
  | "stopped";

// Durable run state plus the folded no-improvement tracker.
export interface SearchRunState {
  readonly specId: string;
  readonly status: SearchRunStatus;
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
// `cancelled` counts candidates the search terminated on cancel; it is read from
// the search's own disposition ledger and excluded from `failed`, so a cancelled
// candidate is not conflated with a genuine backtest failure.
export interface SearchProgress {
  readonly status: SearchRunStatus;
  readonly stopReason: SearchStopReason | null;
  readonly generated: number;
  readonly submitted: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
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
  // Every run still driven by a coordinator loop: running plus the two
  // transitional states that must converge. A restarted host relaunches each one.
  listActive(): Promise<readonly string[]>;

  // Durable control state, all guarded so an illegal transition is a no-op the
  // coordinator can detect and reject.
  status(specId: string): Promise<SearchRunStatus | undefined>;
  // Move the run from one of `from` to `to`, returning whether a row matched.
  transition(specId: string, from: readonly SearchRunStatus[], to: SearchRunStatus): Promise<boolean>;
  // Settle a cancel: cancelling -> cancelled, recording the stop time.
  markCancelled(specId: string): Promise<void>;
  // Terminate pending (queued, never-claimed) candidate runs and signal
  // cancellation on running ones, so in-flight work drains toward zero. Running
  // work is only signalled: it stops at the runner's cooperative checkpoint.
  cancelPendingRuns(specId: string): Promise<void>;
  // Reclaim candidate runs whose lease expired under a dead runner: close the
  // open attempt and requeue the run. Returns the number reclaimed; idempotent.
  sweepStaleClaims(specId: string): Promise<number>;
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

// Narrow port onto the leaderboard projector. The coordinator needs it only for
// the adopted-run case below; the normal path is driven by result acceptance.
export interface SearchLeaderboardProjection {
  applyCompletedRun(runId: string): Promise<unknown>;
}

export type TickOutcome =
  | { readonly kind: "submitted"; readonly contentHash: string }
  | { readonly kind: "waited" }
  // A control transition is in progress and in-flight work is still draining;
  // the loop keeps polling until it settles.
  | { readonly kind: "converging"; readonly target: "paused" | "cancelled" }
  | { readonly kind: "paused" }
  | { readonly kind: "cancelled" }
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
    private readonly projection: SearchLeaderboardProjection,
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

  // Request a pause. Durable state is written; the coordinator's loop converges.
  // Idempotent when already pausing or paused; rejected once the run is terminal.
  async pause(specId: string): Promise<void> {
    if (await this.store.transition(specId, ["running"], "pausing")) return;
    const status = await this.requireStatus(specId);
    if (status === "pausing" || status === "paused") return;
    throw new Error(`SEARCH_CANNOT_PAUSE: ${specId} is ${status}`);
  }

  // Request a resume back to running. Idempotent when already running.
  async resume(specId: string): Promise<void> {
    if (await this.store.transition(specId, ["pausing", "paused"], "running")) return;
    const status = await this.requireStatus(specId);
    if (status === "running") return;
    throw new Error(`SEARCH_CANNOT_RESUME: ${specId} is ${status}`);
  }

  // Request a cancel. Allowed from any live state; the loop converges by
  // terminating pending work and draining in-flight work. Idempotent.
  async cancel(specId: string): Promise<void> {
    if (await this.store.transition(specId, ["running", "pausing", "paused"], "cancelling")) return;
    const status = await this.requireStatus(specId);
    if (status === "cancelling" || status === "cancelled") return;
    throw new Error(`SEARCH_CANNOT_CANCEL: ${specId} is ${status}`);
  }

  // Reclaim candidate runs abandoned by a dead runner using the EXP-04 lease.
  // Idempotent: a run with no stale claim is untouched.
  sweepStaleClaims(specId: string): Promise<number> {
    return this.store.sweepStaleClaims(specId);
  }

  // One unit of controlled work. Deterministic and side-effect-bounded so tests
  // can drive a run step by step and simulate a restart by using a new instance.
  async tick(specId: string): Promise<TickOutcome> {
    const run = await this.store.findRun(specId);
    if (run === undefined) {
      throw new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`);
    }

    // Control convergence takes priority over generation. A requested state is
    // durable; each tick moves the run one step toward it.
    switch (run.status) {
      case "stopped":
        return { kind: "stopped", stopReason: run.stopReason ?? "exhausted" };
      case "cancelled":
        return { kind: "cancelled" };
      case "paused":
        return { kind: "paused" };
      case "pausing":
        return this.convergePause(specId);
      case "cancelling":
        return this.convergeCancel(specId);
      case "running":
        return this.advance(specId, run);
    }
  }

  // Pause policy: new submission has already stopped; the run reports paused only
  // once all in-flight work has drained. In-flight work is left to finish.
  private async convergePause(specId: string): Promise<TickOutcome> {
    if ((await this.store.inFlightCount(specId)) > 0) {
      return { kind: "converging", target: "paused" };
    }
    await this.store.transition(specId, ["pausing"], "paused");
    this.iterators.delete(specId);
    return { kind: "paused" };
  }

  // Cancel policy: terminate pending work and signal running work every tick, and
  // settle only once nothing is in flight. Completed results are never touched.
  private async convergeCancel(specId: string): Promise<TickOutcome> {
    await this.store.cancelPendingRuns(specId);
    if ((await this.store.inFlightCount(specId)) > 0) {
      return { kind: "converging", target: "cancelled" };
    }
    await this.store.markCancelled(specId);
    this.iterators.delete(specId);
    return { kind: "cancelled" };
  }

  // A running run generates the next candidate, honouring stop conditions and the
  // backpressure bound.
  private async advance(specId: string, run: SearchRunState): Promise<TickOutcome> {
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

  // Drive a run to a settled state. Hosted by the API process and used for the
  // manual demo; tests use tick() directly for determinism. The loop exits when
  // the run settles (stopped, cancelled, or paused) and sweeps stale claims on
  // each pass so a dead runner's work is reclaimed on a schedule.
  async runToCompletion(specId: string, signal?: AbortSignal): Promise<void> {
    while (signal?.aborted !== true) {
      await this.store.sweepStaleClaims(specId);
      const outcome = await this.tick(specId);
      if (outcome.kind === "stopped" || outcome.kind === "cancelled" || outcome.kind === "paused") {
        return;
      }
      await delay(this.pollMilliseconds, undefined, { signal }).catch(() => undefined);
    }
  }

  progress(specId: string): Promise<SearchProgress> {
    return this.store.progress(specId);
  }

  // Runs still driven by a coordinator loop: running plus the transitional states
  // that must converge. A restarted host relaunches each one's loop.
  listActive(): Promise<readonly string[]> {
    return this.store.listActive();
  }

  private async requireStatus(specId: string): Promise<SearchRunStatus> {
    const status = await this.store.status(specId);
    if (status === undefined) {
      throw new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`);
    }
    return status;
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
    // The candidate contract governs what shape a specification may be; a
    // generated composite is carried inline rather than through a saved record,
    // so nothing here branches on the generator that produced it.
    const strategy: StrategyConfiguration =
      specification.kind === "single"
        ? { id: specification.id, version: specification.version, parameters: specification.parameters }
        : { id: specification.composite.id, version: specification.composite.version, parameters: {} };
    const derivedContent: ExperimentDraftContent = {
      schemaVersion: baseSpecification.content.schemaVersion,
      datasetRef: baseSpecification.content.datasetRef,
      strategy,
      execution: baseSpecification.content.execution,
      metricSet: baseSpecification.content.metricSet,
      ...(specification.kind === "composite" ? { compositeDefinition: specification.composite } : {})
    };
    const draft = await this.specifications.createDraft(derivedContent);
    await this.specifications.freeze(draft.specId, baseSpecification.content.provenance);
    // The run is idempotent by its content-derived key: a replayed candidate after
    // a crash returns the same run rather than enqueuing a duplicate.
    const run = await this.runs.start(draft.specId, correlationId);
    const sequenceNumber = await this.store.candidateCount(specId);
    const { recorded } = await this.store.recordCandidate({
      specId,
      contentHash: candidate.contentHash,
      sequenceNumber,
      candidate,
      derivedSpecId: run.specId,
      runId: run.runId
    });
    // An adopted run: a previous experiment already generated this candidate over
    // the same dataset window, so the content-derived run is complete and no new
    // result will ever be accepted for it. Acceptance therefore cannot fill this
    // experiment's leaderboard, and without this the board stays empty until
    // someone runs leaderboard:rebuild. Projecting is idempotent per leaderboard,
    // so doing it here is safe even if the run finished a moment ago.
    if (recorded && run.status === "completed") {
      await this.projection.applyCompletedRun(run.runId);
    }
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
