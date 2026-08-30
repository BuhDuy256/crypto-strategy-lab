# Legacy and Current Architecture Comparison

**Compared repositories:**

- Current: `crypto_strategy_lab_v1`
- Legacy: `final_cryptolab`
- Date inspected: 2026-08-23

The current-code snapshot is pinned to commit `b823d45`, before the uncommitted
MKT-01 implementation that followed this comparison. Architecture v1.2 and ADR-010
were included in the final report, but the code inventory intentionally describes
that fixed pre-MKT-01 snapshot.

The path supplied for the legacy repository, `final/_cryptolab`, does not exist in
the workspace. The existing repository at `../final_cryptolab` matches the old
Crypto Strategy Lab project and is used as the legacy source in this report.

This report compares both architecture intent and code that exists. A design in a
document is not counted as implemented unless matching source or tests also exist.
It does not approve a new architecture decision.

## Executive conclusion

The current architecture keeps the best core idea from the legacy system: a
modular monolith with provider adapters, pure strategy logic, a separate long-running
work role, PostgreSQL as durable truth, and a React SPA behind backend contracts.
It improves the old direction in five important ways:

1. It reduces overlapping module ownership to five clear bounded contexts.
2. It separates durable asynchronous delivery from best-effort live notification.
3. It defines transaction, idempotency, and projection recovery rules.
4. It expands reproducibility from a small provenance record to a complete immutable
   experiment specification.
5. It turns architecture claims into named proof plans and automated boundary rules.

The main trade-off is that the current repository restarted implementation on a new
Node.js/TypeScript stack. The legacy repository already has strict domain models,
Market and News provider ports, Binance normalization fixtures, error conventions,
CI, and dependency-aware health checks. The current repository has a stronger target
architecture but less implemented domain behavior today. Its V1 work should reuse
the legacy behavior and test ideas, not copy the Python implementation or freeze the
legacy contracts unchanged.

Sources: [current baseline](architecture-baseline.md),
[current implementation tracker](../../implementation-plan/TRACKING.md),
legacy baseline (`final_cryptolab/docs/01_ARCHITECTURE_BASELINE.md`), and
legacy integrated status (`final_cryptolab/docs/03_PROJECT_STATUS.md`).

## Snapshot: target architecture versus code today

| Concern | Legacy target | Legacy code at last recorded state | Current target | Current code at inspection time |
|---|---|---|---|---|
| Backend | Python 3.13, FastAPI | FastAPI bootstrap, health, errors, logging, config, SQLAlchemy/Alembic | Node.js, TypeScript, NestJS | NestJS API, five module shells, logging, config, `pg` migration support |
| Frontend | React, TypeScript, Vite | Health shell and tests | React, TypeScript, Vite | Five routes, typed health client, placeholder feature pages |
| Domain contracts | Shared Pydantic `v0.1` contracts | Candle, Signal, strategy, backtest, metrics, news, sentiment implemented | Module-owned domain contracts plus separate browser DTO package | Only browser `HealthResponse` is implemented; V1 domain contracts are next |
| Database | PostgreSQL 17 | Alembic baseline; no domain schema or tables | PostgreSQL, module-owned schemas | Four empty schemas exist: `market`, `strategy`, `experiment`, `news` |
| Async | Celery over Redis | Planned; no Celery dependency or worker implementation | BullMQ/Redis final path; PostgreSQL executor is the approved staged path before V6 | No executor, broker, outbox, or worker yet |
| Live path | Binance WS, backend WS, Redis support | Planned; mapper exists only for REST fixture | Separate market ingest, Redis Pub/Sub, NestJS Gateway, snapshot recovery | Not implemented in V1 foundation |
| Architecture enforcement | Two Python import scans plus review | Implemented | Six source-tree dependency rules plus proof plan and governance validator | Boundary test and governance automation implemented; CI is not yet present |

Evidence: legacy technology ADR (`final_cryptolab/docs/adr/ADR-002-technology-stack.md`),
legacy contracts (`final_cryptolab/backend/app/shared/contracts/`),
legacy migration (`final_cryptolab/backend/migrations/versions/20260817_0001_schema_baseline.py`),
[current technology ADR](../adr/ADR-009-technology-realization.md),
[current migration](../../apps/backend/migrations/0001_create_module_schemas.sql),
[current contract package](../../packages/api-contracts/src/index.ts), and
[current boundary rules](../../apps/backend/src/architecture/boundary-rules.ts).

## 1. Logical boundaries and ownership

### Legacy structure

