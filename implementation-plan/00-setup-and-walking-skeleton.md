# 00 - Setup and Walking Skeleton

Environment readiness (D5) plus a thin end-to-end path through every runtime role.
Nothing in later files can be validated until this file is finished, because the
run commands, test commands, and process roles do not exist yet.

Read [`README.md`](README.md) first. Statuses live in [`TRACKING.md`](TRACKING.md).

## Why this area comes first

The repository today contains documentation only. There is no package manager, no
TypeScript configuration, no database, no test runner, and no way to run anything.
Every later slice's Validation section names a command, so those commands have to
exist first.

The area ends with three walking-skeleton slices that push a trivial payload
through each frozen communication path (HTTP, BullMQ, WebSocket plus Pub/Sub)
before any domain logic is written. That is deliberate: wiring failures found on a
trivial payload are cheap, and wiring failures found during a backtest are not.

## Open decisions

These are implementation choices the frozen architecture does not make. Each has a
recommended default so work is not blocked. A coding agent may proceed on the
default and must record the choice; the user may override at any time.

| Decision | Recommended default | Why, and what the trade-off is |
|---|---|---|
| Package manager and workspace | pnpm workspaces | Fast, and strict about undeclared dependencies, which helps hold module boundaries. npm workspaces also work and need no extra install. |
| Test runner | Vitest | Fast, native TypeScript and ESM. Jest is the NestJS default and is also acceptable; choosing Jest costs speed, choosing Vitest costs a little example compatibility with NestJS docs. |
| Database access layer | A SQL-first layer such as Drizzle or Kysely, with plain SQL migrations | The baseline forbids ORM models leaking into domain code and requires module-owned schemas. A SQL-first layer makes both easy to see and easy to test. TypeORM is more NestJS-idiomatic but pulls entity classes toward the domain; Prisma centralizes one schema file, which fights module ownership. |
| Chart library | `lightweight-charts` | Built for candlesticks, and supports the markers, price lines, and overlays the requirements ask for. Any library that renders candles, markers, and horizontal price lines is acceptable. |
| Frontend build | Vite plus React plus TypeScript | Standard and fast. No server-side rendering is needed for a SPA. |

These decisions need human sign-off **before the slice that first uses them**,
because the baseline says such values must be explicit configuration rather than
hidden defaults:

| Decision | Blocks | Note |
|---|---|---|
| Execution model defaults: starting capital, fee, slippage, fill rule, rounding, position sizing, stop rules | `EXP-02` | Baseline "Reproducibility rules" item 5 requires these to be resolvable per result. They must be specification fields with supplied values, not constants inside the engine. |
| Ranking weights and tie-break rule | `SEARCH-03` | The baseline requires an explicit versioned ranking policy. |
| Concrete news sources | `NEWS-02` | Licensing and rate policy have to be reviewed before collection starts (ADR-007 risk). |
| Concrete sentiment model or service | `NEWS-04` | Decides whether the optional Python runtime behind `SentimentAnalyzer` is justified. |
| Retention for candles, results, outbox and inbox rows | `EXP-08` | Outbox and inbox tables grow without a policy (ADR-005 risk). |

## Recommended repository layout

This is a plan assumption, not a frozen decision. What **is** frozen is that each
`ARC-*` module maps to a clear NestJS module boundary with an explicit exported
port surface, and that cross-module access goes only through that surface.

```text
apps/
  backend/
    src/
      main.api.ts                # NestJS HTTP + WebSocket gateway process
      main.market-ingest.ts      # market ingest process role
      main.backtest-worker.ts    # BullMQ backtest worker role
      main.news-worker.ts        # news and sentiment worker role
      main.outbox-dispatcher.ts  # outbox dispatcher role
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
  api-contracts/                 # transport DTO types and event envelope schemas
```

Inside each `modules/<name>/` directory use:

```text
domain/          # framework-free contracts and logic
application/     # use cases and ports
infrastructure/  # adapters implementing this module's own ports
index.ts         # the ONLY file other modules may import from
```

All five roles share one build. Roles differ only by entry command, which the
baseline explicitly permits.

---

## SETUP-01 - Workspace, TypeScript, and quality commands

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
- Node.js and TypeScript only for the core backend. Do not add a second backend language.
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
Routine. It only creates the commands later proof runs use.

---

## SETUP-02 - Local infrastructure topology and configuration

**Outcome**
One command starts PostgreSQL and a Redis instance configured for persistence with
no arbitrary key eviction, and a documented check command reports both settings.
`.env.example` lists every variable the system reads.

**Why this slice exists**
BullMQ correctness depends on Redis persistence and eviction settings. If Redis
starts with default developer settings, several architecture proofs are invalid
from the first day and nobody will notice.

