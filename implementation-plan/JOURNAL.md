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

### 2026-08-30 - V4 release freeze

**Validation**

- Final regression passed 94 Vitest files and 544 tests, plus workspace typecheck,
  lint, Compose config, architecture boundary, and diff checks. The only first-run
  failure was a stale Market schema expectation missing the MKT-09
  `provider_health` table; the focused repair and the one permitted full rerun pass.
- `PROOF-RT-001` passed on rebuilt Compose images. Its record is
  [`PROOF-RT-001.md`](../docs/validation/evidence/PROOF-RT-001.md). The controlled
  provider outage recovered with no unresolved gap or duplicate; snapshots stayed
  immutable; four subscriptions stayed isolated; and Redis loss did not block a
  closed-candle PostgreSQL commit.
- The V4 Definition of Demoable and the complete V4 browser/demo scenario pass.
  [`V4-DEFINITION-OF-DEMOABLE.md`](../docs/validation/evidence/V4-DEFINITION-OF-DEMOABLE.md)
  is the release evidence.
- `DEMO-01` recertified the Compose path for V4. The assembled topology adds only
  `redis` and `market-ingest` to the V1-V3 roles, and every release gate above ran
  on that topology instead of on host processes.

**Operational note**

- The local governance command still sees an ignored, pre-existing legacy process
  directory and fails only for that directory. It was not deleted. The same command
  passes on a detached clean worktree at the release source commit, so no ignored
  local artifact enters the release tree.

**Ending state**

- V4 is frozen by the release commit that carries this entry and local annotated tag
  `v4.0-demo`. No branch, tag, or authorization for V5 was created.
- The freeze also repaired the host-development section of the README, which still
  said Redis was not started yet and that `docker compose up -d` starts one
  PostgreSQL container. Since V4 that bare command starts the whole topology, so
  the host path now names `postgres redis` explicitly.

### 2026-08-30 — V4 — MKT-09

**Decisions**

- Socket.IO sends a forming `candle.tick` through its volatile path only when the
  transport is temporarily busy. Ticks are explicitly ephemeral; snapshots and
  committed closed candles remain on the existing bounded durable path.

**Validation**

- The focused gateway regression test was red before the change and green after it.
  Backend typecheck, targeted lint, and `git diff --check` pass. Final
  `smoke:mkt09` on rebuilt images and default buffer 32 observed healthy, degraded,
  then healthy again while the original charts retained durable data and resumed live.

**Ending state**

- MKT-09 is `DONE` in the tracker. The MKT-09 work remains uncommitted on base
  `1eb8f14`; V4 freeze and V5 were not started.

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
not affect behaviour, so it was left as is.

The slice was committed at `7bc5bf3` without a two-axis review. The review was
skipped deliberately to conserve budget, not overlooked, so this diff carries no
review record. Anyone auditing V4 later should read WS-03 as validated by tests
and browser smoke only.


### MKT-06 - Binance live ingest process

**What was built**

A separate `market-ingest` process role. `apps/backend/src/main.market-ingest.ts`
starts it, `market-ingest.module.ts` is its own narrow composition root, and
`MarketIngestRuntime` owns which streams the role holds. It joins Compose as the
`market-ingest` service, so the V4 topology now starts the role the WS-03 comment
said was deliberately absent.

**The decision that shapes the code: two channels, one place**

A Binance kline arrives with a boolean `x`. That single flag separates two things
that are different in kind, so exactly one function decides it -
`liveCandleChannel` in `market-live-ingest-service.ts`:

```text
x = false -> candle.tick   -> published, never stored, no durable side effect
x = true  -> candle.closed -> committed to PostgreSQL first, announced after
```

Everything else follows. The tick path calls no store at all, and the durable
write path independently refuses a candle that is not closed, so a later caller
cannot smuggle a forming candle into a dataset even by mistake.

**Notification sequence is seeded from the wall clock**

The API drops a live message whose sequence is not greater than the last one it
saw, and asks for a fresh durable snapshot when it sees a jump. A counter that
restarted at zero would therefore make a restarted ingest process invisible to
every already-connected client. Seeding the counter from `Date.now()` turns a
restart into a jump instead, which the API already handles by refreshing the
snapshot. Losing a notification costs a chart one update; going silently deaf
would not have been recoverable.

**`ws` was added as a real dependency**

`ws` is now a backend dependency and a root dev dependency, and `pnpm-lock.yaml`
changed with it. Two reasons for `ws` over the platform WebSocket: it works on the
Node version the engines field allows, and it reports the ping frame. Binance drops
a connection that has not answered a ping within a minute, so "we answer pings" had
to be observable rather than implicit. Anyone regenerating `DEPENDENCY_LOCK_HASH`
from the lock file must do it again after this change.

**Deliberately not built here**

Reconnect, backoff, gap detection, and provider health are `MKT-09`. A closed
connection is reported to the registry, which ends every subscriber stream; the
process then stops rather than pretending to be healthy. This is the documented
boundary of `MKT-06`, not an omission.

**Redis-down root cause and fix**

The first Redis-down tests exposed two separate starvation paths. Tick publication was
initially sequential, so a slow tick could stop a closed kline from reaching the commit
path. Making ticks non-blocking removed that path and kept at most one tick publication
in flight per stream.

Instrumentation then found the remaining defect. A closed kline reached `handle`,
`appendClosed` completed, and only the notification step stopped progressing. The Redis
publisher client was open but not ready while node-redis retried the connection forever;
the publish promise did not settle, so the sequential stream consumer never processed
the next candle. The publisher now disables its offline queue and automatic reconnect,
bounds each publication to one second, and destroys the client on timeout so the
underlying connection and command settle too. Recovery remains simple: the next market
update makes a new best-effort connection attempt. The subscriber and its WS-03 snapshot
recovery behaviour did not change.

The earlier zero-row Redis-down runs were not reproduced under instrumentation: the
instrumented run committed its first closed candle before blocking in publication. The
confirmed defect was still sufficient to fail acceptance criterion 7 because later
closed candles could not continue. Final validation below proves the required continuing
behaviour directly.

**Validation**

The original Redis-available run ingested two closed 1m candles from real Binance,
answered server pings, and stored no forming tick. The final Redis-down run on
2026-08-29 inspected the database before and after two consecutive closed intervals:

```text
before: 1 row for BTCUSDT 1m
after:  3 rows
new:    open times 1788006480000 and 1788006540000, both revision 1,
        closed = true, one row per logical identity
```

Every notification failed as expected while Redis was stopped, but both commits
completed and ingest continued across the second close. After Redis restarted, the
publisher integration test passed and live ingest committed the next observed candle,
open time `1788006660000`, without a notification warning.

The deterministic regression uses an endpoint that accepts TCP but never completes a
Redis handshake. Two publication attempts each settle at the one-second bound. The
service regression holds one tick publication unresolved while later notifications
fail, commits two consecutive closed candles, and observes no more than two publications
in flight.

The committed two-axis review then found three durability holes before push. A full
closed-candle subscriber buffer could discard its oldest closed candle; initial stream
open failure reached only the first waiting subscriber; and Compose required healthy
Redis before starting market ingest. The registry now applies bounded backpressure when
all 256 slots hold closed candles, fails every queue waiting on the same initial open,
and lets Compose start ingest from PostgreSQL and migrations alone. A Redis-stopped
Compose run proved the rebuilt ingest process starts and opens the Binance stream.
The stream client pauses socket reads while asynchronous delivery is backpressured and
resumes only after all already-decoded frames settle, so the bound is not moved into an
unbounded promise chain upstream.

The final backend Market/realtime suite passes at 13 files and 88 tests. Backend
typecheck, scoped lint, Compose config, and `git diff --check` pass.

### MKT-07 - the two live channels became two wire message types (2026-08-29)

`WS-03` shipped one `market:live` message whose candle carried a `closed` boolean, and
`MKT-06` published both channels through it. That let a client decide what a message
meant by reading a flag, and the SPA duly merged a forming tick straight into its durable
candle array. The plan already names the two channels `candle.tick` and `candle.closed`,
and `liveCandleChannel` already decided between them inside ingest, so the decision was
only ever discarded at the wire. It is now the wire message type.

The second change is who may name a subscription. Live messages are split into two type
families:

```text
MarketLiveNotification   ingest -> Redis -> API   no subscriptionId
MarketLiveMessage        API -> one client        notification + subscriptionId
```

Market Data must not know that client sessions exist, so it cannot address a message to
one. The registry stamps the subscription when it matches, which is the API owning
subscription identity in the type system rather than by convention. `isMarketRealtimeMessage`
now rejects an unaddressed live message, and the Pub/Sub edge validates with the separate
`isMarketLiveNotification`. The SPA routes by subscription identifier and keeps the key
check only as a guard.

The SPA keeps the durable series and the forming bar in separate state. A tick sets the
forming bar and never enters the series; a committed candle replaces the bar with the same
open time and clears the forming bar; a fresh snapshot drops the forming bar outright.
That is what makes a snapshot/live overlap apply once at the chart, and the registry drops
a closed candle at or below the snapshot watermark so it usually never reaches the chart
twice in the first place.

WS-03's bounded outbound queue, slow-client disconnect, four-subscription cap, and
sequence-gap snapshot refresh were reused unchanged and re-verified against the new types.

One debt worth naming: `scripts/smoke-mkt07.ts` requires `market-ingest` to be stopped.
The registry drops a live message whose sequence is not greater than the last one it saw,
and ingest seeds its sequence from the wall clock, so a running ingest makes scripted
publications unobservable. `MKT-09` and `PROOF-RT-001` will need a way to assert protocol
behaviour with real ingest traffic present.

### MKT-11 - Four live chart subscriptions

**Why this slice was small in the SPA and not small in the API**

`MKT-08` had already built four charts with stable identifiers, and `MKT-07` had already
built the subscription protocol on those same charts. So the SPA work was mostly moving
the lifecycle `MKT-07` had left inline in `ChartWidget` into one shared hook,
`use-chart-subscription.ts`, and giving the page a real connection indicator instead of a
hard-coded green dot. The protocol, the wire types, and snapshot-before-live were reused
unchanged.

The API was a different story, and it is the durable part of this entry.

**The API held the notion of "four", and it should not have**

`MarketSubscriptionRegistry` was constructed with `maxSubscriptionsPerClient = 4` as a
parameter default, and the gateway never overrode it. `WS-03` introduced it honestly, as
backpressure protection sized to the four charts V4 shows. But `MKT-11`'s architecture
constraint is explicit: the backend holds however many subscriptions exist, never a count
of charts. A default of four is a layout decision living in the API.

The bound itself is still wanted. What changed is where the number comes from:

```text
before   registry default = 4        -> the API assumed the page
after    WS_SUBSCRIPTION_MAX = 32    -> config decides, the page decides its own charts
```

`WS_SUBSCRIPTION_MAX` follows `WS_OUTBOUND_BUFFER_MAX` exactly: validated in
`platform/config.ts`, provided by `ApiModule`, injected into the gateway, listed in
`.env.example` and `docker-compose.yml`. The registry parameter now has no default, so no
future caller can inherit a chart count by forgetting an argument. The registry limit test
configures three rather than four, which is the point: the bound is whatever it is set to.

**A read-only route was added that the slice did not ask for**

