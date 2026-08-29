# Implementation Journal

Durable history of implementation sessions, one section per product version, newest
entry last inside its version.

Read [`README.md`](README.md) first. Current state is in [`TRACKING.md`](TRACKING.md);
this file is why the current state looks the way it does.

## What belongs here

Only what a later team member cannot cheaply reconstruct from `TRACKING.md`, Git, or
the code:

- an implementation decision that closes an open choice, especially one that differs
  from the plan's recommended default;
- a deviation or piece of technical debt handed forward, and what would repay it;
- a validation or proof result that matters beyond the session that ran it;
- a problem that is likely to resurface, with what was learned about it;
- the ending state of the session, and the commit it corresponds to.

## What must never go here

- prompts, AI output, transcripts, or reasoning traces;
- every command that was run;
- temporary compile or debug errors that were fixed in the same session;
- slice definitions, acceptance criteria, or dependencies — those live in the area
  plan files and never move;
- per-slice status — that is `TRACKING.md` and only `TRACKING.md`;
- detailed unfinished-task state — that is `.scratch/checkpoints/<slice-id>.md`,
  which is local and git-ignored. Put only the part others need here.

If an entry restates something already in `TRACKING.md`, delete it from the entry.

## How to write an entry

Append; do not rewrite history. Correct an earlier entry with a new one that says
what changed and why. Keep an entry to roughly fifteen lines. Write only the fields
that have something to say, in this order:

```markdown
### YYYY-MM-DD — <version> — <slices worked on>

**Decisions**
- <choice made, and the reason it beat the alternative>

**Deviations / debt**
- <what was left imperfect, what would repay it, what it blocks if anything>

**Validation**
- <what was run, and the result>

**Problems worth remembering**
- <what is likely to resurface>

**Ending state**
- <where the work stopped, and the commit>
```

A session that only moved slices through their normal path, with no decision, no
deviation, and no surprise, does not need an entry. `TRACKING.md` already covers it.

---

## V1 - Backtesting Lab

### 2026-08-22 — V1 — SETUP-01 through SETUP-06

**Decisions**

- Database access is the `pg` client plus a hand-rolled SQL-first migration runner,
  not Drizzle or Kysely as `00-setup-and-walking-skeleton.md` recommends. Plain SQL
  files and a small runner keep module-owned schemas visible and avoid pulling a
  query builder in before any table exists. Revisit when real query surfaces arrive
  (`MKT-03` onward); the seam is `platform/database.ts`, so a builder can be adopted
  without touching domain code.
- Architecture boundary enforcement is a hand-rolled regex import scanner plus a pure
  rule engine, run as an ordinary Vitest test, rather than a lint plugin. It keeps
  the six rules readable in one file and each rule independently testable.
- Vitest, pnpm workspaces, Vite + React, and `lightweight-charts` follow the plan's
  recommended defaults; no deviation to record.

**Validation**

- Whole stack brought up together after all six slices: `pnpm install`,
  `typecheck`, `lint`, `test` (33 tests / 10 files, database-backed included) pass.
- PostgreSQL reaches healthy; a row survives a container restart and a full recreate.
- Config fail-fast proven by unsetting `POSTGRES_HOST`.
- `migrate` from empty creates exactly the four module schemas; a second `migrate` is
  a no-op; `migrate:reset` empties the database; re-`migrate` restores it.
- API starts without PostgreSQL; `/health` returns `{"status":"ok"}`; request id is
  generated when absent and preserved when supplied; clean SIGTERM shutdown.
- Each of the six boundary rules proven with a temporary violating fixture, then
  reverted; tree confirmed clean afterwards.
- SPA serves all five routes, proxies `/api/health`, and builds for production.
- Governance validator: one finding, the pre-existing untracked scratch directory at
  the repository root, unrelated to any `SETUP-*` slice.

**Problems worth remembering**

- The untracked scratch directory at the repository root (holding earlier workflow
  analyses) predates this work and fails the governance validator by design. Delete
  it, or move what is worth keeping into `docs/`, to get a clean validation pass.

**Ending state**

- All six V1 setup slices `DONE`, committed as `a46dd38`. `MKT-01` and `STRAT-01`
  are the next `READY` slices. No slice left unfinished, so no checkpoint exists.

### 2026-08-22 — V1 — repository workflow governance (no slice)

**Decisions**

- Team handoff state stays in `TRACKING.md` rather than a separate handoff file, to
  avoid a second competing status artifact. `JOURNAL.md` was added for durable
  history only, which nothing previously owned.
- `.claude/skills/` stays a local runtime representation of the canonical, tracked
  `.agents/skills/`. Skill content is not duplicated into Git; the governance
  validator now fails when the Claude-side representation is missing, so an
  under-equipped environment is reported instead of silently degrading.
- Two governance-validator defects were fixed because they hid the rules above. It
  scanned `node_modules` for obsolete process references (false positives), and it
  gated its entire deep-check block on *any* earlier failure, so one unrelated
  finding silently skipped roughly 800 checks. The gate is now missing required
  files only. Check count went from 34 reported to 858 actually run.

**Deviations / debt**

- `IMPLEMENTATION STATUS` was `NOT STARTED` in `AGENTS.md` and `README.md`, and the
  governance validator pinned that exact string, while six slices were already
  complete. Status vocabulary is now `IN PROGRESS` plus a separate
  `CURRENT PRODUCT VERSION`, so advancing a version no longer requires changing
  vocabulary. Both remain user-set; no agent advances them.

**Ending state**

- Governance and workflow documents updated. No application code touched.

### 2026-08-22 — V1 — cross-tool agent support (no slice)

**Decisions**

- Shared policy stays in `AGENTS.md` alone, for every assistant, not only Claude Code
  and Codex. A tool that reads its own instruction file is pointed at `AGENTS.md`
  instead of getting a copy; duplicated policy drifts and then two members' assistants
  follow different rules.
- Skills get a tool-independent fallback: every skill is plain Markdown at
  `.agents/skills/<name>/SKILL.md`, and an assistant with no skill system opens the
  file the phase router names. No per-tool skill wiring was added.

**Deviations / debt**

- `README.md` claimed "Codex reads `.agents/skills/` directly and needs no bootstrap
  step". That was never verified and is probably wrong: `.codex/` holds only
  `config.toml`, there is no `.codex/skills/`, and the manifest's `codex: true` records
  content compatibility, not a discovery mechanism. The claim is removed.

**Problems worth remembering**

- **Open question:** how Codex CLI actually discovers project skills, and whether it
  needs its own bootstrap like `.claude/skills/`. Until someone answers it, assume
  Codex loads no skill automatically and relies on the plain-Markdown fallback. The
  governance validator checks the Claude side only; extending it to Codex depends on
  that answer.

**Ending state**

- `AGENTS.md`, `README.md`, `CLAUDE.md`, and the validator's bootstrap hint updated.
  Validator: 858 checks, only the pre-existing untracked scratch directory reported.

### 2026-08-22 — V1 — skills committed for both assistants (no slice)

Supersedes the two entries above on how skills are distributed. Their reasoning about
avoiding duplication no longer applies; the decision below replaces it.

**Decisions**

- Skills are now committed three times: `.agents/skills/` canonical, plus mirrors at
  `.claude/skills/` and `.codex/skills/`. A clone needs no setup step and both
  assistants load the same set. This closes the open Codex question without answering
  it: `.codex/skills/` is where Codex looks, so how it discovers skills stopped
  mattering.
- Duplication was accepted because the drift objection is handled by tooling, not by
  discipline. The lock already carried a per-skill `treeSha256` over LF-normalized
  content; the validator now recomputes it for each mirror and fails on any drift or
  missing mirror. Cross-platform safe, because the hash normalizes line endings.
- The earlier design (canonical plus local links) was rejected on one concrete
  failure: the links were absolute paths into this machine's checkout, so moving or
  renaming the repository directory broke all twelve silently. A per-clone bootstrap
  step is also a step a teammate will skip.
- The lock and manifest were unified on one scheme, `canonicalDestination` plus
  `mirrors` plus `treeSha256`. The per-file `destinationHashes` variant that only
  `karpathy-guidelines` and `pdf` used is gone; those two now carry tree hashes like
  every other skill.

**Deviations / debt**

- Cost accepted: editing a skill means editing three copies plus one lock hash.
  Acceptable because these skills are pinned to upstream commit `0ab1b63` and are not
  expected to change during this project. If they start changing often, write a small
  sync script rather than relaxing the check.
- `.claude/skills/karpathy-guidelines/SKILL.md` was CRLF while the canonical copy was
  LF, so the two were never byte-identical. Re-copying from canonical fixed it. The
  tree hash normalizes line endings, so this class of mismatch cannot fail the build
  spuriously again.

**Validation**

- Governance validator: 1000 checks, only the pre-existing untracked scratch directory
  reported. All 14 `treeSha256` values verify against the canonical trees.
- Negative tests: appending a line to `.codex/skills/tdd/SKILL.md` reports that mirror
  out of sync; removing `.claude/skills/research` reports the skill missing and names
  the assistant that will not load it.

**Ending state**

- 14 skills, 43 files each, identical across all three trees (`diff -r` clean).

### 2026-08-22 — V1 — Docker Compose integration gate (no slice)

**Decisions**

- Two run paths are now explicit. Host `pnpm` commands stay the normal way to build a
  slice; Docker Compose is the authoritative way to assemble a whole product version.
  Nothing forces a command, a test, or a coding session into a container. The rule is
  declared once in `AGENTS.md` under "Local development and full-system integration".
- The version-completion gate lives in `VERSIONS.md` as "Compose integration gate
  (every version)", stated once instead of copied into six Definition-of-Demoable
  lists. It complements the existing tests, boundary tests, and `PROOF-*` evidence and
  replaces none of them.
- `DEMO-01` owns building the Compose path rather than a new slice. It already recurs
  as an exit criterion of every version, which is exactly what a topology that grows
  with the roadmap needs; a new slice would have needed its own recurrence rule and
  the growth would have scattered into `WS-03`, `MKT-06`, and `NEWS-02`. Its effort
  moved `S` to `M` to pay for the Dockerfile and the application services. Slice count
  is unchanged at 62 required.
- `CODING_STANDARDS.md` and `docs/agents/development-workflow.md` were deliberately
  left alone. The standards file records code conventions and says it never creates
  architecture rules; the workflow router routes phases to skills, and a version exit
  gate is not a phase. Stating the rule there would have created a third and fourth
  copy of it.
- The governance validator gained eight static checks only: `docker-compose.yml` must
  exist, and the rule must still be stated in `AGENTS.md`, `VERSIONS.md`, and
  `README.md`. It deliberately does not start Docker and does not compare Compose
  services against a version's role list, because `VERSIONS.md` is the only source for
  that mapping and any such check would false-fail throughout V1.

**Deviations / debt**

- The full-system path does not exist yet, by design. `docker-compose.yml` still
  starts PostgreSQL only, which is what the completed setup slices needed. Nothing is
  containerized until `DEMO-01`, because before `EXP-05` and `UI-04` there is no
  assembled system to bring up. The cost is that container problems surface late in
  V1; accepted, since containerizing an empty shell proves nothing.
- `.env.example` still carries `POSTGRES_HOST=localhost`, correct for the host path
  and wrong for a container reaching PostgreSQL by service name. `DEMO-01` resolves it
  by supplying the value in the Compose service rather than by editing `.env`.
- The V1-to-V6 role table in the gate is a summary, not a source. If the review of
  `deviation-proposal-001` rejects the deviation, `SETUP-08`, `WS-02`, and `EXP-12`
  move into V1 and V1's row gains Redis.

**Validation**

- Governance validator: 1020 checks, only the three pre-existing, unrelated findings
  about the untracked scratch directory.
