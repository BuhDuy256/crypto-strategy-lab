# Crypto Strategy Lab

Crypto Strategy Lab is an architecture-first platform for crypto market data, strategy experimentation, backtesting, candidate search/evaluation, and leaderboard analysis. It also includes an isolated news/sentiment capability and is designed around extensibility, failure isolation, and reproducible experiment results. The repository contains the accepted architecture and validation plan, plus the implementation built against it so far.

## Current project status

- **Architecture:** `FROZEN v1.2`
- **Validation:** `PENDING IMPLEMENTATION PROOFS`
- **Implementation:** `IN PROGRESS`
- **Current product version:** `V1`

`FROZEN ≠ PROVEN`: the baseline is normative for implementation, but its proof obligations still require implementation evidence.

Implementation status and current product version are separate facts. The first says whether application work has begun; the second names the only product version anyone is authorized to build right now. Both are set by the team, never advanced by a coding agent. Live slice state is in [`implementation-plan/TRACKING.md`](implementation-plan/TRACKING.md).

## Architecture at a glance

| Area | Selection |
|---|---|
| Architecture style | Modular Monolith with selectively separated process roles |
| Core backend | Node.js + TypeScript + NestJS |
| Frontend | React + TypeScript |
| Durable storage | PostgreSQL |
| Async processing | BullMQ + persistence-configured Redis |
| Realtime client transport | NestJS WebSocket Gateway |
| Best-effort live fan-out | Redis Pub/Sub after authoritative state/projection updates |
| Optional ML runtime | Python only behind `SentimentAnalyzer` when a selected model/library justifies it |

PostgreSQL is authoritative durable truth. BullMQ/Redis carries correctness-relevant asynchronous work; Redis Pub/Sub is only ephemeral notification.

## High-level project structure

```text
crypto-strategy-lab/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── CODING_STANDARDS.md
├── implementation-plan/
│   ├── README.md
│   ├── VERSIONS.md
│   ├── TRACKING.md
│   ├── JOURNAL.md
│   └── 00-... to 07-... (slices, by architectural area)
├── apps/
│   ├── backend/
│   └── web/
├── packages/
│   └── api-contracts/
├── .agents/
│   ├── architecture-freeze.yaml
│   ├── skill-manifest.yaml
│   ├── skill-lock.yaml
│   └── skills/            (canonical skills)
├── .claude/
│   ├── settings.json
│   └── skills/            (mirror, loaded by Claude Code)
├── .codex/
│   ├── config.toml
│   └── skills/            (mirror, loaded by Codex)
├── docs/
│   ├── architecture/
│   │   ├── architecture-baseline.md
│   │   ├── architecture-baseline-v1.md
│   │   └── architecture-proposal.md
│   ├── adr/
│   │   └── ADR-001 ... ADR-010
│   ├── diagrams/
│   │   ├── README.md
│   │   └── 01 ... 10 architecture views
│   ├── requirements/
│   └── validation/
│       └── architecture-proof-plan.md
└── scripts/
    └── check-repo-governance.ps1
```

## Recommended review order

1. [Diagram index](docs/diagrams/README.md)
2. [Problem Tree](docs/diagrams/01-problem-tree.md)
3. [Decision Tree](docs/diagrams/02-decision-tree.md)
4. [System Context](docs/diagrams/03-system-context.md)
5. [Container / Runtime View](docs/diagrams/04-container-runtime-view.md)
6. [Module Boundaries](docs/diagrams/05-module-boundaries.md)
7. [Frozen architecture baseline v1.2](docs/architecture/architecture-baseline.md) — normative source
8. The ADRs relevant to the area under review
9. [Architecture Proof Plan](docs/validation/architecture-proof-plan.md)
10. [Architecture Proposal](docs/architecture/architecture-proposal.md) for deeper reasoning and trade-offs

The diagrams are the quick entry point, the baseline defines what implementation must obey, and the ADRs/proposal explain why those decisions were made.

## Main logical modules

