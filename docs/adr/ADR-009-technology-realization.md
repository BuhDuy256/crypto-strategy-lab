# ADR-009 - Technology Realization for Baseline v1.1

**Status:** ACCEPTED
**Decision ID:** D-12
**Related Problem IDs:** P-1, P-2, P-3, P-4, P-6
**Related Scenario IDs:** QA-MOD-001, QA-MOD-002, QA-MOD-003, QA-SCAL-001, QA-REL-001, QA-REL-002, QA-ISO-001, QA-ISO-002, QA-RT-001, QA-OBS-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

The frozen architecture requires visible logical boundaries for API/Presentation, Market Data, Strategy, Experiment, and News Intelligence; controlled dependency directions; exported framework-independent ports; replaceable adapters; coherent HTTP/WebSocket transport; separate CPU-heavy workers; durable PostgreSQL truth; and safe at-least-once processing. The v1 Python/FastAPI/Celery realization was capable of implementing those decisions, but no ASR requires Python for the whole backend. The owner prefers the Node.js ecosystem, and the repository will be developed heavily by AI coding agents, making framework-visible structural guardrails valuable.

The sentiment requirement is a capability behind `SentimentAnalyzer`, not a mandate for the core backend language. This ADR changes the realization, not the problem tree, logical modules, ownership, or domain contracts.

## Architecture forces

- Logical modules and their public surfaces must be visible enough for dependency/import tests and code review.
- Port/adapter bindings need an explicit composition mechanism without introducing framework types into domain contracts.
- HTTP controllers and WebSocket sessions need consistent dependency injection, validation, and lifecycle composition.
- Backtests must run outside interactive API/WebSocket execution and scale by worker process count.
- Correctness-relevant work must survive process failures and tolerate retries/duplicates.
- The selected ecosystem should fit owner experience when no ASR dictates another language.
- Optional ML-specific dependencies must remain isolated behind the existing sentiment boundary.

## Candidates

| Core candidate | Fit | Costs / risks |
|---|---|---|
| Express + TypeScript | Small runtime surface and full composition freedom | Module boundaries, DI, exports, lifecycle, and architecture guardrails are project conventions that must be designed and enforced locally |
| NestJS + TypeScript | Framework-supported modules, provider exports, DI, controllers, gateways, validation/lifecycle integration, and an inspectable application graph map naturally to the frozen architecture | Framework conventions and decorators add coupling at transport/composition edges; careless module imports or global providers can still violate boundaries |
| FastAPI + Python | Capable HTTP/WebSocket framework and strong access to Python data/ML libraries | Does not provide an architecture requirement advantage here; conflicts with owner ecosystem preference and would let an optional ML implementation dictate the core runtime |

No candidate is selected for performance superiority. Express and FastAPI can implement the architecture; the difference is structural fit, enforcement cost, and ecosystem constraint.

For asynchronous work, the credible continuation choices were retaining Celery/Redis with a cross-language worker/runtime split or using BullMQ/Redis in the selected Node.js/TypeScript core. BullMQ is selected to keep initial API/coordinator/workers in one language and contract/build ecosystem. PostgreSQL polling remains a simpler-dependency fallback but would require custom claiming, retry, stalled-work, and operational controls.

## Decision

Use:

- React + TypeScript for the SPA;
- Node.js + TypeScript for the core application and initial workers;
- NestJS Modules as composition support for the frozen logical modules;
- NestJS Controllers for HTTP and a NestJS WebSocket Gateway for realtime transport;
- PostgreSQL for authoritative durable state and local transactions;
- BullMQ with persistence-configured Redis for durable asynchronous commands and correctness-relevant outbox delivery;
- Redis Pub/Sub only for best-effort live/UI notification after authoritative state or projection commit;
- Docker images with a Docker Compose-style local/demo topology.

The logical-to-framework mapping is:

```text
ARC-MARKET      -> MarketModule
ARC-STRATEGY    -> StrategyModule
ARC-EXPERIMENT  -> ExperimentModule
ARC-NEWS        -> NewsModule
ARC-API         -> ApiModule / transport composition
```

This mapping supports the architecture but does not define bounded contexts by itself. Cross-module consumers depend only on exported application/domain ports. They must not import another module's repository, adapter, ORM model/repository, or private provider. NestJS decorators/types stay at composition and transport edges where avoidable, and DI is not used as a service locator inside domain logic. Shared/common modules contain technical primitives only.

The durable integration path is:

