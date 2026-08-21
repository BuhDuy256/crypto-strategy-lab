# Crypto Strategy Lab Architecture Baseline

**Status:** FROZEN
**Baseline Version:** v1
**Frozen:** 2026-08-21
**Normative for:** all application implementation after bootstrap

## Scope

This baseline defines the architecture that implementation must follow for the Crypto Strategy Lab MVP and its stated change/failure/scale scenarios. It governs boundaries, ownership, dependency direction, contracts, communication, persistence, reproducibility, deployment roles, and major technology choices.

The reasoning and rejected alternatives are in [`architecture-proposal.md`](architecture-proposal.md). Business values intentionally left open by the source—ranking weights, fee/slippage/fill defaults, exact performance targets, concrete news sources, sentiment model, retention, and authentication—must be explicit versioned configuration or approved requirements; they must not be hidden defaults.

## Architecture style

Use a **modular monolith with selectively separated process roles**:

- one application repository/codebase and coordinated release;
- logical domain/application modules with stable public ports/contracts;
- separate runtime roles for API/WebSocket, market ingestion, CPU-heavy backtest workers, news/sentiment work, and outbox dispatch;
- shared PostgreSQL and Redis infrastructure with explicit semantic limits and data ownership.

Logical boundary does not imply deployment boundary. Do not create domain microservices for v1.

## System boundaries

Inside the system:

- React SPA and public API/WebSocket gateway;
- Market Data, Strategy, Experiment, and News Intelligence modules;
- infrastructure adapters, workers, outbox dispatcher, PostgreSQL, and Redis.

External systems:

- user/operator;
- Binance initially, future exchanges only through adapters;
- configured news providers;
- configured sentiment model runtime.

Real order execution, exchange-account trading, custody, public multi-tenancy, and production security architecture are outside baseline v1.

## Logical modules / bounded contexts

### ARC-API - API / Presentation

Owns HTTP/WebSocket transport, DTO validation, client subscription/session state, push filtering/backpressure, and query composition. It contains no strategy, backtest, evaluation, ranking, or provider-specific business logic.

### ARC-MARKET - Market Data

Owns provider ports/adapters, normalized candles, historical/live ingestion, validation, deduplication, gap detection/recovery, dataset identity/manifests, candle persistence, and provider health.

### ARC-STRATEGY - Strategy

Owns strategy contracts and implementations, normalized signals, descriptors/semantic versions, parameter schemas, registry, composite definitions, combination policies, and `StrategyGenerator` implementations/contracts. It does not own experiment lifecycle or infrastructure.

### ARC-EXPERIMENT - Experiment

Owns immutable experiment specifications, run state/control/stop policy, candidate/job lifecycle, dispatch reconciliation, deterministic backtest simulation, metric evaluation, ranking policy, trades/results, result commit/outbox, leaderboard projection, and experiment/provenance queries.

### ARC-NEWS - News Intelligence

Owns news provider adapters, collection, normalization/deduplication, item/source persistence, sentiment analyzer/model adapters, inference lifecycle/failures, versioned sentiment results, and sentiment-feature queries.

## Responsibility ownership

| Question | Sole owner |
|---|---|
| Who creates/freezes an Experiment and changes its state? | Experiment |
| Who generates a candidate? | Strategy implementation of `StrategyGenerator`; Experiment owns when/how many |
| Who registers/version strategies and combines signals? | Strategy |
| Who simulates trades? | Experiment Backtester |
| Who calculates metrics and rank? | Experiment Evaluator and RankingPolicy |
| Who updates Top-K? | Experiment LeaderboardProjector |
| Who connects/reconnects to exchanges and repairs gaps? | Market Data |
| Who collects news and runs/version sentiment? | News Intelligence |
| Who publishes an integration event? | Module that owns the completed state change, via its outbox |
| Who owns transport/client sessions? | API / Presentation |

## Allowed dependency directions

```text
API/Presentation -> module application/query ports
Experiment -> Strategy public contracts
Experiment -> Market Data dataset/query ports
Experiment -> News Intelligence sentiment-feature port when requested
Infrastructure adapters -> ports they implement
```