- Negative tests: removing `docker-compose.yml` reports the missing required file;
  breaking each of the seven text anchors in `AGENTS.md`, `VERSIONS.md`, and
  `README.md` produces seven distinct named failures. All anchors restored afterwards
  and the validator returned to the three pre-existing findings.

**Problems worth remembering**

- `SETUP-01` through `SETUP-06` were not touched and their acceptance criteria were
  not rewritten. `SETUP-02` had already required the Compose file to be structured so
  later versions can add services without rewriting it, so this gate continues that
  slice rather than contradicting it.

### 2026-08-22 — V1 — `.env` is not loaded by any command (no slice)

**Problems worth remembering**

- Nothing in the repository loads `.env`. `dotenv` is not a dependency, `vitest.config.ts`
  declares no `env` block and no setup file, and `platform/config.ts` reads
  `process.env` directly. So copying `.env.example` to `.env` does not put the values
  anywhere a process can see them. `pnpm run test`, `pnpm run migrate`, and
  `pnpm run start:api` all need the variables exported into the shell first.
- The documentation says otherwise. The root `README.md` "Local setup" step 1,
  `.env.example`'s own header, and the comment at the top of `database.test.ts` all
  imply the copy is enough. On a clean checkout with Docker running,
  `pnpm run test` still fails with `Missing required environment variable
  "POSTGRES_HOST"` from `platform/config.ts`.
- Verified during this session: with PostgreSQL healthy but the variables only in
  `.env`, 1 test file fails and 31 of 33 tests run. After exporting `.env` into the
  shell, all 33 tests in 10 files pass. The code is correct; the documented path is
  incomplete.
- Left unfixed on purpose. `SETUP-02` and `SETUP-04` are `DONE`, and closing this
  means either adding a `.env` loader or correcting the documented commands, which is
  an implementation decision for the user rather than a silent edit to completed
  slices. Whoever picks it up should also decide which of the two paths in
  `AGENTS.md` it belongs to, since the Compose path will supply these values through
  service environment rather than through `.env`.
- This is exactly the class of gap the Compose integration gate exists to catch: every
  slice's own validation passed, and the assembled clean-checkout path still did not
  work.

**Validation**

- At `b55a9d4`: `pnpm run typecheck` and `pnpm run lint` clean; `pnpm run test` 33
  passed / 10 files with `.env` exported and PostgreSQL healthy; governance validator
  1020 checks with only the three pre-existing unrelated findings.

### 2026-08-23 — V1 — architecture review, setup repair, and MKT-01 start

**Decisions**

- The Project Owner accepted Alternative C from Deviation Proposal 001. V1 through
  V5 use a PostgreSQL-backed durable executor behind `BacktestExecutor`; V6 replaces
  only the adapter and runner entry point with BullMQ. ADR-010 and baseline v1.2 are
  the normative record.
- MKT-A is accepted for `MKT-01`: OHLCV uses finite `number` values; time uses Unix
  epoch milliseconds; `Timeframe` is exactly `1m | 5m | 15m | 30m | 1h | 2h | 4h |
  1d`. The port methods are `fetchHistorical(request): Promise<readonly Candle[]>`,
  `subscribeLive(request): AsyncIterable<Candle>`, and
  `getHealth(): Promise<ProviderHealth>`. Historical results are unique, closed,
  ascending candles inside the inclusive requested open-time range.
- MKT-A health states are `healthy | degraded | unavailable`. Provider error codes
  are `UNSUPPORTED_SYMBOL`, `UNSUPPORTED_TIMEFRAME`, `RATE_LIMITED`,
  `PROVIDER_UNAVAILABLE`, `INVALID_PROVIDER_DATA`, and `NOT_SUPPORTED` for an adapter
  that deliberately lacks live capability in V1. `DatasetRef` contains `datasetId`,
  integer `version`, `manifestVersion`, `provider`, `symbols`, `timeframe`, inclusive
  `range`, `revisionWatermark`, and `integrityHash`.
- EXEC-A is accepted for `EXP-02`: 10,000 USDT starting capital, 0.1% fee and 0.05%
  slippage per fill, close-of-bar signal with next-open fill, one 1x position using
  available equity, both long and simulated-short directions, optional stops disabled
  by default, stop-loss-first same-bar tie handling, and final-close liquidation.
  Quantity, cash, fees, and realized PnL normalize to eight decimal places. Every
  value and disabled option is recorded in the immutable experiment specification
  rather than hidden in the engine.
- Setup repair is authorized: normalize the freeze hash across line endings, load the
  root `.env` for host commands, and pin the pnpm toolchain for clean-clone repeatability.

**Validation**

- Architecture governance passes 1,108 checks on Windows, including LF-normalized
  freeze identity for baseline v1.2 and the exact preserved v1.1 snapshot.
- Thirty-five targeted tests pass for the MKT-01 contract, deliberately broken
  provider responses, root `.env` loading, and all six architecture boundary rules.
  A targeted strict typecheck reports zero diagnostics.
- After installing the pinned pnpm 9.15.9 dependencies, the canonical repository
  commands pass: `pnpm run typecheck`, `pnpm run lint`, and `pnpm run test` (61 tests
  in 13 files, including the PostgreSQL-backed schema tests).
- PostgreSQL 16 is healthy for this checkout. Local port 5433 is used because port
  5432 belongs to the preserved legacy checkout; this is local `.env` configuration
  only and does not change the committed topology.

**Problems worth remembering**

- `corepack enable` may require an elevated terminal when Node is installed under
  `C:\Program Files`; invoking the prepared package manager through Corepack or using
  an existing pnpm shim avoids that machine-level permission issue.
- The root environment loader must tolerate Vite's HTTP-form `import.meta.url` in
  frontend tests. It now falls back to the test process working directory while
  retaining file-relative resolution in the backend runtime.

**Ending state**

- MKT-01 is `DONE`; its direct dependent MKT-02 is promoted to `READY`. STRAT-01
  remains independently `READY`. The legacy comparison is pinned to pre-MKT commit
  `b823d45` in `docs/architecture/legacy-architecture-comparison.md`.

### 2026-08-23 — V1 — MKT-02

**Decisions**

- The adapter uses Node.js native `fetch` and Binance's public market-data endpoint;
  no HTTP package or architecture change is needed. HTTP and delay injection stay
  private to Market Data so offline fixtures can exercise the public provider seam.

**Validation**

- The unchanged provider contract suite and adapter regression tests pass. A live
  two-page fetch returned 1,001 one-minute BTCUSDT candles from open time
  `1785542400000` through `1785602400000`, with exact continuity.
- Canonical typecheck and lint pass; 77 tests in 15 files pass; governance passes
  1,110 checks. Standards and spec re-review have no open finding.

**Problems worth remembering**

- Provider HTTP wrappers must preserve status and headers before interpreting the
  body, because rate-limit responses may not contain JSON. Unknown numeric fields
  must be narrowed before conversion; JavaScript coercion otherwise accepts null,
  booleans, and blank strings.

**Ending state**

- MKT-02 is complete in the working tree based on `b823d45`; MKT-03 is now `READY`.
  No commit was created because Git actions require separate owner approval.

### 2026-08-23 - V1 - MKT-03 decision gate

**Decision**

- The Project Owner accepted MKT03-A. `Candle.revision` remains a local sequence for
  one logical candle, while each stored revision receives a globally increasing,
  storage-only ingest sequence. `DatasetRef.revisionWatermark` is an ingest-sequence
  boundary. An as-of query first excludes rows beyond that boundary and then selects
  the highest local revision per logical candle.
- The accepted application seam is one deep `MarketDataQuery.getCandles(request)`
  operation. Its inclusive range request carries provider, symbol, timeframe, start
  time, end time, and an optional revision watermark. Omitting the watermark returns
  the current view; providing it returns the stable as-of view.
- This clarifies the already-frozen append-only snapshot mechanism; it does not add
  a module, communication path, technology, or ownership change, so no new ADR is
  required. The implementation plan is corrected because a local candle revision
  alone cannot serve as a stable global snapshot boundary.

**Ending state**

- `MKT-03` is `IN_PROGRESS`. Implementation proceeds test-first through the accepted
  application seam; the PostgreSQL repository remains internal to Market Data.

### 2026-08-23 - V1 - MKT-03 completion

**Implementation**

- Migration `0002_create_market_candles.sql` creates the Market-owned append-only
  candle table, composite logical-identity-plus-revision primary key, global identity
  ingest sequence, and range index.
- `PostgresCandleRepository` implements the accepted `MarketDataQuery` application
  port. Duplicate values are a no-op; changed values receive the next local revision;
  current and watermark-bounded reads are inclusive and ascending.
- Historical backfill uses one set-based SQL statement per batch. A shared
  transaction-level advisory lock coordinates writes and watermark capture, ensuring
  a snapshot watermark cannot overtake a lower, uncommitted ingest sequence.
- PostgreSQL-backed test files run sequentially because they intentionally reset the
  same dedicated test database.

**Validation**

- The TDD red phase failed because the repository did not exist. The green phase now
  covers eight PostgreSQL integration cases: duplicate no-op, immutable revision,
  current view, cross-candle watermark stability, inclusive ordered gaps, concurrent
  set-based backfills, closed-only persistence, and a backend-wide append-only guard.
- Canonical `pnpm run typecheck` and `pnpm run lint` pass. Canonical `pnpm run test`
  passes 85 tests in 16 files. Repository governance passes 1,110 checks, and
  `git diff --check` is clean apart from Git's existing Windows line-ending notices.
- The two-axis Standards and Spec review initially found seven issues. All were
  corrected; re-review reports no remaining finding.

**Ending state**

- `MKT-03` is `DONE`. Direct dependents `MKT-10` and `MKT-04` are promoted to
  `READY`; independent `STRAT-01` remains `READY`. No commit was created because Git
  actions require separate owner approval.

### 2026-08-23 - V1 - MKT-10, MKT-04, and STRAT-01 decision gate

**Decision**

- The Project Owner accepted Option A for all three slices. Dataset snapshots are
  content-addressed with SHA-256, use manifest version v1, record consecutive gap
  ranges, and resolve candles through the global ingest watermark rather than copied
  candle rows.
- The candle history surface is `GET /market/candles`, accepts only the V1 provider,
  symbol, and timeframe vocabulary, and limits a response to 10,000 candles. API
  composition receives Market Data through an exported injection token. Historical
  loading is a CLI command rather than an unauthenticated mutation endpoint.
- Strategy analysis uses declared discriminated inputs rather than importing Market
  types or exposing a service locator. Registry-owned wrappers validate the compact,
  frontend-renderable parameter schema and required inputs before invoking a pure
  strategy. Signal and the five generic annotation primitives use closed normalized
  vocabularies.
- These choices concretize ADR-002 and ADR-006 without adding a technology, module,
  ownership edge, or communication path. No new ADR is required.

**Ending state**

- `MKT-10`, `MKT-04`, and `STRAT-01` are `IN_PROGRESS` as one owner-approved batch.

### 2026-08-23 - V1 - MKT-10, MKT-04, and STRAT-01 completion

**Implementation**

- `MKT-10` adds immutable content-addressed dataset manifests, range-scoped ingest
  watermarks, canonical SHA-256 identity, explicit consecutive gaps, exact as-of
  resolution, and a PostgreSQL trigger rejecting dataset mutation. Pure snapshot
  policy lives in domain/application; the PostgreSQL adapter only persists manifests.
- `MKT-04` binds Market query/dataset/backfill use cases in `MarketModule`, exposes a
  validated 10,000-candle HTTP range, shares its response contract with the SPA, and
  adds a Market-owned CLI backfill. The E2E fixture uses the backfill use case rather
  than writing Market tables from outside the module.
- `STRAT-01` adds declared price/sentiment analysis inputs, normalized signals, a
  compact renderable parameter schema, generic annotation primitives, and an
  additive registry wrapper that filters context and validates every run.