- **ARC-API — API / Presentation:** Owns HTTP/WebSocket transport, DTO validation, client subscription/session state, push behavior, and query composition. It contains no strategy, backtest, ranking, or provider business logic.
- **ARC-MARKET — Market Data:** Owns provider adapters, normalized candles, ingestion, validation, deduplication, gap recovery, datasets, persistence, and provider health.
- **ARC-STRATEGY — Strategy:** Owns strategy contracts/implementations, registry metadata, normalized signals, composition policies, and `StrategyGenerator` contracts/implementations.
- **ARC-EXPERIMENT — Experiment:** Owns immutable experiment specifications, run control, candidate/job lifecycle, backtesting, evaluation, ranking, result acceptance, provenance, and leaderboard projection.
- **ARC-NEWS — News Intelligence:** Owns news collection/normalization, sentiment analysis adapters, inference lifecycle, versioned results, and sentiment-feature queries.

Cross-module access uses exported application/domain ports. A logical module is not automatically a deployment boundary.

## Key runtime flows

- [Experiment / Backtest Flow](docs/diagrams/06-experiment-backtest-flow.md)
- [Realtime Market Flow](docs/diagrams/07-realtime-market-flow.md)
- [News / Sentiment Flow](docs/diagrams/08-news-sentiment-flow.md)
- [Reproducibility / Provenance Map](docs/diagrams/09-reproducibility-provenance-map.md)
- [Proof Coverage Map](docs/diagrams/10-proof-coverage-map.md)

## Architecture decisions

- [ADR-001 — Modular Monolith with Process-Role Separation](docs/adr/ADR-001-modular-monolith-process-roles.md)
- [ADR-002 — Strategy Extensibility and Search Replaceability Contracts](docs/adr/ADR-002-strategy-and-search-contracts.md)
- [ADR-003 — Provider Adapters and Normalized Contracts](docs/adr/ADR-003-provider-adapters.md)
- [ADR-004 — Asynchronous Experiment Processing](docs/adr/ADR-004-asynchronous-experiment-processing.md)
- [ADR-005 — Transactional Results and Derived Leaderboard](docs/adr/ADR-005-transactional-results-leaderboard.md)
- [ADR-006 — Immutable Experiment Specification and Provenance](docs/adr/ADR-006-immutable-experiment-provenance.md)
- [ADR-007 — News Collection and Sentiment Isolation](docs/adr/ADR-007-news-sentiment-isolation.md)
- [ADR-008 — Realtime Delivery and Market Recovery](docs/adr/ADR-008-realtime-delivery-recovery.md)
- [ADR-009 — Technology Realization for Baseline v1.1](docs/adr/ADR-009-technology-realization.md)
- [ADR-010 — Realization Sequencing for Asynchronous Backtest Execution](docs/adr/ADR-010-realization-sequencing-for-asynchronous-backtest-execution.md)

## Development workflow

Work follows a gated path from research/problem evidence to specification, architecture conformance, TDD implementation, two-axis code review, and architecture proof. Architecture constraints apply throughout rather than as a one-time design step.

The [Development Workflow](docs/agents/development-workflow.md) identifies the repository-local skill, authoritative inputs, artifact, validation or human gate, next phase, and freeze constraint for each step. [`CODING_STANDARDS.md`](CODING_STANDARDS.md) says how the code itself is written. The [Architecture Proof Plan](docs/validation/architecture-proof-plan.md) remains authoritative for implementation evidence: `FROZEN` is not `PROVEN`.

## How implementation work is organized

The plan is **organized by architectural area, not one file per version**. A product version is a set of slices spread across several area files.

