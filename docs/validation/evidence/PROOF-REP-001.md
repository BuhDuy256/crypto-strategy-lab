# PROOF-REP-001 - Leaderboard Reproducibility Evidence

## Result

**PASS** on 2026-08-26. A completed result is accepted through the real acceptance
store with the deterministic backtester's trades and a complete reproducibility
checklist. The full checklist resolves back from storage with an explicit, non-alias
build identity, and rerunning the recorded backtest input reproduces the exact
canonical trade hash that was stored. The leaderboard read that resolves a Top-1
entry back to its strategy and specification, and the cross-process determinism of
the trade hash, are proven by the cited existing tests.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-5.* -> QA-REP-001 -> D-08/D-09 -> ADR-006/ADR-005.
- Proof definition: `docs/validation/architecture-proof-plan.md`, `PROOF-REP-001`.

## Code and dependency identity

- Base commit: `975ce6ac09f46e4dad8b40889363c0aae182ea64` (`feat(v3): done UI-03`).
- Version tag: none; the Project Owner has not created `v3.0-demo`.
- The proof ran on the implementation worktree. No commit or tag was created;
  Git actions require separate owner approval.
- pnpm lock SHA-256:
  `e37cb2406761a8c2e119990792f2c7f48f381c5188bff777cba8ac7a6fb29c54`.
- Reproducibility proof test SHA-256:
  `bf399e99f19017fb62aecc170eea85df7877c79508bdce15f7612cffcfb37cde`
  (`apps/backend/src/modules/experiment/infrastructure/leaderboard-reproducibility.proof.test.ts`).

## Environment and configuration

- OS: Windows_NT 10.0.26200.
- CPU: 11th Gen Intel(R) Core(TM) i5-11400F @ 2.60GHz.
- Memory: 17,042,784,256 bytes.
- Node.js: v25.9.0.
- PostgreSQL: `postgres:16-alpine`, Docker Compose service healthy, host port 5433.

## What the proof requires, and how each part is shown

The proof selects a Top-1 result, resolves its complete reproducibility checklist,
reruns on the recorded dataset/build/config, and compares trades canonically. Pass
requires that no value comes from a mutable default or a current registry/model
alias.

Rerun reproducibility, end to end (`leaderboard-reproducibility.proof.test.ts`,
test 1):

- The real `Backtester` turns a recorded input into a fixed trade set.
- `PostgresResultAcceptanceStore.accept` stores those trades and records
  `tradeContentHash = canonicalSha256(trades)` inside one transaction.
- Rerunning the same recorded input reproduces the exact trades, and
  `canonicalSha256(rerun)` equals the stored `tradeContentHash`. The stored trade
  rows equal the recomputed trade count.

Full checklist with an explicit build identity
(`leaderboard-reproducibility.proof.test.ts`, test 2):

- `resolveProvenance` returns every baseline checklist item, each `recorded` or
  explicitly `not-applicable` (at least the ten baseline items).
- The recorded `runtimeAndBuild` value is the explicit runtime and build identity:
  a 64-hex dependency lock hash and non-empty application/worker commits, none of
  them `latest`. The engine is the recorded `BACKTEST_ENGINE`, not an alias.