- `CONTEXT.md` records the project vocabulary resolved by these contracts.

**Validation**

- Focused TDD suites cover five dataset cases, nine Strategy registry/contract cases,
  and six SPA-client-to-HTTP-to-port-to-PostgreSQL cases.
- A live CLI smoke loaded BTCUSDT `1h` at open time `1704070800000` from Binance;
  `GET /market/candles` returned that exact normalized durable candle.
- The single final full run passes typecheck, lint, 105 tests in 19 files, governance
  with 1,114 checks, and `git diff --check` (only existing Windows line-ending notices).
- Two-axis Standards and Spec review has no remaining finding after refactoring
  snapshot policy, DTO validation, shared contracts, and test seeding.

**Ending state**

- `MKT-10`, `MKT-04`, and `STRAT-01` are `DONE`. `STRAT-02` and `MKT-05` are promoted
  to `READY`. No commit was created because Git actions require separate owner approval.

### 2026-08-23 - V1 - STRAT-02 and MKT-05 decision gate

**Decision**

- The Project Owner accepted Option A for both slices. `MAStrategy` uses simple moving
  averages, declares `open | high | low | close` as its price-source vocabulary with
  `close` as the default, and declares default fast and slow periods of 10 and 20.
  The fast period must be smaller than the slow period. A crossover is confirmed at
  candle close, needs the previous and current averages, and therefore holds until at
  least `slowPeriod + 1` candles exist.
- The single V1 chart uses the already planned `lightweight-charts` library, defaults
  to `1h`, and requests the latest 200 fully closed candles. It renders candlesticks
  and volume from normalized API data. A timeframe change refreshes only the chart
  request and state.
- These choices fill in task-local strategy semantics and presentation query behavior
  inside the frozen Strategy and API/Presentation boundaries. They add no module,
  ownership edge, communication path, persistence policy, or deployment role, so no
  ADR is required.

**Ending state**

- `STRAT-02` and `MKT-05` are `IN_PROGRESS`.

### 2026-08-23 - V1 - STRAT-02 and MKT-05 completion

**Implementation**

- `STRAT-02` adds a pure sliding-window SMA primitive and a registered built-in
  `MAStrategy`. The strategy validates the accepted period relationship, reads only
  its declared price-bars input, evaluates upward and downward crossovers at candle
  close, holds during warm-up or without a new crossover, and emits aligned fast and
  slow line annotations.
- `MKT-05` adds the planned `lightweight-charts` dependency and a presentation-only
  candlestick-and-volume component. `BacktestPage` owns the recent 200-closed-candle
  query, defaults to `1h`, reloads only chart state on timeframe changes, and exposes
  loading, empty, and error states.

**Validation**

- Canonical typecheck and lint pass. The full suite passes 123 tests in 23 files;
  governance passes 1,116 checks; `git diff --check` is clean apart from existing
  Windows line-ending notices. The web production build passes.
- The Market CLI stored 200 real closed BTCUSDT `1h` candles. A manual browser run
  through the local API and Vite rendered the chart and nonzero canvases, changed to
  the meaningful `4h` empty state, restored the real `1h` chart, and produced no
  browser warning or error.
- Two-axis review has no remaining Standards or Spec finding after consolidating the
  price-source vocabulary and adding the required test-file purpose comments.

**Ending state**

- `STRAT-02` and `MKT-05` are `DONE`. `EXP-01` and `PROOF-PROVIDER-001` are promoted
  to `READY`. No commit was created because Git actions require separate owner approval.

### 2026-08-23 - V1 - EXP-01 and PROOF-PROVIDER-001 decision gate

**Decision**

- The Project Owner accepted Option A for `EXP-01`. A relational lifecycle envelope
  stores a typed V1 specification as JSONB. The canonical hash covers the complete
  frozen content but excludes lifecycle identity and timestamps. Freeze resolves the
  dataset, validates the strategy reference and parameters through Strategy-owned
  validation, and adds runtime/build provenance. A PostgreSQL trigger permits draft
  edits and the draft-to-frozen transition, then rejects update or delete.
- The Project Owner accepted a deterministic fake second provider for
  `PROOF-PROVIDER-001`. The proof runs the shared provider contract, sends its
  normalized candles through the real dataset service and unchanged chart component,
  and uses a temporary browser harness that is removed after validation.
- Architecture proof records are stored under `docs/validation/evidence/`, beginning
  with `PROOF-PROVIDER-001.md`.

**Ending state**

- `EXP-01` and `PROOF-PROVIDER-001` are `IN_PROGRESS`.

### 2026-08-23 - V1 - EXP-01 and PROOF-PROVIDER-001 completion

**Implementation**

- `EXP-01` adds the typed V1 draft and frozen specification contracts, a relational
  lifecycle envelope with JSONB content, exhaustive runtime validation, Market dataset
  resolution, Strategy-owned parameter validation, canonical SHA-256 freezing, and a
  PostgreSQL trigger that prevents frozen update or deletion. Frozen specifications
  retain the accepted EXEC-A profile, metric version, and runtime/build provenance.
- `PROOF-PROVIDER-001` adds a Market-owned second-provider proof that runs the full
  common provider contract and sends normalized candles through real append-only
  persistence and immutable dataset resolution. The unchanged chart accepts the same
  provider-neutral candles.

**Validation**

- The proof command passes 24 tests across Binance, the second provider, dataset
  integration, and chart input. A temporary browser harness rendered seven nonzero
  chart canvases with no warning or error and was removed afterward.
- Canonical typecheck and lint pass. The final full suite passes 138 tests in 25 files;
  governance passes 1,118 checks; `git diff --check` is clean apart from existing
  Windows line-ending notices.
- The proof environment, commands, fixture, hashes, browser result, deviations, and
  follow-up are recorded in `docs/validation/evidence/PROOF-PROVIDER-001.md`.
- Two-axis review has no remaining Standards or Spec finding after exhaustive nested
  validation and moving the proof inside the owning Market boundary.

**Ending state**

- `EXP-01` and `PROOF-PROVIDER-001` are `DONE`. `EXP-02` and `EXP-04` are promoted to
  `READY`. No commit was created because Git actions require separate owner approval.

### 2026-08-23 - V1 - EXP-02 and EXP-04 decision gate

**Decision**

- The Project Owner accepted Option A for deterministic simulation. Opposite signals
  close and reverse at the next candle open; sizing uses available equity after entry
  fee at 1x leverage; slippage is adverse on every fill; fees apply to entry and exit
  notional; monetary values and quantity normalize to eight decimal places. Optional
  percentage stops default off, stop loss wins a same-candle tie, and final positions
  liquidate at the last close.
- The Project Owner accepted a broker-neutral `BacktestExecutor.enqueue(job)` seam.
  PostgreSQL claim, lease, and reclaim stay internal to the V1 adapter. Run intent is
  committed before enqueue. Idempotency hashes the frozen spec plus engine/runtime
  execution identity; V1 candidate identity hashes strategy ID/version/parameters.
  Attempts start at one, expired 30-second leases create later attempts, and HTTP
  exposes start plus status reads.

**Ending state**

- `EXP-02` and `EXP-04` are `IN_PROGRESS`.

### 2026-08-23 - V1 - EXP-02 and EXP-04 completion

**Implementation**

- `EXP-02` adds a pure deterministic backtester with next-open execution, long and
  short positions, opposite-signal reversal, available-equity sizing, adverse
  slippage, entry and exit fees, optional percentage exits, stop-first same-candle
  ties, final liquidation, eight-place normalization, and annotation passthrough.
- `EXP-04` adds the broker-neutral executor port, stable candidate and idempotency
  hashes, durable PostgreSQL run and attempt tables, atomic lease-based claims and
  reclaim, complete durable job identity, start and status endpoints, shared API
  contracts, and SPA client methods.

**Validation**

- Hand-checked simulation tests cover both directions, reversal, hold, no look-ahead,
  stop/take priority, fees, slippage, sizing, final liquidation, and annotations. A
  separate Node process produces the same canonical trade-list hash.
- PostgreSQL tests prove two concurrent runners claim different work, expired leases
  create a new attempt, and attempt history remains queryable. Application and HTTP
  tests cover durable-before-enqueue, duplicate submission, status serialization,
  failure reason, and invalid run identifiers.
- Two-axis review findings were resolved: intrabar chronology now applies the known
  open action before candle high/low, claimed work contains the full immutable job,
  command identity is verified, and execution rates have safe bounds.

**Ending state**

- `EXP-02` and `EXP-04` are `DONE`. `EXP-03` is promoted to `READY`. No commit was
  created because Git actions require separate owner approval.

### 2026-08-23 - V1 - EXP-03 decision gate

**Decision**

- The Project Owner accepted Option A. Total return uses initial and final
  closed-trade equity, win rate counts strictly positive realized trades, and zero
  trades produce zero return, win rate, and drawdown. Maximum drawdown is the largest
  peak-to-trough decline on the closed-trade equity curve. Metric values are decimal
  ratios, and the V1 set is identified as `mvp-metrics@1.0.0`.

**Ending state**

- `EXP-03` is `IN_PROGRESS`.

### 2026-08-23 - V1 - EXP-03 completion

**Implementation**

- Added a pure versioned evaluator for total return, strict-positive win rate,
  closed-trade peak-to-trough maximum drawdown, and trade count.
- Metric definitions are bound to an explicit metric-set identity. New metric sets
  can add a metric without changing callers, while empty or duplicate IDs and all
  non-finite inputs or outputs fail fast.

**Validation**

- Nine evaluator tests cover a hand-checked mixed fixture, zero trades, all wins,
  all losses, one trade, a breakeven trade, extensibility, invalid identifiers, and
  non-finite values.
- Full regression passes 159 tests in 31 files. Typecheck and lint pass. Governance
  passes 1,118 checks. Two-axis review has no remaining finding.

**Ending state**

- `EXP-03` is `DONE`. `EXP-05` is blocked on its owner decision gate.

### 2026-08-23 - V1 - EXP-05 decision gate

**Decision**

- The Project Owner accepted Option A. The runner produces a framework-independent
  outcome and hands it to `BacktestResultAcceptor`; `EXP-06` supplies the durable
  transaction behind that port. V1 polls every 500 milliseconds, defaults to one
  positive configured concurrent slot, renews a 30-second lease every 10 seconds,
  and checks cooperative cancellation after claim, after input resolution, after
  strategy execution, and before acceptance. Graceful shutdown stops new claims and
  waits for active work. Unrecoverable failures record a stable failure reason.

**Ending state**

- `EXP-05` is `IN_PROGRESS`.

### 2026-08-23 - V1 - EXP-06 decision gate

**Decision**

- The Project Owner accepted Option A. Accepted results use relational result,
  provenance, and ordered trade tables in one transaction. Metrics and execution
  assumptions are versioned JSONB values; trades remain rows for V1 paging. A
  canonical ordered trade hash protects content. Provenance explicitly distinguishes
  recorded and not-applicable inputs, and runtime/build identity must match the
  frozen specification. Accepted rows are immutable and idempotent by logical key.

**Ending state**

- `EXP-05` and `EXP-06` are both `IN_PROGRESS`. Their plan dependency is a delivery
  order, but the accepted port has no valid production implementation until the
  acceptance transaction exists, so both close together after the integrated runner
  validation. This overlap is recorded explicitly rather than hiding implemented
  `EXP-06` work behind a `TODO` status.

### 2026-08-23 - V1 - EXP-05 CPU isolation decision

**Decision**

- The Project Owner accepted Option A. The runner main thread owns durable claim,
  heartbeat, cancellation, graceful shutdown, and result acceptance. Strategy,
  backtest simulation, and evaluation execute in a Node.js Worker Thread behind a
  framework-independent computation port. This keeps heartbeat and signal handling
  responsive during CPU-bound work without changing deployment topology or the pure
  domain APIs.