Forbidden:

- domain modules depending on web framework, provider payloads, broker, cache, ORM, database adapters, or UI code;
- a module importing another module's repository implementation or writing its tables;
- Strategy calling Market Data providers or persistence directly;
- News Intelligence importing Strategy/Experiment internals;
- direct worker calls that mutate Leaderboard.

## Contracts

The architecture contracts and semantic minimums are:

- `Candle`: provider, symbol, timeframe, open/close time, OHLCV, closed/revision state; identity is provider+symbol+timeframe+open time.
- `DatasetRef`: immutable dataset/version/manifest, provider, symbols, timeframe, range, watermark/snapshot, integrity reference.
- `StrategyDescriptor`: stable strategy ID, semantic version, category/capabilities, parameter schema, required inputs, build binding.
- `Strategy`: supplied context -> normalized `Signal` and optional annotations; no infrastructure access.
- `CompositeStrategy`: ordered strategy refs/versions/params plus combination-policy ID/version/config.
- `StrategyGenerator`: versioned/configured request -> `CandidateStrategy`; generator implementation is opaque downstream.
- `CandidateStrategy`: immutable complete strategy/composition spec plus generator provenance and content hash.
- `ExperimentSpec`: immutable after start; includes every applicable reproducibility input.
- `BacktestJob`: immutable command with job/experiment/candidate IDs, attempt and idempotency key.
- `BacktestResult`: one logical result per idempotency key, with trades/metrics/artifact/build references.
- `LeaderboardEntry`: rebuildable projection linking result and immutable experiment spec.
- `NewsItem`: normalized source/content identity and provenance.
- `SentimentResult`: news ref, label/score, model/artifact/version, input/preprocessing version, timestamp/status.
- Event envelope: event/type/schema/aggregate IDs and versions, timestamps, correlation/causation IDs, payload.

Contract schemas must be versioned before crossing a process boundary.

## Runtime communication

- SPA -> API: HTTP for commands/queries and WebSocket for subscription control, market updates, progress, degradation, and leaderboard notifications.
- API -> modules: in-process application/query ports.
- API/coordinator -> workers: Celery commands through Redis, delivered at least once.
- Worker -> durable state: PostgreSQL transaction.
- Durable state -> integration events: PostgreSQL transactional outbox then dispatcher to Redis-backed consumers/notifications.
- Market ingest -> API live fan-out: Redis Pub/Sub, explicitly ephemeral; durable snapshots/gap recovery use PostgreSQL.
- Module integration: public commands/queries and versioned integration events only.

Pause/resume/cancel and stop conditions are durable Experiment state. They are not delegated to broker-specific cancellation semantics.

## Events

Durable integration events include:

- `CandleClosed` when a durable consumer requires it;
- `BacktestCompleted`;
- `StrategyEvaluated`;
- `LeaderboardUpdated`;
- `NewsCollected`;
- `SentimentAnalyzed`.

`MarketUpdate` may be ephemeral and is never the source of truth. `BacktestJob` is a command, not a broadcast event.

All durable publication uses an outbox. Consumers use event-ID deduplication/inbox state and aggregate-version checks. Duplicate delivery must be a no-op. Ordering assumptions must be explicit per aggregate/key.

## Data ownership

| Owner | Data |
|---|---|
| Market Data | candles, provider health, dataset manifests/snapshots |
| Strategy | descriptors/versions, schemas, composite definitions, combination policy definitions |
| Experiment | experiments, run state, candidates, jobs/attempts, trades, metrics, results, ranking application, leaderboard projection |
| News Intelligence | news/source state, inference attempts, sentiment results, model/input metadata |
| Each publishing/consuming module | its outbox/inbox records |

## Persistence rules

- Use one PostgreSQL instance initially with module-owned schemas/tables.
- Only the owning module writes its data.
- Started experiment specs and all versions/artifacts referenced by completed results are append-only/immutable.
- Trades, metrics, completion status, and result outbox record commit in one local transaction per logical result.
- Authoritative experiment/results are never reconstructed from the leaderboard projection.
- Redis is not authoritative for experiments, results, candles, news, or provenance.
- Schema migrations must preserve frozen ownership and completed-run provenance.