`MKT-11`'s expected change surface names SPA work only. Acceptance criterion 4 says the
server-side subscription state must *show* exactly four entries before and after a
timeframe change, and nothing exposed that state outside a unit test.
`GET /realtime/subscriptions` now returns `{ activeSubscriptions }`. It is read-only, it
reports the count that exists rather than an expected one, and it sits in `ARC-API`, which
already owns client subscription and session state, so it crosses no boundary. Without it
the fourth criterion could only ever be argued from a unit test, and a unit test does not
prove what the assembled system does.

**Validation**

Criteria 1 through 5 were proven in a real browser by `pnpm run smoke:mkt11`, against
Compose `api` and `web` images rebuilt from the final code. Four charts held `5m`, `15m`,
`1h`, and `4h` at once, each with its own watermarked snapshot; the API reported four
active subscriptions; a tick published on each timeframe reached only its own chart;
retargeting `chart-1` to `1h` gave it a fresh snapshot with real candles and no stale
forming bar while the other three kept their snapshot counts, durable counts, and forming
bars and went on receiving ticks; a value planted in the document survived the change, so
there was no reload; the count was still four afterwards and zero once the page closed.
Criterion 6 became a guard test rather than an inspection: `ChartWidget.test.tsx` asserts
the `MKT-05` renderer receives exactly `candles` and `state`, so a future slice cannot
quietly hand the chart a socket. Relevant suites: 12 files, 90 tests. Typecheck, scoped
lint, and `git diff --check` pass.

**Two operational facts, both already known and both still true**

`smoke:mkt11` stops `market-ingest` before publishing, for the same reason `smoke:mkt07`
did: the API accepts a live message only when its sequence follows the last one for that
subscription, and ingest seeds its per-stream sequence from the wall clock. That filtering
is the design. The smoke restarts ingest when it finishes.

`market-ingest` is currently in a restart loop: it opens the Binance stream, subscribes to
all eight streams, and stops about 300 ms later having committed nothing. That is
`MKT-06`'s documented boundary, where a closed provider connection ends the streams and the
process stops rather than pretending to be healthy. Reconnect, backoff, and gap recovery
are `MKT-09`, which is the remaining V4 slice. It was classified and left alone here.

**No review record on this diff**

The two-axis review was skipped on the owner's explicit instruction, to conserve budget,
not overlooked. `WS-03` carries the same gap for the same reason. Read `MKT-11` as
validated by its tests and its browser smoke, and by nothing else.

---

## V5 - News and Sentiment

### 2026-08-30 - V4 -> V5 handover

**Decisions**

- The owner moved the target version to V5 and authorized the branch and the version
  field change. The agent verified the five `AGENTS.md` authorization conditions
  against the repository first, at `5f2f7af` with a clean tree, rather than trusting
  the instruction alone. `TRACKING.md` records that check.
- V5 work starts on `v5-news-and-sentiment`, branched from the V4 release commit.
  The V4 branch stays at `5f2f7af` so `v4.0-demo` remains reproducible.

**Open decisions that block work**

- `NEWS-02` cannot start until concrete news sources are approved, and `NEWS-04`
  until a sentiment model or service is chosen. Both are now `BLOCKED` rather than
  `TODO`, so they stay visible while `NEWS-01` proceeds.

**Ending state**

- No V5 code exists. `NEWS-01` is the only `READY` slice.

### 2026-08-30 - V5 validation cadence

**Decision**

- Each required backend News slice (`NEWS-01`, `NEWS-02`, `NEWS-03`, `NEWS-04`,
  `NEWS-05`, and `NEWS-07`) is accepted from its targeted unit, contract,
  integration, narrow typecheck/lint, relevant architecture-boundary, and
  `git diff --check` evidence. A repository-wide Vitest run is not a per-slice
  requirement during the V5 implementation chain.
- After all required backend News slices through `NEWS-07` pass their targeted
  validation, run the repository-wide suite once as the News backend integration
  gate. If it fails, diagnose and repair through targeted tests before one ready
  re-run; do not repeat full suites while diagnosing.
- `UI-07` uses focused News UI/API/degraded-path validation. The final
  repository-wide V5 certification runs only after `UI-07` and the required V5
  proof and demo work are complete.

**Current run**

- A repository-wide Vitest run began before this decision while NEWS-01 was stable.
  Its outcome is incidental V5 baseline evidence only. Do not restart it or use it
  as a reason to run another full suite at NEWS-01 completion.

### 2026-08-30 - NEWS-01 targeted completion and incidental baseline

**Result**

- NEWS-01 delivered the normalized NewsItem domain contract, UTC timestamp rule,
  deterministic source-plus-URL identity, first-item-wins deduplication, explicit
  malformed-content rejection, and 20,000-character content truncation.
- The reusable NewsProvider contract suite passes with FakeNewsProvider and rejects
  BrokenFakeNewsProvider duplicate output. NEWS-01 targeted tests, News boundary
  check, narrow lint/typecheck, and diff check pass.
- No model, real provider, persistence, collector, scheduling, API, or worker was
  added. NEWS-02 and NEWS-04 remain blocked on their existing owner decisions.

**Incidental V5 baseline**

- The full Vitest run started before the V5 validation-cadence decision finished
  with 95/97 files and 555/558 tests passing. It failed only in backtest
  result-query and backtest-runner-lifecycle integration tests: one queued-result
  HTTP status mismatch, one hard-kill reclaim timeout, and one graceful-shutdown
  status mismatch. NEWS-01 does not touch the Experiment module, runner, database,
  API endpoints, or these tests; all three NEWS-01 files passed in that run. This is
  recorded as incidental baseline evidence, not attributed to NEWS-01 and not
  repaired or rerun within this slice.

### 2026-08-30 - NEWS-02 CoinDesk RSS source decision

**Owner decision**

- The owner approved CoinDesk's official RSS feed as the first concrete News source:
  `https://www.coindesk.com/arc/outboundfeeds/rss/`. This is an owner source
  decision, not an agent product-scope or version decision.
- The adapter must receive its endpoint from configuration. It may consume only RSS
  title, summary/description, canonical link, and published timestamp. It must not
  scrape article pages, download articles, or reproduce full article content.
- The owner accepted `6f387d6 implement(v5): finish NEWS-01` as the NEWS-01
  baseline as-is, including its known PDF render PNG files. NEWS-02 starts from that
  commit without rewriting or repeating NEWS-01 review.

**Implementation start**

- `NEWS-02` moved from `BLOCKED` to `IN PROGRESS`. C1 adds the News-owned
  collection tables and an atomic persistence seam. The source is not yet queried;
  adapter, collector, scheduler, worker role, and real-source demonstration remain
  in later NEWS-02 milestones.

### 2026-08-30 - NEWS-02 complete: collection worker and CoinDesk RSS adapter

**Delivered**

- The first real provider adapter, `CoinDeskRssNewsProvider`, reaches the approved
  feed through configuration and maps RSS-only fields through the unchanged NEWS-01
  normalization contract. It passes the NEWS-01 provider contract suite unmodified.
- News Intelligence now owns durable collection state: `news.items` and
  `news.source_health` in migration `0016_create_news_collection.sql`. The item table
  encodes the deterministic `source|url` identity as a check constraint, enforces a
  unique `(source, url)`, and permits only the `pending` analysis state.
- `NewsCollectionService` fetches through the port, deduplicates, and commits one
  batch through a single `NewsCollectionStore.storeCollectedBatch` transaction that
  also writes source health. A V6 outbox row can join that transaction without
  rewriting the collector; no outbox exists now.
- `NewsWorkerModule`, `main.news-worker.ts`, and the `news-worker` Compose service add
  the News worker as its own process role, with manual (`pnpm run news:collect`) and
  scheduled triggers.

**Durable decisions**

- Collection stays strictly RSS-only. No article page is ever requested, and no full
  article body is stored; observed stored summaries run 37 to 203 characters.
- Provider failure is caught inside News, persisted as degraded source health, and
  never raised outside the News boundary. A failing collection exits successfully.
- The no-analyzer guarantee is enforced by a static proof that pins the collector's
  import list, not by observing an uncalled mock. It was mutation-tested: adding an
  analyzer import turned it red, and the change was reverted.

**Isolation evidence**

- With `api`, `web`, `market-ingest`, `redis`, and `runner` stopped, the news worker
  collected healthily. With the news worker stopped, the backtest runner started and
  reported `Runner slot ready`. This is targeted NEWS-02 evidence; `PROOF-ISO-001`
  still needs its own full-topology run after the remaining V5 slices.

**Validation cadence**

- NEWS-02 used targeted validation only: the News module and config tests (8 files,
  47 tests), backend typecheck, narrow lint, `git diff --check`, and
  `docker compose config --quiet`. The repository-wide suite was not run and must not
  be until the V5 News backend integration gate after `NEWS-07`.

**State**

- `NEWS-02` is `DONE` but deliberately uncommitted, awaiting owner review. `NEWS-03`
  is now `READY`. `NEWS-04` stays `BLOCKED` until the owner selects a sentiment model
  or service.

### 2026-08-30 - NEWS-03 complete: analyzer lifecycle without a model decision

**Delivered**

- News Intelligence now owns a framework-, library-, vendor-, and language-neutral
  `SentimentAnalyzer` port plus a versioned `SentimentResult`. The result requires
  label, bounded score, result schema version, news reference, timestamp, and exact
  model ID, artefact identity, model version, input version, and preprocessing
  version. Moving aliases, including `latest`, are rejected at the result boundary.
- Forward migration `0017_add_news_sentiment_analysis.sql` preserves existing
  `pending` rows and adds the full state set: `pending` (claimable), `analyzing`
  (leased and reclaimable), `analyzed` (terminal success), and `degraded` (terminal
  exhausted retry). It also adds durable News-owned result and immutable attempt
  history tables.
- The analyzer stage and its PostgreSQL store reuse the EXP-04 skip-locked lease
  pattern. A result, attempt closure, and `analyzed` state commit atomically; every
  failure records its reason and returns the item to `pending` or to visible
  `degraded` under configured bounded retry policy.
- Collection and analysis stay independent stages in the news-worker process. They
  meet only in News-owned durable state. The worker supports scheduled analysis and
  the manual `pnpm run news:analyze` trigger. The NEWS-02 collector no-analyzer
  proof remains unchanged and green.

**Validation and live evidence**

- Contract, provenance, migration, repository, lifecycle, retry, lease-recovery,
  concurrency, binding, runtime, config, and collector-isolation suites pass. The
  final non-reset focused run passed 8 files and 62 tests; backend typecheck, scoped
  lint, `git diff --check`, and `docker compose config --quiet` pass. No
  repository-wide Vitest suite was run or repeated.
- The rebuilt news-worker processed all 25 existing real CoinDesk items with
  `FakeLexiconSentimentAnalyzer`: 25 results and 25 successful attempts, all with
  complete alias-free provenance. One synthetic non-article C5 item exercised the
  `UnavailableFakeSentimentAnalyzer` three times: two retryable durable failures,
  then a visible `degraded` state with no result. The 25 real normalized items stayed
  intact; no article body is reproduced here.
- No real sentiment model, hosted inference API, model library, or Python runtime
  was selected, installed, downloaded, or bound. The only worker binding remains a
  fake. NEWS-04 remains blocked on the owner's model or service decision.

**Durable handoff**

- At handoff, `NEWS-03` was intentionally uncommitted; no push occurred. `NEWS-01`
  (`6f387d6`), `NEWS-02` (`93958a9`), and NEWS-03 must receive their combined
  slice-diff review later because the owner explicitly deferred it. Do not run that
  review or delete `.scratch/checkpoints/NEWS-02.md` before the owner directs it.