Top-1 resolves back to its strategy and specification
(`postgres-leaderboard-query.test.ts`, "returns ranked entries with their strategy
composition and metrics"): the leaderboard read returns the ranked entry with its
exact single-strategy specification (id, version, parameters) and metrics, resolved
from the append-only candidate ledger.

Cross-process determinism of the trade hash
(`integration/backtester-determinism.test.ts`): the canonical trade hash is
identical when recomputed in a separate process, so reproduction does not depend on
in-process state.

No value from a mutable default: the freeze path rejects any non-explicit version
(`experiment-specification-service.test.ts` enforces explicit semantic versions and
a 64-hex dependency lock hash), and the acceptor rejects a produced runtime that
differs from the frozen provenance or a placeholder engine
(`backtest-result-acceptor.test.ts`).

## Commands and automated evidence

```powershell
pnpm exec vitest run `
  apps/backend/src/modules/experiment/infrastructure/leaderboard-reproducibility.proof.test.ts `
  apps/backend/src/modules/experiment/infrastructure/postgres-leaderboard-query.test.ts `
  apps/backend/src/modules/experiment/infrastructure/postgres-provenance-query.test.ts `
  integration/backtester-determinism.test.ts
```

The reproducibility proof test passes (2). The cited leaderboard-query (4),
provenance-query (2), and cross-process determinism (1) tests pass. Full suite at
the time of the proof: 366/366 across 70 files, typecheck green across all three
packages, changed files lint clean.

## Generated-composite re-run (FIN-06)

**Result: PASS** on 2026-09-03. `FIN-01` changed frozen specification content
(added `compositeDefinition`) and therefore the canonical content hash, so
`frozen_implementation_plan/04-final-certification-and-freeze.md` requires this
proof to be re-run once against a generated composite before freeze. The
single-strategy result above is unchanged and still stands; this section adds a
second, independent instance of the same property, for a composite instead of a
single strategy.

### What this instance proves that the single-strategy instance does not

- The frozen specification carries an inline `compositeDefinition` (two real
  components plus a combination policy), not a single `strategy` reference.
- The candidate was produced by the real `SearchCoordinator` + `RandomStrategyGenerator`,
  executed by the real, separate `BacktestRunnerService` (worker-thread computation,
  not a hand-built outcome), and projected by the real `LeaderboardProjector` — the
  full pipeline, not a synthetic `BacktestRunnerOutcome`.
- No `CompositeStrategyService` and no saved-composite row exists anywhere in the
  test: the composite is resolved entirely from the inline definition, per `FIN-01`'s
  own contract (`worker-thread-backtest-computation.ts`'s inline-first branch).

### Code and dependency identity

- Base commit at the time this evidence was written: `da8a2a0` (`v5-news-and-sentiment`
  branch, uncommitted `FIN-06` proof test on top; `FIN-06`'s own closing commit
  supersedes this once made — see `TRACKING.md`/`JOURNAL.md` for the final hash).
- pnpm lock SHA-256: `2def83389247e1c769c6f1ca7c619abdc96286fef4201850d2fceeeae9ffa305`.
- Proof test SHA-256:
  `1c7af4fb94c886b01737fc5bbbe6a2b052fc3d49ad25d907286612a909aec3ce`
  (`integration/leaderboard-reproducibility-composite.proof.test.ts`). It lives
  under `integration/`, not inside the `experiment` module, because it wires the
  `market`, `strategy`, and `experiment` modules together directly (the same
  reason `backtest-runner-lifecycle.e2e.test.ts` lives there): a file inside a
  module may not reach into another module's `application/`/`infrastructure/`
  paths directly (`BOUND-1-INDEX-ONLY`, `BOUND-5-NO-INTERNAL-REACH`).

### Environment and configuration

- OS: Windows_NT 10.0.26200.
- CPU: 13th Gen Intel(R) Core(TM) i7-1355U.
- Memory: 16,857,645,056 bytes.
- Node.js: v22.19.0.
- PostgreSQL: `postgres:16-alpine`, disposable container isolated from the
  Compose stack (`fin06-disposable-postgres`, host port 5544, database
  `csl_test_fin06`), dropped after use.

### What the proof requires, and how each part is shown

Trace: leaderboard entry -> result -> frozen `ExperimentSpec` -> generated
composite definition -> component versions/parameters -> dataset identity ->
execution assumptions -> build/runtime provenance -> rerun comparison. One real
run recorded these durable identities:

- Parent search spec: `4ce3655c-9d0a-4b17-bc6c-cd79cf63a652`.
- Derived (frozen) candidate spec: `b7aa39fd-b28d-4a40-a1e2-97c6b7ec4409`, content
  hash `4bbcb9cc7dea94965024e3d4f708d94f41af363b4f4497e55f3129e42487b829`.
- Run: `0c0e680e-ca41-4115-8954-311d6f0b0564`; result:
  `465b0480-5cd7-4587-9c2e-f5dfe831da04`.
- Composite definition, stored inline on the frozen spec: components
  `moving-average` (`fastPeriod: 10, slowPeriod: 20, priceSource: "open"`) and
  `rsi` (`period: 14, buyThreshold: 30, sellThreshold: 70, priceSource: "open"`),
  policy `majority-vote`.
- Leaderboard: one entry, rank 1, on leaderboard `4ce3655c-9d0a-4b17-bc6c-cd79cf63a652`,
  `strategy.kind = "composite"`, `numberOfTrades: 2`.
- Stored canonical trade hash:
  `9a7d29c2dff3f1ff7b94b497140ba7f9e5e9f8cfbeeb077dac26cae5719a315c`.

Rerun determinism: the test recomputes the same frozen specification against the
same candles through a second, independent `WorkerThreadBacktestComputation`
instance (a fresh worker thread) and confirms `canonicalSha256(rerun.trades)`
equals the stored hash above, with a non-empty trade array (2 trades) so the
comparison is not a trivial empty-array match.

Full reproducibility checklist resolved from storage (`PostgresProvenanceQuery`):
`specification`, `dataset`, `strategy`, `execution`, `metricSet`, `engine`,
`runtimeAndBuild`, and `attempt` all `recorded`, with `runtimeAndBuild` and
`engine` matching the explicit, non-alias identity the test supplied (not a
mutable default).

**Known, pre-existing scope limit, not a regression.** `combinationPolicy`,
`generatorAndSearch`, and `rankingPolicy` resolve as `not-applicable` in this
checklist too — `ProvenanceChecklist` (`backtest-result-acceptor.ts`, untouched by
`FIN-01`) types these three fields as always `not-applicable`, for a
single-strategy or a composite result alike. The combination policy and
component parameters are still fully traceable (they are inside the frozen
specification's own `compositeDefinition`, resolved above), and the generator
and ranking-policy identity are traceable through the parent search
specification's `search` field, joined via `experiment.search_candidates`. This
is an existing checklist scope limit that predates `FIN-01`; closing it would be
a schema change to `ProvenanceChecklist` and is out of `FIN-06`'s no-new-features
scope.

### Commands and automated evidence

```powershell
pnpm exec vitest run integration/leaderboard-reproducibility-composite.proof.test.ts
```

The generated-composite reproducibility proof test passes (1/1), against the
disposable `csl_test_fin06` database described above.
