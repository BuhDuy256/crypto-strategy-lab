# Crypto Strategy Lab

Crypto Strategy Lab is an architecture-first platform for crypto market data, strategy experimentation, backtesting, candidate search/evaluation, and leaderboard analysis. It also includes an isolated news/sentiment capability and is designed around extensibility, failure isolation, and reproducible experiment results. The repository contains the accepted architecture and validation plan, plus the implementation built against it so far.

## Current project status

- **Architecture:** `FROZEN v1.1`
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
│   │   └── ADR-001 ... ADR-009
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
7. [Frozen architecture baseline v1.1](docs/architecture/architecture-baseline.md) — normative source
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

1. Clone, then `pnpm install`.
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

Open product/configuration choices remain intentionally undecided: ranking weights and tie-breaking; capital, fee, slippage, fill, sizing, and stop defaults; concrete news providers and sentiment model; measurable performance targets and test hardware; authentication; and retention. The team should confirm or schedule these decisions rather than allowing hidden implementation defaults.

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

## Local setup

V1 needs durable storage only, so local setup starts PostgreSQL through Docker Compose. Redis is not started yet; it arrives with the live fan-out slice (V4).

### 1. Configure environment variables

```powershell
cp .env.example .env
```

`.env.example` lists every variable the system reads, with a safe placeholder for each — no real secret. Edit `.env` if you want different local values; `.env` is git-ignored and never committed.

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
command is a no-op for migrations already applied. The first migration
(`0001_create_module_schemas.sql`) creates one empty PostgreSQL schema per
data-owning module. No tables exist yet; each schema gets its tables from the slice
that owns that data.

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

`apps/backend/src/platform/config.ts` exports `loadConfig()`, a typed loader that reads the same PostgreSQL variables from `.env.example` out of `process.env`. It is fully typed (no `any`, no silent `undefined`) and fails fast: a missing or blank required variable, or an invalid port, throws an error naming that exact variable instead of letting the app start with a bad config. See `apps/backend/src/platform/config.test.ts` for the loader's expected behavior. Nothing in the API process (below) imports this loader yet; that wiring arrives in a later slice.

### Starting the API process

The API process is a NestJS HTTP server exposing a health endpoint. It does not need PostgreSQL running.

```powershell
pnpm run start:api
```

This runs `apps/backend/src/main.api.ts` (the entry command for the API/WebSocket process role) via `tsx`. Once it logs that it is listening, check it:

```powershell
curl http://localhost:3000/health
```

Every request gets an `x-request-id` header on the response: the inbound header's value if the request sent one, otherwise a freshly generated one. Log lines are structured records with a timestamp, level, process role, and that request identifier; they print pretty in development and as raw JSON when `NODE_ENV=production`. Stop the process with Ctrl+C (`SIGINT`) or `SIGTERM`; it shuts down cleanly.

## Next phase

Implementation against the frozen baseline continues as a Walking Skeleton / architecture proof-oriented vertical slice inside **V1 - Backtesting Lab**.

All six V1 setup slices (`SETUP-01` through `SETUP-06`) are complete: pnpm workspace and quality commands, PostgreSQL topology and the typed config loader, the NestJS API skeleton with the five frozen module boundaries and structured logging, module-owned migrations, automated architecture boundary tests, and the React SPA shell with a typed API client. Domain implementation has not started; `MKT-01` and `STRAT-01` are the next available slices.

[`implementation-plan/TRACKING.md`](implementation-plan/TRACKING.md) is authoritative for what is done and what may be started next. This section is a summary and can lag; the tracker cannot. 