## Reproducibility rules

A completed result must resolve all applicable values/versions for:

1. strategy IDs/versions/parameters and component order;
2. combination policy/version/config;
3. generator/version/search configuration/search space/seed;
4. dataset identity/manifest/provider/symbol/range/timeframe/watermark;
5. capital, side/position, fee, slippage, fill, rounding, stops and sizing rules;
6. backtest engine/build and deterministic runtime configuration;
7. metric and ranking policy versions/config;
8. news/input-set identity and sentiment model/artifact/input/preprocessing versions when used;
9. every random seed/nondeterminism declaration;
10. attempts, result artifacts/hashes, timestamps, and accepted data-quality exceptions.

No leaderboard row may claim reproducibility from strategy version alone.

## Deployment topology

Initial roles:

1. static React/TypeScript SPA;
2. FastAPI HTTP/WebSocket process;
3. Market ingest process;
4. one or more Celery backtest workers on a dedicated queue;
5. news/sentiment worker on separately routed queues;
6. outbox dispatcher;
7. PostgreSQL;
8. Redis.

Roles may share the same application image/build and use role-specific entry commands. Scale backtest workers first from measured queue demand. API/news/model/database splits require evidence and an architecture review.

## Technology decisions

- Python for backend/domain/worker implementation.
- FastAPI for HTTP and WebSocket gateway.
- React + TypeScript for the single SPA.
- PostgreSQL for durable state and local transactions.
- Redis as Celery broker/coordination/cache where justified and Pub/Sub for ephemeral live fan-out only.
- Celery for routed asynchronous worker commands.
- Docker images and a Docker Compose-style local/demo topology during implementation.

Library/runtime versions must be pinned by implementation dependency locks. Version upgrades do not require architecture review unless they change a contract, semantic guarantee, ownership rule, or topology.

Not selected for v1: arbitrary runtime plugin loading, domain microservices, Kafka, general CQRS, Event Sourcing, Kubernetes, or service mesh.

## Architectural invariants

1. Add MACD through Strategy implementation + descriptor/registration; unrelated core components do not change.
2. Replace search through `StrategyGenerator`; candidate consumers do not change.
3. Add an exchange/news provider only through its adapter and normalized contract.
4. Backtest workers never run inside API request/WebSocket execution.
5. At-least-once work is idempotent; duplicate events cannot change results or rank.
6. News/sentiment failure does not stop market charts or technical backtests.
7. Closed-candle gaps/duplicates are reconciled by Market Data, not the UI.
8. Leaderboard is derived and traceable to immutable Experiment truth.
9. No cross-module table writes or hidden infrastructure dependencies.
10. No architectural technology without a traced problem/scenario/ADR.

## Accepted ADRs

- [ADR-001 - Modular monolith with process-role separation](../adr/ADR-001-modular-monolith-process-roles.md)
- [ADR-002 - Strategy extensibility and search replaceability](../adr/ADR-002-strategy-and-search-contracts.md)
- [ADR-003 - Provider adapters and normalized contracts](../adr/ADR-003-provider-adapters.md)
- [ADR-004 - Asynchronous experiment processing](../adr/ADR-004-asynchronous-experiment-processing.md)
- [ADR-005 - Transactional results and leaderboard projection](../adr/ADR-005-transactional-results-leaderboard.md)
- [ADR-006 - Immutable experiment provenance](../adr/ADR-006-immutable-experiment-provenance.md)
- [ADR-007 - News and sentiment isolation](../adr/ADR-007-news-sentiment-isolation.md)
- [ADR-008 - Realtime delivery and market recovery](../adr/ADR-008-realtime-delivery-recovery.md)

## Deviation procedure

The frozen baseline is normative. Do not silently redesign.

If implementation conflicts with it:

1. stop the affected work;
2. identify this baseline section, related ADR, problem, and quality scenario;
3. describe the conflict and evidence;
4. compare alternatives and consequences;
5. request explicit architecture review;
6. if accepted, create a superseding ADR and a new baseline version without rewriting history.