- The existing `resetTestDatabase()` helper resets the database selected by `.env`.
  In this workspace that is the live Compose database, not a dedicated test database.
  A first C4 composition test exposed this; its test is now database-free and the
  exact synthetic row was removed before the real 25-row C5 run. Do not call that
  helper again in this session. A dedicated test database is an unresolved local
  environment safeguard, outside NEWS-03 scope.

**Commit boundary**

- After separate owner authorization, NEWS-03 was committed as `c46c2e1`
  (`feat(news): add analyzer inference lifecycle (NEWS-03)`). It remains unpushed;
  the owner-deferred combined NEWS-01..NEWS-03 slice-diff review is still outstanding.

### 2026-08-30 - NEWS-04 owner decision: OpenAI Responses adapter

**Owner decision**

- Bind only the OpenAI Responses API to the existing `SentimentAnalyzer` port, using
  strict structured output and the exact snapshot `gpt-4.1-mini-2025-04-14` at
  `https://api.openai.com/v1/responses`.
- The adapter runs only in the Node.js News worker. Python, local models, Transformers.js,
  ONNX, other providers, and automatic fallback are not authorized.
- The hosted adapter directly classifies normalized English crypto-news text and avoids a
  Python runtime, local model, and another container, keeping NEWS-04 inside the existing
  News adapter boundary.
- The exact snapshot is the immutable model identity available to this repository.
  Results are explicitly **not fully reproducible**: the snapshot, prompt, request schema,
  input/preprocessing versions, SDK version, and application code can be pinned, while the
  hosted model binary and inference runtime remain vendor-controlled.
- Prompt version is `openai-crypto-news-sentiment-v1`. The existing port input version
  remains `news-item.v1`; `news-sentiment-input-v1` identifies deterministic title-plus-
  content preprocessing. Scores are confidence values in `[0,1]`, not calibrated
  probabilities.

**Implementation start**

- NEWS-04 moves from `BLOCKED` to `IN PROGRESS`. No API key has been read or used, and no
  real OpenAI request has been made. The owner will fill the local ignored `.env` only after
  offline C1-C4 validation is complete.

### 2026-08-30 - NEWS-04 C1-C4 offline adapter and credential gate

**Delivered offline**

- `OpenAiResponsesSentimentAnalyzer` binds the exact selected snapshot only, uses strict
  two-field structured output, independently validates that output, and has no model or
  provider fallback. Its client is injected for deterministic no-network tests.
- The existing `SentimentResult` remains unchanged. Its required five-field provenance
  records OpenAI model, immutable hosted artefact identity, snapshot, existing input version,
  and deterministic preprocessing version. Adapter metadata records prompt, SDK, endpoint,
  and the explicit not-fully-reproducible classification without adding optional data to the
  frozen result contract.
- The production News-worker binding now uses the adapter and reads the credential only in
  that composition root. An absent credential follows the existing retryable failure path;
  collection, API, Strategy, and Experiment remain isolated.

**Validation and gate**

- Targeted adapter, contract, missing-credential lifecycle, composition, boundary, existing
  result-provenance, and News isolation tests pass: 10 files, 74 tests. Backend typecheck,
  scoped lint, Compose configuration, and `git diff --check` pass. No live request or credit
  was used.
- The governance validator still reports only three pre-existing obsolete-process findings.
  They are outside NEWS-04 and were not changed here.
- C5 is intentionally not run. The local ignored `.env` has an empty `OPENAI_API_KEY` line
  added by the agent without displaying the file. The owner must fill it locally, then request
  C5 explicitly; do not inspect or print the credential.

### 2026-08-30 - NEWS-04 C5 partial live validation

**Safe service state**

- The local credential was checked only as a non-empty boolean and `.env` remained ignored.
  It was never printed, copied, persisted, or inspected through Compose configuration or
  container inspection.
- Only `news-worker` was rebuilt and recreated, and it was verified running with batch size
  one. It was then deliberately paused to prevent an unobserved paid attempt while C5 is
  blocked. `postgres` stayed healthy and `runner` stayed running; `api`, `web`,
  `market-ingest`, and `redis` stayed stopped. Compose now passes the existing
  `NEWS_ANALYSIS_BATCH_SIZE` configuration only to `news-worker` so a proof cannot claim a
  backlog.
- Worker-log output was not displayed. A non-disclosing marker scan found no credential marker.

**Hosted labelled sample**

- The three fixed examples from official source section 29 were run through the production
  `NewsWorkerModule` binding and its `SENTIMENT_ANALYZER` port. The endpoint was
  `https://api.openai.com/v1/responses`; the model snapshot was
  `gpt-4.1-mini-2025-04-14`; prompt version was `openai-crypto-news-sentiment-v1`; input and
  preprocessing versions were `news-item.v1` and `news-sentiment-input-v1`.
- Three requests were made, once each: positive -> positive (0.90), negative -> negative
  (0.95), neutral -> neutral (0.50). Accuracy is 3/3 (100%) and is informational only. The
  score is application-level model confidence, not a calibrated probability.

**Remaining C5 blocker**

- The recreated worker and one explicit collection-only run each found no new CoinDesk item:
  zero stored and 25 skipped. The protected database therefore remains at 25 analyzed items,
  one existing degraded fixture, 25 results, and 28 attempts (25 succeeded and 3 failed).
- No real pending item exists for the worker to claim. The real-item result/provenance proof
  and the controlled durable-unavailability proof remain incomplete; the existing degraded
  fixture was inspected only and not altered. No fake result was overwritten, no database was
  reset, and no fallback was used.

**Targeted checks**

- `docker compose config --quiet` and `git diff --check` pass after the narrow Compose mapping.
  No full suite, backend integration gate, code review, migration, commit, or push was run.

### 2026-08-31 - NEWS-04 collection-only composition correction

**Root cause and correction**

- `news:collect --once` previously selected `collectOnce()` after creating the full
  `NewsWorkerModule`, whose graph includes `SENTIMENT_ANALYZER`. Although the method
  did not invoke analysis, collection-only bootstrap could still resolve the
  production adapter.
- `NewsCollectionWorkerModule` is now a separate composition root. It owns only the
  existing provider, collection repository, collection service, scheduler, logger,
  database pool lifecycle, and `NewsCollectionWorkerRuntime`. It contains no
  analyzer token, analyzer adapter, sentiment scheduler, sentiment service, or
  sentiment repository. `main.news-worker.ts --once` selects this root before
  Nest bootstraps. The normal worker continues to import the collection root and
  binds the OpenAI adapter through `SENTIMENT_ANALYZER` unchanged.

**Evidence**

- The new composition test compiles the collection-only root, obtains its collection
  runtime, and proves both `SENTIMENT_ANALYZER` and `SentimentAnalysisService` are
  absent. Its static check also proves `--once` selects the collection-only root and
  that root contains no analyzer implementation or sentiment lifecycle type.
- The targeted collection-root, full-worker-binding, and worker-topology tests pass:
  3 files, 8 tests. Backend typecheck, `docker compose config --quiet`, and
  `git diff --check` pass. No repository-wide suite or review ran.
- After the authorized `docker compose run --rm news-worker pnpm run news:collect`,
  collection stored 2 items and skipped 23. The database moved from 26 items
  (25 analyzed CoinDesk, 1 degraded fixture) to 28 items (27 CoinDesk: 25 analyzed,
  2 pending; the same 1 degraded fixture). Results remain 25 and attempts remain 28
  (25 succeeded, 3 failed). The API and normal News worker remained stopped; runner
  remained running. The collection-only graph cannot issue a hosted request, and
  the cumulative hosted-request count remains 3.

**Next action**

- Do not analyze either pending item in this continuation. In the next authorized
  C5 continuation, select exactly one newly collected pending CoinDesk item, run the
  controlled durable unavailability proof, then perform at most one successful
  retry through the normal News worker.

### 2026-08-31 - NEWS-04 C5 controlled failure and real-item recovery

**Reconciliation and deterministic boundary**

- Before starting a worker, the live `news` schema matched the protected baseline:
  28 items; 25 CoinDesk `analyzed`; two CoinDesk `pending`; one unchanged `c5-fake`
  `degraded` fixture; 25 `sentiment_results`; and 28 attempts (25 `succeeded`, three
  `failed`). PostgreSQL was healthy and runner was running; API and the persistent
  normal News worker were stopped.
- The normal worker claims with `ORDER BY collected_at, id`. Both pending CoinDesk
  rows had `collected_at` `1788142079381`, so the bounded batch selected the lexically
  first immutable ID:
  `coindesk-rss|https://www.coindesk.com/business/2026/08/30/from-hawala-to-swift-inside-the-1-000-year-battle-to-move-money-safely`.
  The protected control was
  `coindesk-rss|https://www.coindesk.com/markets/2026/08/30/bitcoin-nears-usd79-000-as-michael-saylor-hints-at-first-bitcoin-purchase-in-two-months`.
  Both began `pending`, with attempt count 0 and no result.
- `news:analyze` maps to `--analyze-once`, which invokes only the normal worker's
  analysis stage. `NEWS_ANALYSIS_BATCH_SIZE=1` and the repository `LIMIT $2` made
  each authorized run claim at most one item. No collection command was run.

**Controlled unavailability**

- Ran exactly once:
  `docker compose run --no-deps --rm -e OPENAI_API_KEY= -e NEWS_ANALYSIS_BATCH_SIZE=1 news-worker pnpm run news:analyze`.
  The empty credential was scoped to that one container; `.env` was not displayed or
  changed. The normal worker reported one claim, zero analyzed, one retryable failure,
  zero degraded, and zero lost claims.
- The selected item kept its immutable ID, returned to `pending`, and recorded attempt
  1 by `news-worker-47` as `failed` with
  `ANALYZER_UNAVAILABLE: OpenAI credential is missing` at
  `2026-08-31 02:19:48.278139+00` through `2026-08-31 02:19:48.308297+00`. It had no
  result. This is the adapter branch that has no client and throws before
  `client.create`; therefore no hosted request occurred in this phase.
- The cumulative hosted-request execution evidence stayed at 3. The control remained
  `pending` with no attempt or result. The `c5-fake` fixture stayed `degraded` with its
  original three failed attempts and no result. The intermediate shape was 28 items,
  25 CoinDesk analyzed, two CoinDesk pending, 25 results, and 29 attempts (25
  succeeded, four failed).

**Recovery and durable result**

- Ran exactly one recovery retry, with the Compose service's real analyzer configuration
  restored by omitting the empty-key override:
  `docker compose run --no-deps --rm -e NEWS_ANALYSIS_BATCH_SIZE=1 news-worker pnpm run news:analyze`.
  It reported one claim, one analyzed, zero retryable/degraded/lost claims, then exited.
- The same selected item recorded attempt 2 by `news-worker-47` as `succeeded`, claimed
  at `2026-08-31 02:21:00.150549+00` and completed at
  `2026-08-31 02:21:04.628113+00`. Its final state is `analyzed`, attempt count 2, no
  open lease or failure reason, and exactly one durable result: `neutral`, score `0.6`,
  `openai-responses`, artifact `openai://responses/gpt-4.1-mini-2025-04-14`, model
  version `gpt-4.1-mini-2025-04-14`, input `news-item.v1`, preprocessing
  `news-sentiment-input-v1`, schema version 1, status `succeeded`.