**Ending state**

- `EXP-05` and `EXP-06` remain `IN_PROGRESS` until worker isolation and integrated
  lifecycle validation pass.

### 2026-08-23 - V1 - EXP-05 and EXP-06 completed

**Delivered**

- Implemented the accepted Worker Thread CPU boundary while the runner process owns
  claims, heartbeat, cancellation, graceful shutdown, and result acceptance.
- Heartbeat rejection or ownership loss aborts CPU work; stale attempts are fenced
  from heartbeat, failure, and acceptance.
- One PostgreSQL transaction persists the immutable result, metrics, ordered trades,
  provenance, attempt completion, and run completion. Runtime, metric-set, and
  executed-engine identities are verified before acceptance.
- Reclaim terminally records an expired attempt as `BACKTEST_LEASE_EXPIRED`, and the
  provenance view exposes every attempt including its lease timestamp.
- Process-level tests use the real API and runner entrypoints. They prove two runners
  produce one result, hard-stopping the API does not stop work, and a hard-killed
  runner is reclaimed and completed as attempt 2.

**Validation and transition**

- `pnpm run typecheck`, `pnpm run lint`, 177 tests, repository governance (1,118
  checks), and `git diff --check` pass.
- Marked `EXP-05` and `EXP-06` `DONE`; promoted `EXP-10` to `READY`.

### 2026-08-23 - V1 - EXP-10 query contract accepted

**Decision**

- The Project Owner explicitly accepted Option A for the single-result read surface.
- `GET /backtests/:runId/result` returns the persisted summary. Missing is `404`,
  queued/running is `202`, failed is `200` with its stable failure reason, and a
  completed result is `200` with metrics, frozen execution assumptions,
  specification identity/hash, and timestamps.
- `GET /backtests/:runId/trades?page=1&pageSize=10` pages persisted trades in
  `sequence_number ASC` order. Page numbering is one-based, page size defaults to
  10 and is capped at 100, and an out-of-range page is empty while preserving the
  total count.
- Both endpoints are keyed by `runId`; the SPA does not need to discover or retain a
  separate result identifier.

**Starting state**

- Claimed `EXP-10` and moved it from `READY` to `IN_PROGRESS`.

### 2026-08-23 - V1 - EXP-10 completed

**Delivered**

- Added the Experiment-owned result query port and PostgreSQL projection adapter.
- Added run-keyed result and server-paged trade HTTP reads, shared response contracts,
  exhaustive runtime decoders, and SPA client methods.
- Preserved stored evaluator metrics, frozen execution assumptions, specification
  identity/hash, timestamps, stable trade ordering, and authoritative SQL sequence
  numbers without controller-side calculation.
- Covered completed, queued/running, failed, missing, multipage, out-of-range,
  zero-trade, malformed nested contract, and unsafe paging cases.

**Validation and transition**

- Full suite: 184 tests pass; typecheck, lint, governance (1,118 checks), and diff
  validation pass. Two-axis review reports no remaining blocker.
- Marked `EXP-10` `DONE`; promoted `EXP-11` and `UI-04` to `READY`.

### 2026-08-23 - Future minimal-account context recorded

- The Project Owner clarified that any future account capability should remain
  intentionally small: username/password and one personal workspace per account.
- Email, verification, password recovery, social login, team workspaces,
  invitations, and billing are out of scope.
- V1 remains a single shared workspace. This is product context, not an accepted
  architecture change; implementation still requires a proposed ADR and explicit
  owner acceptance.

---

## V3 - Automated Discovery

### 2026-08-25 - V3 - target moved to V3, STRAT-06

**Decisions**

- The V3 owner moved the target to V3. V2's 7 slices are `DONE` and the code
  baseline is green at commit `535d4e9` (typecheck across all three packages;
  `pnpm test` 209/212, the 3 failures being environment-sensitive V1 runner/result
  E2E). Some V2 completion items are deferred, not done: `PROOF-EXT-001` (no
  `MACDStrategy`, no evidence file), the full Docker Compose topology (PostgreSQL
  only today), a V2 section here, and version tags. They are recorded in
  `TRACKING.md`'s transition note and do not block V3, but V2 is not called
  complete and must not be tagged until they close.
- `CandidateStrategy` (STRAT-06) hashes its complete content, and the generator
  seed is part of that content, so two candidates that differ only by seed hash
  differently. This follows the slice's acceptance criteria directly.
- The candidate type lives in `strategy/domain`; the factory that computes the hash
  lives in `strategy/application`, keeping `domain` free of `platform` imports as
  the rest of the module already does. The hash reuses `platform/canonical-json`'s
  `canonicalSha256`; no second hasher was written.
- The stored candidate and its hash come from one canonical clone. The factory
  validates the input, builds a known-fields-only graph, `structuredClone`s it once,
  then both hashes that clone and stores it on the candidate. This severs every
  reference to the caller's input (so freezing the candidate never freezes the
  caller's objects) and makes it impossible for the stored content and its hash to
  drift apart.

**Validation**

- STRAT-06: `candidate-strategy-factory.test.ts` (13 cases, one behaviour each:
  repeat-hash stability, round trip of the produced candidate, key-order
  insensitivity, component-order sensitivity, parameter/version/policy/seed
  sensitivity, generator provenance recorded, deep immutability, and three
  completeness rejections) and `candidate-strategy-cross-process.test.ts` (1 case:
  identical hash from a separate `node --import tsx` process via
  `candidate-hash-process.ts`, criterion 7). Strategy module and the architecture
  boundary test pass; typecheck is green across all three packages.
- Two-axis `code-review` on both axes is clean: the initial pass raised test
  granularity (bundled `it` blocks), a stored-vs-hashed drift risk, input frozen by
  reference, and a weak AC2 round trip; all were fixed and the re-review confirmed
  no remaining finding, including the follow-up double type assertion that was
  removed by giving the content builders their real return types.

**Ending state**

- `STRAT-06` is `DONE`; `STRAT-07` is promoted to `READY`. `SEARCH-03` is `BLOCKED`
  on the ranking-weights human decision. Committed at the slice boundary on
  `feat/v3-automated-discovery`; not pushed.

### 2026-08-25 - V3 - STRAT-07

**Decisions**

- The seeded random source is a new `platform/seeded-random.ts` (mulberry32, with
  string seeds folded through FNV-1a). It is the only source of randomness the
  generator draws from, which is what makes a run reproducible across processes.
- `StrategyGenerator.generate(request)` returns a lazy `Iterable<CandidateStrategy>`.
  The generator proposes candidates only; the caller decides how many to pull and
  when to stop, per the slice constraint. The search coordinator (SEARCH-01) will
  own count and stop policy.
- Duplicate handling (criterion 5): duplicates are avoided. A candidate whose
  content hash was already emitted is skipped, and the sequence ends once the
  generator sees `maxConsecutiveDuplicates` (default 100, a generator config field)
  already-seen candidates in a row. This bounds a small search space cleanly and
  stays deterministic.
- The generator emits a generic combination-policy configuration (one weight per
  component plus a threshold) rather than branching per policy. Weighted-score
  consumes both; majority-vote ignores them. This keeps the generator free of any
  per-policy knowledge.
- Parameters are drawn within the strategy's own schema bounds, or a search-space
  `parameterRanges` override, and fall back to the schema default when a numeric
  parameter has no usable upper bound. Every emitted candidate is validated through
  the registry before it leaves the generator (criterion 1).
- A `parameterRanges` override may only narrow within a strategy's own schema
  bounds, never widen past them: a wider range would draw values the strategy's
  own validation rejects. Overrides are checked eagerly at the top of `generate()`
  (`GENERATOR_PARAMETER_RANGE`), so a bad range is a clear configuration error, not
  a mid-sequence crash. Numeric params with a minimum but no maximum still do not
  vary without an explicit override; that is an accepted consequence of the search
  space being explicit configuration, not a defect.
- Generated composites use a fixed placeholder definition id; a candidate's identity
  is its content hash, not a composite id, and persistence is out of scope here.

**Validation**

- `seeded-random.test.ts` (10), `random-strategy-generator.test.ts` (9),
  `strategy-generator-registry.test.ts` (6, incl. throwaway-generator rehearsal for
  `PROOF-REPLACE-001`), `generator.controller.test.ts` (1), and
  `random-strategy-generator-cross-process.test.ts` (1: identical sequence from a
  separate `node --import tsx` process, criterion 2). Boundary test still clean;
  typecheck green across all three packages.
- Full suite at end: 249/253. The same 4 pre-existing environment-sensitive V1 E2E
  fail (`backtest-runner-lifecycle`, `backtest-result-query`); none touch strategy
  or generator code.
- Two-axis `code-review` is clean. It raised an unsafe `as unknown as` cast in the
  catalog controller (replaced with a field-by-field schema mapper), an inline
  re-declaration of `GeneratorProvenance` (now imported), and the `parameterRanges`
  widen contradiction above (fixed to narrow-only with eager validation and tests);
  the re-review confirmed no remaining finding.

**Ending state**

- `STRAT-07` is `DONE`. No V3 slice is `READY`: `SEARCH-01` depends on `SEARCH-03`,
  which is `BLOCKED` on the ranking-weights and tie-break human decision. V3 needs
  that decision before search work can continue.

### 2026-08-25 - V3 - SEARCH-03

**Decisions**

- The Project Owner supplied the V1 ranking policy, unblocking `SEARCH-03`. Policy
  `weighted-return-drawdown@1.0.0`:
  - `score = weights.totalReturn * totalReturn + weights.maximumDrawdown * maximumDrawdown`,
    with the accepted config `weights = { totalReturn: +1.0, maximumDrawdown: -1.0 }`.
  - Gate: a candidate with `numberOfTrades < minTrades` (accepted `minTrades = 5`) is
    ineligible; its score is `-Infinity` and it cannot enter the Top-K.
  - Win rate is not part of the score; it is used only in the tie-break.
  - Tie-break, total and deterministic: score desc, maximumDrawdown asc, totalReturn
    desc, winRate desc, numberOfTrades desc, contentHash asc.
- Metric directions are declared explicitly on the policy (`metricDirections`, AC6)
  rather than implied by a weight's sign. Weights and `minTrades` are configuration
  carried on the frozen specification and recorded on every ranked result, so a
  change is a new recorded version and never reinterprets old results.
- The policy is pure (Experiment domain), mirroring the evaluator and combination
  policies; the `RankingPolicyRegistry` (application) mirrors the strategy and
  policy registries. The projection that stores the ranking is `SEARCH-04`, out of
  scope here.

**Validation**

- `weighted-return-drawdown-policy.test.ts` (14: hand-checked score, trades gate,
  win-rate-not-in-score, provenance recorded, explicit directions, each tie-break
  level, eligible-before-gated, strict total order under sort, and config/metric
  validation) and `ranking-policy-registry.test.ts` (6: list/resolve/duplicate,
  two coexisting versions each keeping their own, second implementation with no
  consumer change). Boundary test clean; typecheck green across all three packages.
- Full suite at end: 273/276. The same 3 pre-existing environment-sensitive V1 E2E
  fail (`backtest-runner-lifecycle`, `backtest-result-query`); none touch ranking code.

**Ending state**

- `SEARCH-03` is `DONE`; `SEARCH-01` (search coordinator) is promoted to `READY` now
  that `STRAT-07`, `EXP-05`, and `SEARCH-03` are all `DONE`.

### 2026-08-25 - V3 - SEARCH-01

**Decisions**

