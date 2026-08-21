# ADR-001 - Modular Monolith with Process-Role Separation

**Status:** ACCEPTED
**Decision ID:** D-01, D-08, D-12
**Related Problem IDs:** P-1, P-2.1, P-2.5, P-2.7, P-4
**Related Scenario IDs:** QA-SCAL-001, QA-ISO-001, QA-OBS-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

The system needs strong logical boundaries and some independent runtime scaling/failure behavior, especially for CPU-heavy backtests, long-lived market connections, and unreliable news/ML dependencies. The sources provide no evidence of independent domain teams, release cadences, or operational capacity for many services.

## Decision

Use one Node.js/TypeScript application codebase and coordinated release organized into API/Presentation, Market Data, Strategy, Experiment, and News Intelligence modules, with NestJS as the core application realization. Deploy role-specific processes for API/WebSocket, market ingest, BullMQ backtest workers, news/sentiment work, and outbox dispatch. Use one PostgreSQL instance with module-owned data, BullMQ/Redis for durable asynchronous delivery, and Redis Pub/Sub for explicitly ephemeral live fan-out.

Logical modules are not services. Process roles may share an image/build and must use the same versioned contracts. A future Python ML runtime behind the framework-independent `SentimentAnalyzer` port is an adapter-level implementation choice and does not violate the coordinated Node.js/TypeScript core architecture.

## Alternatives considered

- **One-process layered monolith:** viable logically, but CPU work and provider/model failures compete with API/realtime workloads and scale only together.
- **Microservice per domain:** provides independent deployment but adds network, data consistency, observability, contract, and operations cost without a source driver.
- **Serverless functions for most workloads:** useful for short scheduled work, but poor default for long-lived market connections and CPU-heavy controlled loops.

## Why this option

It preserves simple development and transactions while isolating the runtime profiles explicitly challenged by the project. It also creates a measured path to later splits without paying distributed-system costs now.

## Consequences

Benefits:

- one codebase and contract set;
- worker and ingestion scale/fail separately;
- straightforward local/demo packaging;
- module ownership can be tested.

Costs:

- process boundaries require serialization, idempotency, correlation, and operational supervision;
- shared PostgreSQL/Redis can become bottlenecks;
- coordinated release remains the default.

## Risks

- A “modular monolith” can degrade into cross-module imports/table writes without automated tests/review.
- Too many role-specific processes can imitate microservice complexity.
- Shared infrastructure can hide ownership unless schema and write rules are enforced.

## Evidence / validation

- PROOF-SCALE-001 changes worker count without core-code changes.
- PROOF-ISO-001/002 kills news/model paths while market and technical experiments continue.
- Dependency/ownership tests reject forbidden imports and cross-module writes.

## Revisit triggers

- independent teams require independent releases;
- one module must scale/deploy separately beyond current process roles;
- shared database contention or failure domain is measured and cannot be addressed in the current topology;
- public-production availability requirements exceed the single-installation assumption.

## Affected architecture sections

Baseline: Architecture style, Logical modules, Allowed dependency directions, Data ownership, Deployment topology, Technology decisions, NestJS realization invariants.
Proposal: sections 12 D-01/D-08/D-12, 14, 16, 17, 20, 22; ADR-009 realizes the technology choice.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
