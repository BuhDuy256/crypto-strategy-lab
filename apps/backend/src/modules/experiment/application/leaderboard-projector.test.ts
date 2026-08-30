// Unit tests for the leaderboard projector's pure Top-K logic, driven by an
// in-memory store so the ranking, eviction, version guard, and eligibility rules
// are covered without a database. One behaviour per test.
//
// The projector's public input is one evaluated result and nothing else
// (acceptance criterion 8): it resolves the leaderboard, the frozen
// specification, and the ranking policy on its own. These tests exercise that by
// passing only an `EvaluatedResultRef`.

import { describe, expect, it } from "vitest";
import { createBuiltInRankingPolicyRegistry } from "./built-in-ranking-policy-registry.js";
import {
  LeaderboardProjector,
  type CandidateMembership,
  type CompletedCandidateResult,
  type EvaluatedResultRef,
  type LeaderboardEntry,
  type LeaderboardProjectionStore,
  type LeaderboardWriteScope,
  type ProjectionSpecifications
} from "./leaderboard-projector.js";
import type { ExperimentSpecification } from "../domain/experiment-specification.js";

const LEADERBOARD = "10000000-0000-4000-8000-000000000001";
// A second search experiment with the same ranking policy. Two searches can
// generate the same candidate over the same dataset window, which makes them
// share one content-addressed run.
const OTHER_LEADERBOARD = "10000000-0000-4000-8000-000000000002";

const specifications: ProjectionSpecifications = {
  get: (specId: string): Promise<ExperimentSpecification> => {
    if (specId !== LEADERBOARD && specId !== OTHER_LEADERBOARD) {
      return Promise.reject(new Error(`unknown spec ${specId}`));
    }
    return Promise.resolve({
      specId,
      status: "frozen",
      content: {
        search: {
          rankingPolicy: { id: "weighted-return-drawdown", version: "1.0.0" },
          rankingConfiguration: { weights: { totalReturn: 1, maximumDrawdown: -1 }, minTrades: 1 }
        }
      }
    } as unknown as ExperimentSpecification);
  }
};

const rankings = createBuiltInRankingPolicyRegistry();

// A tiny in-memory store. `withLeaderboard` runs the callback with direct access
// to the array, which is all the pure projector logic needs.
class FakeStore implements LeaderboardProjectionStore {
  readonly boards = new Map<string, LeaderboardEntry[]>();
  readonly appliedByBoard = new Map<string, Map<string, number>>();
  // A run can be a candidate in more than one experiment, so this is a multimap.
  readonly memberships = new Map<string, CandidateMembership[]>();
  readonly results = new Map<string, EvaluatedResultRef>();
  completed: CompletedCandidateResult[] = [];

  // Most tests use the single default leaderboard, so these read through to it.
  get entries(): LeaderboardEntry[] {
    return this.board(LEADERBOARD);
  }

  set entries(value: LeaderboardEntry[]) {
    this.boards.set(LEADERBOARD, [...value]);
  }

  get applied(): Map<string, number> {
    return this.appliedVersions(LEADERBOARD);
  }

  board(leaderboardId: string): LeaderboardEntry[] {
    let entries = this.boards.get(leaderboardId);
    if (entries === undefined) {
      entries = [];
      this.boards.set(leaderboardId, entries);
    }
    return entries;
  }

  private appliedVersions(leaderboardId: string): Map<string, number> {
    let versions = this.appliedByBoard.get(leaderboardId);
    if (versions === undefined) {
      versions = new Map<string, number>();
      this.appliedByBoard.set(leaderboardId, versions);
    }
    return versions;
  }

  findCandidateMemberships(runId: string): Promise<CandidateMembership[]> {
    return Promise.resolve([...(this.memberships.get(runId) ?? [])]);
  }

  findEvaluatedResult(runId: string): Promise<EvaluatedResultRef | undefined> {
    return Promise.resolve(this.results.get(runId));
  }

  readCompletedCandidateResults(): Promise<CompletedCandidateResult[]> {
    return Promise.resolve(this.completed);
  }

  readEntries(): Promise<LeaderboardEntry[]> {
    return Promise.resolve([...this.entries]);
  }