- Owner decision gate accepted two choices. (1) The coordinator loop runs **in the
  API process** (not a new process): `POST /experiments/:specId/search/start` records
  durable intent and launches a background loop; on API start `SearchExperimentHost`
  resumes every experiment still marked `running`, which is what makes a coordinator
  restart recover. (2) Each candidate is backtested by **deriving a per-candidate
  frozen specification** (clone the base spec's dataset, execution, and metric set;
  replace the strategy with the candidate's) and submitting it through the existing
  `BacktestExecutor` unchanged. V3's search space is single-strategy; running a
  **composite** candidate needs the computation path to resolve composites and is out
  of this slice's change surface, so `submit()` rejects a composite candidate.
- **AC1 "freezes its specification" interpretation.** `start()` requires the base
  experiment already frozen and rejects a draft, rather than freezing inside `start`.
  This is deliberate: each derived per-candidate spec reuses the base's
  `content.provenance`, and the runner's result acceptor rejects a result whose
  provenance does not match the runner's runtime identity. Freezing inside `start`
  with placeholder provenance (as `SpecificationController` does for the single-run UI
  path) would make every search backtest fail acceptance. So the base must be frozen
  with runner-matching provenance before start; AC1 holds across the create-frozen +
  start flow. Supplying that provenance from the Discovery/demo path is a later
  concern.
- The **append-only candidate ledger** (`experiment.search_candidates`, one row per
  candidate, immutable by trigger) is the idempotency record. A candidate row is
  written last, after its derived spec and run exist, so it is complete and never
  edited. Run submission is idempotent by its content-derived key, so a candidate
  replayed after a crash returns the same run instead of enqueuing a duplicate.
- **Restart resume** is deterministic: the generator sequence is a function of the
  seed, so a fresh coordinator rebuilds the iterator and fast-forwards past the
  already-recorded prefix (its count), then continues. No duplicated candidates, no
  lost progress.
- **No-improvement** folds the contiguous terminal prefix of candidate outcomes in
  sequence order into a durable tracker (best score via the `SEARCH-03` policy,
  consecutive-no-improvement count). A still-running earlier candidate blocks the ones
  behind it, keeping the iteration order stable. Stop reasons are `max-candidates`,
  `max-duration`, `no-improvement`, plus `exhausted` when the generator's unique
  sequence ends. Stop conditions and `maxInFlight` are configuration on the frozen
  specification (additive `search` field), never hidden defaults.

**Validation**

- `search-coordinator.test.ts` (8 PostgreSQL integration cases: reject second start,
  submit + progress snapshot, restart resume with no duplicates against an independent
  generator oracle, backpressure bound + release, each of the three stop conditions,
  and append-only enforcement) and `search.controller.test.ts` (4: start snapshot,
  409 on re-start, 404 on unknown, stopped-run progress). `database.test.ts` updated
  for the two new experiment tables.
- Full suite green: 288/288 in 58 files, including the two V1 runner/result E2E that
  are environment-sensitive but passed on this environment. Typecheck green across all
  three packages; architecture boundary test still clean. Lint of the new files is
  clean.

**Problems worth remembering**

- Deriving a per-candidate spec re-resolves the dataset once per candidate through the
  spec-freeze path. Correct and fine for V3's small demo; if a large search makes this
  costly, cache the resolved dataset per experiment or add a direct frozen-spec insert.
- Pre-existing gates still red and untouched by this slice: 43 `apps/web` lint errors
  in the V2 UI pages (`BacktestPage.tsx`, `StrategyEnginePage.tsx`), and 38 governance
  issues (mostly broken legacy-doc references, plus the V2->V3 README/AGENTS version
  mismatch and two missing TRACKING header fields). None involve SEARCH-01 files.

**Ending state**

- `SEARCH-01` is `DONE`. `SEARCH-02` and `SEARCH-04` are promoted to `READY`
  (`SEARCH-05` and `UI-03` remain `TODO` behind them). Not committed; Git actions
  await explicit owner request.

### 2026-08-26 - V3 - SEARCH-02

**Decisions**

- Control is a durable status machine, not a desired-vs-actual column pair:
  `running -> pausing -> paused` and `running|pausing|paused -> cancelling ->
  cancelled`, with `stopped` kept for the natural stop conditions. The requested
  state (`pausing`, `cancelling`) is written first and the coordinator converges
  toward the settled state inside `tick`, which is what makes "reports paused only
  after convergence" (AC1) observable and makes a restart mid-transition (AC4)
  recover: `resumeAll`/`listActive` relaunch loops for `running`, `pausing`, and
  `cancelling`, not just `running`. Migration `0011` widens the status set and
  splits the terminal CHECK so only `stopped` carries a `stop_reason` while
  `cancelled` carries only `stopped_at`.
- Cancel reuses the EXP-05 cooperative path rather than inventing a second one.
  Running candidate runs get `cancellation_requested = true` and are left to stop
  at the runner's existing safe checkpoint (ADR-004: broker/worker controls do not
  define domain state). Pending (queued, never-claimed) runs would otherwise never
  drain, because `claimNext` skips cancellation-flagged rows, so the coordinator
  terminates them directly. The shared `BACKTEST_CANCELLED_REASON` constant is used
  by both the runner and the coordinator so cancelled work reads identically.
- Pause policy is "let in-flight work finish": new submission stops immediately,
  and the run reports `paused` only when `inFlightCount` reaches zero. Documented in
  code so AC5's "documented and observable" holds.
- The stale-claim sweep reclaims a dead runner's run by closing its open attempt as
  `BACKTEST_LEASE_EXPIRED` and requeuing it, keyed on the EXP-04 lease. It is
  idempotent (a run with no expired lease is untouched) and runs each pass of the
  driving loop, satisfying "on coordinator start and on a schedule" without a timer.
- A cancelled pending candidate is marked cancelled first-class in the search's own
  layer, not only at the backtest-job level. Migration `0012` adds an append-only
  `experiment.search_candidate_dispositions` ledger; `cancelPendingRuns` records a
  `cancelled` disposition for each queued candidate before failing its job, and the
  progress read counts `cancelled` from that ledger and excludes it from `failed`.
  The candidate ledger itself stays append-only and untouched (SEARCH-01 AC9), so
  disposition is a separate immutable fact rather than a mutation of the candidate.
  Chosen over relaxing the append-only trigger (which the SEARCH-01 test guards) and
  over adding a `cancelled` backtest status (a cross-slice V1 change, see debt).

**Deviations / debt**

- `BacktestRunStatus` (`queued|running|completed|failed`) has no `cancelled` member,
  so at the backtest-job level a cancelled candidate remains `failed` +
  `BACKTEST_CANCELLED_REASON`, following the V1 convention already established in
  `backtest-runner-service.ts`. The search layer distinguishes cancelled from failed
  first-class (disposition ledger + `progress.cancelled`), which is what AC3 needs;
  the remaining gap is only that a raw `backtest_runs.status` query still reads a
  cancelled job as `failed`. Adding a first-class `cancelled` job status was left out
  on purpose: it is a cross-slice change to the already-`DONE` EXP-04/05/06/10
  contracts (enum, CHECK, result-query 202/200 logic, run-level counts). The driver
  to distinguish them at the job level is V6 `SEARCH-07` reconciliation; repay it
  there. The Project Owner accepted this scoping.

**Validation**

- `search-coordinator.test.ts` (+8 PostgreSQL cases: pause convergence with no
  submission while pausing, resume with no duplicated candidates against the
  generator oracle, cancel that terminates pending work, records the `cancelled`
  disposition, counts it separately from `failed` in progress, and keeps the
  completed result, the cooperative `cancellation_requested` signal on a running
  candidate, restart-mid-pause and restart-mid-cancel via a fresh coordinator
  instance, illegal transition rejection, and stale-claim recovery + sweep
  idempotence).
  `search-experiment-host.test.ts` (5, new: `resumeAll`/`listActive` relaunch,
  resume/cancel relaunch, pause without a second loop, one loop per experiment).
  `search.controller.test.ts` (+6: pause/resume/cancel mapping and 409/404 codes).
- Full suite 307/307 in 59 files (was 288 at SEARCH-01), including the two V1
  runner/result E2E that are environment-sensitive but passed here. Typecheck green
  across all three packages; changed files lint clean.
- Two-axis `code-review` (fixed point = SEARCH-01 `HEAD`) applied: migration `0011`
  made fully re-runnable with `DROP CONSTRAINT IF EXISTS`, reciprocal sync comments
  added to the mirrored `SearchRunStatus`, and the host restart/relaunch wiring given
  its own test. The AC3 `failed`-vs-`cancelled` reading was raised and is recorded as
  accepted debt above.

**Ending state**

- `SEARCH-02` is `DONE`. No new slice becomes `READY`: `UI-03` still waits on
  `SEARCH-05`, and `SEARCH-04` was already `READY`, so it is the only READY V3 slice.
  Not committed; Git actions await explicit owner request.

### 2026-08-26 - V3 - SEARCH-04

**Decisions**

- Leaderboard size (K) is a fixed project configuration value, `LEADERBOARD_TOP_K`
  (default 10), not a per-experiment specification field. Owner decision. It keeps
  the SEARCH-01 `SearchConfiguration` contract untouched and, being fixed, a rebuild
  always uses the same K and reproduces the same content. The default lives only in
  `config.ts`; the projector requires `topK` explicitly.
