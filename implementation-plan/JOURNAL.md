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
