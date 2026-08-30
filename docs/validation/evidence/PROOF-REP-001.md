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