```text
PostgreSQL result/state/outbox transaction
  -> OutboxDispatcher
  -> BullMQ durable enqueue acknowledgement
  -> idempotent consumer
  -> PostgreSQL authoritative state/projection
  -> optional Redis Pub/Sub notification
  -> NestJS WebSocket Gateway
```

An outbox row is not marked delivered because Pub/Sub succeeded. The dispatcher marks it delivered only after BullMQ acknowledges job creation. It uses a stable event-derived job ID, while consumers retain event-ID/inbox and aggregate-version idempotency because enqueue acknowledgement and process failure can still create ambiguous retries or redelivery. BullMQ's Redis is configured for persistence and no arbitrary eviction; PostgreSQL remains the recovery truth.

`SentimentAnalyzer` remains a framework- and language-independent port. Its implementation may be Node-compatible, hosted, or Python-backed only when the chosen model/library provides a concrete benefit. Strategy and Experiment never depend on BERT/FinBERT, Transformers, Python, hosted APIs, or local-model details.

## Consequences

Benefits:

- framework-visible modules, imports, provider exports, and DI bindings support automated architecture checks and AI-agent guardrails;
- HTTP, WebSocket, coordinator, and initial worker code share TypeScript contracts and build tooling;
- optional Python/ML dependencies do not determine the core backend;
- BullMQ fits the existing queue/worker, at-least-once, and separate-process decisions without changing domain lifecycle ownership.

Costs:

- NestJS structure does not automatically enforce semantic ownership; dependency tests and review remain required;
- framework types must be kept out of domain contracts deliberately;
- BullMQ correctness depends on Redis persistence/eviction configuration, stable job identity, reconciliation, and idempotent consumers;
- CPU-heavy work still needs separate processes and measured concurrency; NestJS does not make it non-blocking;
- a later Python model runtime adds an operational boundary and its own provenance requirements.

## Risks

- A broad global/shared Nest module could hide dependencies and recreate a coupled monolith.
- Direct injection of repositories/adapters across Nest modules could bypass public ports.
- Assuming enqueue or worker execution is exactly-once could corrupt results/projections.
- Treating Redis Pub/Sub as durable could strand correctness-relevant work.
- Redis without suitable persistence or with an eviction policy can invalidate BullMQ durability assumptions.
- A model-specific adapter could leak Python/model concepts into Strategy or Experiment.

## Evidence / validation

Capability and limitation evidence comes from primary documentation:

- [NestJS modules](https://docs.nestjs.com/modules) document encapsulated providers, imports, and explicit exports as a module's public interface.
- [NestJS WebSocket gateways](https://docs.nestjs.com/websockets/gateways) use the same provider/DI model as the application.
- [NestJS queues](https://docs.nestjs.com/techniques/queues) document BullMQ integration and Redis-backed distributed producers/consumers.
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) require retry-safe job design.
- [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production) requires Redis persistence configuration and warns against arbitrary key eviction.
- [Redis Pub/Sub](https://redis.io/docs/latest/develop/pubsub/) documents at-most-once delivery, supporting its best-effort-only role.
- [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) support the local atomic result/outbox boundary.

Implementation evidence remains pending. PROOF-SCALE-001, PROOF-RETRY-001, PROOF-DUP-001, PROOF-RT-001, and dependency/import architecture tests must validate the realization. FROZEN means normative, not empirically proven.

## Revisit triggers

- NestJS prevents rather than supports a required frozen contract or boundary.
- Dependency tests cannot reliably prevent private-provider/repository/ORM imports.
- Measured BullMQ/Redis dispatch, recovery, persistence, or control behavior cannot satisfy accepted targets.
- CPU/backtest requirements require a different bounded compute runtime while preserving job/result contracts.
- A selected sentiment model/library creates a demonstrated Python benefit, triggering only the adapter/runtime decision behind `SentimentAnalyzer`.
- HTTP or WebSocket requirements create a measured incompatibility with the selected NestJS adapters.

## Affected architecture sections

Baseline: Architecture style, Runtime communication, Events, Deployment topology, Technology decisions, NestJS realization invariants, Architectural invariants.
Proposal: D-05, D-06, D-07, D-10, D-12, resulting architecture, runtime flows, deployment, risks, and final recommendation.
Related ADRs: ADR-001, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008.

## Supersedes / Superseded by

Supersedes: the technology-realization portions of frozen baseline v1; it does not supersede the architecture-pattern decisions in ADR-001 through ADR-008.
Superseded by: none.
