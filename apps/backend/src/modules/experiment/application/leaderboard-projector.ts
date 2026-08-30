// The leaderboard projector: an idempotent, rebuildable Top-K projection derived
// from authoritative evaluated results using the experiment's ranking policy.
//
// In V3 the projector is called synchronously from the result-acceptance path,
// once per accepted result. Its public input is one evaluated result and nothing
// caller- or transaction-specific, so V6 can drive the exact same logic from an
// event consumer without changing it. The projector never writes projection rows
// from arbitrary code: it is the only writer, it owns its own serialized
// transaction per leaderboard, and the whole projection can be deleted and
// rebuilt from authoritative results with no loss.
//
// A result belongs to a leaderboard only when its run is a search candidate. A
// single, manually-run backtest produces a result too, so a result that is not a
// candidate is simply ignored here.

import { canonicalSha256 } from "../../../platform/canonical-json.js";
import type { RankingPolicyRef } from "./ranking-policy-registry.js";
import type { RankedResult, RankingPolicy } from "../domain/ranking-policy.js";
import type { ExperimentSpecification } from "../domain/experiment-specification.js";

// The projector's whole public input: one evaluated result. `aggregateVersion`
// is the backtest attempt that produced the result; it lets a duplicate or a
// stale (out-of-order) application be ignored, which is the V6 duplicate/stale
// behaviour rehearsed here.
export interface EvaluatedResultRef {
  readonly resultId: string;
  readonly runId: string;
  readonly aggregateVersion: number;
  readonly metrics: Readonly<Record<string, number>>;
}

// A row of the derived projection. It links to its authoritative result and its
// immutable frozen specification, and is never authoritative itself.
export interface LeaderboardEntry {
  readonly leaderboardId: string;
  readonly contentHash: string;
  readonly resultId: string;
  readonly runId: string;
  readonly derivedSpecId: string;
  readonly rank: number;
  readonly score: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly policy: { readonly id: string; readonly version: string; readonly configuration: Record<string, unknown> };
  readonly aggregateVersion: number;
}

// Which leaderboard a candidate result belongs to, resolved from the run.
export interface CandidateMembership {
  readonly leaderboardId: string;
  readonly contentHash: string;
  readonly derivedSpecId: string;
}

// One authoritative completed candidate result, read for a rebuild.
export interface CompletedCandidateResult {
  readonly contentHash: string;
  readonly resultId: string;
  readonly runId: string;
  readonly derivedSpecId: string;
  readonly aggregateVersion: number;
  readonly metrics: Readonly<Record<string, number>>;
}

// The highest result version a candidate has been applied at, recorded whether or
// not the candidate is on the board.
export interface AppliedVersion {
  readonly contentHash: string;
  readonly aggregateVersion: number;
}

// A write scope over one leaderboard, serialized against concurrent writers by
// the store. The projector reads the current entries and the per-candidate
// applied versions, decides the new Top-K, and writes both, all inside one
// serialized transaction.
export interface LeaderboardWriteScope {
  loadEntries(): Promise<LeaderboardEntry[]>;
  replaceEntries(entries: readonly LeaderboardEntry[]): Promise<void>;
  // The version this candidate was last applied at, or undefined if never applied.
  appliedVersion(contentHash: string): Promise<number | undefined>;
  // Record that this candidate has now been applied at this version.
  recordApplied(contentHash: string, aggregateVersion: number): Promise<void>;
  // Replace the whole applied-version record, used by a rebuild.
  resetAppliedVersions(versions: readonly AppliedVersion[]): Promise<void>;
}

export interface LeaderboardProjectionStore {
  // Every leaderboard the run is a candidate in. A run is content-addressed and
  // therefore shared by any search experiment that generated the same candidate
  // over the same dataset window, so this is a list, not a single row.
  findCandidateMemberships(runId: string): Promise<CandidateMembership[]>;
  // The authoritative evaluated result of a completed run, if it has one. Used
  // when a search adopts a run that another experiment already completed, so the
  // adopting leaderboard is projected without waiting for a result that will
  // never be produced again.
  findEvaluatedResult(runId: string): Promise<EvaluatedResultRef | undefined>;
  readCompletedCandidateResults(leaderboardId: string): Promise<CompletedCandidateResult[]>;
  readEntries(leaderboardId: string): Promise<LeaderboardEntry[]>;
  // Run `run` with exclusive access to one leaderboard's rows, in a transaction.
  withLeaderboard<T>(
    leaderboardId: string,
    run: (scope: LeaderboardWriteScope) => Promise<T>
  ): Promise<T>;
}

