# ADR-005 - Transactional Results and Derived Leaderboard

**Status:** ACCEPTED
**Decision ID:** D-06, D-09
**Related Problem IDs:** P-2.3, P-4.3, P-4.5, P-5.6
**Related Scenario IDs:** QA-REL-002, QA-REP-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

A worker can fail between saving trades, metrics, completion status, broker acknowledgement, and notifying ranking. Direct database-write-then-publish creates a loss window; direct leaderboard mutation makes duplicates/order difficult and turns a display model into truth.

## Decision

For one logical result/idempotency key, accept completion only when the complete trade result is durably represented and content-addressably linked. In one PostgreSQL acceptance transaction, commit the logical result identity, metrics, completion state, required provenance references, an outbox event, and either directly stored trade rows or an immutable trade-data reference plus cryptographic/content hash. This does not require external object storage for v1.1.

For correctness-relevant integration work, the outbox dispatcher enqueues the event to BullMQ with a stable event-derived job ID and marks the outbox row delivered only after successful enqueue acknowledgement. A crash after enqueue but before the delivered mark can cause retry/duplicate delivery, so consumers record event IDs/inbox state and aggregate versions; duplicate or stale delivery is a no-op. Redis Pub/Sub is used only after authoritative state/projection commit for best-effort live/UI notification, and a Pub/Sub publish is never evidence that an outbox entry was durably delivered.

Build Top-K as an idempotent, rebuildable projection from authoritative evaluated results using the experiment's versioned RankingPolicy. A leaderboard row links to result and immutable ExperimentSpec; it is never authoritative.

## Alternatives considered

- **Database commit then direct publish:** simple but loses events on process failure.
- **Publish then database commit:** can expose completion that never committed.
- **Distributed transaction across database/broker:** stronger atomicity but high operational/protocol cost and limited fit.
- **Recompute leaderboard on every query:** correct but increasingly expensive and poor for live updates.
- **Full Event Sourcing/general CQRS:** supports history/replay but adds schema/rebuild complexity beyond current requirements.

## Why this option

Local transaction plus outbox closes the failure window using the existing durable store. A projection supports fast/live Top-K reads while immutable evaluated results retain truth.

## Consequences

- Publication is eventually consistent after commit.
- Dispatcher lag and projection lag must be visible.
- Consumers require deduplication and version checks.
- BullMQ's Redis must be configured and verified for persistence/no arbitrary eviction; PostgreSQL remains authoritative truth.
- Projection can be deleted/rebuilt without result loss.
- Ranking policy/version is part of provenance.

## Risks

- Outbox/inbox tables can grow without retention/archival.
- Bad idempotency-key design can merge distinct executions or duplicate the same one.
- Projection concurrency can create rank races unless updates are serialized/versioned per leaderboard.

## Evidence / validation

- PROOF-RETRY-001 injects failures before/after result commit, BullMQ enqueue acknowledgement, outbox delivered marking, consumer receipt, and consumer commit.
- PROOF-DUP-001 duplicates and reorders events, then compares projection state/hash.
- PROOF-REP-001 traces entry -> result -> ExperimentSpec.

## Revisit triggers

- durable event replay becomes a primary product requirement;
- projection volume/latency exceeds PostgreSQL/outbox design;
- multiple brokers/stores require a different consistency strategy;
- ranking must be strongly synchronous with result acceptance rather than eventually projected.

## Affected architecture sections

Baseline: Runtime communication, Events, Persistence rules, Reproducibility, Invariants.
Proposal: sections 12 D-06/D-09/D-12, 17 ARC-EXPERIMENT, 18.3/18.4/18.6, 20-21; ADR-009 realizes BullMQ/Redis semantics.

## Supersedes / Superseded by

Supersedes: initial proposal candidate that used Redis notifications for durable completion.
Superseded by: none.