- This bounded recovery can issue exactly one hosted request: the single-item stage made
  one successful analyzer call and the SDK client has `maxRetries: 0`. Therefore the
  cumulative execution evidence is 3 -> 3 -> 4 (labelled sample -> unavailable ->
  recovery). This is execution evidence rather than an external billing-ledger query.
- Final shape: 28 items; 26 CoinDesk `analyzed`; one CoinDesk `pending` (the untouched
  control); one unchanged `c5-fake` `degraded`; 26 results; and 30 attempts (26
  `succeeded`, four `failed`).

**Exact read-only database queries**

- Each statement below ran against the `news` schema through
  `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U crypto_strategy_lab -d crypto_strategy_lab -P pager=off -c`.
  Before the worker, the aggregate query returned 28 items, 25 results, and attempts
  of 25 `succeeded` plus three `failed`; the grouped item query returned 25 CoinDesk
  `analyzed`, two CoinDesk `pending`, and one `c5-fake` `degraded`.

```sql
SELECT count(*) AS total_items FROM news.items;
SELECT source, analysis_state, count(*) AS item_count
FROM news.items GROUP BY source, analysis_state ORDER BY source, analysis_state;
SELECT count(*) AS total_results FROM news.sentiment_results;
SELECT outcome, count(*) AS attempt_count
FROM news.sentiment_analysis_attempts GROUP BY outcome ORDER BY outcome;
SELECT i.id, i.url, i.collected_at, i.analysis_state, i.analysis_attempt_count,
       count(DISTINCT a.attempt_number) AS durable_attempts,
       count(DISTINCT r.news_item_id) AS durable_results
FROM news.items i
LEFT JOIN news.sentiment_analysis_attempts a ON a.news_item_id = i.id
LEFT JOIN news.sentiment_results r ON r.news_item_id = i.id
WHERE i.source = 'coindesk-rss' AND i.analysis_state = 'pending'
GROUP BY i.id, i.url, i.collected_at, i.analysis_state, i.analysis_attempt_count
ORDER BY i.collected_at, i.id;
```

- During unavailable mode, the selected query returned state `pending`, count 1,
  zero results, and its single `failed` attempt with the exact missing-credential
  reason. The control query returned state `pending`, count 0, zero attempts, and
  zero results. Aggregates became 25 results and 29 attempts (25 succeeded, four
  failed).

```sql
SELECT i.id, i.analysis_state, i.analysis_attempt_count, i.analysis_failure_reason,
       count(DISTINCT r.news_item_id) AS result_count, a.attempt_number,
       a.analyzer_id, a.outcome, a.failure_reason, a.claimed_at, a.completed_at
FROM news.items i
LEFT JOIN news.sentiment_results r ON r.news_item_id = i.id
LEFT JOIN news.sentiment_analysis_attempts a ON a.news_item_id = i.id
WHERE i.id = 'coindesk-rss|https://www.coindesk.com/business/2026/08/30/from-hawala-to-swift-inside-the-1-000-year-battle-to-move-money-safely'
GROUP BY i.id, i.analysis_state, i.analysis_attempt_count, i.analysis_failure_reason,
         a.attempt_number, a.analyzer_id, a.outcome, a.failure_reason, a.claimed_at,
         a.completed_at
ORDER BY a.attempt_number;
SELECT i.id, i.analysis_state, i.analysis_attempt_count, i.analysis_failure_reason,
       count(DISTINCT a.attempt_number) AS attempt_count,
       count(DISTINCT r.news_item_id) AS result_count
FROM news.items i
LEFT JOIN news.sentiment_analysis_attempts a ON a.news_item_id = i.id
LEFT JOIN news.sentiment_results r ON r.news_item_id = i.id
WHERE i.id = 'coindesk-rss|https://www.coindesk.com/markets/2026/08/30/bitcoin-nears-usd79-000-as-michael-saylor-hints-at-first-bitcoin-purchase-in-two-months'
GROUP BY i.id, i.analysis_state, i.analysis_attempt_count, i.analysis_failure_reason;
```

- After recovery, the query below returned selected state `analyzed`, attempt count
  2, null lease/failure fields, attempt 1 `failed`, attempt 2 `succeeded`, and the
  one result described above. The aggregate query returned 28 items, 26 results,
  26 CoinDesk `analyzed`, one CoinDesk `pending`, one `c5-fake` `degraded`, and 30
  attempts (26 succeeded, four failed).

```sql
SELECT id, analysis_state, analysis_attempt_count, analysis_failure_reason,
       analysis_claimed_by, analysis_lease_expires_at
FROM news.items
WHERE id = 'coindesk-rss|https://www.coindesk.com/business/2026/08/30/from-hawala-to-swift-inside-the-1-000-year-battle-to-move-money-safely';
SELECT news_item_id, attempt_number, analyzer_id, outcome, failure_reason,
       claimed_at, completed_at
FROM news.sentiment_analysis_attempts
WHERE news_item_id = 'coindesk-rss|https://www.coindesk.com/business/2026/08/30/from-hawala-to-swift-inside-the-1-000-year-battle-to-move-money-safely'
ORDER BY attempt_number;
SELECT news_item_id, schema_version, label, score, model_id, model_artifact_id,
       model_version, input_version, preprocessing_version, analyzed_at, status
FROM news.sentiment_results
WHERE news_item_id = 'coindesk-rss|https://www.coindesk.com/business/2026/08/30/from-hawala-to-swift-inside-the-1-000-year-battle-to-move-money-safely';
```

**Validation and process state**

- The focused NEWS-04 and bounded-worker suite passed: 12 files, 83 tests. Backend
  typecheck, scoped ESLint over every changed News TypeScript file, `docker compose
  config --quiet`, and `git diff --check` passed. No full suite was run.
- The one-off containers were removed. `docker compose ps -a` confirms persistent
  `news-worker` and API are stopped; PostgreSQL is healthy; runner remains running;
  web, market ingest, Redis, and migrate are stopped. No collection, unrelated service,
  full-suite test, migration, commit, or push ran during this continuation.

**Final diff review**

- Two-axis review of the full working diff against
  `f8ed5bfc93808604024db6477cf38b8dc017f709` passed after correcting worker-topology
  comments and wrapping three long lines. The Standards axis found no documented
  breach or Fowler baseline smell. The Spec axis found no missing C5 evidence, scope
  creep, or incorrect behavior. The final targeted suite and narrow checks were then
  rerun successfully.

**NEWS-04 acceptance mapping**

1. Real item classification: the selected durable CoinDesk item is `neutral` with score
   `0.6`.
2. Provenance: its one result stores exact model, artifact, model version, input, and
   preprocessing versions.
3. Hosted reproducibility: the existing static metadata/test declares the selected
   hosted snapshot not fully reproducible; the persisted result identifies its exact
   configured snapshot.
4. Narrow change surface: the full working diff remains limited to News adapter and
   worker composition, configuration, tests, the pinned SDK lock, and NEWS-04 records.
5. Unavailability: the selected real item has one durable failed attempt, stays
   retryable rather than lost, and has no result during the unavailable phase.
6. Worker-only execution: both live stages ran through the normal News worker while
   API remained stopped.

### 2026-08-31 - NEWS-05 Product Owner feature-contract decisions

**Decisions**

- The News sentiment-feature interface accepts a canonical uppercase base-asset code
  such as `BTC`, `ETH`, or `SOL`. News owns these codes and queries
  `NewsItem.relatedCoins`; Market/Experiment maps a market pair before crossing the
  News port. News does not parse Market symbols or depend on Market types.
- Every sentiment-dependent candidate or experiment declares its own positive
  `maxAge`, missing-data action, stale-data action, and an explicit signed substitute
  in `[-1, 1]` whenever either action is `substitute`. `block` returns an explicit
  blocked decision and no value; `degrade` retains a real stale aggregate but returns
  no value for missing data; `substitute` returns only the configured value and is
  always visibly substituted/degraded. Exact freshness equality is current.
- A query is evaluated at caller-supplied `asOf` over the inclusive rolling interval
  `[asOf - windowDuration, asOf]`. It includes only published items in that interval;
  ingestion and analysis completion times cannot admit future news. Each snapshot has
  a deterministic identity over the canonical asset, bounds, `signed-mean-v1`, and
  the included sentiment-result identities. A sentiment-dependent durable result
  records a deduplicated manifest of the actual rolling snapshots used, including
  bounds, contributing result identities, exact stored model-version sets, and
  policy/quality state.
- Normalized sentiment is `positive -> +score`, `neutral -> 0`, and
  `negative -> -score`. Every included result contributes once to the unweighted
  arithmetic mean; an empty set is missing, not neutral. Freshness is the age of the
  latest included item publication relative to `asOf`; model versions come only from
  included stored results.

**Scope and data-quality limit**

- CoinDesk's present collector intentionally persists an empty `relatedCoins` array.
  This means its current stored data cannot yield asset-specific feature values until
  a later provider/data-quality slice supplies canonical codes. NEWS-05 uses explicit
  deterministic fixtures and does not add title parsing, NLP, backfill, or a NEWS-02
  rewrite.

### 2026-08-31 - NEWS-05 implementation complete (seam level, uncommitted)

**What was built, across 14 TDD cycles from the Product Owner decisions above**

- `news/application/sentiment-feature.ts`: `SentimentFeatureService`, the only News
  query seam Experiment may use. It normalizes a canonical asset code, filters the
  inclusive caller-timed rolling window, validates every included stored result,
  computes the unweighted `signed-mean-v1` aggregate, and evaluates the missing/stale
  policy (`block`, `degrade`, `substitute`) before returning a response that carries
  window, item count, freshness, and quality but never a model, artifact, or provider
  detail. A separately carried `SentimentFeatureProvenance` (result IDs, model
  versions) exists only for Experiment's durable result boundary.
- `news/infrastructure/postgres-sentiment-feature-store.ts`: the read-only adapter
  behind that seam, joining analyzed/succeeded results to items inside the requested
  asset and window.
- `news/index.ts`: exports the feature, its request/response/policy types, and the
  window-identity helper as the module's public surface.
- `experiment/domain/sentiment-input.ts` and `experiment-specification.ts`/
  `experiment-specification-service.ts`: `SentimentInputConfiguration` is now a typed,
  validated, optional field of frozen experiment content. Freezing a descriptor that
  requires `sentiment-series` requires and validates it (positive window duration, a
  valid News policy); freezing a technical-only descriptor forbids it.
- `experiment/application/sentiment-feature-context-assembler.ts` and
  `sentiment-usage-manifest.ts`: `ExperimentSentimentContextAssembler` returns
  immediately for a technical-only descriptor without ever touching the News port; for
  a sentiment-required descriptor it resolves one rolling snapshot per evaluation time,
  builds cumulative `sentiment-series` inputs, and produces a deduplicated
  `sentiment-feature-usage.v1` manifest of the actual snapshots used (window, result
  IDs, model versions, quality, applied policy). An unusable snapshot returns a typed
  `blocked` assembly result rather than throwing.
- `experiment/application/backtest-result-acceptor.ts` and `backtest-runner-service.ts`:
  `BacktestRunnerOutcome` gained an optional `sentimentUsage` field; when supplied, the
  provenance checklist's `newsInput` records the manifest itself and `sentimentModel`
  records the deduplicated, sorted model-version set, replacing the previous
  unconditional `not-applicable` for both. No migration was needed - the checklist is
  stored as JSONB and the API contract's `isProvenanceResponse` already accepts any
  `recorded` value for any checklist key.