  async withLeaderboard<T>(
    leaderboardId: string,
    run: (scope: LeaderboardWriteScope) => Promise<T>
  ): Promise<T> {
    const applied = this.appliedVersions(leaderboardId);
    const scope: LeaderboardWriteScope = {
      loadEntries: () => Promise.resolve([...this.board(leaderboardId)]),
      replaceEntries: (entries) => {
        this.boards.set(leaderboardId, [...entries]);
        return Promise.resolve();
      },
      appliedVersion: (contentHash) => Promise.resolve(applied.get(contentHash)),
      recordApplied: (contentHash, aggregateVersion) => {
        applied.set(contentHash, aggregateVersion);
        return Promise.resolve();
      },
      resetAppliedVersions: (versions) => {
        this.appliedByBoard.set(
          leaderboardId,
          new Map(versions.map((v) => [v.contentHash, v.aggregateVersion]))
        );
        return Promise.resolve();
      }
    };
    return run(scope);
  }
}

function metrics(totalReturn: number, maximumDrawdown: number, numberOfTrades = 5): Record<string, number> {
  return { totalReturn, maximumDrawdown, winRate: 0.5, numberOfTrades };
}

// Register a candidate's membership and return the ref used to apply its result.
function candidate(
  store: FakeStore,
  name: string,
  values: Record<string, number>,
  aggregateVersion = 1
): EvaluatedResultRef {
  const runId = `run-${name}`;
  const contentHash = name.repeat(64).slice(0, 64);
  store.memberships.set(runId, [
    { leaderboardId: LEADERBOARD, contentHash, derivedSpecId: `spec-${name}` }
  ]);
  const ref = { resultId: `result-${name}`, runId, aggregateVersion, metrics: values };
  store.results.set(runId, ref);
  return ref;
}

function board(store: FakeStore): Array<{ rank: number; contentHash: string; score: number }> {
  return store.entries.map((e) => ({ rank: e.rank, contentHash: e.contentHash, score: e.score }));
}

