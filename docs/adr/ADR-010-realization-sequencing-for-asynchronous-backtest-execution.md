# ADR-010 - Realization Sequencing for Asynchronous Backtest Execution

**Status:** ACCEPTED
**Decision ID:** D-13
**Accepted:** 2026-08-23
**Accepted by:** Project Owner
**Related Problem IDs:** P-2.1, P-2.2, P-2.5
**Related Scenario IDs:** QA-SCAL-001, QA-REL-001, QA-REL-002
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.2
**Decision record:** [`deviation-proposal-001`](../architecture/deviation-proposal-001-backtest-execution-transport.md)

## Context

ADR-004 and ADR-009 select BullMQ with persistence-configured Redis as the final
correctness delivery path for asynchronous backtest work. The V1 product slice needs
backtests outside the interactive API process, but the load and reliability drivers
that require broker-backed horizontal worker scaling do not arrive until automated
discovery and the V6 proof work.

Building the full BullMQ, Redis, outbox, dispatcher, idempotent-consumer, and
operational configuration path before the first demonstrable backtest would delay
the functional spine. Running a backtest inside an HTTP request would be smaller,
but would violate the process-isolation invariant immediately.

## Decision

Accept the staged realization proposed as Alternative C:

- V1 through V5 use a PostgreSQL-backed durable executor behind the
  framework-independent `BacktestExecutor` port.
- A separate backtest-runner process claims durable run records and executes work;
  no backtest runs inside an API request or WebSocket process.
- PostgreSQL remains authoritative for run intent, attempts, results, and recovery.
- Domain and application contracts expose no PostgreSQL polling, lease, cursor,
  transaction, or claim semantics.
- V6 replaces only the executor adapter and process entry point with BullMQ workers
  on persistence-configured Redis.
- No correctness-relevant cross-process integration publication is permitted before
  the transactional outbox and BullMQ path exists. If such publication becomes
  necessary earlier, this sequencing decision must be reviewed again.

The stable seam is `BacktestExecutor`. `Backtester`, `Evaluator`,
`ResultCommitter`, `ExperimentSpec`, immutable job identity, and result contracts
must remain unchanged when the adapter is replaced.

## Alternatives

### Build BullMQ and Redis in V1

Rejected for sequencing, not suitability. It implements the final target immediately
but adds infrastructure before the first user-visible backtest and lengthens the V1
critical path.

### Run backtests synchronously in the HTTP request

Rejected. It violates process isolation, couples request lifetime to CPU-heavy work,
and makes crash recovery impossible without later redesign.

### Proceed with PostgreSQL polling without an explicit decision

Rejected. It would silently contradict ADR-004, ADR-009, and baseline v1.1.

## Consequences

Benefits:

- V1 reaches a demonstrable backtest earlier while preserving process isolation.
- The domain and application interfaces are designed once and survive the V6 swap.
- Run intent and recovery state remain in the already-authoritative database.

Costs:

- The project must implement atomic claiming, lease expiry, stale-claim recovery,
  retry accounting, and idempotency controls that BullMQ would otherwise provide.
- Two executor adapters exist during V6 migration and both require conformance tests.
- Scale and retry proofs against the PostgreSQL adapter do not prove BullMQ behavior.

## Risks and controls

- PostgreSQL-specific details could leak through the port. Boundary and contract
  tests must reject that leakage.
- A naive claim loop could duplicate work or strand a run. `EXP-04` and `EXP-05`
  must prove conditional claiming, reclaim after lease expiry, and duplicate-safe
  result acceptance.
- The intermediate path could become permanent by inertia. `EXP-12` remains a V6
  requirement and closes this sequencing exception only after its proofs pass.

## Evidence and validation

- `EXP-04` proves durable intent, stable idempotency identity, and atomic claiming.
- `EXP-05` proves execution in a process separate from the API and recovery after a
  killed runner.
- `EXP-12` proves the BullMQ adapter satisfies the same `BacktestExecutor` interface
  without changing domain/application contracts.
- `PROOF-SCALE-001`, `PROOF-RETRY-001`, and `PROOF-CONTROL-001` are run against the
  final BullMQ realization in V6.

## Revisit triggers

- Correctness-relevant cross-process integration publication is needed before V6.
- PostgreSQL claiming cannot meet the accepted recovery or concurrency behavior.
- Automated discovery creates measured queue pressure earlier than planned.
- The V6 adapter requires a change to a frozen domain/application contract.

## Affected architecture sections

Baseline: Runtime communication, Realization sequencing, Deployment topology,
Technology decisions, and Architectural invariant 11.

Related ADRs: ADR-001, ADR-004, and ADR-009 retain the final BullMQ target; this ADR
amends only when that realization becomes mandatory.

## Supersedes / Superseded by

Supersedes: the immediate-from-V1 execution-timing clauses of ADR-004 and ADR-009.
Their selected final BullMQ/Redis target, delivery semantics, and safeguards remain
accepted and mandatory in V6. This ADR also formally accepts the intermediate
sequence raised by Deviation Proposal 001.

Superseded by: none.
