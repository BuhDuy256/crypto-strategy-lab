# 00 - Setup and Platform Foundations

Environment readiness plus the cross-cutting platform slices, across every version.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

This file is organized by version because its slices are spread across four of
them. The V1 group is a one-time cost that everything else stands on. The V4 and V6
groups arrive only when their architectural drivers appear.

| Version | Slices |
|---|---|
| V1 | `SETUP-01`, `SETUP-02`, `SETUP-03`, `SETUP-04`, `SETUP-05`, `SETUP-06` |
| V4 | `WS-03` |
| V6 | `SETUP-08`, `SETUP-09`, `WS-02`, `MSG-01` |

## Open decisions

Implementation choices the frozen architecture does not make. Each has a
recommended default so nothing is blocked. A coding agent may proceed on the
default and must record the choice; the user may override at any time.

| Decision | Recommended default | Why, and what the trade-off is |
|---|---|---|
| Package manager and workspace | pnpm workspaces | Fast, and strict about undeclared dependencies, which helps hold module boundaries. npm workspaces also work and need no extra install. |
| Test runner | Vitest | Fast, native TypeScript and ESM. Jest is the NestJS default and is also acceptable; choosing Jest costs speed, choosing Vitest costs a little example compatibility with NestJS docs. |
| Database access layer | A SQL-first layer such as Drizzle or Kysely, with plain SQL migrations | The baseline forbids ORM models leaking into domain code and requires module-owned schemas. A SQL-first layer makes both easy to see and easy to test. TypeORM is more NestJS-idiomatic but pulls entity classes toward the domain; Prisma centralizes one schema file, which fights module ownership. |
| Chart library | `lightweight-charts` | Built for candlesticks, and supports the markers, price lines, and overlays the requirements ask for. Any library that renders candles, markers, and horizontal price lines is acceptable. |
| Frontend build | Vite plus React plus TypeScript | Standard and fast. No server-side rendering is needed for a SPA. |

## Decisions that need a human

| Decision | Blocks | Needed by |
|---|---|---|
| Execution model defaults: starting capital, fee, slippage, fill rule, rounding, position sizing, stop rules | `EXP-02` | **V1** - baseline reproducibility rule 5 requires these to be resolvable per result, so they must be specification fields with supplied values, not constants inside the engine |
| Architecture review of the backtest execution transport deviation | `EXP-04` | **V1** - a formal review under the `AGENTS.md` deviation procedure, not an acknowledgement. See [`deviation-proposal-001`](../docs/architecture/deviation-proposal-001-backtest-execution-transport.md) |
| Ranking weights and tie-break rule | `SEARCH-03` | **V3** - resolve during V2 so it does not stall V3 |
| Concrete news sources | `NEWS-02` | **V5** - licensing and rate policy have to be reviewed before collection starts (ADR-007 risk) |
| Concrete sentiment model or service | `NEWS-04` | **V5** - decides whether the optional Python runtime behind `SentimentAnalyzer` is justified |
| Retention for outbox and inbox rows | `SETUP-08` | **V6** - those tables do not exist before V6, so this is not an early blocker |

## Recommended repository layout

A plan assumption, not a frozen decision. What **is** frozen is that each `ARC-*`
module maps to a clear NestJS module boundary with an explicit exported port
surface, and that cross-module access goes only through that surface.

```text
apps/
  backend/
    src/
      main.api.ts                # V1  NestJS HTTP process (WebSocket added in V4)
      main.backtest-runner.ts    # V1  backtest execution role
      main.market-ingest.ts      # V4  market ingest role
      main.news-worker.ts        # V5  news and sentiment role
      main.outbox-dispatcher.ts  # V6  outbox dispatch role
      modules/
        api/                     # ARC-API
        market/                  # ARC-MARKET
        strategy/                # ARC-STRATEGY
        experiment/              # ARC-EXPERIMENT
        news/                    # ARC-NEWS
      platform/                  # technical primitives only
    migrations/
  web/                           # React SPA
packages/
  api-contracts/                 # V1  public transport DTOs, imported by apps/web
  messaging-contracts/           # V6  internal job and event schemas, backend only
```

Inside each `modules/<name>/` directory:

```text
domain/          # framework-free contracts and logic
application/     # use cases and ports
infrastructure/  # adapters implementing this module's own ports
index.ts         # the ONLY file other modules may import from
```

