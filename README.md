# Crypto Strategy Lab

An architecture-first platform for crypto market data, trading-strategy experimentation,
backtesting, automated candidate search, and leaderboard analysis, with an isolated
news and sentiment capability alongside it.

The project is built around three properties that are hard to add later: **extensibility**
(a new strategy, search method, or data provider does not ripple downstream),
**failure isolation** (news or sentiment breaking must not stop charts or backtests), and
**reproducibility** (any leaderboard row resolves back to the exact frozen inputs that
produced it).

This README is the front door. It orients you and points at the real documents; it is
not the architecture report.

## Current status

- **Architecture:** `FROZEN v1.2`
- **Validation:** `PENDING IMPLEMENTATION PROOFS`
- **Implementation:** `IN PROGRESS`
- **Current product version:** `V5`
- **Last frozen release:** `V5 at v5.1-demo`

`FROZEN` is not `PROVEN`. The baseline is normative for implementation, but its proof
obligations are discharged by recorded evidence, and four of them deliberately are not.
See [Current realization and scope](#current-realization-and-scope).

## What the system does today

| Area | Capability |
|---|---|
| Market data | Binance adapter behind a provider port; normalized, append-only candle history with immutable revisions; dataset snapshots resolved by manifest hash |
| Realtime | Live candle streaming over WebSocket; four independent chart subscriptions, each retimeframable on its own; reconnect with backoff, missing-interval computation, and REST gap recovery |
| Strategies | Six built-in strategies through one pure contract: moving average, RSI, Bollinger Bands, support/resistance, MACD, and news sentiment |
| Composition | Composite strategies from any component set, combined by a versioned policy (majority vote or weighted score) |
| Backtesting | Deterministic backtester with fees and slippage, run in a separate process and a worker thread, never on the API path |
| Evaluation | Total return, win rate, maximum drawdown, and trade count, behind a versioned metric set |
| Search | Two search methods behind one `StrategyGenerator` port (random and grid); three stop conditions; pause, resume, and cancel that survive a restart |
| Leaderboard | Top-K ranking projected from accepted results, with full provenance for every row |
| News and sentiment | RSS collection and model-backed sentiment analysis in a separate worker process, isolated so its failure degrades nothing else |

## Architecture at a glance

| Area | Selection |
|---|---|
| Architecture style | Modular Monolith with selectively separated process roles |
| Core backend | Node.js + TypeScript + NestJS |
| Frontend | React + TypeScript |
| Durable storage | PostgreSQL, the single authoritative truth |
| Backtest execution (V1-V5) | PostgreSQL-backed durable claim/lease queue in a separate runner process (ADR-010) |
| Backtest execution (V6 target) | BullMQ on persistence-configured Redis, **not implemented** |
| Realtime client transport | NestJS WebSocket Gateway |
| Live fan-out | Redis Pub/Sub, best-effort notification only, never durable truth |
| Optional ML runtime | Python only behind `SentimentAnalyzer`, if a model justifies it |

Five logical modules own their own data and expose ports to each other. A logical module
is not automatically a deployment boundary.

### Sentiment analyzer selection

The News worker selects a sentiment adapter at its composition root:

- When `OPENAI_API_KEY` is set, it uses the OpenAI Responses adapter.
- When `OPENAI_API_KEY` is empty, it uses `LocalLexiconSentimentAnalyzer`.

The local analyzer is deterministic, free, and intended for development and demos. It scores a fixed English finance-news lexicon and records the exact `local-lexicon-en` model provenance. It is not a replacement for a trained sentiment model and must not be presented as AI analysis. Both adapters implement the same `SentimentAnalyzer` port, so collection, storage, `SentimentFeature`, and strategy code do not change when the adapter changes.

## High-level project structure

- **ARC-API** — HTTP/WebSocket transport, DTO validation, subscriptions, query composition. No strategy, backtest, ranking, or provider logic.
- **ARC-MARKET** — provider adapters, normalized candles, ingestion, deduplication, gap recovery, datasets, provider health.
- **ARC-STRATEGY** — strategy contracts and implementations, registry metadata, signals, composition policies, `StrategyGenerator` contracts.
- **ARC-EXPERIMENT** — immutable specifications, run control, candidate lifecycle, backtesting, evaluation, ranking, provenance, leaderboard projection.
- **ARC-NEWS** — news collection and normalization, sentiment adapters, inference lifecycle, versioned results.

These boundaries are enforced by a test, not by convention. See
[`evidence-module-boundaries.md`](docs/evidence/evidence-module-boundaries.md).

## Current realization and scope

**V1 through V5 are realized and frozen at `v5.1-demo`.** That covers everything in
[What the system does today](#what-the-system-does-today), assembled and demonstrated
through the documented Docker Compose path.

**V6 is deliberately not implemented.** It is the final asynchronous realization:
BullMQ-based execution, the transactional outbox, inbox deduplication, and the four
proofs that depend on them (`PROOF-SCALE-001`, `PROOF-RETRY-001`, `PROOF-DUP-001`,
`PROOF-OBS-001`). Diagrams and the baseline describe V6 as the target architecture and
label it as such. Nothing about queue scalability, broker retry, duplicate-delivery
safety, or outbox reliability is claimed.

The complete list of what must not be claimed is in
[`docs/final-defense-notes.md`](docs/final-defense-notes.md).

The original Walking Skeleton was the repository's architecture proof-oriented vertical slice.
The roadmap and each version's Definition of Demoable are in
[`implementation-plan/VERSIONS.md`](implementation-plan/VERSIONS.md).
[`implementation-plan/README.md`](implementation-plan/README.md) explains how the plan
works, and [`implementation-plan/TRACKING.md`](implementation-plan/TRACKING.md) is the
authoritative current-state view.

## Architecture decisions

**Reading the architecture for the first time? Start with
[`docs/architecture/architecture-report.md`](docs/architecture/architecture-report.md).**
It describes the architecture as delivered, marks what is and is not implemented, and
answers the eight central architecture questions in one place.

The frozen normative source is
[`docs/architecture/architecture-baseline.md`](docs/architecture/architecture-baseline.md).
Ten accepted decisions record why it looks the way it does:

| ADR | Decision |
|---|---|
| [ADR-001](docs/adr/ADR-001-modular-monolith-process-roles.md) | Modular monolith with process-role separation |
| [ADR-002](docs/adr/ADR-002-strategy-and-search-contracts.md) | Strategy extensibility and search replaceability contracts |
| [ADR-003](docs/adr/ADR-003-provider-adapters.md) | Provider adapters and normalized contracts |
| [ADR-004](docs/adr/ADR-004-asynchronous-experiment-processing.md) | Asynchronous experiment processing |
| [ADR-005](docs/adr/ADR-005-transactional-results-leaderboard.md) | Transactional results and derived leaderboard |
| [ADR-006](docs/adr/ADR-006-immutable-experiment-provenance.md) | Immutable experiment specification and provenance |
| [ADR-007](docs/adr/ADR-007-news-sentiment-isolation.md) | News collection and sentiment isolation |
| [ADR-008](docs/adr/ADR-008-realtime-delivery-recovery.md) | Realtime delivery and market recovery |
| [ADR-009](docs/adr/ADR-009-technology-realization.md) | Technology realization |
| [ADR-010](docs/adr/ADR-010-realization-sequencing-for-asynchronous-backtest-execution.md) | Realization sequencing for asynchronous backtest execution |

Ten diagrams cover the problem tree, decision tree, context, runtime, boundaries, and
flows: [`docs/diagrams/README.md`](docs/diagrams/README.md). Longer reasoning and
trade-offs are in
[`architecture-proposal.md`](docs/architecture/architecture-proposal.md).

## Architecture evidence

**[`docs/evidence/README.md`](docs/evidence/README.md) is the index for reviewers.** It
maps each architecture claim to a recorded proof, a test, or the code, and it also lists
the four proofs that have no evidence and may not be claimed.

Eight architecture proofs have recorded PASS evidence under
[`docs/validation/evidence/`](docs/validation/evidence/). The proofs themselves are
defined in
[`docs/validation/architecture-proof-plan.md`](docs/validation/architecture-proof-plan.md).

## Two run paths

There are two ways to run the project, and they answer different questions. Neither
replaces the other.

| Path | Use it for | What it starts |
|---|---|---|
| **Full-system** | Proving or demonstrating a whole version | Every process role, through one Compose command |
| **Host development** | Coding, testing, debugging, hot reload | Infrastructure in Docker; app processes as `pnpm` commands |

Docker Compose is what proves a version. Host tests passing is not that gate. The rule
lives in [`AGENTS.md`](AGENTS.md); the per-version condition is the
[Compose integration gate](implementation-plan/VERSIONS.md#compose-integration-gate-every-version).

### Full-system path (start here)

```powershell
cp .env.example .env          # every variable the system reads, with safe placeholders
docker compose up --build -d
docker compose exec api pnpm run demo:seed
```

`.env` is git-ignored and holds no real secret by default. Compose reads it for `${VAR}`
values; backend services override `POSTGRES_HOST` to the service name themselves, so you
do not edit `.env` to switch paths. Set real `DEPENDENCY_LOCK_HASH`,
`APPLICATION_COMMIT`, and `WORKER_COMMIT` values: the runner requires explicit build
identity.

`demo:seed` loads the recent candle windows every page opens on (30 days of BTCUSDT at
5m, 15m, 1h, and 4h). Without it the pages correctly report that they have no candles.

The V5 topology is eight services: seven long-running roles plus a one-shot migration.

| Service | Role |
|---|---|
| `postgres` | The authoritative durable store |
| `redis` | Best-effort live notification fan-out only; never durable truth |
| `migrate` | One-shot: applies every pending migration, then exits. `api` and `runner` wait for it |
| `api` | The NestJS HTTP and WebSocket process |
| `runner` | The separate PostgreSQL-backed backtest runner. Scale it with `--scale runner=N` |
| `market-ingest` | The Binance stream and REST recovery process |
| `news-worker` | News collection and sentiment analysis, isolated from everything above |
| `web` | The built React SPA on Nginx, proxying `/api` to `api` |

The SPA is at <http://localhost:8080>, the API at <http://localhost:3000>. Stop with
`docker compose down`; data survives in the `postgres_data` volume unless you add `-v`.

### Host development path

Start infrastructure in containers, run the app on your machine:

```powershell
docker compose up -d postgres redis    # name them explicitly: a bare `up` starts everything
pnpm install                           # after `corepack enable`
pnpm run migrate
pnpm run start:api                     # plus start:ui, start:backtest-runner, start:market-ingest, start:news-worker
```

`POSTGRES_HOST=localhost` in `.env` is correct for this path. Migrations are tracked in
`public._migrations`, so re-running is a no-op; `pnpm run migrate:reset` returns the
database to empty.

Each data-owning module owns exactly one schema, and only that module writes to it:
`market`, `strategy`, `experiment`, `news`.

### Commands

| Command | Purpose |
|---|---|
| `pnpm run typecheck` | Type-check every workspace package |
| `pnpm run lint` | ESLint |
| `pnpm run test` | The Vitest suite, including the architecture boundary rules |
| `pnpm run migrate` / `migrate:reset` | Apply / drop migrations |
| `pnpm run demo:seed` | Load the candle windows the demo pages need |
| `pnpm run market:backfill -- --symbol BTCUSDT --timeframe 1h --startTime <ms> --endTime <ms>` | Load one explicit closed range |
| `powershell -File scripts/check-repo-governance.ps1` | Governance, link, and skill-mirror validation |

Database-backed tests require a dedicated test database (`csl_test_*`) and an explicit
guard token; the guard refuses to reset anything else.

## Demo

[`docs/demo-script.md`](docs/demo-script.md) is the canonical walkthrough: realtime
charts, the strategy catalog, a manual composite, a backtest, automated composite
discovery, the leaderboard, provenance, and a live news-failure isolation step.

Read it together with [`docs/final-defense-notes.md`](docs/final-defense-notes.md),
which lists the known limitations and every claim that evidence does **not** support.

## Known limitations

- **Single operator.** No registration, login, session, token, user entity, or
  role-based access exists anywhere, and none should be implied. Account ownership
  arrived as a late requirement and was deliberately not built.
- **Combination-policy options in the frontend are not metadata-driven.** The backend
  registry is versioned and extensible; what is missing is a policy catalog endpoint, so
  adding a policy currently also needs a frontend change. This is a UI integration
  limitation, not a domain architecture limitation.
- **Sentiment as a strategy is not reachable from the Backtest page.** The page can only
  supply price bars, so it offers only strategies whose declared inputs it can satisfy.
  The capability is exercised over the API and in tests.
- **Performance is measured once, on one laptop, at small scale.** No throughput figure,
  no scaling factor, and no latency target. See
  [`evidence-performance-and-scale.md`](docs/evidence/evidence-performance-and-scale.md).

## Repository guide

```text
crypto-strategy-lab/
├── apps/backend/          NestJS backend: modules/, platform/, architecture/, migrations/
├── apps/web/              React SPA
├── packages/api-contracts/  Shared request/response contracts
├── docs/
│   ├── architecture/      Frozen baseline (normative), proposal, comparisons
│   ├── adr/               ADR-001 … ADR-010
│   ├── diagrams/          Ten architecture views
│   ├── evidence/          Reviewer evidence index  <- start here for claims
│   ├── validation/        Proof plan and recorded PROOF-* evidence
│   ├── demo-script.md     The canonical walkthrough
│   └── final-defense-notes.md   Limitations and unsupported claims
├── implementation-plan/   Roadmap, per-version scope, live tracker, journal
├── frozen_implementation_plan/  The final pre-defense release plan (closed)
└── scripts/               Governance, seeding, smoke, and measurement scripts
```

### Working on the project

1. `corepack enable`, then `pnpm install`. The package manager is pinned in `package.json`.
2. Skills are committed for both Claude Code and Codex, so there is no setup step.
3. [`AGENTS.md`](AGENTS.md) is the single entry point for shared project policy;
   `CLAUDE.md` imports it. It routes to the plan, the tracker, the journal, and the
   coding standards.

[`docs/agents/development-workflow.md`](docs/agents/development-workflow.md) routes each
phase of work to a skill, its authoritative inputs, and its gate.
[`CODING_STANDARDS.md`](CODING_STANDARDS.md) says how the code itself is written.

Skills live canonically in `.agents/skills/`, mirrored byte-identically into
`.claude/skills/` and `.codex/skills/`. Change all three in one commit and update
`treeSha256` in `.agents/skill-lock.yaml`; the governance validator fails on drift.