- The projector is built decoupled, "as if event-driven": its public `apply` takes
  one evaluated result and nothing caller- or transaction-specific (AC8), owns its
  own serialized transaction, and is idempotent + rebuildable. In V3 it is called
  synchronously from the acceptance path (`DurableBacktestResultAcceptor`), after the
  authoritative result commits, best-effort: a projection failure is logged and never
  un-accepts the result, mirroring how a V6 event consumer behaves. A missed update
  is recovered by the `leaderboard:rebuild` CLI. This resolves the projection-seam
  contradiction (see debt) in favour of the plan's repeated, dominant instruction
  ("write it as if event-driven; input is a result, not a transaction handle; if V6's
  EXP-09 has to modify it, the V3 seam was wrong").
- Idempotency and staleness are keyed by result identity and aggregate version (the
  backtest attempt number). A per-candidate applied-version ledger
  (`leaderboard_applied_versions`) records the highest version applied per candidate
  regardless of Top-K membership, so a duplicate or out-of-order result is ignored
  even for a candidate displaced from the board. Chosen over an on-board-only guard
  (which the first cut had) because this slice exists to build the V6 duplicate-safety
  that `PROOF-DUP-001` rehearses, and the on-board-only guard left a hole for
  displaced candidates.
- Writes are serialized per leaderboard with `pg_advisory_xact_lock(hashtext(id))`,
  the concrete answer to the rank-race ADR-005 names. The leaderboard identity is the
  base search `spec_id`; membership (which leaderboard a result belongs to) is
  resolved from the run's `search_candidates` row, so a plain single-run backtest,
  which has no candidate row, is simply ignored by the projector.

**Deviations / debt**

- Projection-seam wording vs AC8. `04-search-and-leaderboard.md` says the projection
  is updated "synchronously, inside the same transaction that accepts the result",
  while AC8 and the "write it as if event-driven" constraint forbid sharing the
  acceptance transaction. Implemented per AC8 (separate, projector-owned transaction).
  The consequence is a V3 durability gap: a crash between the result commit and the
  projection leaves the board stale until a manual `leaderboard:rebuild`. Accepted:
  V3 has no outbox yet; the gap closes when V6's outbox/consumer (`EXP-08`/`EXP-09`)
  drive the same projector. Flagged to the owner to confirm the reading governs.

**Validation**

- `leaderboard-projector.test.ts` (9 unit, fake store: rank order, enter+displace,
  worse-than-last no-op, duplicate, stale on-board, stale displaced-candidate,
  ineligible gate, non-candidate ignored, rebuild equivalence) and
  `postgres-leaderboard-projection-store.test.ts` (8 PostgreSQL: enter+displace,
  reject, duplicate hash-equality, stale hash-equality, displaced-stale, rebuild
  content+hash equivalence, result/spec link resolution, concurrent updates keep a
  valid contiguous Top-K). `backtest-result-acceptor.test.ts` (+2: projection hook
  called with the evaluated result; a projection failure keeps the accepted result).
  `config.test.ts` (+1: `LEADERBOARD_TOP_K`), `database.test.ts` updated for the two
  new tables.
- Full suite 327/327 in 61 files (was 307 at SEARCH-02). Typecheck green across all
  three packages; changed files lint clean; architecture boundary test clean.
- Two-axis `code-review` (fixed point = HEAD, SEARCH-02): no hard standards violation.
  Applied fixes: error message names the real knob `LEADERBOARD_TOP_K`; removed the
  speculative `DEFAULT_LEADERBOARD_SIZE` default (topK now required); extended the
  stale guard to displaced candidates via the applied-version ledger. The projection
  seam question was raised and is recorded as debt above.

**Ending state**

- `SEARCH-04` is `DONE`; `SEARCH-05` is promoted to `READY` (`SEARCH-04` and `EXP-06`
  are both `DONE`). `UI-03` remains `TODO` behind `SEARCH-05`. Not committed; Git
  actions await explicit owner request.

### 2026-08-26 - V3 - SEARCH-05

**Decisions**

- The read surface follows the EXP-10 pattern: query ports are abstract classes in
  `application`, PostgreSQL adapters in `infrastructure`, and the API composes reads
  without any metric or ranking calculation. Provenance and annotation reads are
  keyed by `runId` (not `resultId`) so they line up with the EXP-10 result/trades
  reads and the SPA never has to discover a separate result id. No new result or
  trades endpoint was added (AC3): provenance/annotations are extra reads on the
  existing `BacktestController`, and the progress read (AC2/8) is reused unchanged.
- Leaderboard sort is a display concern only. The stored ranking-policy `rank` is
  read straight from `leaderboard_entries`; a metric sort reorders the returned
  array in the adapter and never rewrites the projection, satisfying AC6 and the
  "API performs no ranking calculation" invariant.
- Annotations for a search result are recomputed on demand (AC5) by re-running the
  run's frozen spec through the same `computeBacktest` + `downsampleAnnotations` the
  acceptance path uses; the result is never persisted. Running this inside the
  request handler is CPU work, but SEARCH-05's own constraint explicitly authorizes
  on-demand recompute, so it stays in the query path for V3's small demo datasets.
- `ApiLeaderboardEntry` carries `score`, `contentHash`, and the provenance response
  carries `attempts[]` beyond criterion 1's literal field list. Kept deliberately:
  they serve traceability and reproducibility item 10 (`PROOF-REP-001`), not scope
  creep.

**Validation**

- Tests: `postgres-leaderboard-query.test.ts` (4), `postgres-provenance-query.test.ts`
  (2), `search-annotation-recompute.test.ts` (2 PostgreSQL), `leaderboard.controller.test.ts`
  (4). Full suite 339/339 in 65 files (was 327 at SEARCH-04); typecheck green across
  all three packages; changed files lint clean; boundary test clean. No migration.

**Problems worth remembering**

- Two-axis `code-review` (fixed point HEAD/SEARCH-04) surfaced two fixes, both
  applied. (1) The leaderboard read INNER-JOINed `search_candidates`, so a
  candidate-less projection row would have silently vanished; switched to a LEFT
  JOIN that raises `LEADERBOARD_QUERY_CORRUPT`, with a test. (2) The AC5 proof was an
  in-test re-derivation through the same pipeline; it is now an integration test that
  compares the recompute against the annotations the real EXP-06 acceptance
  transaction persisted, so a divergence between the stored downsampling and the
  recompute would be caught.
- The provenance read is a faithful pass-through: the baseline ten-item completeness
  is guaranteed by what EXP-06 stored, not re-asserted by the read. Accepted as the
  correct separation (the read never invents provenance).

**Ending state**

- `SEARCH-05` is `DONE`; `UI-03` is promoted to `READY` (`SEARCH-05` and `SEARCH-02`
  are both `DONE`). All V3 slices are now `DONE` except `UI-03`, the last V3 slice.
  Not committed; Git actions await explicit owner request.

### 2026-08-26 - V3 - UI-03

**Decisions**

- UI-03 could not be a pure frontend slice. Its AC1 ("configure ... then start")
  and the V3 demo scenario need the page to create a runnable search experiment,
  but no endpoint could: the single-run `POST /specifications` has no `search`
  field and freezes with placeholder provenance (`engine: ui`, zero lock hash),
  which the backtest runner rejects at result acceptance
  (`BACKTEST_PROVENANCE_MISMATCH`), so every candidate would fail and the
  leaderboard would never fill. This was surfaced to the owner as a missing backend
  capability rather than worked around in the browser. The owner authorized the
  context-fit option: add a minimal backend enabler so the demo runs end to end.
- The enabler is `POST /experiments/search` (`SearchExperimentController` ->
  `SearchExperimentCreationService`). The service resolves a real dataset for the
  chosen window, uses the first allowed strategy with its schema defaults as the
  base template each candidate replaces, fills the fixed V1 parts a person does not
  choose per run (the V1 execution profile, the `mvp-metrics` metric set, and the
  `weighted-return-drawdown@1.0.0` ranking policy with its accepted config), carries
  the caller's search configuration, and freezes with the API process's runtime
  provenance. The API process shares the runner's root env (both call
  `loadRootEnvFile`), so the stamped provenance matches the runner's runtime
  identity and candidate results are accepted. The browser cannot know that
  provenance, which is exactly why the assembly cannot live in the page.
- The page holds no strategy, backtest, evaluation, or ranking logic. The read side
  (progress snapshot + Top-K leaderboard) sits behind one `SearchDataSource`
  interface, so V6's SEARCH-06 can swap the poll for a push without touching a
  component (AC9). The generator selector is fed by the STRAT-07 catalog, so a new
  generator appears with no change under `apps/web` (AC7). Pause/resume/cancel show
  the converged state the control endpoint returns, never an optimistic requested
  state (AC4). The last run's spec id is persisted so a refresh restores the view
  from a snapshot (AC6).

**Validation**

- Tests: `search-experiment-creation-service.test.ts` (7: dataset resolution,
  carried search config, fixed ranking/metric set, valid base template, injected
  provenance + returned spec id, empty-strategy and no-stop-condition rejections),
  `search-experiment.controller.test.ts` (4: request mapping, config-error -> 400,
  unknown strategy -> 400, malformed body -> 400 before the service),
  `DiscoveryPage.test.tsx` (6: render from an injected data source, refresh
  recovery, converged control state, catalog-driven generator list, configured
  start, entry detail opens trades + provenance), api-contracts guard (+2).
- Full suite 358/358 in 68 files (was 339 at SEARCH-05). Typecheck green across all
  three packages; changed files lint clean; architecture boundary test clean.
  `BACKTEST_ENGINE` and `SearchExperimentCreationService` added to the experiment
  module surface; the new controller reaches the service through that index only.

**Problems worth remembering**

- Two-axis `code-review` (fixed point HEAD/SEARCH-05) applied four fixes. (1) The
  create endpoint took an interface body with no shape validation, so a malformed
  request threw a 500; a shape guard now maps it to 400 while the service keeps the
  domain-rule checks. (2) Entry-detail chart candles were fetched from the current
  form window, which a refresh resets, so an opened entry's backdrop could mismatch
  its real dataset; the window is now read from the run's provenance. (3) Only the
  candidate-limit stop condition was exposed; all three are now configurable, which
  the V3 Definition of Demoable requires. (4) `defaultParametersFor` now fails
  clearly if a base strategy has a required parameter without a default, instead of
  an opaque freeze-time rejection.
- Accepted as consistent with existing precedent, not changed: HTTP error
  classification by message prefix (mirrors `search.controller.ts`), and interface
  request bodies instead of class-validator DTOs (mirrors `specification`/`strategy`
  controllers). The dataset provider/symbol stay fixed to binance/BTCUSDT and the
  search space to single-strategy (`compositeSizes: [1]`), which is the accepted V3
  scope, not a shortcut.

**Ending state**

- `UI-03` is `DONE`. All 8 V3 slices are now `DONE`. This does not declare V3
  complete or authorize V4: the V3 Definition of Demoable (all three stop
  conditions, control across a restart, the reproducibility checklist), the
  `DEMO-01` Compose integration gate, and the three V3 proofs
  (`PROOF-REPLACE-001`, `PROOF-CONTROL-001`, `PROOF-REP-001`) remain the owner's
  to run and accept. Not committed; Git actions await explicit owner request.

### 2026-08-26 - V3 - architecture proofs (REPLACE-001, CONTROL-001, REP-001)

**Decisions**

- The three V3 proofs were run on host, against the running PostgreSQL, and
  recorded as evidence files under `docs/validation/evidence/`. A coding agent
  does not create the `v3.0-demo` tag or advance the validation status; those
  remain the owner's.
- `PROOF-REPLACE-001` needed a genuine second search method, so `grid-search`
  (`GridStrategyGenerator`) was implemented behind the same `StrategyGenerator`
  port as `random-search`: a deterministic cartesian grid over each strategy's
  parameters, no randomness. It was registered in the built-in generator registry.
  The proof is the empty downstream diff: the only files touched are the new
  generator, its test, the registry factory, and the module surface export -
  nothing in the backtester, evaluator, ranking policy, leaderboard projector,
  candidate/job schemas, coordinator, controllers, or web app. The coordinator's
  17-test suite stays green with the second generator present, because it treats
  candidates opaquely.
- `PROOF-CONTROL-001` is demonstrated by the existing SEARCH-01/02 integration
  suite, which already exercises every stop condition, pause/resume/cancel
  convergence to the settled state, coordinator restart recovery, cooperative
  running-candidate signalling, and stale-runner reclaim. The evidence file maps
  each required behavior to the named test. This is the V3 PostgreSQL-executor
  realization; the proof is re-run in V6 against BullMQ (SEARCH-07).
- `PROOF-REP-001` added one end-to-end integration proof
  (`leaderboard-reproducibility.proof.test.ts`): a result is accepted through the
  real `PostgresResultAcceptanceStore` with the real deterministic backtester's
  trades and a full checklist; a rerun of the recorded input reproduces the exact
  `canonicalSha256(trades)` stored as the trade content hash; and the resolved
  checklist carries an explicit, non-alias build identity. Top-1 spec resolution
  and cross-process hash determinism are cited from the existing
  leaderboard-query, provenance-query, and backtester-determinism tests.

**Validation**

- New tests: `grid-strategy-generator.test.ts` (6),
  `leaderboard-reproducibility.proof.test.ts` (2). Full suite 366/366 in 70 files
  (was 358 at the UI-03 commit; +6 grid, +2 reproducibility). Typecheck green
  across all three packages; changed files lint clean; architecture boundary test
  clean.
- Evidence: `docs/validation/evidence/PROOF-REPLACE-001.md`,
  `PROOF-CONTROL-001.md`, `PROOF-REP-001.md`. Each records the base commit
  (`975ce6a`), the environment, the pnpm lock hash, and the commands.

**Ending state**

- All three V3 proofs (`PROOF-REPLACE-001`, `PROOF-CONTROL-001`, `PROOF-REP-001`)
  are `DONE` with recorded evidence. This does not by itself complete V3: the
  Definition of Demoable and the `DEMO-01` Compose integration gate are still
  open, and the version tag and validation-status advance remain the owner's.
  Not committed; Git actions await explicit owner request.

### 2026-08-26 - V3 - Definition of Demoable executed on the host path

**Validation**