All roles share one build and differ only by entry command, which the baseline
explicitly permits. Roles appear in the version that needs them, not before.

### Why two contract packages

`api-contracts` holds what the browser is allowed to see: request and response
DTOs. `messaging-contracts` holds internal job commands and event envelopes.
Keeping them apart stops the SPA from accidentally depending on an internal
messaging type, which would turn an internal refactor into a frontend break. The
second package does not exist until V6, when internal messaging does.
`SETUP-05` enforces that `apps/web` never imports `messaging-contracts`.

---

# V1 slices

## SETUP-01 - Workspace, TypeScript, and quality commands

**Version:** V1 · **Priority:** CRIT · **Effort:** S

**Outcome**
A fresh clone can install dependencies and run four commands that all succeed on an
otherwise empty project: install, typecheck, lint, and test.

**Why this slice exists**
Every later slice names a validation command. Those commands must exist before any
of them can be run.

**Dependencies**
None. This slice is the root of the graph.

**Authoritative references**
- [Baseline - Technology decisions](../docs/architecture/architecture-baseline.md#technology-decisions): Node.js plus TypeScript core, React plus TypeScript SPA, versions pinned by dependency locks.
- [ADR-009](../docs/adr/ADR-009-technology-realization.md): why the stack is what it is.

**Architecture constraints**
- Node.js and TypeScript only for the core backend. Do not add a second backend
  language.
- Library versions must be pinned by a committed lock file. Reproducibility rule 6
  requires the dependency-lock identity to be resolvable later.

**Expected change surface**
Root workspace manifest and lock file, root TypeScript configuration, lint and
format configuration, test runner configuration, `apps/` and `packages/`
directories with placeholder packages, and `.gitignore` entries for build output
and installed dependencies.

**Acceptance criteria**
1. Install succeeds from a clean checkout and produces a committed lock file.
2. Typecheck succeeds, and fails when a deliberate type error is introduced.
3. Lint succeeds, and fails on a deliberate violation.
4. Test runs the test runner and reports zero failures on one trivial passing test.
5. TypeScript `strict` mode is on.
6. All four commands are listed in the root `README.md`.

**Validation**
Run each of the four commands. Prove failure detection by temporarily introducing
one type error and one lint error and confirming a non-zero exit code each time.

**Out of scope**
NestJS, React, Docker, database, Redis, continuous integration, any domain code.

**Proof relevance**
Routine.

---

## SETUP-02 - PostgreSQL topology and configuration

**Version:** V1 · **Priority:** CRIT · **Effort:** S

**Outcome**
One command starts PostgreSQL, a documented check reports it healthy, and
`.env.example` lists every variable the system reads.

**Why this slice exists**
V1 needs durable storage and nothing else. Redis has no driver until V4 brings live
fan-out, so it is not started here.

**Dependencies**
`SETUP-01`.

**Authoritative references**
- [Baseline - Technology decisions](../docs/architecture/architecture-baseline.md#technology-decisions): PostgreSQL for durable state and local transactions; a Docker Compose-style local topology.
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): one PostgreSQL instance initially.

**Architecture constraints**
- PostgreSQL is the authoritative store from V1 onward.
- Configuration values are explicit and readable, never hidden defaults.
- The compose file is structured so V4 and V6 can add services without rewriting it.

**Expected change surface**
A Docker Compose file with one PostgreSQL service, `.env.example`, a typed
configuration loader in `apps/backend/src/platform`, and a local setup section in
the root `README.md`.

**Acceptance criteria**
1. One command starts PostgreSQL and it reports healthy.
2. Data written survives a container restart.
3. `.env.example` lists every variable with a safe placeholder and no real secret.
4. The configuration loader fails fast with a clear message when a required
   variable is missing.
5. The loader is typed, so a missing or misspelled variable is a compile-time or
   startup error rather than an undefined value at runtime.

**Validation**
Start the topology, write a row, restart the container, read the row back. Start
the backend with a required variable removed and confirm a clear failure.

**Out of scope**
Redis (V4), Redis persistence configuration (V6), production deployment, TLS,
authentication, backups, Kubernetes.

**Proof relevance**
Routine.

---

## SETUP-03 - NestJS API, module skeleton, and structured logging

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
The API entry command starts a NestJS HTTP process exposing a health endpoint, the
application graph contains five empty modules named for the five frozen logical
modules, and every log line is a structured record carrying a request identifier.

**Why this slice exists**
The frozen module boundaries need to exist as real, inspectable composition
boundaries before any code is placed inside them. Creating them later means moving
code across boundaries under pressure.

Structured logging is folded in here because it costs almost nothing at this point
and because debugging a two-process system without it is unnecessarily painful. The
heavier cross-process correlation envelope waits for `SETUP-09` in V6, where several
independent roles actually exist.

**Dependencies**
`SETUP-01`, `SETUP-02`.

**Authoritative references**
- [Baseline - NestJS realization invariants](../docs/architecture/architecture-baseline.md#nestjs-realization-invariants) - all eight.
- [ADR-009 - Decision](../docs/adr/ADR-009-technology-realization.md): the `ARC-*` to NestJS module mapping.
- [Module boundaries diagram](../docs/diagrams/05-module-boundaries.md).

**Architecture constraints**
- `ApiModule`, `MarketModule`, `StrategyModule`, `ExperimentModule`, and
  `NewsModule` exist and correspond to `ARC-API`, `ARC-MARKET`, `ARC-STRATEGY`,
  `ARC-EXPERIMENT`, `ARC-NEWS`.
- Each module exposes its public surface through explicit exports plus a single
  `index.ts`. Nothing else in the module is importable from outside.
- Shared or common modules hold technical primitives only, never business concepts.
  The logger belongs there.
- Dependency injection stays at composition and transport edges. It is not a
  service locator inside domain code.
- A NestJS module is implementation support for a frozen boundary. Creating one
  does not by itself justify a new boundary.

**Expected change surface**
The `apps/backend` NestJS application, five module directories each with an
`index.ts`, a root application module, global request validation, a health
controller, a structured logger in `platform`, request identifier middleware, and a
start command in the root `README.md`.

**Acceptance criteria**
1. The API process starts and the health endpoint returns a success response.
2. All five modules appear in the application graph.
3. Each module directory has an `index.ts` that currently exports nothing but is
   declared as the module's public surface.
4. Transport DTO validation is enabled globally.
5. No module imports another module in this slice.
6. Log records are structured and include timestamp, level, process role, and
   request identifier.
7. A request without an inbound identifier gets one; a request carrying one keeps
   it.
8. Log output is readable in development and machine-parsable in production mode.
9. The process shuts down cleanly on a termination signal.

**Validation**
Start the process, call the health endpoint with and without an inbound identifier,
inspect the log records, stop the process. A test asserts the application graph
contains the five module names.

**Out of scope**
Any endpoint other than health, database access, WebSocket, queues, the event
envelope, cross-process correlation, authentication.

**Proof relevance**
Contributes to `PROOF-EXT-001`, `PROOF-REPLACE-001`, and `PROOF-PROVIDER-001`,
which all depend on module boundaries being real enough to inspect in a diff.

---

## SETUP-04 - Database migrations and module-owned schemas

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
A migration command creates one PostgreSQL schema per data-owning module, and a
repeatable command resets the database to a known state for tests.

**Why this slice exists**
The baseline requires module-owned tables and forbids cross-module writes. Making
ownership visible in the database schema turns an architecture rule into something
a reviewer and a test can check.

**Dependencies**
`SETUP-02`, `SETUP-03`.

**Authoritative references**
- [Baseline - Data ownership](../docs/architecture/architecture-baseline.md#data-ownership).
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): one PostgreSQL instance with module-owned schemas; only the owning module writes its data; migrations preserve ownership and completed-run provenance.

**Architecture constraints**
- One PostgreSQL instance, with schemas separated per module: market, strategy,
  experiment, news.
- Only the owning module writes its own tables.
- Migrations are forward-only and never rewrite data referenced by a completed run.
- No database entity or row type may be exported from a module's `index.ts`.

**Expected change surface**
Migration tooling and directory, a first migration creating the empty schemas, a
database connection provider in `platform`, a test database reset helper, and
migration commands in the root `README.md`.

**Acceptance criteria**
1. The migration command creates the schemas from an empty database and is safe to
   run twice.
2. A reset command returns the database to empty.
3. Tests obtain an isolated database state without manual steps.
4. The connection provider reads its settings from configuration, not literals.
5. A short table documents each schema and its owning module.

**Validation**
Run migrations against an empty database, run them again, then reset. Run the test
suite and confirm database-backed tests get a clean state.

**Out of scope**
Any real table. Tables arrive with the slice that owns their data.

**Proof relevance**
Contributes to `PROOF-REP-001`, which depends on completed-run data being
append-only.

---

## SETUP-05 - Architecture boundary tests

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
An automated test fails when code crosses a frozen boundary: importing another
module's internals, importing a web framework or provider payload into domain code,
or reaching into another module's infrastructure.

**Why this slice exists**
ADR-001 names this exact risk: a modular monolith can degrade into cross-module
imports and table writes without automated tests and review. This repository will be
built largely by AI coding sessions, which makes an automated guardrail more
valuable than a review convention.

**Dependencies**
`SETUP-03`, `SETUP-04`.

**Authoritative references**
- [Baseline - Allowed dependency directions](../docs/architecture/architecture-baseline.md#allowed-dependency-directions), including the forbidden list.
- [Baseline - NestJS realization invariants](../docs/architecture/architecture-baseline.md#nestjs-realization-invariants) items 2, 3, 4, 5, 6.
- [ADR-001 - Evidence](../docs/adr/ADR-001-modular-monolith-process-roles.md): dependency and ownership tests reject forbidden imports and cross-module writes.
- [Module boundaries diagram, forbidden examples table](../docs/diagrams/05-module-boundaries.md).

**Architecture constraints**
Encode exactly these rules, no more:
1. A module may import another module only through that module's `index.ts`.
2. Allowed cross-module edges only: API to any module; Experiment to Strategy,
   Market, and News. Every other edge fails.
3. `domain/` may not import NestJS, HTTP clients, database libraries, queue
   libraries, or provider software development kits.
4. `platform/` may not import from any `modules/` directory.
5. Nothing outside a module may import its `infrastructure/` or `domain/` paths
   directly.
6. `apps/web` may import `packages/api-contracts` but never
   `packages/messaging-contracts`, and never anything under `apps/backend`.

Rule 6 has no target until V6 creates `messaging-contracts`. Write it now anyway;
a rule that exists before the thing it guards cannot be forgotten later.

**Expected change surface**
A boundary test file with its rule configuration, and an architecture test command
wired into the main test command.

**Acceptance criteria**
1. The boundary test passes on the current tree.
2. Each rule has a deliberately violating fixture proving the rule fires; the
   fixture is removed or excluded afterwards.
3. The failure message names the offending file, the import, and the rule.
4. The check runs as part of the standard test command, not only on demand.
5. The rule set is extended, not rewritten, when a later version adds a module edge.

**Validation**
Run the boundary test. For each rule, temporarily add the violating import, confirm
a clear failure, and revert.

**Out of scope**
Runtime enforcement, database write enforcement at runtime, custom lint plugins
beyond what these rules need.

**Proof relevance**
Contributes to `PROOF-EXT-001`, `PROOF-REPLACE-001`, and `PROOF-PROVIDER-001`, and
to the ADR-009 claim that framework-visible structure supports automated checks.

---

## SETUP-06 - React SPA workspace and application shell

**Version:** V1 · **Priority:** REQ · **Effort:** M

**Outcome**
`apps/web` builds and serves a React SPA with navigation between the pages the
product will grow into, and a typed API client that successfully calls the backend
health endpoint.

**Why this slice exists**
The frontend needs a build, a routing shell, and one typed way to reach the backend
before any page can be built. Doing this once stops each page slice from inventing
its own fetch layer.

**Dependencies**
`SETUP-01`, `SETUP-03`.

**Authoritative references**
- [Baseline - Technology decisions](../docs/architecture/architecture-baseline.md#technology-decisions): React plus TypeScript for the single SPA.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants): the frontend holds no strategy, backtest, evaluation, or ranking logic.
- The sample interface images under `docs/requirements/sample-ui` are authoritative for visible layout and labels only, never for business rules.

**Architecture constraints**
- No strategy, backtest, metric, or ranking calculation in frontend code, now or
  later.
- The SPA talks only to the project backend. It never calls Binance or a news
  source directly.
- Frontend types come from `packages/api-contracts`, never from provider payload
  shapes and never from internal messaging types.

**Expected change surface**
`apps/web` with build configuration, routing, an application shell with navigation,
page placeholders, one typed API client module, a development proxy to the backend,
and `packages/api-contracts` holding the health response type.

**Acceptance criteria**
1. The SPA development server starts and the production build succeeds.
2. Navigation moves between the Backtest, Realtime, Strategy Engine, Discovery, and
   News routes without a full page reload. Only Backtest has content in V1; the rest
   render a clearly-labelled placeholder.
3. The shell displays live backend health obtained through the typed client.
4. Every backend call in the SPA goes through the single API client module.
5. Typecheck covers the web app.

**Validation**
Start backend and SPA, click through all routes, confirm health renders. Run the
production build and the typecheck command.

**Out of scope**
Charts, WebSocket, real page content beyond Backtest, styling systems beyond what
the shell needs, authentication.

**Proof relevance**
Routine.

---

# V4 slices

## WS-03 - WebSocket gateway, Redis, and best-effort Pub/Sub fan-out

**Version:** V4 · **Priority:** REQ · **Effort:** M

**Outcome**
Redis joins the local topology, the API gains a NestJS WebSocket Gateway, a client
can subscribe with a subscription identifier and receive a durable snapshot before
any live message, and a separate process can publish a live notification through
Redis Pub/Sub after committing to PostgreSQL.

**Why this slice exists**
V4's driver is live chart data arriving in a process that is not the API process.
That crossing needs a transport, and Redis Pub/Sub is the frozen choice. This slice
establishes the pattern on a small payload before `MKT-06` puts real candles
through it.

Redis arrives here rather than in V1 because nothing before V4 crosses a process
boundary in a way that needs it.

**Dependencies**
`SETUP-06`, `MKT-04`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): authoritative state to API fan-out is Redis Pub/Sub into the NestJS WebSocket Gateway, explicitly best-effort and ephemeral; durable snapshots and recovery use PostgreSQL.
- [ADR-008](../docs/adr/ADR-008-realtime-delivery-recovery.md): a subscription identifier plus a symbol and timeframe key, snapshot first and then matching live updates.

**Architecture constraints**
- Publish to Pub/Sub only **after** the authoritative state has been committed.
- A Pub/Sub publish is never evidence of durable delivery and never marks anything
  delivered.
- A lost live message causes a snapshot refresh, never data loss. Redis Pub/Sub is
  at-most-once by design.
- The gateway owns client sessions and subscription identifiers. It holds no
  business logic.
- Outbound buffers are bounded, and slow-client behaviour is explicit.
- This Redis instance needs no persistence configuration, because losing a
  best-effort notification is already handled. `SETUP-08` adds persistence in V6
  when BullMQ makes it a correctness requirement.

**Expected change surface**
A Redis service in the compose file, a NestJS WebSocket gateway in `ApiModule`, a
subscription registry, a Pub/Sub publisher and subscriber in `platform`, and SPA
WebSocket client code with reconnect.

**Acceptance criteria**
1. The client subscribes with its own subscription identifier and receives a
   durable snapshot before any live message.
2. A live message published after a commit reaches only the matching subscription.
3. A second subscription with a different key is unaffected by the first.
4. Stopping Redis leaves committed data intact, and a new snapshot still returns the
   current value.
5. Client reconnect requests a fresh snapshot before resuming live messages.
6. Outbound buffering has an explicit bound and a documented slow-client behaviour.

**Validation**
Automated tests for subscribe, snapshot-then-live, subscription isolation, and
recovery after a dropped Pub/Sub message. A manual run with the SPA connected.

**Out of scope**
Candle ingestion, chart binding, gap recovery, BullMQ, authentication.

**Proof relevance**
Contributes to `PROOF-RT-001`.

---

# V6 slices

## SETUP-08 - Redis persistence and eviction configuration

**Version:** V6 · **Priority:** REQ · **Effort:** S

**Outcome**
The Redis instance is configured for persistence with no arbitrary key eviction,
and a documented check command reports both settings so they can be pasted into a
proof record.

**Why this slice exists**
BullMQ correctness depends on Redis persistence and eviction settings. Until V6,
Redis carries only best-effort notifications where losing a message is already
handled by a snapshot refresh, so these settings have no correctness role. From V6
they do.

**Dependencies**
`WS-03`.

**Authoritative references**
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events): "Redis used for BullMQ must have persistence configured and verified."
- [Baseline - Technology decisions](../docs/architecture/architecture-baseline.md#technology-decisions): Redis persistence is an operational requirement for this correctness path.
- [ADR-009 - Evidence](../docs/adr/ADR-009-technology-realization.md): BullMQ production guidance requires persistence and warns against arbitrary key eviction.

**Architecture constraints**
- Persistence must be configured **and verified**, not assumed.
- The eviction policy must not evict arbitrary keys. Use `noeviction`.
- PostgreSQL remains authoritative. Redis durability protects queued work, not
  truth.

**Expected change surface**
A Redis configuration file or explicit command flags, a check command, and a
retention approach for outbox and inbox rows documented alongside it.

**Acceptance criteria**
1. Redis reports a persistence mode that survives a restart.
2. Redis reports `maxmemory-policy` of `noeviction`.
3. The check command prints both settings in one line.
4. A queued job survives a Redis restart.
5. A retention or archival approach for outbox and inbox rows is documented.

**Validation**
Run the check command. Enqueue a job, restart Redis, confirm the job is still
there.

**Out of scope**
Clustering, replication, managed Redis, alerting.

**Proof relevance**
Contributes to `PROOF-SCALE-001`, `PROOF-RETRY-001`, and `PROOF-DUP-001`. Those
proofs are only meaningful if the settings recorded here are correct.

---

## SETUP-09 - Event envelope and cross-process correlation

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
A versioned event envelope exists in `packages/messaging-contracts`, and a
correlation identifier created at the HTTP or WebSocket edge survives into a queued
job, its consumer, and the resulting projection update.

**Why this slice exists**
`PROOF-OBS-001` requires correlation from experiment through candidate, job,
attempt, result, outbox event, consumer, and leaderboard entry. That chain does not
exist until V6 creates the jobs, events, and consumers in it. Before V6 the request
identifier from `SETUP-03` is sufficient for two processes.

**Dependencies**
`SETUP-03`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): the event envelope carries event and type and schema and aggregate identifiers and versions, timestamps, correlation and causation identifiers, and payload.
- [Proof plan - PROOF-OBS-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- Correlation and causation identifiers travel in the envelope and in job payloads,
  not only in a framework-specific ambient context that cannot cross a process
  boundary.
- The envelope lives in `messaging-contracts`, which `apps/web` may not import.
- Contract schemas must be versioned before crossing a process boundary.

**Expected change surface**
`packages/messaging-contracts` with the envelope type and its version, correlation
propagation through job payloads, and the `SETUP-05` rule 6 target now existing.

**Acceptance criteria**
1. The envelope declares event id, type, schema version, aggregate id and version,
   timestamps, correlation id, causation id, and payload.
2. A correlation identifier created at the API edge appears in the worker's logs and
   in the consumer's logs for the same logical operation.
3. Causation identifiers link an event to the command that caused it.
4. The envelope is versioned, and an unknown version is rejected with a clear error
   rather than partially parsed.
5. The boundary test confirms `apps/web` cannot import `messaging-contracts`.

**Validation**
Trace one correlation identifier end to end across three processes. A test asserts
envelope shape, version rejection, and the boundary rule.

**Out of scope**
Tracing backends, dashboards, log shipping, metrics export.

**Proof relevance**
Directly required by `PROOF-OBS-001`.

---

## WS-02 - BullMQ round trip in a separate worker process

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
The API enqueues a trivial job on BullMQ, a separately started worker process
consumes it and commits a row to PostgreSQL, and delivering the same logical job
twice still produces one row.

**Why this slice exists**
V6 replaces the PostgreSQL run queue with BullMQ. Proving at-least-once delivery and
consumer idempotency on a trivial job first makes `EXP-12` and the messaging
primitives a variation on a known-good pattern rather than a leap.

**Dependencies**
`SETUP-08`, `SETUP-09`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): immutable BullMQ commands through Redis, delivered at least once to separate worker processes.
- [ADR-004](../docs/adr/ADR-004-asynchronous-experiment-processing.md): at-least-once delivery, one idempotency key per logical execution.
- [ADR-009 - Evidence](../docs/adr/ADR-009-technology-realization.md): BullMQ idempotent-job guidance.

**Architecture constraints**
- Delivery is at-least-once. The consumer must be idempotent and duplicate-safe.
- A custom job identifier reduces duplicate enqueues but does not replace consumer
  idempotency. BullMQ ignores an add with an existing job id **only while that job
  is still present in the queue**, and options that remove completed or failed jobs
  release the identifier for reuse. Treat the job id as a cheap first defence and
  the durable idempotency key as the real one.
- Redis is not authoritative for anything. PostgreSQL is.
- The job contract lives in `messaging-contracts`.

**Expected change surface**
A BullMQ queue module in `platform`, a job contract in `messaging-contracts`, a
worker entry command, a consumer with a durable idempotency key, and worker start
instructions in the root `README.md`.

**Acceptance criteria**
1. The worker runs as its own process with its own start command.
2. Enqueue then consume produces exactly one committed row.
3. Delivering the same logical job twice produces one row, and the second delivery
   is recorded as a duplicate rather than silently dropped.
4. Killing the worker before its commit and restarting it produces exactly one row.
5. The consumer records attempt history.
6. The correlation identifier from the enqueue side appears in the worker's logs.

**Validation**
Automated tests for the single, duplicate, and crash-before-commit cases against a
real Redis and PostgreSQL. A manual run of the two processes side by side.

**Out of scope**
Backtesting, the outbox, the projection, retry tuning, worker scaling.

**Proof relevance**
Contributes to `PROOF-SCALE-001` and `PROOF-RETRY-001`.

---

## MSG-01 - Reliable messaging primitives

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
`platform/messaging` provides the generic outbox and inbox **mechanism** - table
shape, the dispatcher loop, deduplication and aggregate-version checking - which
each module then binds to its own tables. Experiment and News share the mechanism
without either depending on the other.

**Why this slice exists**
Both Experiment and News need durable publication and idempotent consumption. The
earlier plan put the pattern inside Experiment, which would have forced News to
either duplicate it or import from Experiment. The second is a forbidden dependency
direction, and the first is worse.

**Dependencies**
`WS-02`.

**Authoritative references**
- [Baseline - Data ownership](../docs/architecture/architecture-baseline.md#data-ownership): "Each publishing/consuming module: its outbox/inbox records."
- [Baseline - NestJS realization invariants](../docs/architecture/architecture-baseline.md#nestjs-realization-invariants) item 6: shared modules contain only genuinely technical primitives and must not become a business-domain dumping ground.
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events).
- [ADR-005](../docs/adr/ADR-005-transactional-results-leaderboard.md).

**Architecture constraints**
The three layers must stay distinct, and this slice owns only the first:

| Layer | Owner | Contents |
|---|---|---|
| Generic mechanism | `platform/messaging` | Outbox and inbox table shape, dispatcher loop, enqueue-then-mark-delivered protocol, event deduplication, aggregate-version comparison |
| Module-owned durable state | each module's own schema | That module's outbox and inbox rows |
| Business meaning | each module's application layer | Which events it publishes, what a consumer does with one |

- `platform` must not import from any module. It knows about envelopes and rows,
  never about results, leaderboards, or news items.
- News must never import Experiment. The shared thing is the primitive, not the
  domain.
- The mechanism is parameterized by schema and table name so each module owns its
  own rows.

**Expected change surface**
`platform/messaging` with the outbox and inbox primitives, a migration helper for
module-owned tables, and tests using a throwaway fake module.

**Acceptance criteria**
1. Two independent fake modules can each bind the primitive to their own tables and
   operate without touching each other's rows.
2. The dispatcher marks a row delivered only after enqueue acknowledgement.
3. The inbox check plus the consumer's effect commit in one transaction.
4. A duplicate event is a recorded no-op; a stale aggregate version is a recorded
   no-op.
5. The boundary test confirms `platform` imports nothing from `modules/`.
6. No domain concept from Experiment or News appears anywhere in `platform`.

**Validation**
Tests with two fake modules covering isolation, delivery marking, duplicate, and
stale version. Run the boundary test.

**Out of scope**
Experiment's or News's actual events and consumers, which are `EXP-08`, `EXP-09`,
and `NEWS-02`.

**Proof relevance**
Enables `PROOF-RETRY-001` and `PROOF-DUP-001`.