// Narrow port to read a frozen specification's search fields. The concrete
// ExperimentSpecificationService satisfies it structurally.
export interface ProjectionSpecifications {
  get(specId: string): Promise<ExperimentSpecification>;
}

export interface ProjectionRankings {
  resolve(ref: RankingPolicyRef): RankingPolicy;
}

// The outcome of applying one result. `applied` is true only when the projection
// actually changed, so a caller (and a test) can tell a real update from a
// no-op.
export type ProjectionApplication =
  | { readonly applied: true; readonly rank: number }
  | {
      readonly applied: false;
      readonly reason: "not-a-search-candidate" | "ineligible" | "stale-or-duplicate" | "unchanged";
    };

function toRanked(entry: LeaderboardEntry): RankedResult {
  return {
    policy: entry.policy,
    score: entry.score,
    eligible: true,
    metrics: entry.metrics,
    contentHash: entry.contentHash
  };
}

export class LeaderboardProjector {
  constructor(
    private readonly store: LeaderboardProjectionStore,
    private readonly specifications: ProjectionSpecifications,
    private readonly rankings: ProjectionRankings,
    // Fixed Top-K size, supplied from LEADERBOARD_TOP_K project configuration. A
    // rebuild uses the same value, so it reproduces the same content.
    private readonly topK: number
  ) {
    if (!Number.isInteger(topK) || topK < 1) {
      throw new Error("LEADERBOARD_TOP_K: leaderboard size must be a positive integer");
    }
  }

  // Apply one evaluated result to its leaderboards. Idempotent and safe to call
  // again with the same or an older result. Returns one entry per leaderboard the
  // result belongs to: a run shared by two search experiments projects into both,
  // each guarded by its own applied-version record, so a repeated delivery is
  // still a no-op per leaderboard.
  async apply(result: EvaluatedResultRef): Promise<ProjectionApplication[]> {
    const memberships = await this.store.findCandidateMemberships(result.runId);
    if (memberships.length === 0) {
      return [{ applied: false, reason: "not-a-search-candidate" }];
    }
    const applications: ProjectionApplication[] = [];
    for (const membership of memberships) {
      applications.push(await this.applyTo(membership, result));
    }
    return applications;
  }

  // Project the result a completed run already produced. A search that generated
  // a candidate an earlier experiment had already run gets no new result to
  // accept, so nothing else would ever fill its leaderboard.
  async applyCompletedRun(runId: string): Promise<ProjectionApplication[]> {
    const result = await this.store.findEvaluatedResult(runId);
    if (result === undefined) return [];
    return this.apply(result);
  }

  private async applyTo(
    membership: CandidateMembership,
    result: EvaluatedResultRef
  ): Promise<ProjectionApplication> {
    const { policy, configuration } = await this.resolvePolicy(membership.leaderboardId);
    const ranked = policy.rank(
      { metrics: result.metrics, contentHash: membership.contentHash },
      configuration
    );
    return this.store.withLeaderboard(membership.leaderboardId, async (scope) => {
      // Duplicate or stale application: this candidate has already been applied at
      // this version or a newer one. Ignore it so a replayed or out-of-order
      // result never changes the board. The applied-version record covers a
      // candidate even after it has been displaced from the Top-K, not only while
      // it is on the board.
      const priorVersion = await scope.appliedVersion(membership.contentHash);
      if (priorVersion !== undefined && priorVersion >= result.aggregateVersion) {
        return { applied: false, reason: "stale-or-duplicate" };
      }
      // A candidate gated out by the policy (score -Infinity) can never be in the
      // Top-K, so it is not projected. Its version is still recorded so a later
      // stale application of it is ignored too.
      if (!ranked.eligible) {
        await scope.recordApplied(membership.contentHash, result.aggregateVersion);
        return { applied: false, reason: "ineligible" };
      }
      const current = await scope.loadEntries();
      const incoming: LeaderboardEntry = {
        leaderboardId: membership.leaderboardId,
        contentHash: membership.contentHash,
        resultId: result.resultId,
        runId: result.runId,
        derivedSpecId: membership.derivedSpecId,
        rank: 0,
        score: ranked.score,
        metrics: result.metrics,
        policy: ranked.policy,
        aggregateVersion: result.aggregateVersion
      };
      const withoutIncoming = current.filter((entry) => entry.contentHash !== membership.contentHash);
      const keepers = this.selectTopK([...withoutIncoming, incoming], policy);
      // Record the version before deciding on a board change, so even a result
      // that does not enter the Top-K is guarded against a later stale replay.
      await scope.recordApplied(membership.contentHash, result.aggregateVersion);
      if (sameBoard(current, keepers)) {
        return { applied: false, reason: "unchanged" };
      }
      await scope.replaceEntries(keepers);
      const rank = keepers.find((entry) => entry.contentHash === membership.contentHash)?.rank;
      // The incoming entry is always among the keepers when the board changed:
      // the board only changes because it entered the Top-K.
      return { applied: true, rank: rank ?? keepers.length };
    });
  }