The legacy baseline names `market`, `strategy`, `experiment`, `search`,
`leaderboard`, `news`, `sentiment`, `api`, `infrastructure`, and `observability` as
separate modules. This gives every named feature a visible home, but it also creates
unclear ownership around one business lifecycle:

- Search generates candidates, but Experiment owns backtesting.
- Leaderboard consumes experiment results but owns ranking output.
- News and Sentiment are separate modules even though they share one product
  capability and lifecycle.

The legacy dependency rules are correct in direction, but the code-level test only
checks forbidden framework/infrastructure imports in `app/modules` and forbidden
imports in shared contracts. It does not encode every allowed module edge or stop a
consumer from reaching another module's internal files. See the
legacy baseline module table (`final_cryptolab/docs/01_ARCHITECTURE_BASELINE.md`)
and legacy architecture test (`final_cryptolab/backend/tests/test_architecture.py`).

### Current structure

The current architecture uses five logical modules:

- API / Presentation
- Market Data
- Strategy
- Experiment
- News Intelligence

Search coordination, evaluation, ranking, and leaderboard projection are owned by
Experiment. Candidate generation remains replaceable through a Strategy-owned
`StrategyGenerator`. Collection and sentiment remain separate components and ports,
but both belong to News Intelligence. This removes module-to-module handoffs without
removing the required seams. See
[current responsibility ownership](architecture-baseline.md#responsibility-ownership),
[ADR-002](../adr/ADR-002-strategy-and-search-contracts.md), and
[ADR-007](../adr/ADR-007-news-sentiment-isolation.md).

The current source also enforces six explicit rules: index-only public surfaces,
an allow-list for module edges, domain purity, platform isolation, no direct access
to module internals, and browser access only to public API contracts. Each rule has
a synthetic failure test and the real tree is scanned. See
[boundary-rules.ts](../../apps/backend/src/architecture/boundary-rules.ts) and
[boundary.test.ts](../../apps/backend/src/architecture/boundary.test.ts).

**Assessment:** boundary design and executable enforcement are stronger in the
current repository. The risk moves from unclear ownership to implementation cost:
the public ports named by the design still need to be built and exported through
each module's `index.ts`.

## 2. Contracts and compatibility

### What the legacy repository already proves

The legacy system has immutable Pydantic models that reject unknown fields, require
UTC timestamps, and use `Decimal` for price, money, and ratios. It implements:

- canonical `Candle` identity and OHLC validation;
- normalized `Signal`, `StrategyDefinition`, and `CompositeDefinition`;
- `BacktestRequest`, trades, equity points, metrics, result status, error details,
  and a small `Provenance` record;
- normalized `NewsItem` and versioned `SentimentResult`;
- JSON examples and round-trip/invalid-payload tests.

See legacy common contract rules (`final_cryptolab/backend/app/shared/contracts/common.py`),
market contract (`final_cryptolab/backend/app/shared/contracts/market.py`),
strategy contract (`final_cryptolab/backend/app/shared/contracts/strategy.py`),
experiment contract (`final_cryptolab/backend/app/shared/contracts/experiment.py`),
news contract (`final_cryptolab/backend/app/shared/contracts/news.py`), and
contract tests (`final_cryptolab/backend/tests/test_contract_validation.py`).

The legacy `MarketDataProvider` and `NewsProvider` are framework-free async Python
protocols with immutable queries and stable error categories. The Binance REST mapper
normalizes a fixture without live network access. See
legacy Market port (`final_cryptolab/backend/app/modules/market/ports.py`),
legacy Binance mapper (`final_cryptolab/backend/app/modules/market/mappers.py`),
legacy Market tests (`final_cryptolab/backend/tests/test_market_provider.py`),
and legacy News port (`final_cryptolab/backend/app/modules/news/ports.py`).

### What changes in the current architecture

The current contract model is more precise at lifecycle level:

- `DatasetRef` makes the tested candle set immutable and content-addressed.
- `StrategyDescriptor` separates discoverable metadata and parameter schema from a
  strategy instance.
- `CandidateStrategy` carries generator provenance and a content hash.
- `ExperimentSpec` owns all run inputs and becomes immutable at start.
- `BacktestJob` has attempt and idempotency identity.
- `BacktestResult` must resolve full trade data and complete provenance.
- `LeaderboardEntry` is explicitly a rebuildable projection, not truth.
- Process-crossing events have a versioned envelope.

See [current contracts](architecture-baseline.md#contracts),
[immutable provenance ADR](../adr/ADR-006-immutable-experiment-provenance.md), and
[V1 Market plan](../../implementation-plan/01-market-and-realtime.md).

The browser contract package is intentionally separate from future internal
messaging contracts. This is a useful improvement over the legacy shared contract
folder because it prevents the SPA from importing worker/event messages. Today,
however, it only contains `HealthResponse`, so the current domain contract layer is
not yet functionally equal to the legacy one. See
[api-contracts](../../packages/api-contracts/src/index.ts) and
[setup contract-package rule](../../implementation-plan/00-setup-and-walking-skeleton.md).

**Assessment:** the current contract design is richer, but the legacy repository is
ahead in executable contract behavior. V1 must close that gap before the stronger
design has practical value.

## 3. Runtime topology and technology realization

Both repositories choose a modular monolith and separate long-running or CPU-heavy
work from interactive HTTP/WebSocket execution. They differ in technology and in how
precisely runtime roles are defined.

The legacy direction uses FastAPI for API/WebSocket, Python for the worker, Celery
over Redis, PostgreSQL, and React. Its Compose file already starts PostgreSQL and
Redis, but Celery is not listed in the Python dependencies and no worker entry point
exists. Therefore the worker topology is an accepted design, not implemented
behavior. See legacy ADR-001 (`final_cryptolab/docs/adr/ADR-001-modular-monolith-and-worker.md`),
legacy backend dependencies (`final_cryptolab/backend/pyproject.toml`), and
legacy Compose file (`final_cryptolab/docker-compose.yml`).

The current direction uses one TypeScript build with NestJS module composition and
role-specific entry commands for API/WebSocket, market ingest, backtest workers,
news/sentiment work, and outbox dispatch. Optional Python is limited to an adapter
behind `SentimentAnalyzer`. This gives the core API, coordinator, worker, and domain
contracts one language and dependency lock. See
[ADR-001](../adr/ADR-001-modular-monolith-process-roles.md) and
[ADR-009](../adr/ADR-009-technology-realization.md).

The approved realization sequence keeps the process boundary but uses a PostgreSQL
executor during early product versions, then replaces that adapter with BullMQ in
V6. This stages infrastructure without changing the `BacktestExecutor` port or the
domain. See
[ADR-010](../adr/ADR-010-realization-sequencing-for-asynchronous-backtest-execution.md)
and [planned realization evolution](../../implementation-plan/VERSIONS.md#planned-realization-evolution).

The current V1 Compose file starts only PostgreSQL. This is deliberate version
scoping, but it means the current code does not yet provide the dependency-aware
PostgreSQL/Redis health path that the legacy walking skeleton had. See
[current Compose](../../docker-compose.yml),
[current health controller](../../apps/backend/src/modules/api/health.controller.ts),
and legacy FND-10 evidence (`final_cryptolab/docs/status/updates/FND-10.md`).

**Assessment:** the current final topology is clearer and safer. The staged topology
is also smaller for V1. The immediate regression is operational visibility: current
health reports process liveness only, while the legacy health response checked its
active dependencies.

## 4. Data ownership and persistence

The legacy baseline assigns data groups to modules and states that PostgreSQL is the
source of truth. The code has SQLAlchemy metadata and an Alembic baseline, but the
first migration creates no schemas or domain tables. Ownership is a documented rule,
not a database-visible structure. See
legacy data ownership (`final_cryptolab/docs/01_ARCHITECTURE_BASELINE.md`),
legacy database support (`final_cryptolab/backend/app/infrastructure/database.py`),
and legacy migration (`final_cryptolab/backend/migrations/versions/20260817_0001_schema_baseline.py`).

The current repository creates one PostgreSQL schema for each data-owning bounded
context. The migration is idempotent and creates no early domain tables. This makes
ownership visible before repositories exist and supports later checks against
cross-module writes. See
[current schema migration](../../apps/backend/migrations/0001_create_module_schemas.sql)
and [current persistence rules](architecture-baseline.md#persistence-rules).

The current baseline also adds stronger result acceptance rules: result identity,
metrics, completion state, provenance, outbox state, and full trade data or its
immutable content-addressed reference must commit as one local transaction. The
leaderboard is derived and rebuildable. The legacy baseline says Experiment is the
source of truth and Leaderboard may be rebuildable, but does not define this atomic
acceptance invariant. See
[ADR-005](../adr/ADR-005-transactional-results-leaderboard.md) and
legacy data ownership (`final_cryptolab/docs/01_ARCHITECTURE_BASELINE.md`).

**Assessment:** current data ownership and result consistency are materially
stronger. They are still claims until the V1 Experiment migrations and integration
tests exist.

## 5. Asynchronous processing and failure semantics

The legacy architecture correctly says long-running backtests must use a separate
worker and that job payloads need versions and idempotency keys. It lists a draft
event catalogue and Redis/Celery delivery, but leaves ACK, retry, dead-letter,
reconciliation, and result-publication behavior for later decisions. See
legacy contract-first ADR (`final_cryptolab/docs/adr/ADR-003-contract-first-integration.md`)
and legacy event catalogue (`final_cryptolab/docs/01_ARCHITECTURE_BASELINE.md`).

The current architecture defines the full correctness path:

```text
PostgreSQL state/result/outbox transaction
  -> dispatcher
  -> BullMQ durable enqueue acknowledgement
  -> idempotent consumer with inbox/version checks
  -> PostgreSQL projection
  -> optional Redis Pub/Sub UI notification
```

It explicitly treats BullMQ delivery as at-least-once, Redis Pub/Sub as ephemeral,
and PostgreSQL as recovery truth. It also keeps pause, resume, cancel, and stop
conditions in Experiment state rather than broker state. See
[runtime communication](architecture-baseline.md#runtime-communication),
[ADR-004](../adr/ADR-004-asynchronous-experiment-processing.md), and
[ADR-005](../adr/ADR-005-transactional-results-leaderboard.md).

**Assessment:** the current async architecture is much more complete and testable.
Its cost is more infrastructure and more failure modes. The staged executor reduces
that cost for V1, but V6 still needs proof that the adapter replacement preserves
the same domain behavior.

## 6. Reproducibility

The legacy `Provenance` model records strategy definition/version, candidate
version, dataset ID, engine version, and score version. This is useful but cannot by
itself reproduce execution assumptions, exact dependency/build identity, full data
revision, model inputs, or every random source. See
legacy Provenance (`final_cryptolab/backend/app/shared/contracts/experiment.py`).

The current baseline requires a completed result to resolve ten categories of
inputs, including strategy order and parameters, generator configuration and seed,
dataset manifest and watermark, fee/slippage/fill/sizing/stops, engine and build
identity, metric/ranking policy, sentiment inputs and model artifacts, all random
seeds, attempts, hashes, and accepted data-quality exceptions. See
[current reproducibility rules](architecture-baseline.md#reproducibility-rules),
[provenance map](../diagrams/09-reproducibility-provenance-map.md), and
[PROOF-REP-001](../validation/architecture-proof-plan.md).

**Assessment:** this is the largest architectural improvement. The old contracts can
seed tests, but their provenance shape must not be copied as the complete current
model.

## 7. Governance and delivery control

The legacy repository has strong team rules: one task per branch, explicit owner
approval for architecture and shared contracts, task handoff reports, a shared
project-status document, issue templates, CODEOWNERS, and five CI jobs. See
legacy AGENTS.md (`final_cryptolab/AGENTS.md`),
legacy status process (`final_cryptolab/docs/03_PROJECT_STATUS.md`), and
legacy CI (`final_cryptolab/.github/workflows/ci.yml`).

The current repository adds a normative source hierarchy, a versioned frozen
baseline, immutable ADR history, plan slices as the work unit, a live tracker,
version-entry gates, a durable journal, local checkpoints, a proof plan, and a
governance validator that checks the freeze record and agent-skill mirrors. See
[current AGENTS.md](../../AGENTS.md),
[plan workflow](../../implementation-plan/README.md),
[tracker](../../implementation-plan/TRACKING.md), and
[governance validator](../../scripts/check-repo-governance.ps1).

The current repository does not yet contain a GitHub Actions workflow. This is a
real delivery regression from the legacy repository: local architecture and quality
checks are stronger, but they are not yet enforced on every pull request.

**Assessment:** current governance is more rigorous and more suitable for several
AI-assisted contributors. It is also heavier to read and maintain. The missing CI
must be treated as an implementation gap, not hidden by the quality of local rules.

## 8. Testability and architecture evidence

The legacy repository has valuable executable evidence:

- strict contract validation and example round trips;
- fixture-based Market and News provider tests with no live network;
- API error, request correlation, database, migration, health, and frontend tests;
- CI jobs for backend lint/test, frontend lint/test/build, and Compose validation.

See legacy backend tests (`final_cryptolab/backend/tests/`),
legacy frontend tests (`final_cryptolab/frontend/src/`), and
legacy CI (`final_cryptolab/.github/workflows/ci.yml`).

The current repository improves architecture-specific test design with six boundary
rules and twelve named proof obligations for replaceability, realtime recovery,
scale, retries, duplicate events, isolation, observability, control, and
reproducibility. See
[current boundary tests](../../apps/backend/src/architecture/boundary.test.ts),
[proof plan](../validation/architecture-proof-plan.md), and
[proof coverage map](../diagrams/10-proof-coverage-map.md).

Most current proofs are intentionally pending because the domain behavior does not
exist yet. The design must not be described as proven until those tests and demos
run against the assembled topology.

## 9. Improvements, regressions, and risks

### Clear improvements

- Five bounded contexts replace several overlapping feature modules.
- Cross-module public surfaces and allowed edges are machine checked.
- Browser DTOs and internal messaging contracts are separated.
- Module data ownership is visible in PostgreSQL schemas.
- Result acceptance, outbox dispatch, idempotency, and projection recovery are
  defined together.
- Redis Pub/Sub is no longer confused with durable delivery.
- Experiment reproducibility covers all material inputs and artifacts.
- Version demos and named architecture proofs create stronger acceptance evidence.

### Current regressions or incomplete areas

- Domain contracts already implemented in legacy Python do not yet exist in current
  TypeScript.
- The current Binance adapter, Market provider, News provider, and their fixture
  tests have not yet been rebuilt.
- Current health checks only process liveness, not active dependencies.
- Current CI is absent while the legacy repository has five working CI jobs.
- The new governance and proof system has more maintenance cost and can slow a small
  team if tracker and code stop agreeing.
- The final async topology is more reliable but much more complex than the legacy
  code that was actually running; it must earn that complexity through the planned
  proofs.

## 10. Reuse and migration implications for current V1

| Legacy asset or idea | V1 use | Reuse guidance | Main caution |
|---|---|---|---|
| Binance kline fixture and mapper tests | `MKT-01`, `MKT-02` | Reuse payload samples and expected normalization cases as TypeScript test vectors | Do not copy Python/Pydantic types or assume the old timestamp/decimal representation is the new public contract |
| Candle validation rules | `MKT-01` | Reuse OHLC invariants, non-negative volume, closed-state checks, and provider-neutral identity tests | Current Candle also needs revision semantics and later DatasetRef support |
| `MarketDataProvider` behavior | `MKT-01` | Reuse the port intent, immutable query idea, stable error taxonomy, and fake-provider pattern | Current port also supports the wider Market capability model; exact TypeScript signatures follow the accepted MKT-A decision |
| Strict Pydantic contract examples | MKT/STRAT/EXP contract tests | Convert them to framework-free TypeScript fixtures and runtime validation tests where a process/API boundary needs it | Do not create one global domain-contract dumping ground; current ownership is module-local |
| Signal and strategy contract semantics | `STRAT-01` | Reuse BUY/SELL/HOLD, bounded strength, version, reasons, and immutable definition test ideas | Current design separates descriptor, implementation binding, annotations, candidate, and generator provenance |
| Backtest trade/equity/metric examples | `EXP-01` to `EXP-03` | Reuse simple golden examples and invalid status/result cases | Legacy `BacktestRequest` and `Provenance` are incomplete for current reproducibility rules |
| Provider fake/error pattern | `MKT-01`, later `NEWS-01` | Reuse deterministic fake adapters and network-free conformance tests | Error codes and public shape must follow current module ownership and accepted contracts |
| Structured logging and correlation tests | later platform work | Reuse redaction and correlation scenarios | Current system needs process-role, job, correlation, and causation identity across roles |
| Legacy CI job coverage | future CI slice | Reuse the coverage categories: lint, test, frontend build, Compose validation | Commands and caches must be rewritten for pnpm/TypeScript/NestJS, and current governance/proof checks must be added |

Safe reuse is therefore mostly **behavioral evidence**: fixtures, invariants, error
cases, golden outputs, and failure scenarios. Direct source copying would carry the
old runtime, shared-contract ownership, naming, and incomplete provenance into the
new architecture.

## 11. V1 impact summary

The current V1 boundary is sound for implementation. The legacy repository provides
useful reference behavior for the first Market and Strategy slices, but it does not
remove the need to define and test current TypeScript contracts.

For V1, the most important architecture-preserving sequence is:

1. Implement the approved Market contract and provider conformance suite.
2. Build the Binance historical adapter using deterministic legacy-style fixtures.
3. Persist immutable candle revisions and create a stable dataset manifest.
4. Define Strategy contracts and one MA implementation without infrastructure
   imports.
5. Freeze the complete ExperimentSpec before backtest execution.
6. Keep the backtest runner outside HTTP execution behind `BacktestExecutor`.
7. Accept the result and provenance as durable Experiment truth before exposing UI
   projections.

This sequence is already represented in the
[V1 tracker](../../implementation-plan/TRACKING.md) and
[version plan](../../implementation-plan/VERSIONS.md). Any future change to public
contracts, module ownership, dependency direction, persistence ownership, or runtime
communication still requires explicit architecture review under
[AGENTS.md](../../AGENTS.md).
