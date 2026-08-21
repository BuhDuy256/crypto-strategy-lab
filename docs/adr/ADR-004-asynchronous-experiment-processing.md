# ADR-004 - Asynchronous Experiment Processing

**Status:** ACCEPTED
**Decision ID:** D-05, D-12
**Related Problem IDs:** P-2.1, P-2.2, P-2.3, P-2.4, P-2.5, P-2.6
**Related Scenario IDs:** QA-SCAL-001, QA-CTRL-001, QA-REL-002, QA-OBS-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

Candidate generation can outpace CPU-heavy backtesting; work needs retry, pause/resume/cancel, finite stop conditions, progress, backpressure, and scale by worker count. Running the loop in an API request or WebSocket handler would couple interactive and batch workloads.

## Decision

Persist Experiment, candidate, and job intent in PostgreSQL. Dispatch immutable `BacktestJob` commands through BullMQ using persistence-configured Redis. Run initial Node.js/TypeScript backtest workers as separate processes outside the API/WebSocket process on dedicated queues. Treat delivery as at-least-once and require an idempotency key per logical experiment/candidate/engine execution.

The SearchCoordinator owns durable run state, generation limits, stop policy, pause/resume/cancel, and dispatch reconciliation. Broker controls do not define domain state. Workers check cooperative cancellation at explicit safe checkpoints.

## Alternatives considered

- **Synchronous/in-process loop:** lowest setup, but blocks and cannot scale/isolate reliably.
- **PostgreSQL polling queue:** durable and fewer dependencies, but requires custom claiming/retry/visibility/control logic.
- **Kafka/event log:** strong replay/throughput, but task ownership, control, and MVP operations are unnecessarily complex.
- **BullMQ/Redis:** selected Node.js/TypeScript task/worker/routing model, with application-level correctness safeguards and explicit Redis durability configuration.

## Why this option

It directly addresses the source's queue/worker scale and control scenarios in the selected Node.js/TypeScript runtime while preserving Experiment as the owner of lifecycle truth.

## Consequences

- API latency is isolated from backtest CPU work.
- Workers scale by replica count without core-code changes.
- BullMQ/Redis is operational infrastructure, not the experiment source of truth.
- Pause/cancel convergence and running-job policy must be implemented/tested explicitly.
- Redelivery/visibility timeout requires idempotency and reconciliation.

## Risks

- Misconfigured retry/stalled-job handling, Redis persistence, or eviction policy can duplicate, delay, or lose queued work.
- Too many workers can saturate PostgreSQL/Redis faster.
- Large trade artifacts can make result transactions expensive.
- Hard process termination can bypass cooperative checkpoints.

## Evidence / validation

- PROOF-SCALE-001 measures workers, backlog, throughput, duplicates, and contention.
- PROOF-CONTROL-001 exercises durable stop/pause/resume/cancel and restart.
- PROOF-RETRY-001 injects worker/broker failure around commit/ack boundaries.
- PROOF-OBS-001 correlates run, candidate, job, attempt, and result.

## Revisit triggers

- measured capacity/latency cannot meet accepted targets;
- BullMQ/Redis recovery/control semantics remain insufficient after configuration and reconciliation;
- durable replay or many independent event consumers becomes a requirement;
- job isolation requires a separate compute platform.

## Affected architecture sections

Baseline: Runtime communication, Deployment topology, Technology decisions, NestJS realization invariants, Architectural invariants.
Proposal: sections 12 D-05/D-12, 16, 17 ARC-EXPERIMENT, 18.3/18.6, 22; ADR-009 realizes the technology choice.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