**Dependencies**
`SETUP-01`.

**Authoritative references**
- [Baseline - Technology decisions](../docs/architecture/architecture-baseline.md#technology-decisions): "Redis persistence is an operational requirement for this correctness path"; a Docker Compose-style local topology.
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events): "Redis used for BullMQ must have persistence configured and verified."
- [ADR-009 - Evidence](../docs/adr/ADR-009-technology-realization.md): BullMQ production guidance requires Redis persistence and warns against arbitrary key eviction.

**Architecture constraints**
- Redis persistence must be configured **and verified**, not assumed.
- The eviction policy must not evict arbitrary keys. Use `noeviction` for the
  BullMQ instance.
- PostgreSQL is the authoritative store. Redis is never authoritative.
- Configuration values are explicit and readable, never hidden defaults.

**Expected change surface**
A Docker Compose file, a Redis configuration file or explicit command flags,
`.env.example`, a typed configuration loader in `apps/backend/src/platform`, and a
short local setup section in the root `README.md`.

**Acceptance criteria**
1. One command starts PostgreSQL and Redis and both report healthy.
2. Redis reports a persistence mode that survives restart, and reports a
   `maxmemory-policy` of `noeviction`.
3. A documented check command prints both settings so the values can be pasted into
   a proof record.
4. Data written to PostgreSQL and to Redis survives a container restart.
5. `.env.example` lists every variable with a safe placeholder and no real secret.
6. The configuration loader fails fast with a clear message when a required
   variable is missing.

**Validation**
Start the topology, run the check command, capture the two Redis settings. Write a
key, restart the containers, read the key back. Start the backend with a required
variable removed and confirm a clear failure.

**Out of scope**
Production deployment, TLS, authentication, backups, Kubernetes, managed cloud
services.

**Proof relevance**
Contributes to `PROOF-SCALE-001`, `PROOF-RETRY-001`, and `PROOF-DUP-001`. Those
proofs are only meaningful if the Redis settings recorded here are correct.

---

## SETUP-03 - NestJS API process and module composition skeleton

**Outcome**
The API entry command starts a NestJS HTTP process that exposes a health endpoint,
and the application graph contains five empty modules named for the five frozen
logical modules.

**Why this slice exists**
The frozen module boundaries need to exist as real, inspectable composition
boundaries before any code is placed inside them. Creating them later means moving
code across boundaries under pressure.

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
- Dependency injection stays at composition and transport edges. It is not a
  service locator inside domain code.
- A NestJS module is implementation support for a frozen boundary. Creating one
  does not by itself justify a new boundary.

**Expected change surface**
The `apps/backend` NestJS application, five module directories each with an
`index.ts`, a root application module, global request validation, a health
controller, and a start command in the root `README.md`.

**Acceptance criteria**
1. The API process starts and the health endpoint returns a success response.
2. All five modules appear in the application graph.
3. Each module directory has an `index.ts` that currently exports nothing but is
   declared as the module's public surface.
4. Transport DTO validation is enabled globally.
5. No module imports another module in this slice.
6. The process shuts down cleanly on a termination signal.

**Validation**
Start the process, call the health endpoint, stop the process. A test asserts the
application graph contains the five module names.

**Out of scope**
Any endpoint other than health, database access, WebSocket, queues, authentication.

**Proof relevance**
Contributes to `PROOF-EXT-001`, `PROOF-REPLACE-001`, and `PROOF-PROVIDER-001`,
which all depend on module boundaries being real enough to inspect in a diff.

---

## SETUP-04 - Database migrations and module-owned schemas

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
  experiment, news, plus outbox and inbox tables owned by the publishing or
  consuming module.
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

**Outcome**
An automated test fails when code crosses a frozen boundary: importing another
module's internals, importing a web framework or provider payload into domain code,
or reaching into another module's infrastructure.

**Why this slice exists**
ADR-001 names this exact risk: a modular monolith can degrade into cross-module
imports and table writes without automated tests and review. This repository will
be built largely by AI coding sessions, which makes an automated guardrail more
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

**Expected change surface**
A boundary test file with its rule configuration, and an architecture test command
wired into the main test command.

**Acceptance criteria**
1. The boundary test passes on the current tree.
2. Each of the five rules has a deliberately violating fixture proving the rule
   fires; the fixture is removed or excluded afterwards.
3. The failure message names the offending file, the import, and the rule.
4. The check runs as part of the standard test command, not only on demand.

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

**Outcome**
`apps/web` builds and serves a React SPA with navigation between the five pages
named in the sample interface, each currently empty, and a typed API client that
successfully calls the backend health endpoint.

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
- Frontend types come from the shared transport contract package, never from
  provider payload shapes.