describe("LeaderboardProjector", () => {
  it("ranks applied results by score descending with contiguous ranks", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    await projector.apply(candidate(store, "b", metrics(0.2, 0)));
    await projector.apply(candidate(store, "a", metrics(0.3, 0)));
    await projector.apply(candidate(store, "c", metrics(0.1, 0)));
    expect(board(store).map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board(store).map((e) => e.score)).toEqual([0.3, 0.2, 0.1]);
  });

  it("lets a better result enter a full board and displaces the previous last entry", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    await projector.apply(candidate(store, "a", metrics(0.3, 0)));
    await projector.apply(candidate(store, "b", metrics(0.2, 0)));
    await projector.apply(candidate(store, "c", metrics(0.1, 0)));
    const [outcome] = await projector.apply(candidate(store, "d", metrics(0.25, 0)));
    expect(outcome).toEqual({ applied: true, rank: 2 });
    expect(board(store).map((e) => e.score)).toEqual([0.3, 0.25, 0.2]);
    expect(store.entries.some((e) => e.contentHash.startsWith("c"))).toBe(false);
  });

  it("does not enter a result worse than the current last place", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    await projector.apply(candidate(store, "a", metrics(0.3, 0)));
    await projector.apply(candidate(store, "b", metrics(0.2, 0)));
    await projector.apply(candidate(store, "c", metrics(0.1, 0)));
    const [outcome] = await projector.apply(candidate(store, "e", metrics(0.05, 0)));
    expect(outcome).toEqual({ applied: false, reason: "unchanged" });
    expect(board(store).map((e) => e.score)).toEqual([0.3, 0.2, 0.1]);
  });

  it("leaves the board unchanged when the same result is applied twice", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    const a = candidate(store, "a", metrics(0.3, 0));
    await projector.apply(a);
    const [outcome] = await projector.apply(a);
    expect(outcome).toEqual({ applied: false, reason: "stale-or-duplicate" });
    expect(board(store)).toEqual([{ rank: 1, contentHash: "a".repeat(64), score: 0.3 }]);
  });

  it("ignores a stale aggregate version even when it would change the ranking", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    await projector.apply(candidate(store, "a", metrics(0.3, 0), 2));
    // A later message about an older version of the same candidate, carrying a
    // much better score. It must be ignored, so the ranking does not change.
    const stale = candidate(store, "a", metrics(0.99, 0), 1);
    const [outcome] = await projector.apply(stale);
    expect(outcome).toEqual({ applied: false, reason: "stale-or-duplicate" });
    expect(board(store).map((e) => e.score)).toEqual([0.3]);
  });

  it("ignores a stale application of a candidate already displaced from the board", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    await projector.apply(candidate(store, "a", metrics(0.3, 0)));
    await projector.apply(candidate(store, "b", metrics(0.2, 0)));
    await projector.apply(candidate(store, "c", metrics(0.1, 0), 2));
    // "c" is pushed off the Top-K by a better candidate.
    await projector.apply(candidate(store, "d", metrics(0.25, 0)));
    expect(store.entries.some((e) => e.contentHash.startsWith("c"))).toBe(false);
    // A stale, off-board message about "c" at an older version, carrying a score
    // that would top the board. It must be ignored even though "c" has no row.
    const [outcome] = await projector.apply(candidate(store, "c", metrics(0.99, 0), 1));
    expect(outcome).toEqual({ applied: false, reason: "stale-or-duplicate" });
    expect(board(store).map((e) => e.score)).toEqual([0.3, 0.25, 0.2]);
  });

  it("does not project a candidate gated out by the ranking policy", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    const [outcome] = await projector.apply(candidate(store, "a", metrics(0.3, 0, 0)));
    expect(outcome).toEqual({ applied: false, reason: "ineligible" });
    expect(store.entries).toHaveLength(0);
  });

  it("ignores a result that is not a search candidate", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    const [outcome] = await projector.apply({
      resultId: "result-x",
      runId: "run-not-a-candidate",
      aggregateVersion: 1,
      metrics: metrics(0.3, 0)
    });
    expect(outcome).toEqual({ applied: false, reason: "not-a-search-candidate" });
    expect(store.entries).toHaveLength(0);
  });

  it("projects a shared run into every experiment that claims it as a candidate", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    const result = candidate(store, "a", metrics(0.3, 0));
    // The second search generated the same candidate, so it adopted the same run.
    store.memberships.get(result.runId)!.push({
      leaderboardId: OTHER_LEADERBOARD,
      contentHash: store.memberships.get(result.runId)![0]!.contentHash,
      derivedSpecId: "spec-a"
    });

    const outcomes = await projector.apply(result);

    expect(outcomes).toEqual([
      { applied: true, rank: 1 },
      { applied: true, rank: 1 }
    ]);
    expect(store.board(LEADERBOARD)).toHaveLength(1);
    expect(store.board(OTHER_LEADERBOARD)).toHaveLength(1);
  });

  it("stays idempotent per leaderboard when a shared run is delivered again", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    const result = candidate(store, "a", metrics(0.3, 0));
    store.memberships.get(result.runId)!.push({
      leaderboardId: OTHER_LEADERBOARD,
      contentHash: store.memberships.get(result.runId)![0]!.contentHash,
      derivedSpecId: "spec-a"
    });
    await projector.apply(result);

    const outcomes = await projector.apply(result);

    expect(outcomes).toEqual([
      { applied: false, reason: "stale-or-duplicate" },
      { applied: false, reason: "stale-or-duplicate" }
    ]);
    expect(store.board(LEADERBOARD)).toHaveLength(1);
    expect(store.board(OTHER_LEADERBOARD)).toHaveLength(1);
  });

  it("projects the result an already completed run produced", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    // The adopting experiment records its membership, but no new result will be
    // accepted for a run that is already complete.
    const result = candidate(store, "a", metrics(0.3, 0));
    store.memberships.set(result.runId, [
      { leaderboardId: OTHER_LEADERBOARD, contentHash: "a".repeat(64), derivedSpecId: "spec-a" }
    ]);

    const outcomes = await projector.applyCompletedRun(result.runId);

    expect(outcomes).toEqual([{ applied: true, rank: 1 }]);
    expect(store.board(OTHER_LEADERBOARD)).toHaveLength(1);
  });

  it("does nothing for a run that has produced no result yet", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);

    expect(await projector.applyCompletedRun("run-never-executed")).toEqual([]);
    expect(store.entries).toHaveLength(0);
  });

  it("rebuilds the same Top-K set the incremental applies produced", async () => {
    const store = new FakeStore();
    const projector = new LeaderboardProjector(store, specifications, rankings, 3);
    const inputs = [
      candidate(store, "a", metrics(0.3, 0)),
      candidate(store, "b", metrics(0.2, 0)),
      candidate(store, "c", metrics(0.1, 0)),
      candidate(store, "d", metrics(0.25, 0)),
      candidate(store, "e", metrics(0.05, 0))
    ];
    for (const input of inputs) await projector.apply(input);
    const incremental = board(store);
    // The store's completed-results view is what a rebuild reads.
    store.completed = inputs.map((input) => ({
      contentHash: store.memberships.get(input.runId)![0]!.contentHash,
      resultId: input.resultId,
      runId: input.runId,
      derivedSpecId: store.memberships.get(input.runId)![0]!.derivedSpecId,
      aggregateVersion: input.aggregateVersion,
      metrics: input.metrics
    }));
    store.entries = [];
    await projector.rebuild(LEADERBOARD);
    expect(board(store)).toEqual(incremental);
  });
});