| File | What it tells you |
|---|---|
| [`implementation-plan/README.md`](implementation-plan/README.md) | How the plan works, and how to pick and finish work. **Start here.** |
| [`implementation-plan/VERSIONS.md`](implementation-plan/VERSIONS.md) | What V1 to V6 must achieve, which slices belong to each, and each version's Definition of Demoable |
| [`implementation-plan/TRACKING.md`](implementation-plan/TRACKING.md) | The one authoritative current-state view: target version, per-slice status, blockers, next allowed action |
| [`implementation-plan/JOURNAL.md`](implementation-plan/JOURNAL.md) | Durable history: decisions taken, deviations and debt handed forward, validation results worth remembering |
| `implementation-plan/00-...` to `07-...` | Slice definitions, grouped by architectural area |
| `.scratch/checkpoints/<slice-id>.md` | Where an unfinished slice stopped. **Local and git-ignored**: it never reaches another team member |

Owning a version means owning that version's slices, wherever they live. Someone assigned V2 owns V2's slices, not the whole of `02-strategy-and-composition.md`.

Two rules that keep sequential work honest:

- **Being assigned V(N+1) does not authorize starting V(N+1).** The previous version must actually have passed its slices, Definition of Demoable, demo scenario, and required proofs, verified in Git and code, not just in the tracker.
- **No agent creates a version tag or advances the current product version.** Those stay explicit human decisions.

## Taking over the project

1. Clone, run `corepack enable`, then `pnpm install`. The repository pins pnpm in
   `package.json`, so every member uses the same package-manager release.
2. Nothing to set up for skills: they are committed for both Claude Code and Codex.
3. Tell your AI assistant:

   > Read the repository AI/development instructions and continue the current authorized product version.

`AGENTS.md` (which `CLAUDE.md` imports) is the entry point, and it routes to the plan, the tracker, the journal, and the coding standards. You should not have to paste project context from a previous member's chat.

`AGENTS.md` is deliberately the only place shared policy lives, so it works for any assistant, not just Claude Code and Codex. If your tool reads its own instruction file instead, point that file at `AGENTS.md` rather than copying rules into it. A second copy drifts, and then two members' assistants follow different rules, which is the failure this whole setup exists to prevent.

If you end a session with a slice unfinished, the checkpoint file stays on your machine, so leave the part others need in tracked state: the slice marked `IN_PROGRESS` in `TRACKING.md` with one line on where it stopped, and any lasting decision or problem in `JOURNAL.md`.

### Project skills

Skills are committed, so there is **no setup step**. `git clone` gives Claude Code and
Codex the same set:

| Directory | Role |
|---|---|
| `.agents/skills/` | Canonical. Edit a skill here. |
| `.claude/skills/` | Mirror that Claude Code loads |
| `.codex/skills/` | Mirror that Codex loads |

Every skill is plain Markdown at `<root>/<name>/SKILL.md`, so an assistant with no
skill system of its own can simply open the file the workflow router names.

Changing a skill means changing all three copies in one commit, then updating that
skill's `treeSha256` in `.agents/skill-lock.yaml`. You do not have to remember this:
the governance validator hashes each mirror against the canonical tree and fails on
drift or a missing mirror, naming the skill and the directory.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

The hash is computed over LF-normalized content, so a Windows checkout and a macOS or
Linux checkout of the same skill agree.

## What the team should review now

- [ ] Are module responsibilities and data ownership clear?
- [ ] Are the allowed dependency directions acceptable?
- [ ] Does the NestJS module/composition mapping preserve the logical boundaries?
- [ ] Are PostgreSQL, BullMQ/Redis, and Redis Pub/Sub responsibilities distinct and acceptable?
- [ ] Is the transactional outbox → BullMQ durable delivery path acceptable?
- [ ] Is optional Python sufficiently isolated behind `SentimentAnalyzer`?
- [ ] Are the immutable provenance and reproducibility requirements realistic?
- [ ] Do any unresolved product policies block the first implementation slice?

Open product/configuration choices remain intentionally undecided: ranking weights
and tie-breaking; concrete news providers and sentiment model; measurable performance
targets and test hardware; authentication; and retention. V1 execution-model defaults
were accepted on 2026-08-23 and are recorded in `implementation-plan/JOURNAL.md`.

## Development commands

The repository is a pnpm workspace (`apps/*`, `packages/*`) with TypeScript in strict mode, ESLint, and Vitest. Run these from the repository root:

| Command | Purpose |
|---|---|
| `pnpm install` | Install dependencies for all workspace packages. |
| `pnpm run typecheck` | Type-check every workspace package with `tsc --noEmit`. |
| `pnpm run lint` | Lint the repository with ESLint. |
| `pnpm run test` | Run the Vitest test suite. |
| `pnpm run migrate` | Apply every pending database migration (safe to run twice). |
| `pnpm run migrate:reset` | Drop the module-owned schemas and return the database to empty. |
| `pnpm run market:backfill -- --symbol BTCUSDT --timeframe 1h --startTime <ms> --endTime <ms>` | Load a closed Binance candle range into append-only Market storage. |

## Two run paths

This repository has two ways to run, and they answer different questions. Neither replaces the other.

| Path | Use it for | What it starts |
|---|---|---|
| **Host development** (below) | Coding, testing, debugging, hot reload, focused slice work | Infrastructure in Docker; the API and the SPA as `pnpm` commands on your machine |
| **Full-system integration and demo** | Proving a whole product version, and running its demo | Every process role that version requires, through one documented Docker Compose command |

Host development is the normal way to build a slice. **Nothing requires a command, a test, or a coding session to run inside a container.** Docker Compose is what proves a whole version: before a version is declared demoable, its required topology must come up from a clean checkout through Compose and its demo scenario must be walked there. Host tests passing is not that gate.