**Expected change surface**
`apps/web` with build configuration, routing, an application shell with navigation,
five empty page components, one typed API client module, a development proxy to the
backend, and `packages/api-contracts` holding the health response type.

**Acceptance criteria**
1. The SPA development server starts and the production build succeeds.
2. Navigation moves between Realtime, Strategy Engine, Discovery, Backtest, and
   News pages without a full page reload.
3. The shell displays live backend health obtained through the typed client.
4. Every backend call in the SPA goes through the single API client module.
5. Typecheck covers the web app.

**Validation**
Start backend and SPA, click through all five routes, confirm health renders. Run
the production build and the typecheck command.

**Out of scope**
Charts, WebSocket, real page content, styling systems beyond what the shell needs,
authentication.

**Proof relevance**
Routine.

---

## SETUP-07 - Correlation identifiers and structured logging

**Outcome**
Every process role emits structured logs carrying a correlation identifier, and an
identifier created at the HTTP or WebSocket edge survives into a queued job and its
consumer.

**Why this slice exists**
`PROOF-OBS-001` requires correlation from experiment through candidate, job,
attempt, result, outbox event, consumer, and leaderboard entry. Threading a
correlation identifier through afterwards means touching every code path twice.
Doing it in the skeleton costs almost nothing.

**Dependencies**
`SETUP-03`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): the event envelope carries correlation and causation identifiers.
- [Proof plan - PROOF-OBS-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- Correlation and causation identifiers belong in the versioned event envelope and
  in job payloads, not only in a framework-specific ambient context that cannot
  cross a process boundary.
- Logging belongs to `platform`. It is a technical primitive, not a domain concept.

**Expected change surface**
A structured logger in `platform`, correlation identifier generation and
propagation at the HTTP and WebSocket edges, and the envelope type in
`packages/api-contracts`.

**Acceptance criteria**
1. Logs are structured records including timestamp, level, process role, and
   correlation identifier.
2. An inbound request without an identifier gets one; a request carrying one keeps
   it.
3. The identifier appears on log lines produced while handling that request.
4. The event envelope type declares event id, type, schema version, aggregate id
   and version, timestamps, correlation id, causation id, and payload.
5. Log output is readable in development and machine-parsable in production mode.

**Validation**
Call an endpoint with and without an inbound identifier and inspect the log records.
A test asserts propagation and envelope shape.

**Out of scope**
Metrics endpoints, tracing backends, dashboards, log shipping. `OPS-01` covers the
operational query surface.

**Proof relevance**
Contributes to `PROOF-OBS-001`.

---

## WS-01 - Walking skeleton: SPA to HTTP to module port to PostgreSQL

**Outcome**
A control in the SPA triggers an HTTP call that reaches a module application port,
writes and reads one trivial row in that module's own schema, and displays the
result. The whole interactive path works with no domain logic in it.

**Why this slice exists**
This is the tracer bullet for the interactive path. It proves the SPA build,
routing, API client, NestJS transport, DTO validation, module port, database
connection, and migration path all work together, using a payload simple enough
that any failure is unambiguous.

**Dependencies**
`SETUP-04`, `SETUP-05`, `SETUP-06`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): SPA to API over HTTP; API to modules through in-process application ports.
- [Baseline - Logical modules](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): `ARC-API` holds no business logic.

**Architecture constraints**
- The API layer calls a module application port. It never touches the module's
  repository or tables.
- The module owns its table in its own schema.
- The transport DTO is separate from the module's application contract.

**Expected change surface**
One small application port and its adapter inside `MarketModule` (the module that
needs persistence first), one migration, one controller and DTO in `ApiModule`, one
API client method, and one SPA control.

**Acceptance criteria**
1. The SPA control performs a round trip and displays a value that came from
   PostgreSQL.
2. `ApiModule` imports only `MarketModule`'s `index.ts`.
3. The boundary test still passes.
4. An integration test covers the round trip against a real database.
5. An invalid request body is rejected by validation with a clear error.

**Validation**
Run the integration test. Start the stack and use the control.

**Out of scope**
Candles, real market data, any domain meaning for the row. This row is scaffolding
and is removed or replaced by `MKT-03`.

**Proof relevance**
Routine.

---

## WS-02 - Walking skeleton: BullMQ round trip through a separate worker process

**Outcome**
The API enqueues a trivial job on BullMQ, a separately started worker process
consumes it and commits a row to PostgreSQL, and the API reads that row back.
Delivering the same logical job twice still produces one row.

**Why this slice exists**
This is the tracer bullet for the durable asynchronous path, and it is where the
project's hardest correctness rules live. Proving at-least-once delivery and
consumer idempotency on a trivial job makes every later worker slice a variation on
a known-good pattern.