- Fixed two pre-existing defects surfaced by a full backend typecheck (not run since an
  earlier cycle): `strategy/index.ts` was missing the `SentimentSeriesInput` export
  that the context assembler already depended on, and a Postgres adapter test's
  zero-argument mock made TypeScript infer an empty-tuple call signature.

**NEWS-05 acceptance-criteria mapping**

1. Windowed query: `SentimentFeatureService.resolve()` returns aggregate sentiment,
   item count, window bounds, and freshness together.
2. No model/artifact/provider leakage: a dedicated response-shape test enumerates the
   response's fields and asserts none of them exist; provenance is a separately
   carried, never-merged structure.
3. Missing sentiment: `block`, `degrade`, and `substitute` each have an independent
   test and each is visibly the applied policy in the response.
4. Stale sentiment: the same three actions have independent stale-path tests; a stale
   value is never reported as current.
5. Result provenance: the multi-window usage-manifest test and the provenance-checklist
   test together prove that a sentiment-dependent result records window identity and
   the exact contributing model versions.
6. Technical-only isolation: a spy/failing-fake resolver test proves zero News calls
   for a descriptor without `sentiment-series`.

**Deliberately deferred, not a gap**

- `ExperimentSentimentContextAssembler` and `BacktestRunnerOutcome.sentimentUsage` are
  fully tested seams but are not yet wired into `backtest-computation.ts` or any
  NestJS module. No strategy today declares `requiredInputs: ["sentiment-series"]` -
  NEWS-06 (sentiment as a strategy) is optional and out of scope for this slice - so
  wiring them into the live composition root now would be unreachable code. The wiring
  becomes live work for whichever slice first adds a sentiment-dependent candidate.

**Validation and process state**

- `pnpm --filter @crypto-strategy-lab/backend run typecheck` passes for the whole
  backend. `pnpm exec eslint` passes for every file touched across the 14 cycles.
  `pnpm exec vitest run` across the six deterministic NEWS-05 test files (sentiment
  feature, its Postgres adapter, the context assembler, the frozen sentiment-input
  configuration, the provenance checklist mapping, and the specification service) ->
  37 tests passed. `git diff --check` shows only pre-existing CRLF warnings. No
  database-backed test, migration, hosted request, collection, analysis, container
  lifecycle operation, full suite, commit, or push ran this session.
- The owner explicitly deferred the usual `implement`-skill code-review, full-suite,
  and commit steps for NEWS-05 in this session. At this point the complete NEWS-05
  diff remained uncommitted working-tree state.

**Commit**

- The owner then explicitly asked for the slice to be committed as-is, without the
  deferred code-review or full-suite run. Committed as `9a44b10` on
  `v5-news-and-sentiment`: `feat(news): add sentiment feature query and degradation
  policy (NEWS-05)`, 18 files (9 new, 9 modified), matching exactly the file set
  described above. A follow-up edit to this file and `TRACKING.md` then replaced the
  "uncommitted" language with the real commit hash.

### 2026-08-31 - NEWS-07 implementation complete (uncommitted)

**What was built**

- Three new News-owned read ports in `news/application/`: `NewsItemQuery` (paginated
  item list), `SentimentDistributionQuery` (windowed positive/neutral/negative
  proportions, asset-agnostic - the whole feed, unlike NEWS-05's per-asset
  `SentimentFeature`), and `NewsHealthQuery` (collection health plus analysis health).
  Collection health reads the existing `news.source_health` table, one entry per
  configured provider, shaped as an array so a second source needs no response-shape
  change later. Analysis has no equivalent table, so `deriveAnalysisHealth` is a pure
  function computed from `news.items` state counts plus the latest completed attempt
  in `news.sentiment_analysis_attempts`: `unavailable` when no attempt has ever
  completed, `degraded` with a count-bearing reason when any item exhausted its
  retries, otherwise `healthy`.
- `news/infrastructure/postgres-news-query-repository.ts`: one adapter implementing
  all three read ports against the existing schema (no new migration - `NEWS-01`'s
  `news.items`/`news.source_health` and `NEWS-03`'s `0017` lease/result/attempt
  tables already carry everything these reads need), mirroring how
  `PostgresCandleRepository` backs three Market query ports from one class.
- `news.module.ts` (previously the empty composition-boundary stub from `SETUP-03`)
  now wires a database pool and the three query tokens, following `MarketModule`'s
  exact DI pattern (`useFactory` pool, `useExisting` port bindings, an
  `OnApplicationShutdown` pool-close lifecycle). `ApiModule` imports `NewsModule` and
  a new `NewsController` (`GET /news/items`, `GET /news/sentiment`, `GET
  /news/health`), each backed by a `class-validator` DTO at the transport edge
  (`news.dto.ts`), matching `CandleHistoryController`'s pattern.
- `packages/api-contracts`: `NewsItemListResponse`, `NewsSentimentDistributionResponse`,
  `NewsHealthResponse` and their runtime type guards, next to
  `BacktestAnnotationsResponse`. `apps/web/src/api/client.ts` gained `getNewsItems`,
  `getNewsSentimentDistribution`, and `getNewsHealth`, following the existing
  `getJson`/guard pattern used by every other read endpoint; per the established
  convention in this file, they were not given their own dedicated tests (the generic
  `getJson` wrapper they call is already covered by `getHealth`'s tests, the same way
  `getProviderHealth`/`getCandleHistory`/`getLeaderboard` are not separately tested).

**Design decisions surfaced during implementation, not obvious from the acceptance
criteria alone**

- The sample News-page mockup (via a research pass over the official source and
  `docs/requirements/sample-ui`) shows a single stacked sentiment bar for one chosen
  window (24h in the mockup), an analyzed-item count, and a "source coverage" ratio
  (healthy/total sources). The 24h window is the page's choice, not a backend
  default - `GET /news/sentiment` takes explicit `startAt`/`endAt`, like
  `CandleHistoryController`. The analyzed count needs no separate endpoint: it is the
  distribution response's `itemCount`. "Source coverage" is why collection health is
  an array rather than one aggregate value - the ratio is a `UI-07` computation over
  that array, not something this slice computes for it.
- AC1 lists five item fields (title, source, publishedAt, relatedCoins,
  analysisState); the response adds `id` on top of that literal list because a
  paginated list has no stable per-row key without one. No other field (url,
  content/summary) was added - `UI-07` can extend the port later if the page needs
  them.
- AC4 ("degrade gracefully... rather than an error") is proven as: none of the three
  reads throw against an empty `news` schema (equivalent to a news worker that has
  never run), and each returns a well-formed zero/`unavailable` payload instead - not
  that every field always literally reads `"degraded"`. This is a judgment call, not
  a certainty; it is recorded here so it can be revisited if `UI-07` disagrees with
  what "graceful" should look like on screen.

**NEWS-07 acceptance-criteria mapping**

1. Paginated item list with the five required fields: `PostgresNewsQueryRepository
   .list()` + `NewsController.listItems()`, `count(*) OVER ()` windowed pagination
   mirroring `PostgresBacktestResultQuery.getTrades()`.
2. Windowed distribution with proportions, item count, and window bounds:
   `computeSentimentProportions` (pure, unit-tested for the zero-item case
   separately from the SQL) plus the adapter's `getDistribution()`.
3. Collection and analysis health with degraded states and reasons:
   `deriveAnalysisHealth` (pure, three states unit-tested independently of SQL) plus
   the adapter's `getHealth()`.
4. Graceful degradation with no worker running: two of the six
   `postgres-news-query-repository.test.ts` cases and one of the three
   `news-health-query.test.ts` cases exercise the empty-schema path directly.
5. No model/provider internal detail: the three response shapes carry only
   transport-safe fields (item summary fields, proportions, provider name and health
   status/reason strings) - no model id, artifact id, or analyzer identity anywhere,
   matching NEWS-05's precedent.
6. Isolation: `news-endpoint-isolation.test.ts` composes `NewsController` and
   `CandleHistoryController` into one real NestJS module instance (as `ApiModule`
   does), makes every News port reject, and proves the Market controller still
   resolves normally in the same instance.

**Validation and process state**

- Targeted only, per this session's owner instruction (no repository-wide Vitest
  run): `pnpm run typecheck` passes for all three workspace packages (`api-contracts`,
  `backend`, `web`). Scoped ESLint over every file touched this slice passes clean.
  `pnpm exec vitest run` across the News module, the API module (all controllers,
  not just News, to catch cross-controller regressions), the architecture boundary
  test, `api-contracts`, and the web API client -> 40 test files, 234 tests, all
  passing. `git diff --check` shows only pre-existing CRLF warnings. The
  architecture boundary test (`apps/backend/src/architecture/boundary.test.ts`)
  passing confirms the new `NewsModule`/`ApiModule` wiring introduces no forbidden
  edge. Per the 2026-08-30 "V5 validation cadence" decision above, the
  repository-wide suite is the News backend integration gate that runs once now that
  every required backend News slice through `NEWS-07` is done - that full run has
  not happened yet and is deliberately left for a session the owner directs to it.
- `.scratch/checkpoints/NEWS-07.md` was written and kept current through the session
  as the owner-requested continuous checkpoint, then deleted once this entry and the
  `TRACKING.md` update landed, per the normal end-of-slice checkpoint rule.

**State**

- `NEWS-07` is `DONE` but deliberately uncommitted - no commit request was made this
  session. `UI-07` is now `READY` (`SETUP-06` and `NEWS-07` are both `DONE` in code).
  `NEWS-06` (optional) remains `TODO` and out of V5's exit criteria.

**Commit**

