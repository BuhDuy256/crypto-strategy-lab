# V3 - Automated Discovery - Definition of Demoable Evidence

## Result

**PASS** on 2026-08-26, on the host (pnpm) run path. All seven Definition-of-Demoable
conditions for V3 (see `implementation-plan/VERSIONS.md`, section "V3 - Automated
Discovery") hold: every one is backed by a test, a proof, or a CLI/live run recorded
below and re-run fresh here.

This record covers the host path only. It is **not** the Compose integration gate:
bringing the V3 topology up from a clean checkout through Docker Compose is `DEMO-01`
and is deferred. This file does not create the `v3.0-demo` tag and does not advance
the repository validation status; both remain the Project Owner's decisions.

## Code and dependency identity

- Base commit: `970e6b13fd4268d71ae8358d18828cbb579a1fb0` (`test(v3): architecture
  proofs REPLACE-001, CONTROL-001, REP-001`).
- Version tag: none; the Project Owner has not created `v3.0-demo`.
- Working tree clean; no commit or tag was created (Git actions require separate
  owner approval).
- pnpm lock SHA-256:
  `e37cb2406761a8c2e119990792f2c7f48f381c5188bff777cba8ac7a6fb29c54`.

## Environment and configuration

- OS: Windows_NT 10.0.26200.
- CPU: 11th Gen Intel(R) Core(TM) i5-11400F @ 2.60GHz.
- Node.js: v25.9.0.
- PostgreSQL: `postgres:16-alpine`, Docker Compose service healthy, host port 5433.
- `LEADERBOARD_TOP_K` = 10 (project default).

## The seven conditions

Each condition names the automated evidence that proves it, the fresh command that
re-confirmed it here, and, where the condition asked for it, a live host run.

### 1. All three stop conditions work: candidate limit, duration limit, no improvement

- Automated: `apps/backend/src/modules/experiment/application/search-coordinator.test.ts`
  - "stops after the maximum candidate count"
  - "stops after the maximum duration"
  - "stops after no improvement for the configured number of iterations"
- Live: the host demo run below stopped on `max-candidates` and reported the reason on
  the Discovery page ("Stopped: max-candidates").
- Fresh run: the eight cited V3 test files below passed 48/48. Full suite 366/366.

### 2. Pause, resume, and cancel each survive a process restart

- Automated, `search-coordinator.test.ts`:
  - "converges a pause in progress after a coordinator restart"
  - "converges a cancel in progress after a coordinator restart"
  - "resumes from durable state after a coordinator restart without duplicating candidates"
- Automated, `apps/backend/src/modules/experiment/application/search-experiment-host.test.ts`
  (5): on start the host relaunches a driving loop for every run still active in durable
  state (resume-all), so a restarted API process recovers running, pausing, and
  cancelling runs.
- These are the durable PostgreSQL-executor realization also recorded in
  `PROOF-CONTROL-001.md`. Re-run in V6 against the BullMQ realization.

### 3. The same seed and search space produce the same candidate sequence across two runs

- Automated:
  `apps/backend/src/modules/strategy/application/random-strategy-generator-cross-process.test.ts`
  - the same seed and search space produce an identical candidate sequence in a
    separate `node --import tsx` process.

### 4. A better candidate enters the Top-K and displaces the last entry; a worse one does not

- Automated, `apps/backend/src/modules/experiment/application/leaderboard-projector.test.ts`
  (9): enter+displace, and worse-than-last is a no-op ("unchanged").
- Automated,
  `apps/backend/src/modules/experiment/infrastructure/postgres-leaderboard-projection-store.test.ts`
  (8): enter+displace against real PostgreSQL, keeping a valid contiguous Top-K.
- Live: the host demo leaderboard filled and ordered strictly by the
  `weighted-return-drawdown` score (rank 1 the only positive-return candidate), and the
  Discovery page sort control re-orders the displayed rows without changing the stored
  rank.

### 5. Deleting and rebuilding the projection reproduces the same content and hash

- Automated,
  `postgres-leaderboard-projection-store.test.ts`: "rebuild content+hash equivalence"
  (the projector's own `rebuild`).
- Live, through the operator CLI `pnpm run leaderboard:rebuild`
  (`apps/backend/src/modules/experiment/infrastructure/run-leaderboard-rebuild.ts`), on
  the host demo leaderboard (experiment `1d26d815-dd72-40f4-9ac2-b6c6e3cbc900`):

  | Step | Entry count | `LeaderboardProjector.projectionHash` |
  |---|---|---|
  | After the search run | 7 | `abf30c80c1895e8c2257c8ecc2fb2abcdc9ad5e22c56cc35d880f280a6620726` |
  | After `DELETE FROM experiment.leaderboard_entries` + `leaderboard_applied_versions` | 0 | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` (empty) |
  | After `pnpm run leaderboard:rebuild -- --experiment 1d26d815-...` | 7 | `abf30c80c1895e8c2257c8ecc2fb2abcdc9ad5e22c56cc35d880f280a6620726` |

  The rebuild is byte-identical: same seven entries, same ranks, same scores, same
  projection hash. The `projectionHash` values were read with the real
  `LeaderboardProjector.projectionHash` (the same value the automated rebuild-equivalence
  test asserts), through a throwaway measurement script that was deleted afterward. The
  deletes removed 7 entry rows and 9 applied-version rows (nine completed candidates,
  two of them displaced from the Top-K), confirming the applied-version ledger is
  rebuilt too.

### 6. Every leaderboard row resolves to its result and its frozen specification

- Automated:
  - `postgres-leaderboard-query.test.ts` (4): a ranked entry resolves to its single-strategy
    specification (id, version, parameters) and metrics, from the append-only candidate ledger.
  - `postgres-provenance-query.test.ts` (2) and
    `leaderboard-reproducibility.proof.test.ts` (2): the full reproducibility checklist
    resolves with an explicit, non-alias build identity (also `PROOF-REP-001.md`).
- Live: the top row of the host demo leaderboard (`runId 8e24fd2c-...`) resolved through
  `GET /backtests/8e24fd2c-.../result` to its result (`resultId 8d671fb8-...`, derived
  frozen `specId 04593e22-...`, `specificationHash 816ce15d...`, metrics matching the
  leaderboard row) and through `GET /backtests/8e24fd2c-.../provenance` to a complete
  checklist: engine `backtester@1.0.0` (recorded), attempt 1 with its runner id, dataset
  `sha256:955c721...` over the run's own window, and the strategy - each `recorded`.

### 7. Everything in V1 and V2 still passes

- Fresh full suite: **366 passed / 366, 70 files**, including the two V1 runner/result
  E2E suites (`backtest-runner-lifecycle.e2e`, `backtest-result-query.e2e`) that are
  environment-sensitive but passed here, and every V2 strategy/composite/catalog test.
  Typecheck green across all three packages; architecture boundary test clean.

## Commands and automated evidence

Cited V3 test files, run fresh (48 tests):

```powershell
pnpm exec vitest run `
  apps/backend/src/modules/experiment/application/search-coordinator.test.ts `
  apps/backend/src/modules/experiment/application/search-experiment-host.test.ts `
  apps/backend/src/modules/strategy/application/random-strategy-generator-cross-process.test.ts `
  apps/backend/src/modules/experiment/application/leaderboard-projector.test.ts `
  apps/backend/src/modules/experiment/infrastructure/postgres-leaderboard-projection-store.test.ts `
  apps/backend/src/modules/experiment/infrastructure/postgres-leaderboard-query.test.ts `
  apps/backend/src/modules/experiment/infrastructure/postgres-provenance-query.test.ts `
  apps/backend/src/modules/experiment/infrastructure/leaderboard-reproducibility.proof.test.ts
```

Result: 48 passed across the 8 files.

Full suite:

```powershell
pnpm test
```

Result: 366 passed / 70 files.

## Host demo run (backfill -> API + runner + UI -> Discovery)

The real end-to-end walk on the host, matching the V3 demo scenario minus the deferred
Compose gate.

1. **Backfill** 1,001 closed BTCUSDT `1h` candles for the demo window
   `[1704067200000, 1707667200000]`:

   ```powershell
   pnpm run market:backfill -- --symbol BTCUSDT --timeframe 1h --startTime 1704067200000 --endTime 1707667200000
   ```

   -> "Stored 1001 closed candles for BTCUSDT 1h."

2. **Start** the three processes: `pnpm run start:api` (port 3000, `/health` -> `{"status":"ok"}`),
   `pnpm run start:backtest-runner` ("Runner slot ready"), and `pnpm run start:ui`
   (Vite on `http://localhost:5173`).

3. **Create and run a search** over the 1,001-candle window, `random-search`, the four
   MVP strategies at `compositeSizes: [1]`, seed 42, `maxCandidates: 12`, `maxInFlight: 2`,
   via `POST /experiments/search` then `POST /experiments/:specId/search/start`
   (experiment `1d26d815-...`). Progress rose to `generated 12, submitted 12, completed 9,
   failed 3` and the run stopped with `stopReason: max-candidates`. The leaderboard filled
   with seven eligible entries, ranked by score, rank 1 the only positive-return candidate
   (bollinger-bands, `totalReturn 0.0471`). This leaderboard is the subject of the
   condition-5 CLI rebuild proof above.

4. **Discovery page** walk in the browser (`/discovery`): the generator selector listed
   both `random-search` and `grid-search` (catalog-driven, no hard-coded name); all three
   stop conditions and the search space were configurable; pressing "Start Search" created
   a run, the candidate counter rose, the leaderboard populated, and the run stopped with
   "Stopped: max-candidates" shown. A 25-candidate run filled and ordered a multi-row
   leaderboard (rank 1 score above rank 2), and the sort control re-ordered the displayed
   rows.

## Observation worth remembering (not a Demoable failure)

Across the live runs, some generated `rsi` candidates failed at backtest execution with
`STRATEGY_PARAMETER_RELATION: buyThreshold must be strictly smaller than sellThreshold`.
The `RandomStrategyGenerator` draws each numeric parameter within its own field range and
calls `validateParameters`, but the RSI cross-field relation (`buyThreshold < sellThreshold`)
is not enforced there, so an invalid `rsi` candidate is generated, submitted, and only
rejected at execution. This does not break any Definition-of-Demoable condition: the search
counts such runs as `failed`, continues, and the leaderboard still fills from the valid
candidates. It is wasteful (dead-on-arrival candidates consume a backtest slot) and is a
gap against STRAT-07 criterion 1 ("every emitted candidate passes validation"). Left
unfixed here because it is out of scope for executing the Definition of Demoable; flagged
for a separate session.
