# PROOF-REPLACE-001 - Search Replaceability Evidence

## Result

**PASS** on 2026-08-26. A second search method, `grid-search`, was implemented
purely through the `StrategyGenerator` port and registered in the shared generator
catalog. It produces valid, deterministic candidates that flow through the exact
same downstream pipeline as `random-search`. Adding it changed only the strategy
module and one registry line; the Backtester, Evaluator, RankingPolicy,
LeaderboardProjector, the candidate/job schemas, the search coordinator, the API
controllers, and the web app were all unchanged.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-1.2 -> QA-MOD-002 -> D-04 -> ADR-002.
- Proof definition: `docs/validation/architecture-proof-plan.md`,
  `PROOF-REPLACE-001`.

## Code and dependency identity

- Base commit: `975ce6ac09f46e4dad8b40889363c0aae182ea64` (`feat(v3): done UI-03`).
- Version tag: none; the Project Owner has not created `v3.0-demo`.
- The proof ran on the uncommitted implementation worktree. No commit or tag was
  created because Git actions require separate owner approval.
- pnpm lock SHA-256:
  `e37cb2406761a8c2e119990792f2c7f48f381c5188bff777cba8ac7a6fb29c54`.
- Grid generator SHA-256:
  `8867e5d916b9f7785c870bfff0ff5391358164369cc51dd5b923eba83b1dcf69`
  (`apps/backend/src/modules/strategy/application/grid-strategy-generator.ts`).
- Grid generator proof test SHA-256:
  `847bf45cd364aaca96ed533e54a91baa1e061cb813df36ec311c8a4687098029`
  (`apps/backend/src/modules/strategy/application/grid-strategy-generator.test.ts`).

## Environment and configuration

- OS: Windows_NT 10.0.26200.
- CPU: 11th Gen Intel(R) Core(TM) i5-11400F @ 2.60GHz.
- Memory: 17,042,784,256 bytes.
- Node.js: v25.9.0.
- PostgreSQL: `postgres:16-alpine`, Docker Compose service healthy, host port 5433.

## The second generator

`grid-search` (`GridStrategyGenerator`) implements the same `StrategyGenerator`
port as `random-search`. It differs in method: rather than drawing candidates at
random from a seeded source, it enumerates a deterministic cartesian grid of
sample points over each strategy's parameters, so the same search space yields the
same candidate sequence every run with no seed dependence. It emits single-strategy
candidates through the shared `createCandidateStrategy` factory, exactly the type
every downstream component already consumes.

## Downstream is unchanged (the proof)

Registering the generator is the only wiring change. The complete diff against the
base commit touches four files, all inside the strategy module:

```
 M apps/backend/src/modules/strategy/application/built-in-strategy-generator-registry.ts
 M apps/backend/src/modules/strategy/index.ts
?? apps/backend/src/modules/strategy/application/grid-strategy-generator.ts
?? apps/backend/src/modules/strategy/application/grid-strategy-generator.test.ts
```

None of the components the proof names appears in the diff:

- Backtester (`experiment/domain/backtester.ts`) - unchanged.
- Evaluator (`experiment/domain/evaluator.ts`) - unchanged.
- RankingPolicy (`experiment/domain/weighted-return-drawdown-policy.ts`) - unchanged.
- LeaderboardProjector (`experiment/application/leaderboard-projector.ts`) - unchanged.
- Candidate and job schemas (`strategy/domain/candidate-strategy.ts`, the
  `search_candidates` / `backtest_runs` migrations) - unchanged.
- Search coordinator (`experiment/application/search-coordinator.ts`) - unchanged.
- API controllers and the web app (`apps/web`) - unchanged.

The search coordinator resolves whichever generator a run names through the
registry and treats its candidates opaquely; it never branches on which generator
produced a candidate. This is why the coordinator's own 17-test integration suite
passes without modification while the new generator is present.

## Commands and automated evidence

```powershell
pnpm exec vitest run `
  apps/backend/src/modules/strategy/application/grid-strategy-generator.test.ts `
  apps/backend/src/modules/strategy/application/strategy-generator-registry.test.ts `
  apps/backend/src/modules/api/generator.controller.test.ts `
  apps/backend/src/modules/experiment/application/search-coordinator.test.ts
```

- `grid-strategy-generator.test.ts` (6): the generator appears in the shared catalog
  next to `random-search`; every emitted candidate is a valid single strategy; the
  same request reproduces the same sequence; no duplicate content is emitted; a finer
  `pointsPerParameter` samples more candidates; an invalid configuration is rejected.
- `strategy-generator-registry.test.ts` (6) and `generator.controller.test.ts` (1):
  the registry and the catalog endpoint list any registered generator with no change
  to the controller.
- `search-coordinator.test.ts` (17): the downstream search pipeline is unchanged and
  green with the second generator registered.

Full suite result at the time of the proof: 364/364 across 69 files, typecheck green
across all three packages, changed files lint clean.