- The owner then explicitly asked for the slice to be committed as-is, without the
  deferred code-review or full-suite run - the same pattern as `NEWS-05`. Committed
  as `b5e5f12` on `v5-news-and-sentiment`: `feat(news): add news list, health, and
  sentiment query surface (NEWS-07)`, 20 files (12 new, 8 modified), matching exactly
  the file set described above. Correction to the line above this one: the checkpoint
  was kept, not deleted, while the diff was still uncommitted (see its own "kept only
  because commit and code-review are still owner-gated" note); it is deleted now that
  the commit has landed, per the normal end-of-slice checkpoint rule.

### 2026-08-31 - UI-07 browser validation blocked by News worker liveness

**What is implemented and validated**

- UI-07 replaces the News placeholder with independently loaded item, sentiment, and
  health panels. It uses only the existing NEWS-07 web client calls, displays a fixed
  explicit 24-hour sentiment window, pages only the item list, and never exposes a
  health provider identifier, health reason, model, artifact, or analyzer detail.
- Component coverage passes for healthy, collection-degraded, analysis-degraded, and
  page-two item states. The route test passes with the News client isolated from the
  application shell. Web typecheck and scoped lint pass.
- A real Vite browser run against the rebuilt Compose API showed the healthy state:
  collected items, 24-hour distribution, analyzed count, and healthy collection and
  analysis statuses all rendered without page errors.
- With the real `news-worker` stopped, a browser Realtime run still showed `Backend:
  ok`, `Market data: live`, and four live chart subscriptions. This is the required
  failure-domain behavior outside News.

**Blocking evidence**

- Immediately after stopping the real `news-worker`, `GET /news/health` still
  returned `collection[0].status = "healthy"`, and the browser News page displayed
  `Collection: healthy`. The endpoint records source collection health, not worker
  liveness or expiry of the last healthy report.
- UI-07 cannot turn that stale response into `degraded` itself: deciding a maximum
  report age or inferring a stopped worker would be a News health aggregation and a
  new frontend business rule, directly conflicting with UI-07's endpoint-only,
  no-aggregation constraint and ADR-007's isolation ownership.
- The real model-unavailable browser state is also not provable from the current
  healthy data without first choosing how News reports liveness/degradation. The
  component test proves the page renders an API-provided analysis-degraded response;
  it is not substituted for the required real browser proof.

**Required owner decision**

- Decide whether to extend NEWS-07 with a News-owned worker heartbeat/freshness policy
  and a transport-safe expired/degraded collection status, then add the corresponding
  contract, migration if needed, tests, and browser proof; or revise UI-07's AC4/AC5
  evidence expectation to the existing source/model health semantics. No frontend
  workaround was added.

**Local environment repair during proof setup**

- The existing local database had `strategy.composites` matching migration 0009 but
  its `public._migrations` ledger stopped at 0008, so Compose could not start its
  migration gate. After a read-only schema comparison, only the matching 0009 ledger
  ID was recorded. The standard migration runner then applied 0010 through 0017
  successfully. No schema reset or data deletion occurred.

### 2026-08-31 - UI-07 complete: endpoint-only page and News worker liveness

**Resolution of the liveness block**

- The owner selected the News-owned heartbeat direction rather than weakening the
  UI acceptance criteria or placing a liveness rule in the frontend. The previously
  considered `news.source_health.checked_at` is written only after an RSS request,
  retry, parsing, and persistence complete. It therefore cannot distinguish a
  stopped worker from a live worker with its next collection request in flight.
- Migration `0018_create_news_collection_worker_heartbeat.sql` adds one
  News-owned, single-row `news.collection_worker_heartbeat` record. The normal
  News worker writes it once at start and every half of the existing configured
  collection interval. The health query keeps provider source state intact, but
  changes a healthy collection entry to generic `degraded` once no heartbeat has
  arrived for one full configured collection interval. This leaves enough time for
  an in-flight provider request without inventing an arbitrary threshold or adding
  a general observability system.
- Analysis health also now notices the existing durable retryable state: a `pending`
  item with `analysis_failure_reason` makes it generic `degraded`; a successful retry
  clears that state and returns health to `healthy`. Neither the API presentation nor
  the page exposes the stored failure reason, model identity, artefact, analyzer, or
  provider-health detail.

**UI and tests**

- `NewsPage` replaces the placeholder with three route-local, independently fetched
  NEWS-07 client reads: paginated collected items, an explicit 24-hour sentiment
  distribution and item count, and collection/analysis health. It does no data
  aggregation and no liveness inference. A failure in any News read stays local to
  this route; paging refetches only the item list.
- TDD covered each seam red then green: page rendering and paging, heartbeat expiry
  versus an in-flight heartbeat, heartbeat persistence/runtime lifecycle, and
  retryable-analysis degradation/recovery. The final targeted runs passed 21 backend
  tests and 7 web tests; backend and web typechecks, scoped ESLint, and `git diff
  --check` pass. No repository-wide Vitest run was started, per the owner-deferred
  News backend integration gate.
- Final two-axis review of the uncommitted diff against `3e04567` found no spec
  issue. Standards review requested only moving the page purpose comment to the
  top of the file and making two new PostgreSQL row fields `readonly`; both fixes
  were rechecked with focused tests and ESLint, and the reviewer found no remaining
  standards issue.

**Browser proof**

- With the normal worker running at the existing 60-second collection interval, the
  real News page showed `Collection: healthy`, `Analysis: healthy`, and ten collected
  rows. After the worker stopped, the page was still healthy before the full interval
  elapsed, then the API and page correctly became `Collection: degraded` after the
  heartbeat expired while the same ten rows remained visible. Restarting the normal
  worker restored `Collection: healthy` in both API and browser.
- During the collection-degraded state, Realtime still showed `Backend: ok`, `Market
  data: live`, and four live chart subscriptions. This is the UI-visible News failure
  isolation required by AC4.
- In isolated temporary database `ui07_news_proof`, genuine collected RSS items were
  retained while the normal worker ran with an explicit whitespace OpenAI credential.
  The real adapter treated it as missing, recorded a retryable unavailable failure,
  and the browser showed `Collection: healthy`, `Analysis: degraded`, and ten item
  rows without a reason. Restarting the worker with the normal credential retried
  successfully, cleared the retryable state, and returned both API and browser health
  to healthy. This did not reset the main database; the temporary database is removed
  during the completion cleanup.

**State**

- `UI-07` is `DONE` and committed as `65110ec` (`feat(ui): add News page and worker
  liveness (UI-07)`) after the owner explicitly requested a commit. `NEWS-06` remains
  optional and out of V5 exit criteria. V5 is not declared demoable: its separate
  owner-deferred News backend integration/full-suite, final Compose, and proof gates
  remain unchanged.

### 2026-08-31 - V5 certification pre-proof review reconciliation

**Git and document truth**

- `65110ec` is the committed UI-07 implementation. `d02318b` is its later
  documentation record, so earlier V5 Journal statements that described UI-07 as
  uncommitted are historical states, not the current status. No earlier Journal entry
  was rewritten.
- The V5 roadmap counted its slices incorrectly. It contains six required News slices
  plus required UI-07, so its summary now says "7 required slices, plus 1 optional".

**Deferred two-axis reviews**

- NEWS-01 through NEWS-03 were reviewed as `c20d7f9...c46c2e1`; NEWS-05 as
  `e777b1c...9a44b10`; and NEWS-07 as `956afb7...b5e5f12`. Each review inspected
  current HEAD `d02318b` before classifying a finding.
- The reviews found persistent V5 repair candidates: expired sentiment leases can
  permit duplicate external inference; scheduled collection and analysis omit an
  in-flight guard and an explicit rejected-promise path; the historical migration test
  bypasses the shared test-database helper; the News health API exposes provider IDs
  and raw stored reasons; and NEWS-07 isolation coverage does not exercise all News
  reads against chart, backtest, and discovery consumers. Smaller NEWS-07 test-name
  and assertion gaps were also recorded.
- The NEWS-05 reviewers also flagged the public sentiment snapshot/provenance surface
  for conformance review. Its response object excludes model data, while the separate
  Experiment provenance carrier contains result references and model versions. This
  must be resolved together with the proof-scope decision below, not silently changed.

**Certification blocker**

- V5 demo step 8 and `PROOF-ISO-002` require a sentiment-dependent candidate that
  applies the missing/stale policy. However no required V5 strategy declares
  `sentiment-series`; the Journal records the runner wiring as intentionally
  unreachable; and `NEWS-06`, the only planned sentiment strategy, is explicitly
  optional and outside V5 exit criteria. The owner prohibited implementing NEWS-06
  merely to create proof evidence. This is a scope conflict, not a documentation gap.
- No proof, full-suite certification, final Compose gate, migration, reset, seed,
  commit, or tag was run after this blocker was identified. The main Compose database
  remained intact after read-only preflight inspection.

**Next action**

- Obtain an owner decision that either authorizes a minimal required V5 consumer path,
  removes the candidate demonstration from V5 proof/demo obligations, or changes V5
  scope through the architecture review procedure. Then repair the review findings
  with targeted red-green tests before resuming `PROOF-ISO-001` and `PROOF-ISO-002`.

### 2026-09-01 - V5 scope correction: NEWS-06 is required

**Owner decision and scope rationale**

- The owner selected the first resolution: retain the existing V5 demo and proof
  obligation, and make `NEWS-06` a required V5 slice. `VERSIONS.md` demo step 8 and
  `PROOF-ISO-002` already require a real sentiment-dependent candidate that applies a
  missing-or-stale policy. `NEWS-06` is the sole planned slice that owns that consumer.
  This corrects an inconsistent plan boundary; it does not add a new strategy system,
  model, source, UI feature, or V6 mechanism.
- The V5 count is consequently eight required slices: seven News slices and `UI-07`.
  The former optional wording and the claim that V5 was demoable without `NEWS-06`
  were corrected in the live plan and tracker. Earlier Journal entries remain a record
  of their then-current state and are not rewritten.

**Execution seam and preserved architecture**

- `NEWS-05` already provides the public `SentimentFeature` port, explicit policy,
  `ExperimentSentimentContextAssembler`, and a durable result-provenance field. The
  minimal V5 completion is a registered `NewsSentimentStrategy`, public News feature
  binding, and runner-side context assembly before worker-thread computation. A
  technical-only descriptor continues to resolve no News port.
- No frozen Strategy, Backtester, Evaluator, RankingPolicy, BacktestExecutor,
  SentimentAnalyzer, or SentimentFeature contract changes. Strategy remains isolated
  from concrete News infrastructure; the runner consumes only the public News port.
  The worker thread receives assembled immutable inputs and does not call News.

**Next action**

- Implement `NEWS-06` and the persistent Phase A review repairs using focused
  red-green tests. Proofs, the final repository-wide gate, and Compose certification
  remain deferred until a fixed-point two-axis review is clean.

### 2026-09-01 - Owner clarification: NEWS-06 remains optional

**Decision**

- This entry supersedes the current exit-scope effect of the preceding scope-correction
  entry; it does not rewrite the historical record of that decision. `NEWS-06` remains
  an optional V5 bonus slice and is not a V5 certification, Definition of Demoable, or
  `PROOF-ISO-002` prerequisite.
- The normative V5 plan explicitly states that `NEWS-05` directly supports
  `PROOF-ISO-002`, and the proof plan permits direct use of the existing NEWS-05
  sentiment feature/context assembly when the optional strategy slice is skipped.
  `PROOF-ISO-002` will therefore be demonstrated through that existing consumer seam,
  not through the optional registered strategy.
- The in-progress `NEWS-06` implementation may continue only as an optional bonus
  against its original acceptance criteria. It must not change existing strategies,
  `CompositeStrategy`, Backtester, Evaluator, ranking, or combination policy.

**Consequences**

- The live V5 count is restored to seven required slices plus one optional slice.
  `VERSIONS.md` and `TRACKING.md` again identify `NEWS-06` as optional and remove it
  from all exit criteria.
- The registered sentiment strategy and runner-side declared-input assembly remain an
  allowed optional implementation surface. Any composite input declaration needed for
  its execution must be assembled outside `CompositeStrategy` from existing component
  descriptors.
- The required V5 proof and final certification remain blocked only by their actual
  repairs, runtime evidence, and integration gates; they do not depend on completion
  of the optional bonus.

### 2026-09-01 - V5 Phase A repairs and checkpoint

**Scope truth**

- The V5 demo scenario now names the required NEWS-05 direct context consumer for the
  missing-or-stale policy demonstration. `NEWS-06` may demonstrate it as an optional
  bonus only. This removes the remaining implication that an optional strategy is an
  exit requirement; `PROOF-ISO-002` remains independent of it.

**Repairs and validation**

- The deferred NEWS-01..03, NEWS-05, and NEWS-07 reviews were closed with focused
  repairs: a session advisory lock fences normal live inference across nominal lease
  expiry without holding a transaction during model I/O; schedulers contain rejection,
  serialize ticks, and stop new work on shutdown; destructive tests fail closed unless
  their connected database is a marker-verified `csl_test_*` database; public News
  health is generic; and all News reads have independent failure coverage while Market,
  backtest, and discovery remain usable.
- The optional `NEWS-06` implementation is present with a registered descriptor,
  configured thresholds/window, NEWS-05 policy and provenance wiring, composite
  required-input assembly outside `CompositeStrategy`, and a zero-call technical path.
  It did not change an existing strategy, `CompositeStrategy`, Backtester, Evaluator,
  ranking, or combination policy.
- Provenance now retains frozen feature freshness, window, and applied policy. The
  result acceptor rejects both missing sentiment usage for a sentiment-dependent
  frozen specification and false sentiment usage for a technical-only specification.
- On the isolated `csl_test_v5_certification` database, the lifecycle suite passed
  8 tests, the repository suite passed 8 tests, the migration suite passed 4 tests,
  and the database guard suite passed 4 tests. A read-only post-test query found no
  remaining client sessions or advisory locks. The protected demo database was never
  reset, reseeded, or modified.
- The final shutdown repair stops collection, analysis, and heartbeat timers before
  it releases News-owned inference sessions and before Nest closes the shared pool.
  The runtime ordering and active-claim pool-close regressions, backend typecheck,
  scoped lint, and `git diff --check` pass.

**Residual boundary and next action**

- Durable result/attempt completion is exactly-once for a live claim. External model
  invocation is deliberately not claimed as exactly-once: process/session loss,
  graceful shutdown after request dispatch, or an uncertain network response can leave
  an external request in flight while a later recovery retries. The session lock removes
  the normal lease-expiry concurrent-call race only.
- The two independent fixed-point reviews found and drove the repairs above. The
  final narrow re-review request of the heartbeat-ordering delta could not run because
  the review agents exhausted their usage limit. Repeat that narrow two-axis review
  first on resume, then start `PROOF-ISO-001`. No proof, repository-wide V5 gate,
  final Compose gate, commit, or tag has run in this session.

### 2026-09-01 - V5 Phase A fixed point and optional NEWS-06 completion

**Result**

- The narrow two-axis re-review of the final shutdown delta is clean. Standards found no
  documented-rule or baseline-smell finding. Spec/architecture found that collection, analysis,
  and heartbeat timers stop before `NewsWorkerAnalysisLifecycle.close()` is awaited; the local
  `PostgresSentimentAnalysisRepository` seam releases held advisory-lock clients before
  `main.news-worker.ts` closes Nest's shared pool.
- Optional `NEWS-06` is complete in the certification working tree. Its registered
  `news-sentiment` descriptor declares `sentiment-series`; thresholds and window are descriptor
  parameters; the existing composite/policy types remain unchanged; NEWS-05 supplies missing and
  stale policy plus durable provenance; and technical-only execution makes no News feature call.
  No existing strategy, `CompositeStrategy`, Backtester, Evaluator, ranking, or combination
  policy changed.

**Validation**

- The refreshed NEWS-06/fixed-point batch passed 10 files / 58 tests, including signal cases,
  strategy catalog, technical composite, missing-policy provenance, runner input transport and
  technical-only zero-call behavior, API DTO/controller mapping, runner composition, contracts,
  and shutdown order. Backend and API-contract typechecks, scoped ESLint, and `git diff --check`
  pass.

**Next action**

- Phase A is closed. Phase B remains unstarted: first verify Docker Desktop read-only, then run
  `PROOF-ISO-001`. `NEWS-06` remains an optional bonus and never gates V5, its Definition of
  Demoable, or `PROOF-ISO-002`; that proof uses the NEWS-05 direct context-assembly seam. No
  proof, repository-wide gate, Compose/demo gate, commit, push, or tag has run.

### 2026-09-01 - V5 PROOF-ISO-001 passes on Compose

**Result**

- `PROOF-ISO-001` passes on the source-built V5 Compose topology. The separate News worker was
  stopped gracefully, its health changed to the public `worker-stale` degraded state after the
  configured heartbeat interval, and restarting only that worker returned collection health to
  healthy. The real source recovered through normal deduplication.
- A Socket.IO monitor held four `BTCUSDT` chart subscriptions (`5m`, `15m`, `1h`, `4h`) for
  seventeen minutes across the failure and recovery. It received every snapshot, stayed connected,
  and recorded no errors. API, runner, market ingest, Redis, and web remained available.
- During the outage, a technical-only backtest completed with `newsInput` marked not applicable.
  A discovery run on existing durable one-minute data stopped by its valid `exhausted` condition
  with four completed candidates and four leaderboard entries. No reset, seed, migration-ledger
  change, or temporary test-database use occurred.

**Investigation note**

- An initial short discovery fixture produced no leaderboard row. This was not a projection defect:
  the applied-version ledger proved projection ran, and the result had one closed trade while the
  frozen ranking policy requires five. The final longer fixture was eligible and ranked.

**Evidence and next action**

- Complete commands, runtime identities, dataset windows, result IDs, timestamps, and recovery
  logs are recorded in [`PROOF-ISO-001.md`](../docs/validation/evidence/PROOF-ISO-001.md).
- The temporary `csl_test_v5_certification` database still has no active sessions or advisory
  locks, but its expected guard-marker schema was missing at this preflight. Do not use or alter it
  without a separate marker-safe decision. The protected Compose database remains untouched except
  for normal proof application operations.
- Next: run `PROOF-ISO-002` through the required NEWS-05 direct context-assembly seam. `NEWS-06`
  remains optional and is not part of that proof. The repository-wide V5 gate still waits for both
  ISO proofs.

### 2026-09-01 - V5 PROOF-ISO-002 passes through NEWS-05

**Result**

- `PROOF-ISO-002` passes through the required direct NEWS-05
  `ExperimentSentimentContextAssembler` seam, not through optional NEWS-06. A temporary
  source-built News worker with an empty model credential recorded an
  `ANALYZER_UNAVAILABLE` attempt and returned its item to `pending`; a later normal worker
  recorded the successful retry and exact hosted-model provenance.
- The guarded `csl_test_v5_certification` database was rechecked immediately before use. Its
  exact durable marker and token were present, all 18 migrations matched source, and it had zero
  other sessions and zero advisory locks. A deterministic BTC fixture was persisted only through
  the real News collection service/repository, never by direct SQL. The protected Compose
  database and migration ledger were not reset, reseeded, dropped, or changed outside normal
  proof operations.
- Direct context assembly produced a current BTC usage manifest with durable result/model
  provenance, stale observed sentiment with explicit `degrade` policy, and missing ETH sentiment
  with explicit `block` policy. A technical-only descriptor made zero News feature calls.

**Evidence and next action**

- Commands, timestamps, attempt outcomes, provenance, policy results, and cleanup state are in
  [`PROOF-ISO-002.md`](../docs/validation/evidence/PROOF-ISO-002.md). The source Compose
  topology stayed running; the temporary worker containers exited cleanly with no held client or
  advisory-lock session.
- Both required V5 isolation proofs now pass. Next: run the repository-wide V5 gate exactly once,
  then run the final Compose Definition of Demoable/cleanup gate. `NEWS-06` remains optional and
  never becomes an exit condition.

### 2026-09-01 - V5 repository gate hand-off is not certifiable

- Repository typecheck passed. The first lint run found only two unused callback parameters in an
  untracked V5 lease-renewal regression test; the test-only parameters/import were removed and a
  second lint run passed. `git diff --check` passed without whitespace errors.
- Before the suite, the guarded test database marker/token, zero other sessions, and zero advisory
  locks were verified. The one authorized `pnpm test` process inherited the explicit test database
  name and guard token, ran database resets only there, and later exited with zero remaining test
  sessions or advisory locks.
- The terminal tool yielded part-way through that long-running process and did not retain the
  process session identifier or final exit code/summary. The process subsequently exited, but its
  pass/fail result cannot be recovered from the available evidence. Do not claim a repository-wide
  V5 gate pass or begin final Compose/demo cleanup. A replacement full-suite run requires an owner
  decision because the certification instruction limited it to one run.

### 2026-09-01 - Unguarded manual `pnpm test` is an invalid gate attempt, not 26 regressions

- A manually run `pnpm test` (Git Bash, no injected `POSTGRES_DB`/`TEST_DATABASE_GUARD_TOKEN`)
  reported 26 failed / 108 passed test files and 643 passed / 129 skipped tests, with nearly
  every failed suite's `beforeAll` throwing `TEST_DATABASE_GUARD_DATABASE: configured database is
  not a dedicated test database`, plus one secondary `TypeError: Cannot read properties of
  undefined (reading 'end')` in `integration/market-live-ingest.e2e.test.ts`'s `afterAll`.
- Root cause confirmed by reading `.env` (`POSTGRES_DB=crypto_strategy_lab`, the protected main
  database, no `TEST_DATABASE_GUARD_TOKEN`) and `vitest.setup.ts` (loads root `.env` only for
  variables not already in the process environment). The plain invocation therefore resolved
  `loadConfig()` to the protected main database name, which fails
  `TEST_DATABASE_NAME.test(database)` in `assertTestDatabaseGuard`
  (`apps/backend/src/platform/test-database.ts`) before any reset is attempted — exactly
  reproduced in isolation on `apps/backend/src/modules/news/infrastructure/news-sentiment-migration.test.ts`.
  The `market-live-ingest.e2e.test.ts` `TypeError` is a direct downstream symptom: its
  module-level `pool` stays `undefined` when `beforeAll` throws first, so `afterAll`'s
  `pool.end()` fails on `undefined` — not an independent product bug.
- This was an invalidly configured gate attempt, not 26 application regressions. No product or
  test code was faulted for it and none was changed for it.
- The guarded temporary database `csl_test_v5_certification` was reverified read-only before any
  further action: exact durable marker/token present, zero other sessions, zero advisory locks,
  distinct from and never confused with the protected `crypto_strategy_lab` database.
- The same file passed cleanly (4/4) once run with the correct guarded configuration
  (`POSTGRES_DB=csl_test_v5_certification TEST_DATABASE_GUARD_TOKEN=v5-certification-test-guard-token`),
  confirming the diagnosis before spending the one authorized full-suite run.

### 2026-09-01 - Correctly guarded full-suite run finds and fixes one pre-existing defect

- The one authorized full `pnpm test` run under the correct guarded configuration completed with
  exit code 1: **1 failed / 133 passed test files, 1 failed / 771 passed tests, 250.51s**
  (`Start at 19:18:03`). The guard/session/lock state was reverified clean before and after.
- The single failure, `apps/backend/src/platform/database.test.ts > database schemas > creates
  only the tables currently owned by each module`, expected the `news` schema to own zero tables
  and received the 5 real tables (`collection_worker_heartbeat`, `items`,
  `sentiment_analysis_attempts`, `sentiment_results`, `source_health`).
- This is a genuine, pre-existing defect unrelated to the V5 certification diff: `database.test.ts`
  was last committed at the V4 freeze (`5f2f7af`), before migrations `0016`-`0018` created any News
  table. Its hardcoded `news: []` expectation was simply never updated across NEWS-01 through
  NEWS-07/UI-07; the actual schema is correct per the frozen architecture's News module boundary.
- Fix: updated only the stale `expectedTables.news` array in `database.test.ts` to the five real,
  intentional News-owned table names (alphabetical, matching the query's `ORDER BY table_name`).
  No product code changed. Targeted re-run of the corrected file passes (2/2). Guard/session/lock
  state on `csl_test_v5_certification` remained clean after.
- The one full-suite run authorized for that session is spent. A second full run to obtain a
  clean, complete repository-wide gate result is recommended but requires explicit owner
  authorization before it is run. Final Compose/demo cleanup, commit, push, and tag remain
  pending regardless.

### 2026-09-01 - V5 repository gate is green

- The owner authorized a second guarded full-suite run plus iterate-until-clean repair authority.
  Preflight reconfirmed `csl_test_v5_certification`'s guard marker/token, zero sessions, and zero
  advisory locks. The correctly guarded `pnpm test` run is fully clean: **exit code 0, 134/134
  test files, 772/772 tests, 178.06s** (`Start at 19:39:59`). No further defects were found; the
  database guard/session/lock state remained clean after.
- Independently cross-checked the official assignment spec (`docs/requirements/Crypto Strategy
  Lab – Đồ án cuối kỳ.pdf`, previously rendered pages 27-29 and the MVP minimum section 37/38) against
  the implemented code. News module fields (`news.items`: id, title, content, source,
  published_at, collected_at, related_coins, url) match section 27's required `News` shape
  exactly. The News Provider port (`news-provider.ts`) with a swappable `coindesk-rss-news-provider.ts`,
  a fake, and a shared reusable contract test satisfies section 28's "must not be hard-coded to
  one crawler" requirement. Sentiment analysis (analyzer port + OpenAI-based analyzer,
  POSITIVE/NEGATIVE-shaped classification) satisfies section 29 (Module 11). The MVP minimum
  checklist in section 37 (Market: Binance data/candlestick/realtime/4 timeframes; Strategy: at
  least MA, RSI, Bollinger, Support/Resistance; Combination: composite strategy; Backtest;
  Evaluation: totalReturn/winRate/maximumDrawdown/numberOfTrades; Search: random search;
  Leaderboard: Top-K; Visualization: buy/sell/entry/exit; News: collect -> store -> analyze
  sentiment pipeline) is present in code with matching field/module names. V1-V4 items were spot-
  checked, not re-audited from scratch, since that scope carries its own prior `v4.0-demo`
  certification.
- The repository-wide V5 gate is now genuinely green. Next: the Compose/demo integration cleanup
  gate (`DEMO-01`), then commit and push (owner pre-authorized the push).

### 2026-09-01 - DEMO-01 recertified for V5

- `docker compose up --build -d` rebuilt every backend image from the current source (including
  the uncommitted V5 certification diff) and brought up the topology in dependency order:
  `postgres` healthy -> `migrate` exit 0 -> `api` healthy, `market-ingest`, `news-worker`,
  `runner` started -> `web` up. `docker compose config --services` lists exactly `api
  market-ingest migrate news-worker postgres redis runner web`, matching `VERSIONS.md`'s V5 role
  table (V4's roles plus the news worker) with no later-version role (no BullMQ, outbox, or
  worker-pool scaling).
- Live smoke against the rebuilt stack (not a full browser walkthrough, since the two isolation
  proofs already drove that scenario in depth): `GET /health` -> `{"status":"ok"}`; `GET
  /news/health` -> collection `healthy`, analysis `healthy` with zero pending/degraded; `GET
  /news/items` -> real analyzed CoinDesk RSS items with title/source/publishedAt/relatedCoins;
  `GET /strategies` -> the descriptor catalog including `moving-average` with its parameter
  schema; the web SPA responded `200` at `:8080`.
- `docs/demo-script.md` gained a "V5 News and Sentiment walkthrough" section (collect/store/
  analyze, stop/restart the news worker, unreachable-model degradation, technical-only zero
  sentiment call, the architecture isolation point), referencing `PROOF-ISO-001.md` and
  `PROOF-ISO-002.md` for full command-level evidence rather than duplicating it. The "Before you
  start" expected-service list was corrected: it previously said a news service was absent
  (stale, predating NEWS-02); it now lists `news-worker`. `docker-compose.yml`'s header comment
  was corrected from "V4's current MKT-06 state" to V5's state. The document's own certified-
  baseline header is untouched (still V1-V4) since freezing V5 remains an explicit owner decision.
- `DEMO-01`'s V5 Compose integration gate PASS. Combined with the green repository-wide test
  suite, both ISO proofs, and the requirements cross-check, every condition in V5's Definition of
  Demoable (`VERSIONS.md`) now has direct evidence except the owner's own freeze decision.

### 2026-09-01 - V5 frozen at `v5.0-demo`

- The owner explicitly authorized the freeze and the temporary-database cleanup in the same
  instruction. Committed the certification work as three commits on `v5-news-and-sentiment` and
  pushed: `392cbeb` (isolated stale-test fix), `ac7fa9b` (NEWS-06 + Phase A fixed-point repairs,
  53 files), `2b751f0` (certification evidence + DEMO-01 recert docs, 7 files).
- Before dropping the temporary database, its guard marker/token and zero active sessions were
  reverified read-only, and its identity was reconfirmed distinct from the protected
  `crypto_strategy_lab` database. `DROP DATABASE csl_test_v5_certification` ran against the
  `postgres` maintenance database; the protected main database and its migration ledger were not
  touched.
- Created the annotated safety tag `git tag -a v5.0-demo` on `2b751f0` per `VERSIONS.md`'s V5 Git
  checkpoint instruction, and pushed it to origin.
- `TRACKING.md` is updated: implementation status is now `V1-V5 BASELINE CERTIFIED`, the last tag
  is `v5.0-demo`, and `NEWS-06` is recorded as committed rather than uncommitted. The current
  target version remains V5 — moving the target to V6 is a separate owner decision, not made here,
  and no coding agent advances it.
- V5 is frozen. Everything after `v5.0-demo` is V6 architecture evolution (BullMQ, transactional
  outbox, idempotent consumers, operational telemetry); this tag must remain demoable no matter
  how V6 goes.

### 2026-09-03 - Final pre-defense release: composite discovery closure and truthfulness sync

**Decisions**
- Owner closed the automated-discovery ambiguity: single-strategy search plus a separately saved
  manual composite is not the accepted reading. Automated discovery must itself generate composite
  candidates and carry them through execution, evaluation, ranking, and leaderboard projection.
  Tracked as `frozen_implementation_plan/` (`FIN-01` through `FIN-06`), separate from this V1-V6
  roadmap and not a new product version.
- `FIN-01` rejected persisting every generated composite through `CompositeStrategyService`: a
  generated candidate is an immutable, experiment-scoped proposal, not a durable object a person
  owns, and collapsing the two would create ownerless data once accounts exist.

**Deviations / debt**
- Deferred account/login requirement and the frontend combination-policy catalog gap are recorded
  as known limitations in `docs/final-defense-notes.md`, not fixed this release.

**Validation**
- `FIN-01` through `FIN-04` done: composite candidate execution, minimal Discovery UI exposure,
  demo-surface presentation hardening, and the canonical demo script. Each used its own targeted
  validation; the repository-wide gate has not re-run since `v5.0-demo` and is `FIN-06` work.

**Problems worth remembering**
- `VERSIONS.md`'s V5 "MVP list is fully satisfied" line was true only under the single-strategy
  reading at the `v5.0-demo` commit; a stated Definition-of-Demoable condition can silently depend
  on which reading of a requirement is accepted. Made explicit in `VERSIONS.md` and `TRACKING.md`.

**Ending state**
- Working tree carries `FIN-01` through `FIN-04` uncommitted on top of `2b751f0` (`v5.0-demo`).
  `FIN-05` (this entry) is in progress. `FIN-06` (repository-wide gate, Compose rehearsal, freeze)
  has not run. No tag moved; the target version remains V5.

### 2026-09-03 - FIN-06 final gate: freeze readiness reached

**Decisions**
- Ran the final pre-defense release gate once, in the order `frozen_implementation_plan/04-final-
  certification-and-freeze.md` defines. Committed `FIN-03` through `FIN-05`'s prior uncommitted work
  first (release-state hygiene) so the gate ran against a real, final tree rather than a mix of
  committed and uncommitted state.

**Validation**
- Governance: 3 known local-only failures from the untracked, git-ignored discarded-material
  directory; no other failure.
- Repository-wide gate, run against a disposable PostgreSQL container isolated from both the live
  Compose stack and the protected main database (`fin06-disposable-postgres`, host port 5544,
  database `csl_test_fin06`, dropped after use): typecheck green, lint clean, `135/135` test files,
  `777/777` tests, exit 0.
- `PROOF-REP-001` re-run against a real generated composite, once (`integration/leaderboard-
  reproducibility-composite.proof.test.ts`, new — it lives outside every module because it wires
  `market`, `strategy`, and `experiment` together directly, same as the existing runner-lifecycle
  e2e test). A real `SearchCoordinator` generated a composite candidate (`rsi` + `moving-average`,
  `majority-vote`), the real `BacktestRunnerService` executed and accepted it, the real
  `LeaderboardProjector` placed it at leaderboard rank 1, and a second, independent worker-thread
  computation reproduced the exact same canonical trade hash from the same frozen specification and
  candles. No `CompositeStrategyService` and no saved-composite row were used anywhere. Evidence
  appended to `docs/validation/evidence/PROOF-REP-001.md` (the original single-strategy PASS record
  is unchanged). One pre-existing, unrelated scope limit was found and recorded, not fixed: the
  reproducibility checklist types `combinationPolicy`/`generatorAndSearch`/`rankingPolicy` as always
  `not-applicable`, for a composite result exactly as for a single-strategy one; the data itself
  (composite definition, generator, ranking policy) is still fully traceable through the frozen
  specification and the parent search specification, just not surfaced as a checklist field. This
  predates `FIN-01` and is out of `FIN-06`'s no-new-features scope.
- Compose: `docker compose up --build -d` from current source brought up the unchanged V5 topology
  (`postgres`, `redis`, one-shot `migrate` exit 0, `api`, `runner`, `market-ingest`, `news-worker`,
  `web`) with no V6-only role. Seeded 30 days of BTCUSDT candles at `5m`/`15m`/`1h`/`4h`, then drove
  the canonical demo flow over HTTP against the live stack: strategy catalog served from the
  registry; a saved manual composite created and backtested to completion; a live automated search
  with `compositeSizes: [2]` generated 30/30 candidates with 0 failures, producing a 10-entry,
  all-composite leaderboard (rank 1: `rsi + moving-average`, 17 trades, positive return) whose
  provenance resolved back to the frozen specification's inline composite definition; news-worker
  stopped and restarted with the API, backtest path, and existing result all unaffected the whole
  time (`PROOF-ISO-001`'s property, observed live, not re-proved as a distinct proof run). No other
  proof was re-run; none of `PROOF-PROVIDER-001`/`PROOF-EXT-001`/`PROOF-REPLACE-001`/
  `PROOF-CONTROL-001`/`PROOF-RT-001`/`PROOF-ISO-001`/`PROOF-ISO-002` had a regression exposed by the
  gate or the Compose run.
- Not independently observed this session: pixel-level visual rendering of the SPA. No browser or
  screenshot tool was available; the SPA's root document was confirmed served (HTTP 200) and every
  canonical-flow screen's underlying data contract was exercised directly against the Compose API
  instead. A brief human visual pass before the live defense is recommended but did not block this
  gate, since no functional or architectural defect was found anywhere else.

**Ending state**
- All FIN-06 changes (the new composite `PROOF-REP-001` evidence and this synchronization) are
  committed together with this entry, on top of the commit that finalized `FIN-03` through `FIN-05`.
  `git log` is authoritative for the exact hash. Working tree clean at that commit. No tag created;
  the target version remains V5. `FREEZE READINESS: READY` — see the freeze-readiness report in this
  session for the full gate-by-gate breakdown. Next: the owner decides whether to freeze and tag, and
  separately whether to authorize `V6`.
