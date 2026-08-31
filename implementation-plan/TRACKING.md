# Implementation Tracking

Two questions this file answers:

1. **Which version are we trying to complete?**
2. **What is the next `READY` slice inside that version?**

Read [`README.md`](README.md) first. Version scope and demo contracts are in
[`VERSIONS.md`](VERSIONS.md).

---

# Current target version

The only authoritative view of where this project is. Keep these fields filled in and
true; keep conversation out of them.

| Field | Value |
|---|---|
| Implementation status | `IN PROGRESS - V1-V4 BASELINE CERTIFIED` |
| Current target version | **V5 - News and Sentiment** |
| Previous version | **V4 - Realtime Market Data: frozen at `v4.0-demo` on 2026-08-30.** V3 was frozen at `v3.1-demo` on 2026-08-29. |
| Last verified commit | `65110ec`, the committed UI-07 implementation on `v5-news-and-sentiment`. `b5e5f12`, `9a44b10`, `e777b1c`, `c46c2e1`, `93958a9`, and `6f387d6` are the committed NEWS-07, NEWS-05, NEWS-04, NEWS-03, NEWS-02, and NEWS-01 slices. |
| Next allowed action | No required V5 implementation slice is `READY`: `UI-07` is committed `65110ec` and `NEWS-06` remains optional/out of scope. Do not declare V5 demoable, move versions, tag, or automatically start the owner-deferred News backend integration/full-suite and final Compose/proof gates. The NEWS-01..NEWS-03 slice-diff review and both NEWS-05's and NEWS-07's own code-review/full-suite steps remain owner-deferred. |
| Last verified on | 2026-08-31 (UI-07 heartbeat, targeted tests, typechecks, scoped lint, diff check, two-axis review, and browser proof; V4 certification remains unchanged). |
| Last tag | `v4.0-demo`, the certified V1-V4 baseline, on `v4-realtime-market-data`. `v3.1-demo` remains the certified V1-V3 baseline on `feat/v3-automated-discovery`; `v3.0-demo` deliberately remains on `2b98139`. `v1.0-demo` and `v2.0-demo` do not exist. |
| V3 slices | 8 (`DONE` 8, `READY` 0, `IN_PROGRESS` 0, `BLOCKED` 0, `TODO` 0) — V3's own scope and its V1+V2 regression condition pass in the baseline-freeze state. |
| V4 slices | 5 (`DONE` 5, `READY` 0, `IN_PROGRESS` 0, `BLOCKED` 0, `TODO` 0) — `WS-03`, `MKT-06`, `MKT-07`, `MKT-09`, and `MKT-11` are done. |
| V5 slices | 7 required plus 1 optional (`DONE` 7, `READY` 0, `IN_PROGRESS` 0, `BLOCKED` 0, `TODO` 1) — `NEWS-01` through `NEWS-05`, `NEWS-07`, and `UI-07` are committed (`6f387d6`, `93958a9`, `c46c2e1`, `e777b1c`, `9a44b10`, `b5e5f12`, `65110ec`); the owner deferred the NEWS-01..NEWS-03 combined slice-diff review and both NEWS-05's and NEWS-07's own code-review/full-suite steps; `NEWS-06` (optional) is `TODO`. |
| History | [`JOURNAL.md`](JOURNAL.md), sections "V1", "V3", "V1/V2 recovery", "V1-V3 freeze repairs", "Demo data prerequisite", and "V4". The V4 -> V5 transition below records the version handover. The recovery entry records the durable V2 decisions that were missing from the original history. |

## V4 -> V5 transition (2026-08-30)

Target moved to V5 by the owner. This is an explicit owner decision, not an agent
action. The agent verified the five version-authorization conditions in `AGENTS.md`
against the repository before the handover, at commit `5f2f7af` with a clean tree:

- All five V4 slices (`WS-03`, `MKT-06`, `MKT-07`, `MKT-09`, `MKT-11`) are `DONE`
  and present in code.
- Every V4 Definition-of-Demoable condition passes; see the V4 release gate section.
- The V4 demo scenario ran end to end on the topology brought up through the
  documented Docker Compose path, not on host processes.
- `PROOF-RT-001` passed and is recorded under `docs/validation/evidence/`.
- Git, code, and tests agree: 94 test files and 544 tests pass, governance passes on
  a clean checkout of the release commit, and `v4.0-demo` points at `5f2f7af`.

Open items carried into V5. They do not reopen V4, which is frozen and demoable, but
someone must decide them before the slices they block can start:

- `NEWS-02` needed approved concrete news sources. Resolved on 2026-08-30: the owner
  approved CoinDesk's official RSS feed as the first source.
- `NEWS-04` needs a chosen sentiment model or service.

V5 work starts on branch `v5-news-and-sentiment`, branched from `5f2f7af`. The V4
branch stays at the frozen release commit.

## V1/V2 recovery (opened 2026-08-28)

A full V1-V3 audit was run against the repository as it exists, not against this
tracker. It verified every claim by reading code, running the suite, and driving the
live Compose stack. Nine slices marked `DONE` failed their own acceptance criteria.

Why this is a recovery and not a new version: V3's Definition of Demoable requires
"Everything in V1 and V2 still passes". That condition was only ever checked by a
green test suite, which does not cover the broken paths. So V3's own exit criteria
are not met, and the target version stays **V3**. No new version was invented; the
affected slices are `REOPENED` in place.

The audit's headline findings, each confirmed by execution:

| # | What was claimed | What is true |
|---|---|---|
| 1 | V2 delivers composite strategies | No production code ever constructs `CompositeStrategy`. `backtest-computation.ts` resolves only through `StrategyRegistry`; `search-coordinator.ts:426` throws `SEARCH_COMPOSITE_UNSUPPORTED`. A saved composite cannot be backtested at all. |
| 2 | V1 Backtest page runs a backtest | `POST /specifications` with the page's own payload returns 500 (`EXPERIMENT_FIELD_REQUIRED: execution.fillRule`). The page also sends an invented `datasetRef` and the non-existent strategy id `ma-crossover`. |
| 3 | `MKT-08` shows four charts | `ChartWidget` renders `Math.random()` candles; the API call is commented out behind an `[API INTEGRATION POINT]` note. No tests exist. |
| 4 | Both combination policies work | The domain policies are correct, but the UI sends object-keyed weights while `WeightedScorePolicy` reads an array, so the weighted path returns 400 at runtime. |
| 5 | `STRAT-08` evaluates a composite | The endpoint takes caller-supplied signals, not a composite and a data window (AC6). The UI feeds it a manual "Simulated Output" dropdown. |
| 6 | `UI-06` highlights a trade | `CandlestickChart` implements it; `BacktestPage` never calls `setSelectedTradeId`. ESLint flags the unused setter. |
| 7 | Repository baseline is green | `pnpm run lint` fails with 43 errors across 21 files, all in V1/V2 code. `pnpm test` is 360/366 with 5 real failures in `EXP-05` after excluding environment noise. |
| 8 | Evidence cells reflect Git | Eight V3 cells claimed "Not committed" although every V3 slice is committed and the tag `v3.0-demo` exists. Corrected in place on 2026-08-28. |

Recovery order, by code dependency rather than by slice number:

```text
R1  UI-04 + UI-06 + single-run specification provenance
R2  EXP-05 runner portability          R5  MKT-08 four charts   (independent)
R3  STRAT-04 + STRAT-08 composite execution seam
R4  UI-02 + composite selection on the Backtest page
R7  PROOF-EXT-001, V1/V2 demo script, repository lint
R8  fresh V1-V3 certification through the documented Compose path
```

**Recovery completion, 2026-08-29:** R1 through R8 passed. The findings above are
retained as the reason for the recovery, not as current defects. V1 and V2 are
functionally certified and V3's regression gate passes in the baseline-freeze state.
No agent advanced the product version or moved a tag. V4 implementation remains
owner-authorized work even after the handoff branch is created.

## V1-V3 freeze repairs (2026-08-29)

A runtime audit of the certified baseline found two functional defects that a green
test suite could not see. Both are fixed; see the "V1-V3 freeze repairs" entry in
[`JOURNAL.md`](JOURNAL.md) for the reasoning.

| # | Defect | Repair |
|---|---|---|
| 1 | `CandlestickChart` called `candleSeries.setMarkers`, removed from `ISeriesApi` in the installed `lightweight-charts` 5.2.1, so any render carrying trades or marker annotations threw and unmounted the React root. An `@ts-expect-error` and a mock exposing the obsolete method hid it. | Component adapted to the v5 `createSeriesMarkers` plugin; the suppression is gone; the mock now models the real module surface and a new test asserts markers go through the plugin. |
| 2 | A search that generated a candidate an earlier experiment had already run adopted that completed run. No new result is accepted for an adopted run, and acceptance is what drives the projection, so the second experiment's leaderboard stayed empty until `leaderboard:rebuild`. Membership also resolved a run to one arbitrary candidate row. | Membership resolution is plural and `apply` projects into every leaderboard the run belongs to, each with its own applied-version guard; `applyCompletedRun` projects an adopted run's existing result, called by the coordinator when it records a candidate whose run was already complete. |

Validation, run once after both repairs: `pnpm run typecheck`, `pnpm run lint`,
`pnpm run test` (421 tests in 76 files), the architecture boundary test, and
`git diff --check` clean. The Compose topology was rebuilt and V1, V2, and V3 were
walked on it: a real backtest with four metrics and 58 trades, four independent
150-candle chart windows, and two same-seed searches where the second adopted all of
the first's runs and still filled its own leaderboard without a rebuild.

## Demo data prerequisite (2026-08-29)

The freeze repairs were verified through the API and the built bundle; opening the
running application showed empty charts on every page. The cause was not domain
logic. Every page derives its default window from the current time, while the
runbook told the operator to backfill a fixed 2024 range, so each page correctly
reported it had no candles for the window it asked for. Discovery additionally
defaulted to a hard-coded 24-hour `2025-01-01` window, so its searches completed
and then ranked nothing.

Fixed in the demo/startup workflow: `pnpm run demo:seed` (`scripts/seed-demo-data.mjs`)
loads thirty days of BTCUSDT at 5m, 15m, 1h, and 4h through the existing Market
backfill CLI; `README.md` and `docs/demo-script.md` name that one command instead of
a fixed range plus hand-written epoch arithmetic; `DiscoveryPage` derives its default
window from the current time like the other pages.