**Dependencies**
`WS-01`, `SETUP-07`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): immutable BullMQ commands through Redis, delivered at least once to separate worker processes.
- [Baseline - Deployment topology](../docs/architecture/architecture-baseline.md#deployment-topology): roles share a build and use role-specific entry commands.
- [ADR-004](../docs/adr/ADR-004-asynchronous-experiment-processing.md): at-least-once delivery, one idempotency key per logical execution.
- [ADR-009 - Evidence](../docs/adr/ADR-009-technology-realization.md): BullMQ idempotent-job guidance.

**Architecture constraints**
- Backtest-style work never runs inside the API or WebSocket process. The worker is
  a separate operating-system process.
- Delivery is at-least-once. The consumer must be idempotent and duplicate-safe.
- A custom job identifier reduces duplicate enqueues but does not replace consumer
  idempotency. BullMQ ignores an add with an existing job id **only while that job
  is still present in the queue**, and options that remove completed or failed jobs
  release the identifier for reuse. Treat the job id as a cheap first defence and
  the durable idempotency key as the real one.
- Redis is not authoritative for anything. PostgreSQL is.

**Expected change surface**
A queue module in `platform`, a job contract in `packages/api-contracts`, an
enqueue call from a module application port, a worker entry command, a consumer
with a durable idempotency key, and worker start instructions in the root
`README.md`.

**Acceptance criteria**
1. The worker runs as its own process with its own start command.
2. Enqueue then consume produces exactly one committed row.
3. Delivering the same logical job twice still produces exactly one row, and the
   second delivery is recorded as a duplicate rather than silently dropped.
4. Killing the worker before its commit and restarting it produces exactly one row.
5. The consumer records attempt history.
6. The correlation identifier from the enqueue side appears in the worker's logs.

**Validation**
Automated tests for the single, duplicate, and crash-before-commit cases against a
real Redis and PostgreSQL. A manual run of the two processes side by side.

**Out of scope**
Backtesting, the outbox, the leaderboard projection, retry policy tuning, worker
scaling.

**Proof relevance**
Contributes to `PROOF-SCALE-001` and `PROOF-RETRY-001`. It establishes the
idempotency pattern those proofs later exercise for real.

---

## WS-03 - Walking skeleton: WebSocket gateway and best-effort Pub/Sub fan-out

**Outcome**
The SPA opens a WebSocket connection, subscribes with a subscription identifier,
receives a durable snapshot first, and then receives a live message that a separate
process published through Redis Pub/Sub after committing to PostgreSQL.

**Why this slice exists**
This is the tracer bullet for the realtime path and for the plan's most easily
confused rule: Pub/Sub is a best-effort notification, never a delivery guarantee.
Proving snapshot-then-live on a trivial payload sets the pattern for charts,
progress, and leaderboard updates alike.

**Dependencies**
`WS-02`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): authoritative state to API fan-out is Redis Pub/Sub into the NestJS WebSocket Gateway, explicitly best-effort and ephemeral; durable snapshots and recovery use PostgreSQL.
- [ADR-008](../docs/adr/ADR-008-realtime-delivery-recovery.md): a subscription identifier plus symbol and timeframe key, snapshot first and then matching live updates.

**Architecture constraints**
- Publish to Pub/Sub only **after** the authoritative state or projection has been
  committed.
- A Pub/Sub publish is never evidence of durable delivery and never marks anything
  delivered.
- A lost live message causes a snapshot refresh, never data loss.
- The gateway owns client sessions and subscription identifiers. It holds no
  business logic.
- Outbound buffers are bounded, and slow-client behaviour is explicit.

**Expected change surface**
A NestJS WebSocket gateway in `ApiModule`, a subscription registry, a Pub/Sub
publisher and subscriber in `platform`, publication from the worker after its
commit, and SPA WebSocket client code with reconnect.

**Acceptance criteria**
1. The client subscribes with its own subscription identifier and receives a
   durable snapshot before any live message.
2. A live message published after a commit reaches only the matching subscription.
3. A second subscription with a different key is unaffected by the first.
4. Stopping the Pub/Sub path leaves committed data intact, and a new snapshot still
   returns the current value.
5. Client reconnect requests a fresh snapshot before resuming live messages.
6. Outbound buffering has an explicit bound and a documented slow-client behaviour.

**Validation**
Automated tests for subscribe, snapshot-then-live, subscription isolation, and
recovery after a dropped Pub/Sub message. A manual run with the SPA connected.

**Out of scope**
Candle data, chart rendering, the four-chart layout, gap recovery, authentication.

**Proof relevance**
Contributes to `PROOF-RT-001`. The four-subscription and recovery evidence comes
later from `MKT-08` and `MKT-09`.