  // Delete and rebuild the whole leaderboard from authoritative results. The
  // result is identical to the incremental path because both keep the best K
  // under the same total order.
  async rebuild(leaderboardId: string): Promise<void> {
    const { policy, configuration } = await this.resolvePolicy(leaderboardId);
    const results = await this.store.readCompletedCandidateResults(leaderboardId);
    const entries: LeaderboardEntry[] = [];
    const appliedVersions = new Map<string, number>();
    for (const result of results) {
      // Every completed candidate has been "applied", so its version belongs in
      // the applied-version record even when it is gated out of the board.
      const seen = appliedVersions.get(result.contentHash);
      if (seen === undefined || result.aggregateVersion > seen) {
        appliedVersions.set(result.contentHash, result.aggregateVersion);
      }
      const ranked = policy.rank({ metrics: result.metrics, contentHash: result.contentHash }, configuration);
      if (!ranked.eligible) continue;
      entries.push({
        leaderboardId,
        contentHash: result.contentHash,
        resultId: result.resultId,
        runId: result.runId,
        derivedSpecId: result.derivedSpecId,
        rank: 0,
        score: ranked.score,
        metrics: result.metrics,
        policy: ranked.policy,
        aggregateVersion: result.aggregateVersion
      });
    }
    const keepers = this.selectTopK(entries, policy);
    await this.store.withLeaderboard(leaderboardId, async (scope) => {
      await scope.replaceEntries(keepers);
      await scope.resetAppliedVersions(
        [...appliedVersions].map(([contentHash, aggregateVersion]) => ({ contentHash, aggregateVersion }))
      );
    });
  }

  // A stable content hash of the leaderboard, used to prove idempotence and
  // rebuild equivalence. It covers the observable projection content, not the
  // wall-clock bookkeeping.
  async projectionHash(leaderboardId: string): Promise<string> {
    const entries = await this.store.readEntries(leaderboardId);
    return canonicalSha256(
      entries.map((entry) => ({
        rank: entry.rank,
        contentHash: entry.contentHash,
        resultId: entry.resultId,
        derivedSpecId: entry.derivedSpecId,
        score: entry.score,
        metrics: entry.metrics,
        policy: entry.policy,
        aggregateVersion: entry.aggregateVersion
      }))
    );
  }

  private selectTopK(entries: readonly LeaderboardEntry[], policy: RankingPolicy): LeaderboardEntry[] {
    return [...entries]
      .sort((a, b) => policy.compare(toRanked(a), toRanked(b)))
      .slice(0, this.topK)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private async resolvePolicy(
    leaderboardId: string
  ): Promise<{ policy: RankingPolicy; configuration: Record<string, unknown> }> {
    const specification = await this.specifications.get(leaderboardId);
    if (specification.status !== "frozen") {
      throw new Error(`EXPERIMENT_NOT_FROZEN: ${leaderboardId}`);
    }
    const search = specification.content.search;
    if (search === undefined) {
      throw new Error(`SEARCH_NOT_CONFIGURED: ${leaderboardId}`);
    }
    return {
      policy: this.rankings.resolve(search.rankingPolicy),
      configuration: search.rankingConfiguration
    };
  }
}

// Two boards are the same when they hold the same candidates, at the same
// versions, in the same order. Rank is derived from order, so it need not be
// compared separately.
function sameBoard(a: readonly LeaderboardEntry[], b: readonly LeaderboardEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      entry.contentHash === other.contentHash &&
      entry.resultId === other.resultId &&
      entry.aggregateVersion === other.aggregateVersion
    );
  });
}