Full gate re-run because production code changed: typecheck, lint, 421 tests in 76
files. Run the suite with the Compose `api` and `runner` containers stopped: they
poll the same database the tests truncate, and leaving them up produces unstable
failures in the search coordinator and runner lifecycle E2E.

User-visible verification, driven through a real browser from `docker compose down -v`,
then `up --build` and one `demo:seed`, with no page or console error in any flow:

| Flow | Seen on screen |
|---|---|
| V1 Backtest | Real candles, completed run, four metrics, eleven trades, entry/exit markers and moving-average lines; selecting a trade zoomed and drew entry/exit price lines; clearing restored the view. |
| V2 Realtime | All four widgets showing real candles at their own 5m, 15m, 1h, and 4h timeframes. |
| V2 Strategy Engine | Two catalog components combined, saved, server-evaluated; the saved composite then ran from the Backtest page with twelve trades and both components' annotations. |
| V3 Discovery | Four-row leaderboard filled with no `leaderboard:rebuild`; the top entry opened its chart, markers, trades, and full provenance checklist without unmounting. |

## V2 -> V3 transition (2026-08-25)

> **Superseded 2026-08-28.** This block is kept as written, because it records a real
> owner decision and the evidence it was based on. That evidence was wrong. "All 7 V2
> slices are `DONE` and present in code" did not hold: the composite execution path
> never existed, and `MKT-08` was running on fabricated data. The three E2E failures
> dismissed below as "environment-sensitive" are reproducible on a clean install with
> the Compose containers stopped. Read "V1/V2 recovery" above for the current state;
> nothing in this block is still authoritative.

Target moved to V3 by the V3 owner. This is an explicit owner decision, not an agent
action.

Verified in code at commit `535d4e9` (clean working tree):

- All 7 V2 slices (`STRAT-03`, `STRAT-04`, `STRAT-05`, `STRAT-08`, `MKT-08`, `UI-02`,
  `UI-06`) are `DONE` and present in code.
- `pnpm run typecheck` is green across all three packages.
- `pnpm test` last local run: 209 of 212 passed. The 3 failures are V1-area
  runner/result E2E tests (`backtest-runner-lifecycle.e2e`,
  `backtest-result-query.e2e`) and are environment-sensitive (stale DB/process state
  on the local machine), not a V2 code defect. Confirm on a clean environment.

Deferred V2 completion items. The team knows about these and accepts them as NOT
blocking the start of V3. Because they are open, V2 is NOT declared absolutely
complete and must not be tagged until they close:

- `PROOF-EXT-001` (strategy extensibility) is still `TODO`: no `MACDStrategy` and no
  evidence file under `docs/validation/evidence/`.
- ~~Docker Compose does not yet bring up the full V2 topology (API process, backtest
  runner process, SPA); `docker-compose.yml` starts PostgreSQL only.~~ **Closed
  2026-08-26 by `DEMO-01`:** `docker compose up --build` now brings up the full V1
  topology (unchanged through V2 and V3) and the V3 Compose integration gate passed.
  See the `DEMO-01` Evidence cell and
  [evidence](../docs/validation/evidence/V3-COMPOSE-INTEGRATION-GATE.md).
- `JOURNAL.md` has no "V2 - Extensible Strategy Engine" section yet.
- No `v2.0-demo` git tag exists (and no `v1.0-demo`).

## Foundation integration gate (2026-08-22)

After all six setup slices landed, the whole stack was brought up together and
re-verified as one system, beyond each slice's own validation. What was run and what it
proved is recorded in [`JOURNAL.md`](JOURNAL.md); the short version is that
`pnpm install`, `typecheck`, `lint`, and `test` (33 tests / 10 files, database-backed
included) pass together, the API, migrations, boundary test, and SPA were each
exercised end to end, and the governance validator reported only the pre-existing,
unrelated `trash` finding.

---

## Status vocabulary

| Status | Meaning |
|---|---|
| `TODO` | Defined, but at least one dependency is not `DONE`, or it belongs to a later version. Do not start. |
| `READY` | Every dependency is `DONE`, nothing external is blocking, **and it is in the current target version**. Pick from here. |
| `IN_PROGRESS` | A session is working on it. Unfinished state is in `.scratch/checkpoints/<slice-id>.md`. |
| `BLOCKED` | Something outside coding must happen first. The Blocker column says what. |
| `DONE` | Acceptance criteria met, validation run, diff reviewed. The Evidence column says where to look. |
| `REOPENED` | Was marked `DONE`, but a later verification against code, tests, or a live run contradicted that claim. The slice is not complete and its version cannot be claimed complete until it returns to `DONE`. The original Evidence text stays, so the incorrect claim remains visible; a `Reopened` note says what failed and when. |

## Priority

| Priority | Meaning |
|---|---|
| `CRIT` | On the critical path to the current target version's demo. Delaying it delays the demo. |
| `REQ` | Required for the version's exit criteria, but not on the critical path. |
| `OPT` | Optional. Excluded from the version's exit criteria. May be skipped entirely. |

## Rules

- Only mark a slice `READY` when every dependency is genuinely `DONE` **in the
  code**, not merely in this table. Check the tree before you trust the row.
- A slice outside the current target version is never `READY`.
- `BLOCKED` outranks `TODO`, because a blocker can be resolved in parallel and
  someone needs to see it. `BLOCKED` must always name the blocker.
- **Readiness promotion is mandatory.** When you mark a slice `DONE`, walk its
  direct dependents. Every dependent whose dependencies are now all `DONE`, that is
  in the current target version, and that has no blocker, moves `TODO` to `READY`.
  Do this in the same edit as the `DONE`.
- `DONE` must point at concrete evidence: a commit, a test command, a proof record.
  "It works" is not evidence.
- Keep one, or at most a few, slices `IN_PROGRESS`.
- No conversational detail here. Unfinished inner-task state belongs in
  `.scratch/checkpoints/`; durable decisions, deviations, and results belong in
  [`JOURNAL.md`](JOURNAL.md).
- Update the **Current target version** fields in the same edit as any status change,
  so the header never disagrees with the tables below it or with Git.
- A slice left unfinished at the end of a session must appear here as `IN_PROGRESS`
  with one line saying where it stopped. The checkpoint file is git-ignored and never
  reaches anyone else.
- Statuses reflect reality, not intent. Architecture documents existing is not
  implementation progress.
- A coding agent never changes the target version and never creates a Git tag.

---

# V1 - Backtesting Lab (target)