- All seven V3 Definition-of-Demoable conditions confirmed on the host (pnpm) path at
  commit `970e6b1`. Evidence: `docs/validation/evidence/V3-DEFINITION-OF-DEMOABLE.md`.
  Fresh runs: the eight cited V3 test files 48/48, and the full suite 366/366 in 70
  files (V1+V2 green, condition 7).
- The gap the roadmap flagged - condition 5 through the actual operator CLI, not only
  the projector's own test - was closed with a live run. On the demo leaderboard
  (experiment `1d26d815`), the projection hash was `abf30c80...0726` (7 entries), the
  entry and applied-version rows were deleted (0 entries), `pnpm run leaderboard:rebuild`
  reproduced exactly `abf30c80...0726` (7 entries, same ranks and scores). The
  authoritative hash was read with `LeaderboardProjector.projectionHash` via a throwaway
  script that was deleted afterward.
- A real host demo was walked: backfill 1,001 BTCUSDT 1h candles over
  `[1704067200000, 1707667200000]`, then `start:api` + `start:backtest-runner` +
  `start:ui`, then a search (random-search, four MVP strategies, seed 42,
  `maxCandidates 12`) via `POST /experiments/search` + start. The run stopped on
  `max-candidates`, the leaderboard filled with seven ranked entries, and the top row
  resolved through the result and provenance endpoints to its result and its derived
  frozen spec (condition 6). The Discovery page press-Start walk filled and ordered the
  leaderboard and showed the stop reason; the generator selector listed both
  `random-search` and `grid-search` (catalog-driven).

**Problems worth remembering**

- The `RandomStrategyGenerator` emits `rsi` candidates with `buyThreshold >= sellThreshold`.
  Each drawn parameter is within its own field range and `validateParameters` passes, but
  the RSI cross-field relation is enforced only at execution, so those candidates fail the
  backtest with `STRATEGY_PARAMETER_RELATION` (about 11 of 25 candidates in one run). It
  breaks no Demoable condition - the search counts them `failed`, continues, and the board
  still fills from valid candidates - but it wastes backtest slots and is a gap against
  STRAT-07 criterion 1. Flagged for a separate session; not fixed here (out of scope for
  executing the Definition of Demoable).

**Ending state**

- V3 Definition of Demoable recorded PASS on the host path. Still open before V3 is
  complete: the `DEMO-01` Compose integration gate. The `v3.0-demo` tag and the
  validation-status advance remain the owner's. Not committed; Git actions await
  explicit owner request.

### 2026-08-26 - V3 - DEMO-01 Compose integration gate

**Decisions**

- `DEMO-01` recurs per version; for V3 its open item was the Compose integration
  gate. The V3 topology is V1's, unchanged (`VERSIONS.md` roles table), so the work
  was to build the full topology once and walk V3's demo scenario on it, with no
  later-version service. Built: one `Dockerfile` (a single backend image serving
  the migrate/api/runner roles by command, plus an Nginx web image), `.dockerignore`,
  `apps/web/nginx.conf`, and the `postgres`/`migrate`/`api`/`runner`/`web` services
  in `docker-compose.yml`. Migrations run as a one-shot `migrate` service that api
  and runner wait on, so each role's start command stays pure and the migration is an
  explicit, observable step rather than a hidden one.
- Container config is supplied by Compose, not by editing `.env`: backend services
  reach PostgreSQL by service name (`POSTGRES_HOST=postgres`, internal port 5432),
  and the api and runner receive the same real `DEPENDENCY_LOCK_HASH` /
  `APPLICATION_COMMIT` / `WORKER_COMMIT` (the api freezes each spec with them, so a
  mismatch would fail acceptance). A shared YAML anchor carries the Postgres block to
  all three backend services.
- Two defects were exposed only by assembling the topology and running a real search;
  host tests do not catch either. Both fixes are infrastructure - no `.ts` source
  changed. (1) The runner's Worker Thread runs TypeScript through the tsx ESM loader,
  and Node 20 does not apply an `--import`-registered loader to a worker's own entry
  module, so every backtest failed with `Unknown file extension ".ts"`; Node 22 (the
  host runtime this code is already proven on, and allowed by `engines >=20.12`)
  applies it. Base image moved to `node:22-alpine`. (2) Nginx resolves an upstream
  host once at startup, so after the demo's deliberate `docker compose restart api`
  the proxy pinned a dead IP and returned 502; the api host is now resolved through
  Docker's embedded DNS with a short TTL via a variable upstream.
- Composite (multi-strategy) search is rejected by the search path today
  (`SEARCH_COMPOSITE_UNSUPPORTED`) and is not part of the V3 demo scenario, which uses
  single-strategy random search. Left as-is; out of scope for `DEMO-01`.

**Validation**

- `docker compose up --build` brings up the topology in dependency order from a clean
  checkout (postgres healthy -> migrate exit 0 -> api healthy -> runner -> web), with
  `docker compose config --services` = `api migrate postgres runner web` (no Redis,
  BullMQ, outbox, or news). Backfill of 1000 real Binance 1h BTCUSDT candles ran via
  the documented `docker compose exec api pnpm run market:backfill` command.
- V3 demo scenario walked end to end on the assembled topology, driven through the
  SPA's own `/api` proxy: start with candidate counter rising and a 9-entry ranked
  leaderboard; pause -> converged `paused` and resume -> `running`; `docker compose
  restart api` with run state surviving and the proxy healthy across the restart;
  `max-candidates` stop reason; top-entry paged trades, Bollinger overlay annotations,
  and the full provenance checklist (engine, attempt, dataset snapshot + integrity
  hash); cancel -> converged `cancelling` -> `cancelled` with completed results
  intact; and the second generator (`grid-search`) present in the catalog. Full
  record in
  [`docs/validation/evidence/V3-COMPOSE-INTEGRATION-GATE.md`](../docs/validation/evidence/V3-COMPOSE-INTEGRATION-GATE.md).

**Ending state**

- `DEMO-01`'s V3 Compose integration gate PASS. This was the last open V3
  demoability item on the Compose path; the host-path Definition of Demoable was
  already PASS. The `v3.0-demo` tag and the validation-status advance remain the
  owner's. Not committed; Git actions await explicit owner request.

---

## V1/V2 recovery

### 2026-08-28 — V1 and V2 — audit of every slice claimed complete

**Decisions**

- Repair the affected V1 and V2 slices in place as `REOPENED` rather than opening a
  recovery version. V3's own Definition of Demoable already requires "Everything in
  V1 and V2 still passes", so the failures are V3 exit-criteria failures, not a new
  scope. The target version stays V3 and no agent touched it.
- Added a `REOPENED` status to `TRACKING.md`'s vocabulary. The existing words did not
  fit: `TODO` means a dependency is missing, `READY` is reserved for the current
  target version, and neither carries the fact that a `DONE` claim was disproved.
  Original Evidence text is kept beside each reopened note so the wrong claim stays
  visible instead of being quietly overwritten.
- Added an Evidence column to the V2 slice table. It never had one. Seven slices were
  marked `DONE` with nowhere to record what proved it, which is a large part of why
  nothing was caught for four days.

**Deviations / debt**

- The `v3.0-demo` tag exists on `2b98139` and sits on a baseline whose V1 and V2
  regressions do not pass. Retagging or moving it is the owner's decision; no agent
  touched it. `TRACKING.md` previously claimed no tag existed.
- `JOURNAL.md` still has no "V2 - Extensible Strategy Engine" section. It was never
  written, so V2's decisions and deviations are unrecoverable except from diffs. This
  entry does not attempt to reconstruct them.

**Validation**

- Clean `pnpm install --frozen-lockfile`, then: `typecheck` green; `lint` **fails**
  with 43 errors across 21 files, every one in V1/V2 code and none in V3; `test`
  **360/366**, 6 failures. With the Compose `api`/`runner` containers stopped to rule
  out database contention, 5 of those 6 remain and all are `EXP-05`.
- Boundary and module-graph tests pass 8/8: the architecture boundaries themselves
  are clean. The defects are inside modules, not across them.
- Governance validator fails with 40 issues, all pre-existing and confined to the archived-artefact folder
  and `legacy-architecture-comparison.md`. Unrelated to the recovery.
- Live Compose run: real Binance backfill and a full V3 search reaching
  `max-candidates` both work. V3's own machinery is sound.

**Problems worth remembering**

- A green test suite hid all of this. The suite never covered: a backtest started from
  the page, a composite executed, four charts loading real data, or a strategy id
  appearing as a literal under `apps/web`. `BacktestPage.test.tsx` mocks the entire
  API client, so a payload missing `execution.fillRule` and carrying an invented
  `datasetRef` passed for four days. When a Definition-of-Demoable condition says a
  user-visible flow works, at least one check must exercise that flow, not a mock of
  it.
- `pnpm test` resets the schemas of whatever database it points at, including the one
  the Compose stack is using. Two agents or a test run plus a live stack will corrupt
  each other. This is why recovery clusters run sequentially rather than in parallel.
- The composite gap was visible in the source the whole time:
  `search-coordinator.ts:426` throws `SEARCH_COMPOSITE_UNSUPPORTED` with a comment
  saying the computation path cannot resolve composites. It was read as a V3 scope
  note; it was actually reporting that V2 had never been finished.
- The weighted-policy representation is safe to change: `strategy.composites` holds no
  rows, and no composite candidate has ever been persisted because the coordinator
  throws before submission, so no stored canonical hash depends on the current shape.

**Ending state**

- Audit complete at `2b98139`, clean tree, nothing committed. Nine slices moved to
  `REOPENED`: `UI-04`, `UI-05`, `EXP-05`, `DEMO-01`, `STRAT-04`, `STRAT-08`, `MKT-08`,
  `UI-02`, `UI-06`. Recovery order R1-R8 is recorded in `TRACKING.md`. V4 is not
  authorized.

### 2026-08-28 — R1 — V1 single-backtest path functionally restored

The Backtest path now resolves a real Market dataset, uses the registered strategy
catalog, freezes a complete specification with runtime provenance, and completes in
the separate Compose runner. The smoke run used 1,000 real BTCUSDT one-hour candles
and returned 58 trades plus all four MVP metrics.

`integration/specification-api.e2e.test.ts` now stubs only the external market
provider and exercises the real DatasetService, StrategyRegistry, specification
service, and PostgreSQL store. UI-04 AC9 remains a historical deviation: the slice
required no backend changes, but its pre-existing endpoint could not produce a
runner-acceptable specification. The recovery added only the missing backend
application path and did not change frozen architecture boundaries.

### 2026-08-29 — R1-R8 — V1/V2 recovery certified

**Decisions**

- Restored functional behavior cluster by cluster, then ran one consolidated
  certification pass. No later-version feature work, tag, or version advance was
  performed. While the certification session was paused, repository HEAD advanced
  externally from `2b98139` to `9d47d43` and that recovery commit appeared on origin;
  the certification agent did not run a commit or push command.
- Kept UI-04 AC9 as a historical deviation. The V1 page required a bounded backend
  application service because the original API could not create a runner-acceptable
  specification; the old criterion was not rewritten as a pass.
- Made saved composite definitions append-only in PostgreSQL. The runner resolves the
  immutable definition by `id@version`, so allowing update or delete would have changed
  the meaning of an already frozen specification.
- Added MACD only through the existing Strategy contract and built-in registry for
  `PROOF-EXT-001`; Backtester, Evaluator, RankingPolicy, provider adapters, and
  persistence ownership did not change.
- A final Compose smoke exposed one legacy-data compatibility defect: one old saved
  composite referenced removed `ma@1.0.0`, causing the whole composite catalog to
  return 500. The catalog now omits only definitions whose strategy or policy version
  is unavailable; repository and infrastructure errors still propagate. A focused
  regression test covers this behavior.

**Validation**