The rule itself is not repeated here. It lives in [`AGENTS.md`](AGENTS.md) under "Local development and full-system integration", and the per-version condition is the [Compose integration gate](implementation-plan/VERSIONS.md#compose-integration-gate-every-version), which also lists which process roles each version needs. Read those two before completing a version.

### Status of the full-system path

Today `docker-compose.yml` starts PostgreSQL only, which is exactly what V1's completed setup slices required. The application services and the single `docker compose up --build` command are built by `DEMO-01`, the last V1 slice, once the API, the backtest runner, and the Backtest page exist to assemble. Until then, use the host development path below.

The topology grows with the roadmap and never ahead of it: Redis and the market ingest process arrive in V4, the news worker in V5, and the outbox dispatcher and BullMQ backtest workers in V6.

## Local setup (host development path)

V1 needs durable storage only, so local setup starts PostgreSQL through Docker Compose. Redis is not started yet; it arrives with the live fan-out slice (V4).

### 1. Configure environment variables

```powershell
cp .env.example .env
```

`.env.example` lists every variable the system reads, with a safe placeholder for each — no real secret. Edit `.env` if you want different local values; `.env` is git-ignored and never committed.

Host commands load this repository-root `.env` automatically. Variables already set
in the shell or CI environment retain precedence, and a missing `.env` remains valid
for commands that do not need PostgreSQL.

`POSTGRES_HOST=localhost` is correct for this path, where the backend runs on your machine and reaches the container through a published port. A backend running *inside* Compose reaches PostgreSQL by its service name instead, so the full-system path supplies its own value for that variable rather than expecting you to edit `.env`. `DEMO-01` wires this up.

### 2. Start PostgreSQL

```powershell
docker compose up -d
```

This starts one PostgreSQL container (service `postgres` in `docker-compose.yml`), using the variables from `.env`, with a named volume (`postgres_data`) so data survives container restarts.

### 3. Check health

```powershell
docker compose ps
```

The `postgres` service should show `healthy` once its healthcheck (`pg_isready`) passes. `docker compose logs postgres` shows startup output if it does not.

### 4. Stop the topology

```powershell
docker compose down
```

Data persists in the `postgres_data` volume across `docker compose down` / `up`. Add `-v` only if you intend to permanently delete local data.

### 5. Run database migrations

```powershell
pnpm run migrate
```

This applies every pending migration under `apps/backend/migrations/` in filename
order, tracking what it has applied in a `public._migrations` table so re-running the
command is a no-op for migrations already applied. The first migration creates one
PostgreSQL schema per data-owning module; later migrations add tables only to the
schema of the slice that owns that data.

| Schema | Owning module |
|---|---|
| `market` | Market Data (`ARC-MARKET`) |
| `strategy` | Strategy (`ARC-STRATEGY`) |
| `experiment` | Experiment (`ARC-EXPERIMENT`) |
| `news` | News Intelligence (`ARC-NEWS`) |

Only the owning module writes to its schema; see `docs/architecture/architecture-baseline.md`,
sections "Data ownership" and "Persistence rules".

To return the database to an empty state (drops the four schemas and the migrations
tracking table):

```powershell
pnpm run migrate:reset
```

Database-backed tests use the same reset-then-migrate sequence through
`apps/backend/src/platform/test-database.ts`, so each test run gets isolated, clean
schema state with no manual steps. Point `.env` at a dedicated test database before
running `pnpm run test` if you do not want tests touching your local dev database.

### How the backend config loader works

`apps/backend/src/platform/root-env.ts` loads the optional root `.env`, then
`apps/backend/src/platform/config.ts` exports `loadConfig()`, a typed loader that reads
the PostgreSQL values from `process.env`. It is fully typed (no `any`, no silent
`undefined`) and fails fast: a missing or blank required variable, or an invalid port,
throws an error naming that exact variable instead of letting the app start with a bad
config. See the adjacent tests for the expected loading and validation behavior.

### Starting the API process

The API process is a NestJS HTTP server exposing health and normalized candle-history
endpoints. PostgreSQL must be running because Market Data supplies the candle query
port.

```powershell
pnpm run start:api
```

This runs `apps/backend/src/main.api.ts` (the entry command for the API/WebSocket process role) via `tsx`. Once it logs that it is listening, check it:

```powershell
curl http://localhost:3000/health
```

After loading a closed range with `market:backfill`, read it through:

```powershell
curl "http://localhost:3000/market/candles?provider=binance&symbol=BTCUSDT&timeframe=1h&startTime=<ms>&endTime=<ms>"
```

Every request gets an `x-request-id` header on the response: the inbound header's value if the request sent one, otherwise a freshly generated one. Log lines are structured records with a timestamp, level, process role, and that request identifier; they print pretty in development and as raw JSON when `NODE_ENV=production`. Stop the process with Ctrl+C (`SIGINT`) or `SIGTERM`; it shuts down cleanly.

## Next phase

Implementation against the frozen baseline continues as a Walking Skeleton / architecture proof-oriented vertical slice inside **V1 - Backtesting Lab**.

All six V1 setup slices are complete. Market Data now has normalized provider
contracts, Binance history, immutable candle revisions, dataset snapshots, and the
typed candle endpoint; Strategy has its pure contract, descriptor, registry, and
annotation vocabulary. The tracker below remains the authoritative next-work view.

[`implementation-plan/TRACKING.md`](implementation-plan/TRACKING.md) is authoritative for what is done and what may be started next. This section is a summary and can lag; the tracker cannot.

## Full-system integration and demo path

The full-system path brings up every process required for the current version (V1: Backtesting Lab) using Docker Compose.

### 1. Configure environment variables

```powershell
cp .env.example .env
```
Ensure you have copied the example environment variables. `docker-compose.yml` uses them, but overrides `DATABASE_URL` internally to route between containers using Docker network hostnames.

### 2. Start the topology

```powershell
docker compose up --build -d
```

This brings up:
- `postgres`: The database
- `api`: The NestJS API process
- `runner`: The PostgreSQL-backed backtest execution process
- `web`: The React frontend served by Nginx

### 3. Run migrations

The database must be migrated. Run the migration script inside the `api` container (or on your host):
```powershell
docker compose exec api npx tsx apps/backend/src/migrate/migration-runner.ts
```
*(Or simply run `pnpm run migrate` on your host while the stack is running).*

### 4. Walk the demo scenario

Once the stack is healthy, refer to the [V1 Demo Script](docs/demo-script.md) for the explicit steps to verify the version end-to-end.