Demo contract: [`VERSIONS.md` V1](VERSIONS.md#v1---backtesting-lab)

## V1 critical path

The longest dependency chain in V1 is eighteen slices. Nothing shortens the demo more
than keeping this chain moving.

```text
SETUP-01 -> SETUP-02 -> SETUP-03 -> SETUP-04 -> SETUP-05
  -> MKT-01 -> MKT-02 -> MKT-03 -> MKT-10
    -> EXP-01 -> EXP-02 -> EXP-03 -> EXP-05 -> EXP-06 -> EXP-10
      -> UI-04 -> UI-05 -> DEMO-01
```

The other seven V1 slices are still required for the demo, but they have slack and
can be done alongside the chain rather than blocking it:

| Slice | Must be done before | Slack |
|---|---|---|
| `SETUP-06` | `MKT-04` | Can start right after `SETUP-03` |
| `MKT-04` | `MKT-05` | Can start right after `MKT-03` |
| `MKT-05` | `UI-04` | Can start right after `MKT-04` |
| `STRAT-01` | `STRAT-02` | Can start right after `SETUP-05` |
| `STRAT-02` | `EXP-01` | Can start right after `STRAT-01` |
| `EXP-04` | `EXP-05` | Can start right after `EXP-01` |
| `EXP-11` | `UI-05` | Can start right after `EXP-10` |

Two branches run in parallel with the chain from `SETUP-05` onward: the strategy
branch (`STRAT-01`, `STRAT-02`) and the chart branch (`SETUP-06`, `MKT-04`,
`MKT-05`). Neither is on the longest chain, so a second session can take one of them
without contending for the same files.

Effort is relative only. `S` is a focused session, `M` is a full session, `L` is
more than one session.

## V1 slices

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Evidence | Plan |
|---|---|---|---|---|---|---|---|---|
| SETUP-01 | CRIT | S | Workspace, TypeScript, quality commands | **DONE** | - | | pnpm workspace (`apps/{backend,web}`, `packages/api-contracts`), root `pnpm install`/`typecheck`/`lint`/`test` all pass; failure detection proven for typecheck (TS2322) and lint (`no-unused-vars`) then reverted; `pnpm-lock.yaml` committed-ready; strict TS on; commands documented in root `README.md` | [00](00-setup-and-walking-skeleton.md) |
| SETUP-02 | CRIT | S | PostgreSQL topology and configuration | **DONE** | SETUP-01 | | Docker Compose `postgres:16-alpine` service, named volume, healthcheck; row survives both container restart and full recreate; `.env.example` with 5 documented vars, no secrets; typed fail-fast config loader in `apps/backend/src/platform/config.ts` with 5 passing tests plus manual missing-var proof; typecheck/lint/test all pass; topology torn down clean | [00](00-setup-and-walking-skeleton.md) |
| SETUP-03 | CRIT | M | NestJS API, module skeleton, logging | **DONE** | SETUP-01, SETUP-02 | | Express-based Nest app (`apps/backend/src/main.api.ts`); five modules (`ApiModule`, `MarketModule`, `StrategyModule`, `ExperimentModule`, `NewsModule`) each with a single-surface `index.ts`, zero cross-module imports; `/health` endpoint; global `ValidationPipe`; structured JSON/pretty logger with request id via `AsyncLocalStorage`, proven by manual curl with/without `x-request-id` and by tests; clean SIGTERM shutdown verified manually; module-graph test in `app.module.test.ts`; typecheck/lint/test (18 tests, 7 files) all pass; governance validator has only the pre-existing unrelated `trash` finding | [00](00-setup-and-walking-skeleton.md) |
| SETUP-04 | CRIT | M | Migrations and module-owned schemas | **DONE** | SETUP-02, SETUP-03 | | Hand-rolled SQL-first migration runner over `apps/backend/migrations/*.sql`, tracked in `public._migrations`; first migration creates exactly the `market`/`strategy`/`experiment`/`news` schemas, no tables; `pnpm run migrate` idempotent (proven by running twice against an empty DB), `pnpm run migrate:reset` proven to empty the DB; `platform/database.ts` connection provider reads only from `platform/config.ts` (no literals); `platform/test-database.ts` gives Vitest isolated schema state; schema-ownership table in README; typecheck/lint/test (20 tests, 8 files, DB-backed) all pass; governance validator has only the pre-existing unrelated `trash` finding | [00](00-setup-and-walking-skeleton.md) |
| SETUP-05 | CRIT | M | Architecture boundary tests | **DONE** | SETUP-03, SETUP-04 | | Hand-rolled regex import scanner + pure rule engine (`apps/backend/src/architecture/{boundary-rules,scan-source-tree,boundary.test}.ts`) encoding all 6 rules (index-only access, allowed edges, domain purity, platform isolation, no internal reach, web/backend isolation incl. future `messaging-contracts`); each rule proven with a temporary violating fixture (clear per-file/import/rule failure message), then reverted — tree confirmed clean afterward; runs automatically in `pnpm run test` (27 tests, 9 files); typecheck/lint pass; governance validator has only the pre-existing unrelated `trash` finding | [00](00-setup-and-walking-skeleton.md) |
| SETUP-06 | REQ | M | React SPA workspace and shell | **DONE** | SETUP-01, SETUP-03 | | Vite+React+TypeScript SPA in `apps/web` with `react-router-dom` shell (5 routes: Backtest/Realtime/Strategy Engine/Discovery/News, placeholder content except Backtest which is also placeholder-level per V1 scope — real content is `UI-04`); dev proxy `/api` -> backend; single typed API client `apps/web/src/api/client.ts` (`getHealth()`), `HealthResponse` type added to `packages/api-contracts`; live health shown in header, proven with backend+dev-server running (`{"status":"ok"}` via proxy); client-side navigation proven by `App.test.tsx` (no remount across all 5 links); production build succeeds (34 modules, ~74 KB gzip); typecheck covers `apps/web`; boundary test still passes with the new `apps/web` tree; governance validator has only the pre-existing unrelated `trash` finding | [00](00-setup-and-walking-skeleton.md) |
| MKT-01 | CRIT | M | Candle contract, provider port, contract suite | **DONE** | SETUP-05 | | Contract, port, fake, reusable conformance suite, and deliberately broken-provider cases implemented; canonical `pnpm run typecheck` and `pnpm run lint` pass; canonical `pnpm run test` passes 61 tests in 13 files with PostgreSQL 16 healthy; governance passes 1,108 checks. | [01](01-market-and-realtime.md) |
| MKT-02 | CRIT | M | Binance historical adapter | **DONE** | MKT-01 | | Native-fetch HTTP wrapper and Binance Spot adapter map recorded 12-field fixtures, page at 1,000 rows, enforce closed/ascending/continuous/in-range candles, translate typed errors, and back off on rate limits; unchanged provider contract suite passes; live 1,001-candle fetch returned the exact endpoints with continuity; canonical typecheck/lint pass, 77 tests in 15 files pass, governance passes 1,110 checks, two-axis review has no open finding. | [01](01-market-and-realtime.md) |
| MKT-03 | CRIT | M | Candle persistence with immutable revisions | **DONE** | MKT-02, SETUP-04 | | Migration, set-based append-only repository, global ingest watermark, and public `MarketDataQuery` implemented; canonical typecheck/lint pass; 85 tests in 16 files pass including 8 PostgreSQL repository cases; governance passes 1,110 checks; two-axis review has no open finding. | [01](01-market-and-realtime.md) |
| MKT-04 | REQ | S | Candle history endpoint | **DONE** | MKT-03, SETUP-06 | | Normalized shared response contract, validated 10,000-candle endpoint, Market DI wiring, SPA client, Market-owned CLI backfill, and real PostgreSQL E2E implemented; live Binance candle loaded and read through HTTP; canonical checks pass. | [01](01-market-and-realtime.md) |
| MKT-05 | REQ | M | Single candlestick chart | **DONE** | MKT-04 | | `lightweight-charts` candlestick and volume component, 200-closed-candle request, timeframe-owned loading, and explicit loading/empty/error states implemented; component/page/App tests pass; production build passes; manual browser run rendered real 1h BTCUSDT data, changed 4h to empty, restored 1h, and logged no warning/error. | [01](01-market-and-realtime.md) |
| MKT-10 | CRIT | S | Dataset snapshot and manifest | **DONE** | MKT-03 | | Content-addressed immutable manifests, range-scoped watermark, canonical SHA-256, exact resolution, explicit gaps, mutation trigger, and five PostgreSQL integration cases implemented; canonical checks pass. | [01](01-market-and-realtime.md) |
| STRAT-01 | REQ | M | Strategy contract, descriptor, registry, annotations | **DONE** | SETUP-05 | | Pure declared-input contract, normalized signal, compact parameter schema, guarded startup registry, and five generic annotations implemented; nine contract tests and boundary checks pass. | [02](02-strategy-and-composition.md) |
| STRAT-02 | REQ | M | Indicator primitives and the first strategy | **DONE** | STRAT-01 | | Pure SMA primitive and registered `MAStrategy` implement validated 10/20 defaults, all four price sources, close-time crossover, explicit warm-up hold, and aligned line annotations; 21 strategy tests pass. | [02](02-strategy-and-composition.md) |
| EXP-01 | CRIT | M | Immutable run specification | **DONE** | MKT-10, STRAT-02 | | Typed V1 JSONB content, draft editing, exhaustive runtime validation, dataset/strategy resolution, canonical freeze hash, build provenance, restart reads, and database immutability implemented; 10 lifecycle tests pass. | [03](03-experiment-backtest-evaluation.md) |
| EXP-02 | CRIT | L | Deterministic backtester | **DONE** | EXP-01 | | Pure deterministic simulator implements next-open long/short/reversal, adverse slippage, entry/exit fees, available-equity sizing, optional percentage exits with stop-first ties, final liquidation, and annotation passthrough; hand-checked and separate-process canonical-hash tests pass. | [03](03-experiment-backtest-evaluation.md) |
| EXP-03 | CRIT | M | Evaluator and the MVP metric set | **DONE** | EXP-02 | | Versioned extensible evaluator implements total return, strict-positive win rate, closed-trade maximum drawdown, and trade count; nine hand-checked edge and validation tests pass, with full regression at 159 tests. | [03](03-experiment-backtest-evaluation.md) |
| EXP-04 | CRIT | M | BacktestExecutor port and durable run record | **DONE** | EXP-01 | | Broker-neutral executor port, durable idempotent run and attempt schema, atomic skip-locked lease claims/reclaim, complete durable job identity, start/status HTTP contracts, and SPA client methods implemented; concurrency, lease, service-order, and HTTP tests pass. | [03](03-experiment-backtest-evaluation.md) |
| EXP-05 | CRIT | M | Backtest runner process | **DONE** | EXP-04, EXP-03 | | **Functionally restored 2026-08-28** (R2): source-mode Worker Threads now enter through the installed `tsx` scoped import API, while compiled workers keep the existing JavaScript path. The focused worker test passes on Node v22.19.0/Windows; the real PostgreSQL process-lifecycle E2E passes API-stop independence with two runners, hard-kill/reclaim at attempt 2, and graceful claim release/replacement completion. **Reopened 2026-08-28** (audit, R2): five of its own proof tests failed on the host path after a clean `pnpm install --frozen-lockfile`, with the Compose `api`/`runner` containers stopped to rule out contention. `worker-thread-backtest-computation.test.ts` failed 2/3 with `Cannot find module ...modules\strategy\index.js` from `backtest-computation.worker.ts` — the CPU-isolation claim. `integration/backtest-runner-lifecycle.e2e.test.ts` failed 3/3, two by 120s timeout, covering exactly "API-stop independence" and "hard-kill/reclaim", which are V1's demo step 10 and its Definition-of-Demoable condition. Original claim, kept as written: "Separate process and start command, configurable concurrent slots, durable claim/heartbeat/cancellation, Worker Thread CPU isolation, graceful release and fenced stale owners implemented. Process E2E proves two ready runners, API-stop independence, hard-kill/reclaim at attempt 2, correlation logging, and active graceful release; full suite passes 177 tests." | [03](03-experiment-backtest-evaluation.md) |
| EXP-06 | CRIT | M | Result acceptance with provenance | **DONE** | EXP-05 | | One PostgreSQL transaction atomically persists immutable result, metrics, ordered trades, complete provenance and completion state; engine/metric/runtime identities are verified, duplicates are content-checked, stale attempts fenced, and expired attempts terminally recorded. Store and process lifecycle tests pass. | [03](03-experiment-backtest-evaluation.md) |
| EXP-10 | CRIT | S | Single backtest result query surface | **DONE** | EXP-06 | | Accepted run-keyed summary and paged-trades endpoints implemented through an Experiment query port, thin controller, PostgreSQL projection, deep shared runtime contracts, and SPA client. Pending/failed/missing/completed, multipage, out-of-range, zero-trade, unsafe paging, and corrupt nested data are covered; full suite passes 184 tests and two-axis review has no blocker. | [03](03-experiment-backtest-evaluation.md) |
| EXP-11 | REQ | S | Visualization annotation capture | **DONE** | EXP-10, STRAT-01 | | Implemented annotation downsampler and integrated into PostgresResultAcceptanceStore. Fixed API process timeout in E2E tests (`integration/backtest-runner-lifecycle.e2e.test.ts`). Tests pass. | [03](03-experiment-backtest-evaluation.md) |
| UI-04 | CRIT | M | Backtest page with metrics and trades | **DONE** | EXP-10, MKT-05 | | Original claim, kept as written: "Interaction defaults accepted (2s poll, 20 trades/page, static panel). Implemented metrics dashboard, trade list, pagination, and sorting; test suite and visual inspection confirmed." **Reopened 2026-08-28** (audit, R1): pressing Start returned 500, used an invented DatasetRef and an unregistered strategy id, assembled Experiment business configuration in the browser, and hid the error. **Functionally restored 2026-08-28:** the page now sends a versioned dataset-window and catalog-strategy request; the backend resolves the real content-addressed dataset, supplies the V1 execution and metric profiles, and freezes real runtime provenance. Focused backend/frontend tests pass; the specification E2E uses the real DatasetService and StrategyRegistry; a rebuilt Compose run completed over 1,000 real Binance candles with 58 trades, four metrics, and recorded provenance. **Historical deviation:** AC9 remains failed because the pre-existing backend endpoint was unusable and required a bounded backend enabler. The original implementer should have stopped and reported that missing capability. | [06](06-ui-and-demo-integration.md) |
| UI-05 | REQ | M | Signal and trade visualization | **DONE** | UI-04, EXP-11 | | **Certified 2026-08-29:** the restored V1 Compose flow completed with four real trades, including final liquidation, and returned stored strategy annotations through the same result surface used by the page. Focused `CandlestickChart` and `BacktestPage` tests cover annotation rendering, trade markers, selection, deselection, and visible-range movement; the final full suite passes. Original reopening retained for history: the 2026-08-28 audit could not verify this slice while UI-04 was broken. | [06](06-ui-and-demo-integration.md) |
| DEMO-01 | CRIT | M | Run documentation, Compose topology, and version demo script | **DONE** | UI-04, UI-05 | | **Certified 2026-08-29:** `docs/demo-script.md` now includes V1 and V2 regression walkthroughs. A fresh `docker compose up --build -d` brought up only `postgres`, one-shot `migrate`, `api`, `runner`, and `web`; health passed. Runtime proof completed a real MA backtest with four metrics/trades/provenance, a saved MA+RSI composite with server evaluation and component annotations, four independent chart API windows with 150 real candles each through the web proxy, and a five-candidate V3 regression with five ranked entries. **Recertified 2026-08-30 for V4:** `docs/demo-script.md` gained the V4 realtime walkthrough, and the Compose topology now also brings up `redis` and `market-ingest`; see the V4 Compose integration gate. | [06](06-ui-and-demo-integration.md) |

## V1 proof

| ID | Proof | Status | Prerequisites | Evidence |
|---|---|---|---|---|
| PROOF-PROVIDER-001 | Provider replaceability | **DONE** | MKT-01, MKT-02, MKT-03, MKT-04, MKT-05 | [PASS evidence](../docs/validation/evidence/PROOF-PROVIDER-001.md): full second-provider contract, immutable dataset path, unchanged production chart browser render. |

## V1 blockers needing a human

None. The decisions for `EXP-02`, `EXP-04`, and `EXP-05` are accepted and recorded.

---

# V2 - Extensible Strategy Engine

Demo contract: [`VERSIONS.md` V2](VERSIONS.md#v2---extensible-strategy-engine)

**V2 is functionally certified in the V1-V3 baseline-freeze state.** The
2026-08-28 audit correctly disproved the earlier completion claim; the reopened
functional paths were repaired and the consolidated 2026-08-29 test and Compose gates
passed. See "V1/V2 recovery" near the top of this file. The owner still controls any
tag or product-version transition.

This table had no Evidence column until 2026-08-28. That absence is part of why V2's
claims went unchecked for so long: seven slices were marked `DONE` with nowhere to
record what proved it. The column below was added during the V1/V2 recovery.

| ID | Priority | Effort | Slice | Status | Depends on | Evidence | Plan |
|---|---|---|---|---|---|---|---|
| STRAT-03 | REQ | M | The remaining three MVP strategies | **DONE** | STRAT-02 | Four strategies register and produce hand-checked signals; `rsi`, `bollinger-bands`, and `support-resistance` each have domain tests that pass. Known gap, not blocking this slice: RSI enforces `buyThreshold < sellThreshold` inside `evaluate` rather than `validateParameters`, so an invalid combination is accepted at save/generate time and only fails at execution (see `STRAT-07` criterion 1 and `STRAT-08` AC2). | [02](02-strategy-and-composition.md) |
| STRAT-04 | REQ | M | Composite strategy and combination policy | **DONE** | STRAT-03 | **Functionally restored 2026-08-28** (R3): production instantiates saved composites from real built-ins, persisted object-keyed weights are runnable, and the Worker Thread receives the immutable composite definition. A real Binance/PostgreSQL run completed at attempt 1 with MA+RSI component annotations, 4 trades, and 4 MVP metrics. **Reopened 2026-08-28** (audit, R3): nothing in production instantiated `CompositeStrategy`; the worker resolved built-ins only, and the weighted policy could not read the writer's weights. | [02](02-strategy-and-composition.md) |
| STRAT-05 | REQ | S | Strategy catalog query and endpoint | **DONE** | STRAT-03, SETUP-06 | Verified 2026-08-28. `GET /strategies` returns all four descriptors with id, version, name, description, category, capabilities, and full parameter schema. AC4 is genuinely covered: `strategy.controller.test.ts` injects a registry holding only a fake strategy and asserts it appears, with no controller change. | [02](02-strategy-and-composition.md) |
| STRAT-08 | REQ | S | Composite persistence and endpoint | **DONE** | STRAT-04 | **Functionally restored 2026-08-28** (R3): save rejects invalid cross-parameter relations and unusable policy configuration; `POST /strategies/composites/:id/evaluate` loads real candles and evaluates the stored composite on the server. Runtime proof used 97 real BTCUSDT 1h candles, returned `hold` at the real final candle time, then froze and completed the same composite through the runner. **Reopened 2026-08-28** (audit, R3): the old endpoint accepted caller-supplied fake signals and invalid composites could be stored permanently. | [02](02-strategy-and-composition.md) |
| MKT-08 | REQ | M | Four charts with independent timeframes | **DONE** | MKT-05 | **Functionally restored 2026-08-28** (R5): all dummy and `Math.random` candles are removed; each stable chart widget loads its own 150-candle window through the shared typed API client and shows loading, empty, or visible error state. Focused isolation tests pass 5/5. Rebuilt Compose served the Realtime route and returned real Binance candles through the nginx/API path for `5m`, `15m`, `1h`, and `4h`. | [01](01-market-and-realtime.md) |
| UI-02 | REQ | M | Strategy Engine page | **DONE** | STRAT-05, STRAT-08 | **Functionally restored 2026-08-28** (R4): simulated signals are removed. Catalog components are saved as a validated composite, the backend evaluates them over the chosen real market window, and saved immutable `id@version` composites appear on the Backtest page with empty runtime parameters. Focused Strategy Engine/Backtest/chart tests pass, web typecheck passes, and rebuilt Compose completed a saved MA+RSI composite with 9 trades, four metrics, and both components' annotations. Deferred P2: policy ids and version remain frontend constants until a policy catalog/schema exists. | [06](06-ui-and-demo-integration.md) |
| UI-06 | REQ | S | Trade detail and chart highlight | **DONE** | UI-05 | **Functionally restored 2026-08-28** (R6): trade rows select, replace, deselect, and clear the active trade; the chart draws entry/exit lines and uses `setVisibleRange`, which correctly accepts final-liquidation exit timestamps at candle close. Focused Backtest/chart tests pass 23/23. The rebuilt Compose composite result supplied 9 real trades, including a final-liquidation close timestamp, through the same result seam. No browser automation harness exists, so the click behavior is proven at the public component seam pending consolidated manual certification. | [06](06-ui-and-demo-integration.md) |

| ID | Proof | Status | Prerequisites | Evidence |
|---|---|---|---|---|
| PROOF-EXT-001 | Strategy extensibility | **DONE** | STRAT-03, STRAT-05, UI-02, EXP-06 | [PASS evidence](../docs/validation/evidence/PROOF-EXT-001.md): MACD added through the existing Strategy contract and registry; representative backtest/result acceptance plus full regression pass. |

---

# V3 - Automated Discovery

Demo contract: [`VERSIONS.md` V3](VERSIONS.md#v3---automated-discovery)

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Plan |
|---|---|---|---|---|---|---|---|
| STRAT-06 | REQ | M | Candidate contract and canonical hashing | **DONE** | STRAT-04 | | [02](02-strategy-and-composition.md) |
| STRAT-07 | REQ | M | Generator port, random search, generator catalog | **DONE** | STRAT-06 | | [02](02-strategy-and-composition.md) |
| SEARCH-03 | REQ | S | Versioned ranking policy | **DONE** | EXP-03 | | [04](04-search-and-leaderboard.md) |
| SEARCH-01 | REQ | L | Search coordinator and stop conditions | **DONE** | STRAT-07, EXP-05, SEARCH-03 | | [04](04-search-and-leaderboard.md) |
| SEARCH-02 | REQ | M | Durable pause, resume, cancel | **DONE** | SEARCH-01 | | Durable control states (migration `0011`: `running`->`pausing`->`paused`, `*`->`cancelling`->`cancelled`) with the requested state written first and the coordinator converging in `tick`. Pause stops new submission and reports `paused` only after in-flight drains; resume continues from the durable ledger with no duplicated candidates; cancel terminates pending (queued) candidate runs as `failed`/`BACKTEST_CANCELLED_REASON`, records a first-class `cancelled` disposition in the append-only `search_candidate_dispositions` ledger (migration `0012`) counted separately from `failed` in progress, and signals running ones via `cancellation_requested` for the EXP-05 cooperative checkpoint, leaving completed results intact. Stale-claim sweep reclaims dead-runner leases (EXP-04) and is idempotent. `resumeAll`/`listActive` relaunch `running`/`pausing`/`cancelling` loops after an API restart. Pause/resume/cancel endpoints added. Tests: `search-coordinator.test.ts` (+8: pause convergence, resume no-dup, cancel keeps completed, cooperative signal, restart-mid-pause, restart-mid-cancel, illegal transition, stale recovery + sweep idempotence), `search-experiment-host.test.ts` (5, restart/relaunch wiring), `search.controller.test.ts` (+6). Full suite 307/307 in 59 files; typecheck green across all three packages; changed files lint clean; two-axis review applied (re-runnable migration, sync comments, host wiring test). Committed (this claim was stale: every V3 slice is committed; see Git). | [04](04-search-and-leaderboard.md) |
| SEARCH-04 | REQ | M | Leaderboard projection | **DONE** | SEARCH-01, SEARCH-03 | | Idempotent, rebuildable Top-K projection (migration `0013`: `leaderboard_entries` + `leaderboard_applied_versions`). The projector (`leaderboard-projector.ts`) takes one evaluated result and nothing caller/transaction-specific (AC8), resolves the leaderboard from the run's `search_candidates` membership, ranks with the base experiment's `SEARCH-03` policy, and keeps the best K under the policy's total order. Idempotent + stale-safe via a per-candidate applied-version ledger that guards a displaced candidate too, not only on-board ones. Writes serialized per leaderboard by `pg_advisory_xact_lock`. Driven synchronously from the acceptance path in a V6-consumer style: `DurableBacktestResultAcceptor` calls the projector after the authoritative result commits, best-effort (a projection failure is logged, never un-accepts the result; recovered by the `leaderboard:rebuild` CLI). Fixed size `LEADERBOARD_TOP_K` (default 10, owner decision: project config, not a per-experiment spec field). Tests: `leaderboard-projector.test.ts` (9, incl. displaced-candidate stale guard), `postgres-leaderboard-projection-store.test.ts` (8 PostgreSQL: entry/displace, reject, duplicate + stale hash-equality, displaced-stale, rebuild equivalence, link resolution, concurrency), `backtest-result-acceptor.test.ts` (+2 hook). Full suite 327/327 in 61 files; typecheck green across three packages; changed files lint clean; boundary test clean. Two-axis review (fixed point HEAD/SEARCH-02) applied: error-message term aligned to `LEADERBOARD_TOP_K`, speculative default constant removed (`topK` required), and the stale guard extended to displaced candidates. Committed (this claim was stale: every V3 slice is committed; see Git). Open item flagged to owner: the projection-seam wording ("same transaction") vs AC8 ("input is a result, not a transaction handle") — implemented per AC8; V3 durability gap between result commit and projection is recovered by rebuild and closed by the V6 outbox/consumer. | [04](04-search-and-leaderboard.md) |
| SEARCH-05 | REQ | M | Experiment and leaderboard query surface | **DONE** | SEARCH-04, EXP-06 | | Read-only query surface that reuses EXP-10. `LeaderboardQuery`/`PostgresLeaderboardQuery` return ranked entries with the candidate's strategy composition (from the append-only `search_candidates` ledger) and MVP metrics; a metric sort reorders the display only while the stored ranking-policy `rank` and the projection table are untouched; an unknown experiment returns `undefined` -> 404. `ProvenanceQuery`/`PostgresProvenanceQuery` return the baseline ten-item reproducibility checklist plus the attempt history, keyed by `runId`. `SearchAnnotationRecompute` recomputes annotations on demand from the run's frozen spec through the deterministic backtester and downsampler (never persisted as authoritative). Result and trades reuse the EXP-10 endpoints unchanged (no new result/trades controller); the progress read is reused as-is (SEARCH-01/02). New `LeaderboardController` (`GET /experiments/:specId/leaderboard?sort=`) and `BacktestController` additions (`GET /backtests/:runId/{provenance,annotations}`); api-contracts response types + guards; web client reads. No migration (existing tables only). Tests: `postgres-leaderboard-query.test.ts` (4: composition+metrics, sort-display-only, unknown->undefined, candidate-less row -> `LEADERBOARD_QUERY_CORRUPT`), `postgres-provenance-query.test.ts` (2), `search-annotation-recompute.test.ts` (2 PostgreSQL: recompute equals the annotations the real EXP-06 acceptance transaction stored, unknown->undefined), `leaderboard.controller.test.ts` (4). Full suite 339/339 in 65 files; typecheck green across three packages; changed files lint clean; boundary test clean. Two-axis review (fixed point HEAD/SEARCH-04) applied: the leaderboard read now surfaces a candidate-less projection row as corruption instead of silently dropping it (LEFT JOIN + guard), and the AC5 test was strengthened from an in-test re-derivation to a comparison against the acceptance-path-persisted annotations row. Committed (this claim was stale: every V3 slice is committed; see Git). | [04](04-search-and-leaderboard.md) |
| UI-03 | REQ | L | Discovery page | **DONE** | SEARCH-05, SEARCH-02 | Discovery page plus the minimal backend enabler that makes a search run demoable from the UI. A new `POST /experiments/search` (`SearchExperimentController` -> `SearchExperimentCreationService`) resolves a real dataset, assembles the base spec with the fixed V1 execution profile, `mvp-metrics` metric set, and `weighted-return-drawdown` ranking policy, and freezes it with the API process's runtime provenance (engine `backtester`, env lock/commit) so candidate results pass acceptance and the leaderboard fills. The single-run `POST /specifications` could not be reused: its placeholder provenance fails the runner's acceptance check. The page (`DiscoveryPage.tsx`) configures dataset window + generator + search space + all three stop conditions + seed + maxInFlight, starts the run, polls progress and the Top-K leaderboard through a swappable `SearchDataSource` (poll now, SEARCH-06 push later), shows converged control state for pause/resume/cancel (never optimistic), renders the stop reason, restores the last run from a snapshot on refresh, feeds the generator selector from the `STRAT-07` catalog (no hard-coded name), and opens an entry's trades, chart overlays, and provenance (chart candles drawn over the run's own dataset window read from provenance). No frontend business logic. api-contracts: `CreateSearchExperimentRequest/Response` + guard. Tests: `search-experiment-creation-service.test.ts` (7), `search-experiment.controller.test.ts` (4, incl. malformed->400), `DiscoveryPage.test.tsx` (6: swappable source render, refresh recovery, converged control, catalog-driven generators, configured start, entry detail), api-contracts guard (+2). Full suite 358/358 in 68 files; typecheck green across three packages; changed files lint clean; boundary test clean. Two-axis `code-review` (fixed point HEAD/SEARCH-05) applied: transport shape guard added (malformed body -> 400), entry-detail chart window now read from provenance instead of the current form (AC8/AC6), all three stop conditions exposed (AC1), and a clear template-parameter guard added. Committed (this claim was stale: every V3 slice is committed; see Git). | [06](06-ui-and-demo-integration.md) |

`SEARCH-03` comes **before** `SEARCH-01`, because the no-improvement stop condition
needs a defined comparison criterion. Ranking weights are a human decision that
should be resolved during V2 so it does not stall V3.

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-REPLACE-001 | Search replaceability | **DONE** — [evidence](../docs/validation/evidence/PROOF-REPLACE-001.md): second generator `grid-search` added through the port; downstream diff empty (only strategy module + registry changed); 364/364 tests. Committed (this claim was stale: every V3 slice is committed; see Git). | STRAT-06, STRAT-07, SEARCH-01, SEARCH-04, UI-03 |
| PROOF-CONTROL-001 | Pause, resume, cancel, stop | **DONE** — [evidence](../docs/validation/evidence/PROOF-CONTROL-001.md): all three stop conditions, pause/resume/cancel converging to the settled state, and restart recovery proven by 31 integration tests (V3 PostgreSQL realization; re-run in V6). Committed (this claim was stale: every V3 slice is committed; see Git). | SEARCH-01, SEARCH-02, EXP-05, UI-03 |
| PROOF-REP-001 | Leaderboard reproducibility | **DONE** — [evidence](../docs/validation/evidence/PROOF-REP-001.md): a rerun of the recorded backtest reproduces the stored canonical trade hash, the full provenance checklist resolves with an explicit non-alias build identity, and Top-1 resolves to its spec (new proof test + cited leaderboard/provenance/determinism tests). Committed (this claim was stale: every V3 slice is committed; see Git). | MKT-10, EXP-01, EXP-02, EXP-06, SEARCH-03, SEARCH-04, SEARCH-05 |

## V3 Definition of Demoable (host path)

**PASS** on the host (pnpm) path — [evidence](../docs/validation/evidence/V3-DEFINITION-OF-DEMOABLE.md).
All seven conditions confirmed at commit `970e6b1`: the three stop conditions,
pause/resume/cancel across a restart, seed reproducibility, Top-K enter/displace,
projection delete-and-rebuild reproducing the same content **and** hash through the
real `leaderboard:rebuild` CLI, every leaderboard row resolving to its result and
frozen spec, and V1+V2 still green (full suite 366/366). A real host demo run was
walked end to end (backfill 1,001 candles -> `start:api` + `start:backtest-runner` +
`start:ui` -> press Start on the Discovery page -> leaderboard filled and ordered).
This does **not** tag `v3.0-demo` and does **not** advance the validation status;
those remain the owner's.

## V3 Compose integration gate (Compose path)

**PASS** on 2026-08-26 — [evidence](../docs/validation/evidence/V3-COMPOSE-INTEGRATION-GATE.md).
`DEMO-01` built the full V1 topology (unchanged through V3) and the gate was
walked: `docker compose up --build` brings up `postgres`, one-shot `migrate`,
`api`, `runner`, and `web` from a clean checkout with no later-version service,
and the V3 demo scenario ran end to end on that assembled topology (start,
leaderboard fill and reorder, pause/resume/cancel converged, api-restart
survival, `max-candidates` stop, and top-entry trades/overlays/provenance). Two
topology-only defects were found and fixed (Node 22 base image for the tsx
worker-thread loader; dynamic Docker-DNS nginx upstream surviving an api
restart); no `.ts` source changed. This is the last open V3 demoability item on
the Compose path. It does **not** tag `v3.0-demo` and does **not** advance the
validation status.

---

# V4 - Realtime Market Data

Demo contract: [`VERSIONS.md` V4](VERSIONS.md#v4---realtime-market-data)

| ID | Priority | Effort | Slice | Status | Depends on | Plan |
|---|---|---|---|---|---|---|
| WS-03 | REQ | M | WebSocket gateway, Redis, Pub/Sub fan-out | **DONE** | SETUP-06, MKT-04 | [00](00-setup-and-walking-skeleton.md) |
| MKT-06 | REQ | L | Binance live ingest process | **DONE** | MKT-03, WS-03 | [01](01-market-and-realtime.md) |

MKT-06 evidence: the separate ingest role holds the Binance stream, answers pings, never stores
ticks, commits a closed candle before its best-effort notification, and deduplicates replayed
closed klines. With Redis stopped, the final manual run committed two consecutive 1m candles:
the database count moved from 1 to 3, open times `1788006480000` and `1788006540000`, both
revision 1 with one row per identity. After Redis restarted, ingest committed open time
`1788006660000` normally. Final relevant suite: 13 files and 88 tests pass; backend typecheck,
scoped lint, Compose config, and `git diff --check` pass. MKT-06 is committed on the current branch.
| MKT-07 | REQ | M | Chart subscription protocol | **DONE** | MKT-06, MKT-05 | [01](01-market-and-realtime.md) |
| MKT-11 | REQ | M | Four live chart subscriptions | **DONE** | MKT-07, MKT-08 | [01](01-market-and-realtime.md) |
| MKT-09 | REQ | L | Gap detection, recovery, provider health | **DONE** | MKT-06, MKT-02 | [01](01-market-and-realtime.md) |

MKT-09 progress: milestone M1 of 8 is done. A forced provider disconnect is now detected and marks
provider health degraded, and health is queryable. Provider health is Market Data state stored in
PostgreSQL (`market.provider_health`, migration `0015`) because ingest and the API are separate
processes and ADR-008 makes Redis ephemeral; a new `LiveIngestSupervisor` owns connection lifetime so
`MarketLiveIngestService` still means one connection generation; the API exposes
`GET /market/provider-health`. Proven against a new controllable fake Binance stream server
(`src/modules/market/testing/fake-binance-stream-server.ts`): connected plus a live candle gives
healthy, a terminated socket gives degraded, and a shutdown abort degrades nothing. Targeted suites
pass: provider health and supervisor (7 tests), the provider health controller (2 tests), and live
ingest plus architecture boundary (16 tests) with backend typecheck.

MKT-09 progress: milestone M2 of 8 is done. Reconnect now runs on increasing backoff with a
documented ceiling: base 1 second, factor 2, ceiling 30 seconds, so the schedule is 1s, 2s, 4s, 8s,
16s, 30s, 30s and never faster than 1 second. The forcing fact is Binance's documented limit of 300
connection attempts per 5 minutes per address, which a tight retry loop would exhaust in seconds.
The backoff resets only after a generation that actually delivered candles, so a socket that opens
and immediately dies cannot spin. The wait is an injected sleep, so tests assert the schedule instead
of sleeping through it, and the production default cancels its timer on abort. Proven by
`reconnect-backoff.test.ts` (4 tests) and `live-ingest-supervisor.test.ts` (7 tests): reconnect and
resumed live flow with a second connection to the fake server, the increasing schedule stopping at
the ceiling, the reset after a delivering generation, and one real-timer test showing shutdown
returns well inside the base delay rather than orphaning the timer. Backend typecheck passes.

MKT-09 progress: milestone M3 of 8 is done. `missing-intervals.ts` is a pure calculator with no
provider call, no database, and no clock of its own, so every boundary case is cheap to check. The
lower boundary is exclusive because that candle is already stored, and the upper boundary is
inclusive because that interval closed without being delivered; the forming-interval rule lives in
exactly one function, `lastClosedOpenTime`, which steps back one interval from the interval
containing now. An unknown last committed candle returns an empty gap rather than an unbounded
backfill, because repairing a range that was never subscribed is out of scope. One pass is bounded
at 1000 intervals, the maximum Binance kline page, and a longer gap is reported as truncated and
finished by repeating the pass. Proven by `missing-intervals.test.ts` (11 tests): no gap, one missing
candle, many missing candles with both boundaries asserted, the forming interval excluded, unknown
lower boundary, an out-of-order resume, the bound with truncation, a non-minute timeframe, and
misaligned input rejected.

MKT-09 progress: milestone M4 of 8 is done. `MarketGapRecoveryService` fetches and stores the candles
an outage lost, and it adds no new machinery: which candles are missing comes from the M3 calculator,
where to get them is the existing `MKT-02` Binance REST adapter through
`MarketDataProvider.fetchHistorical`, and how to store them is `PostgresCandleRepository.appendMany`,
the same append-only revision-comparing write historical backfill uses. There is no recovery table and
no second write path, because either would break the append-only rule dataset snapshots depend on.
`recover` returns only after the durable write returns, chains at most ten bounded passes while
recomputing the boundary from storage, and reports a range the provider cannot answer as incomplete
instead of looping. `PostgresCandleRepository` gained one read, `getLatestCommittedOpenTime`.

Proven against real PostgreSQL with a faked provider by `market-gap-recovery-service.test.ts`
(6 tests): exactly the missing candles stored in ascending order at revision 1 with the still-forming
interval excluded; a second recovery pass changing neither row count nor the current revision
watermark and finding nothing missing; a corrected payload still producing revision 2, which shows
the ordinary append-only path is used rather than bypassed; no gap meaning no write; a provider that
returns nothing reported as unresolved; and a never-committed stream recovering nothing.
`postgres-candle-repository.test.ts` still passes (9 tests), including the guard that no UPDATE or
DELETE targets the candle table. Backend typecheck passes.

MKT-09 progress: milestone M5 of 8 is done, covering criteria 5 and 7. A Market-owned gap query
answers whether an unresolved known gap remains in a range, exposed as `GET /market/gaps` and bound
through the new `MARKET_GAP_QUERY` port. It reuses the arithmetic dataset creation already had:
`findDatasetGaps` was split so its range-based body is now `findMissingRanges`, and both callers use
it, so the dataset view and the operational view cannot disagree. The query reads current state with
no revision watermark, because the question is about the stream as it stands now, and it reports
only - it never fetches from a provider and never repairs.

The dataset resolver was deliberately not changed. The existing append-only revision plus
`DatasetRef.revisionWatermark` rule already makes a pre-outage snapshot stable under recovery, so M5
adds a test that shows it rather than code that enforces it. `market-recovery-invariants.test.ts`
(5 tests, real PostgreSQL) proves: the outage range reported unresolved with the exact missing run
and reported resolved after recovery; a complete range resolved with no recovery; a misaligned range
rejected; a dataset snapshot created before the outage, over a range recovery later writes into,
still resolving to the same series, the same integrity hash, the same dataset id, and the same
revision watermark; and a snapshot taken after recovery seeing all six candles with no gaps, so
recovery is invisible only to snapshots older than it. `market-dataset-service.test.ts` and the
architecture boundary tests still pass (12 tests), and backend typecheck passes.

MKT-09 progress: milestone M6 of 8 is done, covering criterion 6. Recovery is now wired into the
connection supervisor, so the whole flow runs without anyone invoking it: healthy live ingest,
disconnect, degraded, backoff, reconnect, recover the missed closed intervals over REST, healthy.
Two decisions carry the correctness. The supervisor starts the next connection generation and runs
recovery concurrently rather than before it, so an interval that closes while recovery is running is
either delivered live or fetched over REST, and the append-only compare makes that overlap harmless.
The health tracker gained a recovery hold, so a live tick arriving on a freshly reconnected socket
cannot report healthy while the outage candles are still missing; an incomplete recovery, or one
that throws, keeps health degraded with the reason `a known gap remains after recovery` and is
retried on the next cycle, which works because the recovery boundary is recomputed from storage
every call. `live-ingest-supervisor.test.ts` proves all four cases against the fake stream server
(11 tests). The 7 non-PostgreSQL MKT-09 suites plus the architecture boundary tests pass (48 tests);
backend typecheck, scoped lint, and `git diff --check` pass.

Docker Desktop stopped partway through the session, so the three PostgreSQL-backed suites cannot
currently run. All three passed earlier in the same session, at M4 and M5, and M6 changes no SQL or
repository code, so this is an environment block rather than a regression. They must be re-run
before the slice can close.

MKT-09 progress: milestone M7 of 8 is done, covering criterion 8 at component level. The SPA shell
now shows Market Data's provider health next to the existing backend indicator, reading it through
`GET /market/provider-health` with a new `ProviderHealthResponse` contract and guard in
`api-contracts`. The component only displays: it computes no gap, calls no exchange, repairs
nothing, and never clears chart data, so candles already on screen survive an outage. An unreachable
API is a separate state from a degraded provider, so a dead API cannot look like an exchange outage.
`CandlestickChart.tsx` and `ChartWidget.tsx` are untouched, so the `MKT-11` criterion 6 guard still
holds. `ProviderHealthIndicator.test.tsx` proves degraded appears with its reason during an outage,
that recovery has its own reason, and that returning to healthy clears it. The SPA and contracts
suites pass (11 files, 85 tests), and workspace typecheck, lint, and `git diff --check` pass.

MKT-09 progress: milestone M8 of 8 is done. The manual controlled outage ran on final Compose images
rebuilt from this code, cutting only the provider connection so PostgreSQL stayed reachable and the
degraded state was observable. Outage 01:57:28 to 02:00:01 UTC on 2026-08-30. During it the provider
health endpoint reported `degraded: the provider closed the stream` and backoff held at the
documented 30 s ceiling. While REST was blocked too, recovery reported `a known gap remains after
recovery` and refused to report healthy, so the negative path is proven in production and not only in
tests. After restore, ingest recovered exactly the three missing 1m candles plus one each for 5m, 15m
and 1h, health returned to healthy, and live flow resumed. Re-running recovery added no duplicate:
row count moved by one, and that row is a newly closed interval. Across the whole table the
duplicate-identity count is 0 and the count of rows with revision above 1 is 0. The gap query over
the affected range reports `resolved: true` with 8 of 8 candles present. The dataset snapshot taken
before the outage, over the range recovery wrote into, still resolves to the identical integrity hash
`f5211e8d...`, the same watermark and the same two candles.

One real defect was found by the real environment and fixed inside the slice. With more than five
configured timeframes the Binance connection died about 450 ms after opening, every time, because the
subscription registry opened on the first stream and added the rest with SUBSCRIBE control frames,
exceeding Binance's documented limit of five incoming messages per second. The registry now opens one
connection carrying every stream requested in the same tick, through the combined-stream URL, which
costs no control frames. Confirmed by isolating the cause with a single-stream run, by two new tests,
and on the rebuilt image: one connection with all eight streams, zero disconnects, healthy, pings
answered.

All eight criteria are proven. AC8 is now browser-proven on the final Compose images by
`pnpm run smoke:mkt09` (exit 0): the shell observed `healthy -> degraded -> healthy` in 7,832 ms and
9,969 ms; the API held four subscriptions throughout; 5m and 15m durable counts and identities were
retained during outage; recovery kept the same page alive, delivered a fresh live update, and left all
four charts `connected/live`. The smoke's window marker proved no full reload. At final evidence the
default `WS_OUTBOUND_BUFFER_MAX=32` was verified, so the temporary larger-buffer diagnostic is not
part of the result.

Browser recovery exposed one API transport defect in the slice: a snapshot refresh temporarily makes
the Socket.IO transport non-writable, and queuing ephemeral ticks behind it could either strand old
charts or fill the bounded queue and disconnect them. `market-realtime.gateway.ts` now sends only a
busy `candle.tick` through Socket.IO volatile delivery; snapshots and closed candles retain the bounded
durable path. A new gateway regression test was red before the change and green after it. Targeted
gateway test, backend typecheck, targeted lint, `git diff --check`, and the final browser smoke pass.
MKT-09 is committed at `4e00730`. The slice is `DONE`; the later V4 freeze record
holds the final regression, demo, and proof evidence.
MKT-11 evidence: the four `MKT-08` identifiers `chart-1`..`chart-4` are now the subscription identifiers,
and the per-chart subscribe/retarget/cleanup lifecycle lives in one shared hook,
`apps/web/src/hooks/use-chart-subscription.ts`, reusing the `MKT-07` protocol unchanged. All six criteria
are proven. Criteria 1-5 were proven in a real browser by `pnpm run smoke:mkt11` against Compose `api`/`web`
images rebuilt from this code: four charts with four distinct identifiers holding `5m`, `15m`, `1h`, and
`4h` at once, each with a watermarked snapshot and real candles; `GET /api/realtime/subscriptions`
reporting 4; one tick per timeframe reaching only its own chart; `chart-1` retargeted to `1h` taking a new
snapshot with real candles and no stale forming bar while `chart-2`-`chart-4` kept their snapshot count,
durable count, and forming bar and went on receiving ticks; a value planted in the document before the
change still present after it, so there was no page reload; the count still 4 after the change; and 0 once
the page closed. Criterion 6 is a guard test: `ChartWidget.test.tsx` asserts the `MKT-05` renderer receives
exactly `candles` and `state`, and `CandlestickChart.tsx` is unchanged by this slice.

One architecture defect was found and fixed inside the slice: the API held the notion of "four". The
registry's per-client subscription cap was a hard-coded default of 4, which `MKT-11` forbids. It is now the
configured resource bound `WS_SUBSCRIPTION_MAX` (default 32) threaded through `config.ts`, the `ApiModule`
provider, and the gateway; the registry parameter has no default at all. `GET /realtime/subscriptions` was
added so the API can report how many subscriptions it actually holds, which is what makes criterion 4
checkable outside a unit test. Relevant suites: 12 files and 90 tests pass across the SPA, the subscription
registry, the new status controller, and platform config. Root typecheck, scoped lint, and `git diff --check`
pass. The smoke requires `market-ingest` stopped, for the sequence reason recorded for `MKT-07`; it stops and
restarts it itself. The `MKT-11` diff is committed at `6b3a326`. The two-axis review was skipped on the owner's explicit
instruction, not overlooked, so this diff carries no review record. Anyone auditing V4 later should read
`MKT-11` as validated by tests and browser smoke only, the same way `WS-03` is.


MKT-07 evidence: live updates are now two wire message types, `candle.tick` and `candle.closed`,
split into a `MarketLiveNotification` that ingest publishes without any client identity and a
`MarketLiveMessage` that the gateway stamps with the subscription it matched. The SPA keeps the
forming bar in separate state from the durable series. All seven criteria are proven. Criteria 1-6
were proven in a real browser by `pnpm run smoke:mkt07` against Compose `api`/`web` images rebuilt
from this code, on one chart: a snapshot with a watermark and zero live updates before it, a tick
that moved the forming bar to open time `1788010800000` while the durable series stayed at 150
candles, a committed candle that ended the series at that open time and cleared the forming bar,
the same committed candle republished and not applied a second time, a fresh snapshot after
`docker compose restart api` with no stale forming bar, and a chart retargeted to `15m` that stopped
receiving `5m` updates. Criterion 7 (bounded outbound buffer, slow-client disconnect) is not
browser-observable. WS-03's bound is reused unchanged, but this slice adds ticks as a second,
higher-rate source of outbound traffic, so the bound is now also exercised by tick traffic in the
registry tests rather than by closed candles alone. Relevant suites: 22 files and 136 tests pass
across the API gateway, market realtime, SPA, and contracts. Root typecheck, scoped lint, and
`git diff --check` pass. The smoke requires `market-ingest` stopped; see the `JOURNAL.md` entry
for why.

The MKT-07 diff is committed at `fce0741`. The two-axis review ran on it before the commit and produced four accepted changes: live delivery
message shapes became interfaces per `CODING_STANDARDS.md`; the candle guard regained a type
predicate and lost its flag parameter; a tick can no longer advance the durable revision watermark;
and two test gaps closed, the ingest wire-type seam and the outbound bound under tick traffic.
Typecheck, the relevant suites, scoped lint, `git diff --check`, and the one-chart browser smoke
were all re-run on the post-review code. Known debt, not fixed: `scripts/smoke-mkt07.ts` repeats the
bootstrap block of `scripts/smoke-ws03.ts`, and the smoke publishes to Redis by hand rather than
observing a tick produced by live Binance ingest.

WS-03 evidence: Redis joined the Compose topology, the API gained a Socket.IO gateway with a
subscription registry, and the SPA consumes snapshot-then-live over WebSocket. Acceptance criteria
1-5 were proven in a real browser by `pnpm run smoke:ws03` against Compose `api`/`web` images
rebuilt from this code: four durable snapshots before any live message, a post-commit live update
reaching only the matching subscription, an untouched second subscription on a different key,
fresh snapshots after reconnect, and a durable snapshot still served with Redis stopped. Criterion
6 (bounded outbound buffer, slow-client disconnect) is not browser-observable and is covered by the
registry unit tests. Backend suite: 64 files, 361 tests pass. SPA and contracts: 10 files, 60 tests
pass. Root typecheck, lint, and `git diff --check` pass.

Note for the next session: the backend integration tests drop and recreate the PostgreSQL schema,
which deletes demo data. Run `pnpm run demo:seed` again before any browser smoke or demo that
follows a backend suite run.

The WS-03 diff is committed at `7bc5bf3`. The two-axis review was deliberately skipped for it to
conserve budget, so that diff carries no review record.

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-RT-001 | Realtime recovery and chart isolation | **DONE** - [evidence](../docs/validation/evidence/PROOF-RT-001.md): four-chart isolation, controlled provider recovery, immutable snapshot, API restart, Redis-loss durability, and delivery latency baseline pass on the V4 Compose topology. | MKT-06, MKT-07, MKT-09, MKT-11 |

## V4 Definition of Demoable (release gate)

**PASS** on 2026-08-30 - [evidence](../docs/validation/evidence/V4-DEFINITION-OF-DEMOABLE.md).
Every V4 condition in `VERSIONS.md` has release-candidate evidence: four live
subscriptions with distinct identifiers, a timeframe change that resets only its own
subscription with no page reload, a controlled provider outage that recovered with the
correct missing intervals and left no unresolved gap and no duplicate, committed candles
and fresh snapshots that survive stopping Redis, no forming tick written as a closed
candle, the V1-V3 regression, and `PROOF-RT-001`. The final regression passed 94 test
files and 544 tests plus workspace typecheck, lint, Compose config, and diff checks.

## V4 Compose integration gate (Compose path)

**PASS** on 2026-08-30 - the same [evidence](../docs/validation/evidence/V4-DEFINITION-OF-DEMOABLE.md)
record, section "Compose and browser walkthrough". `DEMO-01` grew the topology to the
V4 roles and no further: `docker compose up --build -d --force-recreate` brought up
`postgres`, `redis`, one-shot `migrate`, `api`, `runner`, `market-ingest`, and `web`
from the release source, with no BullMQ, outbox dispatcher, or news service. The V4
demo scenario, the proof runs, and the browser reload check all ran on that assembled
topology rather than on host processes.

---

# V5 - News and Sentiment (MVP complete)

Demo contract: [`VERSIONS.md` V5](VERSIONS.md#v5---news-and-sentiment)

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Plan |
|---|---|---|---|---|---|---|---|
| NEWS-01 | REQ | M | News contract, provider port, contract suite | **DONE** | SETUP-05 | | [05](05-news-and-sentiment.md) |
| NEWS-02 | REQ | M | Collection worker and first provider adapter | **DONE** | NEWS-01, SETUP-04 | | [05](05-news-and-sentiment.md) |
| NEWS-03 | REQ | M | Analyzer port, result contract, lifecycle | **DONE** | NEWS-02 | | [05](05-news-and-sentiment.md) |
| NEWS-04 | REQ | M | First real sentiment analyzer | **DONE** | NEWS-03 | C5: one selected CoinDesk item recorded a retryable unavailable attempt, then one successful normal-worker retry with exact OpenAI provenance; the second item remains untouched. See JOURNAL.md. | [05](05-news-and-sentiment.md) |
| NEWS-05 | REQ | S | Sentiment feature query and degradation policy | **DONE** | NEWS-04 | Committed `9a44b10`. All 6 acceptance criteria proved by 14 TDD cycles: windowed signed-mean query with window/item-count/freshness/quality; missing and stale block/degrade/substitute all visible in the response; technical-only descriptors make zero News calls; a supplied multi-window usage manifest is recorded as `newsInput`/`sentimentModel` in the provenance checklist. Typecheck, ESLint, and 37 targeted tests pass. The owner explicitly deferred this slice's own code-review and full-suite steps. See JOURNAL.md. | [05](05-news-and-sentiment.md) |
| NEWS-07 | REQ | S | News list, health, and sentiment query surface | **DONE** | NEWS-05 | Committed `b5e5f12`. All 6 acceptance criteria proved by TDD: paginated item list (title/source/publishedAt/relatedCoins/analysisState); windowed sentiment distribution (positive/neutral/negative proportions + item count + window bounds); collection health (per-provider, from `news.source_health`) and analysis health (derived from `news.items` state counts, no separate table); all three read as well-formed zero/`unavailable` payloads against an empty schema instead of throwing; no model/artifact/provider internal detail in any response; a News-query throw proven not to affect a sibling Market controller in the same module instance. Typecheck (all 3 packages), scoped ESLint, and 40 targeted test files / 234 tests pass. See JOURNAL.md. | [05](05-news-and-sentiment.md) |
| UI-07 | REQ | M | News page | **DONE** | NEWS-07, SETUP-06 | Committed `65110ec`. Endpoint-only 24-hour page lists items/source/time/coins, distribution plus count, and generic health. A News-owned normal-worker heartbeat writes at half the configured collection interval; after one full missed interval, `/news/health` degrades collection without changing source status. Browser proves healthy -> stopped/stale collection-degraded -> restarted healthy, retained items, and independent Realtime live subscriptions. Missing model credential produces generic analysis-degraded with items retained; a normal retry recovers healthy. No provider/model internals are rendered. 21 backend + 7 web targeted tests, package typechecks, scoped ESLint, diff check, and two-axis review pass. See JOURNAL.md. | [06](06-ui-and-demo-integration.md) |
| NEWS-06 | **OPT** | M | Sentiment as a strategy | TODO | NEWS-05, STRAT-04 | | [05](05-news-and-sentiment.md) |

### NEWS-01 evidence (2026-08-30)

- Focused News normalization, provider-contract, and fake-provider tests pass:
  3 files, 14 tests.
- Backend typecheck and lint limited to NEWS sources pass; the architecture boundary
  test passes (7 tests); `git diff --check` passes.
- The valid fake passes the unchanged reusable contract suite. The deliberately
  broken fake is rejected for a duplicate deterministic identity.
- The repository-wide Vitest run that was already in progress when V5 policy changed
  is incidental baseline evidence only: 95/97 files and 555/558 tests passed. Its
  three unrelated failures are in backtest result-query/runner lifecycle integration
  tests. It is not NEWS-01 acceptance evidence and must not be repeated until the
  V5 News backend integration gate.

### NEWS-02 evidence (2026-08-30)

Source: the owner approved CoinDesk's official RSS feed,
`https://www.coindesk.com/arc/outboundfeeds/rss/`, as the first concrete News source.
This is an owner decision, not an agent scope decision. The feed URL, poll interval,
timeout, and retry policy are validated configuration, never domain constants.
Collection reads RSS fields only (title, description, canonical link, published
timestamp) and never requests or stores article pages.

Acceptance criteria, each with direct evidence:

1. The CoinDesk adapter passes the unchanged `NEWS-01` contract suite. The provider
   contract and fake-provider contract tests run against it without modification.
2. A collection run stores new items and skips already-seen ones. The first live run
   stored 25 and skipped 0; the next two runs stored 0 and skipped 25.
3. Stored items have analysis state `pending`. The database check constraint permits
   only `pending`, and all 25 live rows are `pending`.
4. A failing source records degraded health and raises no error outside News. A live
   run against an unreachable feed logged `degraded`, persisted
   `coindesk-rss = degraded` with its reason, left the 25 items untouched, and exited
   with code 0. A later healthy run restored `healthy`.
5. Collection reaches no sentiment code path. A static proof pins the collector's
   import list and rejects `SentimentAnalyzer` and dynamic imports. Adding an analyzer
   import to the collector was confirmed to turn the proof red, then reverted.
6. The news worker is its own process. With `api`, `web`, `market-ingest`, `redis`,
   and `runner` all stopped, the news worker collected healthily; with the news worker
   stopped, the backtest runner started and reported `Runner slot ready`. Static
   topology tests also assert the worker module loads no API, Market, or Experiment
   path, and that the API process references no collection service.
7. Collection is triggerable manually and on a schedule. The worker runs an initial
   collection then a bounded schedule; `pnpm run news:collect` performed a manual
   collection inside the running worker container.

Targeted validation only, per the V5 validation budget:

- `pnpm exec vitest run apps/backend/src/modules/news apps/backend/src/platform/config.test.ts`
  passes: 8 files, 47 tests. This includes the PostgreSQL-backed repository and
  collector lifecycle tests, the offline CoinDesk fixture tests, and the topology tests.
- Backend typecheck passes; lint limited to the new News worker sources passes;
  `git diff --check` passes; `docker compose config --quiet` passes.
- No repository-wide Vitest run was performed. The incidental NEWS-01 baseline
  (95/97 files, 555/558 tests, three pre-existing backtest integration failures)
  was not repeated and must not be until the V5 News backend integration gate after
  `NEWS-07`.

Live demonstration used one bounded manual collection against the approved feed. The
25 stored rows carry the deterministic `source|url` identity, the canonical CoinDesk
link, `coindesk-rss` attribution, normalized published and collected timestamps, and
summary text between 37 and 203 characters, which is RSS summary length and not
article bodies. One stray fixture row left in the demo database by an earlier dev run
was deleted so the demo state holds only real collected items.

### NEWS-03 evidence (2026-08-30)

Acceptance criteria, each with direct evidence:

1. `SentimentAnalyzer` accepts a normalized `NewsItem` and input-version string and
   returns only label, bounded score, and versioned generic provenance. Its static
   test pins its two News-domain imports and rejects model/library/vendor/language,
   transport, process, and framework tokens.
2. Migration `0017_add_news_sentiment_analysis.sql` widens the forward-only analysis
   state check from `pending` to `pending | analyzing | analyzed | degraded`, adds
   lease bookkeeping, and adds News-owned result and attempt tables. Migration tests
   apply it over existing `pending` rows unchanged and prove it is rerunnable.
3. The PostgreSQL adapter reuses EXP-04's `FOR UPDATE SKIP LOCKED` durable lease
   pattern. One transaction commits a result, closes its attempt, and sets `analyzed`;
   a failure closes its attempt with a reason and returns the intact item to `pending`
   while retries remain.
4. Lease seconds, retry maximum, batch size, and schedule interval are validated
   `NEWS_ANALYSIS_*` configuration. At configured maximum attempt three, the C5 fake
   failure recorded three durable failure rows and the item became visibly `degraded`.
5. Lifecycle integration tests prove two analyzer stages claim 12 items only once;
   an expired claim becomes `lease_expired`, is reclaimed, and produces exactly one
   result. The collector's unchanged no-analyzer proof remains green.
6. `normalizeSentimentResult` requires model ID, artefact identity, model version,
   input version, and preprocessing version and rejects aliases such as `latest` at
   the boundary. C5 found zero alias-bearing durable results.
7. `FakeLexiconSentimentAnalyzer` and differently-behaving
   `FakeConstantSentimentAnalyzer` pass the same reusable contract suite. A Nest
   composition test binds the second fake through only `SENTIMENT_ANALYZER`, with no
   lifecycle, repository, or contract edit.

The rebuilt running `news-worker` used only `FakeLexiconSentimentAnalyzer`: its initial
scheduled batch analyzed 10 of the 25 existing CoinDesk items, then two manual
`pnpm run news:analyze` invocations analyzed 10 and 5. Database inspection found 25
real CoinDesk items, 25 analyzed, 25 results, 25 successful attempts, zero missing
results, and no invalid normalized item shape. Representative provenance was
`fake-lexicon | sha256:9f2c1a7b4e6d0c85 | 1.0.0 | news-item.v1 |
lowercase-word.v1`. One deliberately inserted synthetic non-article item proved the
unavailable-fake path: three `ANALYZER_UNAVAILABLE` attempts, no result, and a
durable `degraded` state. No article body is recorded here.

Targeted validation only: C1/C3/C4 contract, static, runtime, lifecycle,
concurrency, lease-recovery, substitutability, config, migration, and repository
tests pass; the final non-reset suite passed 8 files / 62 tests. Backend typecheck,
scoped ESLint, `git diff --check`, and `docker compose config --quiet` pass. No
repository-wide Vitest suite ran or was repeated. No real model, hosted inference API,
model library, or Python runtime was introduced. `PROOF-ISO-002` remains TODO for its
later V5 proof scope.

The NEWS-01..NEWS-03 slice-diff review is outstanding but deliberately deferred by
owner decision. It was not run in this session. After separate owner authorization,
NEWS-03 was committed as `c46c2e1`; nothing was pushed.

`NEWS-06` is optional. It is **not** part of V5's exit criteria and V5 is demoable
without it. Build it only if V5 finishes early.

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-ISO-001 | News failure isolation | TODO | NEWS-02, MKT-11, EXP-05, UI-07 |
| PROOF-ISO-002 | Sentiment failure isolation | TODO | NEWS-03, NEWS-04, NEWS-05, UI-07 |

---

# V6 - Async Execution, Reliability, and Proofs

Demo contract: [`VERSIONS.md` V6](VERSIONS.md#v6---async-execution-reliability-and-architecture-proofs)

Consider a `v6-async` branch for this version, since it replaces the execution
transport. `main` at `v5.0-demo` must stay demoable throughout.

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Plan |
|---|---|---|---|---|---|---|---|
| SETUP-08 | REQ | S | Redis persistence and eviction for BullMQ | TODO | WS-03 | Retention policy for outbox and inbox rows | [00](00-setup-and-walking-skeleton.md) |
| SETUP-09 | REQ | M | Event envelope and cross-process correlation | TODO | SETUP-03 | | [00](00-setup-and-walking-skeleton.md) |
| WS-02 | REQ | M | BullMQ round trip in a separate worker process | TODO | SETUP-08, SETUP-09 | | [00](00-setup-and-walking-skeleton.md) |
| MSG-01 | REQ | M | Reliable messaging primitives | TODO | WS-02 | | [00](00-setup-and-walking-skeleton.md) |
| EXP-12 | REQ | M | BullMQ backtest executor | TODO | WS-02, EXP-05 | | [03](03-experiment-backtest-evaluation.md) |
| EXP-08 | REQ | M | Experiment outbox dispatcher | TODO | MSG-01, EXP-06 | | [03](03-experiment-backtest-evaluation.md) |
| EXP-09 | REQ | M | Experiment idempotent consumer | TODO | EXP-08 | | [03](03-experiment-backtest-evaluation.md) |
| SEARCH-07 | REQ | M | Broker dispatch reconciliation | TODO | EXP-12, SEARCH-02 | | [04](04-search-and-leaderboard.md) |
| SEARCH-06 | REQ | M | Live progress and leaderboard push | TODO | EXP-09, MKT-07 | | [04](04-search-and-leaderboard.md) |
| OPS-01 | REQ | M | Operational status surface | TODO | EXP-08, SEARCH-06, MKT-09 | | [04](04-search-and-leaderboard.md) |

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-SCALE-001 | Worker scale and backpressure | TODO | EXP-12, SEARCH-01, OPS-01 |
| PROOF-RETRY-001 | Partial failure retry | TODO | EXP-08, EXP-09, EXP-12, SEARCH-04 |
| PROOF-DUP-001 | Duplicate and stale event | TODO | EXP-08, EXP-09, SEARCH-04 |
| PROOF-OBS-001 | Operational observability | TODO | SETUP-09, OPS-01, plus the proof it accompanies |
| PROOF-CONTROL-001 | Re-run against the BullMQ realization | TODO | SEARCH-07 |

---

# Totals

| Version | Slices | Optional | Proofs |
|---|---|---|---|
| V1 | 25 | 0 | 1 |
| V2 | 7 | 0 | 1 |
| V3 | 8 | 0 | 3 |
| V4 | 5 | 0 | 1 |
| V5 | 7 | 1 | 2 |
| V6 | 10 | 0 | 4 + 1 re-run |
| **Total** | **62** | **1** | **12** |

Sixty-three slice identifiers exist; `NEWS-06` is the optional one, so sixty-two are
required work.

Advancing the repository's validation status from `PENDING IMPLEMENTATION PROOFS`
is a change to the frozen baseline's metadata. It requires the proof evidence
**and** explicit user approval. A coding agent never changes it.