- Final `pnpm test`: **76 files, 415 tests passed**. This includes the real
  specification integration, runner lifecycle, Worker Thread isolation, result and
  provenance persistence, composite immutability, architecture boundaries, all
  touched UI paths, and the MACD extensibility proof.
- Final `pnpm typecheck`: pass across API contracts, backend, and web. Final
  `pnpm lint`: pass with zero errors and warnings.
- `PROOF-EXT-001`: pass; detailed evidence is in
  [`PROOF-EXT-001.md`](../docs/validation/evidence/PROOF-EXT-001.md).
- Canonical `docker compose up --build -d`: `postgres` healthy, one-shot `migrate`
  exited 0, `api` healthy, and `runner`/`web` up; no later-version service was present.
- V1 runtime: specification `2c939d20-abbf-488e-ba03-982a4c8098fa`, run
  `420aa1ec-95cb-402e-864f-d9603c253743`, result
  `95326b03-9582-48cb-96f2-193e7b70c908`; completed with the four MVP metrics, four
  trades, a content-addressed dataset, and recorded runtime/build provenance.
- V2 runtime: saved composite
  `composite-9ad4e513-9c80-4245-91b1-1f53cdd599f1` was returned with its
  server-owned descriptor, evaluated on the real window, froze, and completed as run
  `fa37c98f-881f-4a11-84f9-0ba6523d8ff8`; four trades and four stored/recomputed
  annotations carried `moving-average` and `rsi` component IDs. The web proxy returned
  150 real candles independently for 5m, 15m, 1h, and 4h.
- V3 regression: search `dd0f0edd-24a0-440c-8d4a-7161bb65aa8e` stopped by
  `max-candidates` after 5 generated/submitted/completed candidates, no failures, and
  produced five ranked entries. Its top result completed with 23 trades and recorded
  dataset plus runtime/build provenance.
- Repository governance now passes every tracked check. The validator still reports
  only the pre-existing untracked archived-files directory and two obsolete
  references inside it; those user files were not deleted or moved.

**Deferred non-blockers**

- Composite search remains explicitly unsupported in the V3 coordinator; V3's
  authorized single-strategy search regression passes.
- Policy catalog/schema, duplicated V1 execution/timeframe constants, broader test
  refactoring, and strategy-versioning review remain P2 work.

**Ending state**

- `9d47d43` contains the intended R1-R6 recovery, immutable-composite migration,
  MACD extensibility proof, test repairs, and first certification records. The only
  later delta is the catalog compatibility fix and final certification documentation;
  no recovery file was lost, duplicated, or partially committed.
- V1 and V2 are functionally certified and V3 regression passes in the
  baseline-freeze commit containing this entry. No tag or product-version field was
  advanced. The owner controls later-version authorization.

## V1-V3 freeze repairs (2026-08-29)

A runtime audit of the certified baseline found two functional defects the test
suite could not see. Both are fixed here; no other scope was opened.

**Chart marker crash (V1/V3 UI)**

`CandlestickChart` called `candleSeries.setMarkers(...)`. That method was removed
from `ISeriesApi` in `lightweight-charts` v5; the installed version is 5.2.1, where
markers are a separate plugin created with `createSeriesMarkers(series, markers)`.
Every render carrying trades or marker annotations therefore threw
`TypeError: c.setMarkers is not a function` and unmounted the React root, which is
what killed the page after a completed backtest and when opening a Discovery result.

Two things had hidden it. The component carried an `@ts-expect-error` over the call,
so the compiler's correct complaint was suppressed rather than read. The chart test
mock exposed `setMarkers` on the fake series, so the tests asserted against an API
the library no longer has.

The fix adapts the component to the v5 plugin API rather than pinning the library
back. The mock now models the real module surface, and a new test asserts markers
are attached through `createSeriesMarkers`, so a v4-era call cannot return unnoticed.

**Leaderboard empty for a repeated search (V3)**

A backtest run is identified by the content of its frozen specification, so two
searches over the same dataset window that generate the same candidate share one
run. The second search adopts a run that is already `completed`. No new result is
ever accepted for it, and result acceptance is what drives the projection, so the
second experiment's leaderboard stayed empty until someone ran `leaderboard:rebuild`.
Progress still reported the candidates as completed, which is why the failure looked
like a projection bug rather than a missing trigger.

A second, latent defect sat underneath it: `findCandidateMembership` resolved a run
to a single candidate row with `rows[0]`, so when a run belonged to two experiments
it projected into an arbitrary one of them.

Two narrow changes, both at the projection seam:

- membership resolution is now plural (`findCandidateMemberships`), and `apply`
  projects into every leaderboard the run belongs to, returning one outcome per
  leaderboard. Each board keeps its own applied-version guard, so a repeated
  delivery is still a no-op per board and no duplicate row appears.
- `LeaderboardProjector.applyCompletedRun(runId)` reads the result an adopted run
  already produced, and the search coordinator calls it when it records a candidate
  whose run was already complete. Acceptance still drives the normal path unchanged.

The acceptance-driven design from `SEARCH-04` AC8 is untouched: the projector's
input is still a result, never a transaction handle, so V6 can drive it from an
event consumer without change.

**Validation**

- Full gate, run once after both repairs: `pnpm run typecheck`, `pnpm run lint`,
  `pnpm run test` (421 tests in 76 files, all passing), the architecture boundary
  test (7), and `git diff --check` clean.
- Compose topology rebuilt from the current source: `postgres`, one-shot `migrate`,
  `api`, `runner`, `web`, and no later-version service.
- V1: a real `moving-average` backtest over 1,000 backfilled candles completed with
  four metrics, 58 trades, and a readable trade page.
- V2: 5m, 15m, 1h, and 4h each returned their own 150-candle window through the
  nginx/API path.
- V3: two searches with the same seed and window. The second adopted all three of
  the first's runs (confirmed in `search_candidates`) and both leaderboards hold the
  same two ranked entries, with no `leaderboard:rebuild`. Before the fix the second
  board would have been empty.
- Chart repair is proven at the component seam and in the deployed artifact: the
  bundle served at `localhost:8080` calls the v5 plugin factory and contains no
  application-level `setMarkers` call. There is still no browser automation harness
  in this repository, so no click-through run was recorded.

## Demo data prerequisite and the Discovery default window (2026-08-29)

The freeze repairs above were verified through the API and the built bundle, and
that was not enough. Opening the running application showed empty charts on every
page, which the earlier evidence had not caught.

**What was actually wrong**

Nothing in the domain. Every page derives its default window from the current
time: Realtime asks for the last 150 closed candles per timeframe, Backtest and
the Strategy Engine open on a recent range. The runbook, however, told the
operator to backfill a fixed 2024 window, plus a second hand-written loop of
epoch arithmetic for the four chart widgets. Follow it and the database holds
candles nobody asks for, so each page correctly reports that it has none.

The Discovery page had a second, worse version of the same problem: its default
search window was the hard-coded constant pair `2025-01-01` to `2025-01-02`. That
is both outside any seeded range and only twenty-four hours long, so a search
would generate, submit, and complete its candidates, then rank none of them
because no candidate produced a trade. Progress said `completed`, the leaderboard
said `No ranked candidates yet`, and nothing on screen connected the two.

**What changed**

- `scripts/seed-demo-data.mjs`, run as `pnpm run demo:seed`, loads thirty days of
  BTCUSDT at 5m, 15m, 1h, and 4h. It computes the windows and calls the existing
  Market backfill CLI once per timeframe; it is not a second ingest path.
- `README.md` and `docs/demo-script.md` now name that one command instead of a
  fixed 2024 range and a PowerShell epoch loop. The explicit-range CLI is still
  documented for anyone who wants a specific window.
- `DiscoveryPage` derives its default window from the current time, the way the
  other pages already did, instead of the two fixed constants.
- `eslint.config.js` declares Node globals for `scripts/**/*.mjs`; TypeScript
  files get them from `@types/node`, plain JavaScript tooling does not.

The Discovery default is presentation state, not business logic: no strategy,
backtest, evaluation, or ranking rule moved to the frontend.

**Validation**

Full gate re-run because production code changed: typecheck, lint, and 421 tests
in 76 files, all passing.

One note on running the suite: the earlier run of this session reported three,
then five, failures in the search coordinator and the runner lifecycle E2E. That
was contention, not regression. The Compose `runner` container was polling the
same database the tests truncate. With `api` and `runner` stopped and `postgres`
left up, the suite passes 421/421. This is the same condition the 2026-08-28
audit recorded, and it is worth knowing before reading a failure here as a defect.

**User-visible verification**

Driven through a real browser against the Compose stack, from `docker compose
down -v` and a clean volume, then `docker compose up --build` and one
`demo:seed`. No page error and no console error in any flow.

- V1 Backtest: real candles on load, run completed, four metrics, eleven trades,
  entry/exit markers and moving-average annotation lines drawn, selecting a trade
  zoomed to it and drew entry/exit price lines, clearing restored the view.
- V2 Realtime: all four widgets showed real candles at their own 5m, 15m, 1h, and
  4h timeframes.
- V2 Strategy Engine: two catalog components combined, saved, and evaluated on the
  server; the saved composite then appeared on the Backtest page and completed
  with twelve trades and both components' annotations.
- V3 Discovery: the search filled a four-row leaderboard with no
  `leaderboard:rebuild`, and opening the top entry showed its chart, markers,
  trades, and the full provenance checklist without unmounting.

---

## V4 - Realtime Market Data

### 2026-08-29 — V4 — WS-03 completed

WS-03 put Redis into the local topology and gave the API a Socket.IO gateway, a
subscription registry, and a post-commit publisher. It is the first slice where a
live notification crosses a process boundary, so it fixes the pattern that MKT-06
will carry real candles through.

**The ordering rule this slice establishes**

Commit to PostgreSQL first, publish to Redis second, and never treat the publish
as evidence of delivery. `CommittedLivePublisher` enforces that order: a failed
commit never publishes, and a failed publish is logged without rolling back state
that is already durable. Recovery is always a fresh PostgreSQL snapshot, never a
replayed message. That is why this Redis instance has no AOF, no RDB file, and no
volume. Losing a notification is already handled. SETUP-08 adds persistence in V6,
when BullMQ makes it a correctness requirement rather than a convenience.

A subscription is keyed by subscription identifier, symbol, and timeframe. A
sequence gap, a reconnect, or Redis subscriber readiness all force the same
response: drop back to the snapshot phase and re-read durable state before
delivering anything live. Each client holds at most four subscriptions, matching
the four charts V4 shows, and each subscription has a bounded outbound queue.
Overflow or an unwritable socket disconnects the client, because reconnect
recovers correctly by snapshot and an unbounded buffer does not.

**Validation**

Acceptance criteria 1 through 5 were proven in a real browser by
`pnpm run smoke:ws03`, against Compose `api` and `web` images rebuilt from the
final code. Criterion 6 is not observable from a browser and is covered by the
registry unit tests. Backend: 64 files, 361 tests. SPA and contracts: 10 files,
60 tests. Root typecheck, lint, and `git diff --check` pass.

**Two operational facts worth knowing before reading a failure here as a defect**

The backend integration tests drop and recreate the PostgreSQL schema, which
deletes seeded demo data. The first smoke run after the backend suite failed with
`WS03_SMOKE_DATA` for exactly that reason. Re-run `pnpm run demo:seed` before any
browser smoke or demo that follows a backend suite run.

The smoke deliberately stops Redis to prove criterion 4, so
`Redis live publisher error` warnings during that window are the designed
behaviour, not a fault. The smoke starts Redis again when it finishes.

**Carried forward**

The registry stores subscription state under a NUL-delimited composite string key
rather than a nested structure. It is contained inside one private method and does
not affect behaviour, so it was left as is. The coherent WS-03 diff has not been
through the two-axis review since the last round of fixes, and it is not yet
committed. Both belong before MKT-06 starts.
