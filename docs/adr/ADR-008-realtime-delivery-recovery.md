# ADR-008 - Realtime Delivery and Market Recovery

**Status:** ACCEPTED
**Decision ID:** D-07, D-12
**Related Problem IDs:** P-3.1, P-3.2, P-3.3, P-3.4, P-6.1
**Related Scenario IDs:** QA-REL-001, QA-RT-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

The dashboard has up to four independently changing chart subscriptions, needs realtime updates without repeated polling/full reload, and must recover when the exchange WebSocket disconnects. API/client processes can also restart or miss a live notification.

## Decision

Use a NestJS WebSocket Gateway between SPA and backend for bidirectional subscription control and push. Each chart has a client subscription ID plus symbol/timeframe key. The API returns a durable snapshot first and then forwards matching live updates.

Market ingest owns the Binance WebSocket/REST lifecycle, normalization, closed-candle persistence, health, reconnect/backoff, gap calculation, REST recovery, and deduplication. Redis Pub/Sub fans normalized live notifications from ingest or an already committed authoritative projection to API replicas but is explicitly ephemeral and at-most-once. PostgreSQL Candle/Dataset and projection state is the recovery truth for client/API reconnect and correctness. Pub/Sub is not the durable outbox delivery path.

## Alternatives considered

- **HTTP polling:** easy but adds waste/delay and conflicts with required realtime flow.
- **Server-Sent Events:** adequate server-to-client updates but needs a separate control path for changing subscriptions; still viable if WebSocket proves operationally unsuitable.
- **Durable stream for every live update:** replayable but adds retention/consumer-offset complexity before a durable-tick requirement.
- **WebSocket + ephemeral fan-out + durable snapshots:** selected.

## Why this option

It matches independent interactive subscriptions while separating low-latency notification from durable correctness. Missing Pub/Sub messages cause a snapshot refresh, not data corruption.

## Consequences

- WebSocket sessions require bounded buffers, heartbeat/reconnect, validation, and slow-client policy.
- API replicas can share live notifications without owning exchange connections.
- Ephemeral partial updates are not accepted as experiment datasets unless captured into a versioned durable dataset.
- Numeric latency acceptance awaits proof calibration.

## Risks

- Provider timestamp/revision rules can create false gaps or duplicates.
- Slow clients can consume memory or receive stale updates.
- Pub/Sub outage pauses live push even though durable ingestion may continue.
- Snapshot/live handoff can race unless watermark/version is included.

## Evidence / validation

- PROOF-RT-001 exercises four subscriptions, one timeframe change, provider disconnect/gap recovery, API/client reconnect, duplicate/gap checks, and latency measurement.
- Provider contract tests validate timestamp/timeframe normalization.
- Load tests observe outbound buffers and slow-client behavior.

## Revisit triggers

- durable tick replay becomes required;
- WebSocket infrastructure cannot meet accepted connection/latency targets;
- API replica fan-out or Redis Pub/Sub becomes a measured bottleneck;
- provider semantics require a richer normalized contract.

## Affected architecture sections

Baseline: Contracts, Runtime communication, Events, Deployment, Technology decisions.
Proposal: sections 12 D-07/D-12, 16, 17 ARC-API/ARC-MARKET, 18.1, 22-23.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
