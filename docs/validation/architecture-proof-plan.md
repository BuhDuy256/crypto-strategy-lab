# Architecture Proof Plan

Validation Status: PENDING IMPLEMENTATION PROOFS
Baseline: [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Purpose

Architecture claims are useful only when observable changes/failures demonstrate them. Each proof below defines later implementation evidence. Numerical performance thresholds remain calibration items because the official sources provide no target hardware or accepted latency/throughput values.

## Evidence conventions

Every proof run records:

- baseline version and relevant ADRs;
- code/build/dependency-lock versions;
- environment/hardware and configuration;
- dataset/fixture identity;
- commands and timestamps;
- logs/metrics/traces/diffs/artifact hashes;
- result, deviations, and follow-up decision.

## PROOF-EXT-001 - Strategy extensibility

Trace: P-1.1 -> QA-MOD-001 -> D-02 -> ADR-002 -> ARC-STRATEGY.

1. Start from the four MVP strategies.
2. Add `MACDStrategy`, descriptor, registration, and focused tests.
3. Run strategy contract tests plus representative backtest.
4. Inspect the diff.

Pass evidence:

- no change to Backtester, Evaluator, RankingPolicy, provider adapters, persistence ownership, or frontend core;
- strategy appears through registry metadata rather than a type-switch;
- result stores MACD strategy/version/parameters.

## PROOF-REPLACE-001 - Search replaceability

Trace: P-1.2 -> QA-MOD-002 -> D-04 -> ADR-002.

1. Run a fixed experiment using Random Search.
2. Implement Domain-Guided or Genetic generator through `StrategyGenerator`.
3. Run against the same downstream pipeline.
4. Compare downstream diffs/contracts.

Pass evidence: Backtester, Evaluator, RankingPolicy, LeaderboardProjector, and candidate/job schemas are unchanged.

## PROOF-PROVIDER-001 - Provider replaceability

Trace: P-1.3/P-3.5 -> QA-MOD-003 -> D-03 -> ADR-003.

Use a fake second provider or approved OKX adapter and run the common provider contract suite. Confirm normalized candle fixtures are accepted by charts/experiments with no frontend or strategy changes.

## PROOF-SCALE-001 - Worker scale and backpressure

Trace: P-2.* -> QA-SCAL-001 -> D-01/D-05 -> ADR-001/ADR-004.

1. Establish a reproducible CPU-bound job fixture and calibrated candidate count.
2. Run with worker counts 1, 2, and N supported by test hardware.
3. Capture completed jobs/time, p50/p95 job duration, BullMQ queue depth and job-state counts, enqueue/consume rate, retries/stalled jobs, duplicate deliveries/results, Redis CPU/memory/persistence health/evictions, PostgreSQL latency/locks/connection use, and worker utilization.
4. Increase candidate count toward the source's very-large-scale challenge until a bottleneck is observed or the agreed test limit is reached.

Pass evidence:

- worker count changes deployment configuration, not core code/job contracts;
- no duplicate logical result;
- backpressure prevents unbounded in-memory growth;
- bottlenecks and the next scale action are identified.

No linear-scaling claim is permitted without measurements.

## PROOF-CONTROL-001 - Pause/resume/cancel/stop

Trace: P-2.4 -> QA-CTRL-001 -> D-05 -> ADR-004.

Exercise max-candidate, max-duration, no-improvement, user pause, resume, and cancel. Verify durable state survives API/coordinator restart, new dispatch converges to the requested state, and running-job behavior is documented and observable.

## PROOF-RETRY-001 - Partial failure retry

Trace: P-2.3/P-4.3 -> QA-REL-002 -> D-06 -> ADR-005.

Inject failures:

- before result transaction;
- during simulation before commit;
- after result acceptance commit but before the worker acknowledges completion;
- after outbox commit, with the dispatcher crashing before BullMQ enqueue;
- after BullMQ enqueue succeeds but before the dispatcher marks the outbox entry delivered;
- after a consumer receives the BullMQ job but before its durable state/projection commit;
- after the consumer commit but before BullMQ completion acknowledgement;
- during consumer retry and explicit duplicate job/event delivery.

Pass evidence: exactly one logical result per idempotency key; a complete accepted trade result represented by direct rows or an immutable verified reference/hash; internally consistent metrics/state/provenance/outbox; eventual BullMQ delivery and consumer processing; one logical state transition/projection despite at-least-once delivery; and visible worker, dispatcher, and consumer attempt history. A Redis Pub/Sub publish does not satisfy this proof.

## PROOF-DUP-001 - Duplicate completion/event

Trace: P-4.5 -> QA-REL-002 -> D-06/D-09 -> ADR-005.

Deliver the same `StrategyEvaluated` envelope twice and then deliver a stale aggregate version. Confirm inbox/deduplication evidence and an unchanged leaderboard projection hash/rank.

## PROOF-ISO-001 - News failure isolation

Trace: P-4.1 -> QA-ISO-001 -> D-10 -> ADR-007.

Disable the news worker/provider while continuously exercising market chart subscriptions and a technical-only backtest. Pass when News reports degraded/failure while chart and technical experiment checks remain successful.

## PROOF-ISO-002 - Sentiment failure isolation

Trace: P-4.2 -> QA-ISO-002 -> D-10 -> ADR-007.

Make model inference unavailable. Verify analysis attempts/retries are recorded, sentiment-dependent candidates block/degrade according to policy, and non-sentiment strategies/backtests remain operational.

## PROOF-RT-001 - Realtime recovery and chart isolation

Trace: P-3.* -> QA-REL-001/QA-RT-001 -> D-03/D-07 -> ADR-003/ADR-008.

1. Subscribe four charts through the NestJS WebSocket Gateway with distinct subscription IDs/timeframes.
2. Change one timeframe and confirm only that subscription resets.
3. Disconnect the provider WebSocket for a controlled interval.
4. Restore it and observe reconnect, missing-interval calculation, REST recovery, deduplication, and resume.
5. Restart API/client and verify durable snapshot before live continuation.

Pass evidence:

- no unresolved known closed-candle gap or duplicate;
- unrelated chart subscriptions do not reset;
- no full-page reload;
- end-to-end latency distribution is captured against the later agreed budget.

## PROOF-REP-001 - Leaderboard reproducibility

Trace: P-5.* -> QA-REP-001 -> D-08/D-09 -> ADR-006/ADR-005.

Select current Top #1 and resolve every applicable field in the baseline reproducibility list, including Node.js runtime, dependency lock, and application/worker build identities plus conditional ML runtime/model provenance. Rerun on the identified dataset/build/config. Compare directly stored trades canonically or compare immutable trade-artifact and metric hashes; if nondeterminism is declared, apply the recorded tolerance and explain it.

Pass evidence: no value is obtained from a mutable default or current registry/model alias.

## PROOF-OBS-001 - Operational observability

Trace: P-2.6/P-6.2 -> QA-OBS-001.

During scale and failure proofs, confirm correlation from experiment -> candidate -> BullMQ job -> attempt -> result -> outbox event -> consumer/inbox -> leaderboard entry. Verify query/metrics/log access to run state, BullMQ queue depth/job states, dispatcher lag, projection lag, latency, retries/stalls/failures, Redis persistence/eviction health, provider health/gaps, worker counts, and current leader.

## Proof gate

An architecture proof failure does not authorize a local document patch or silent redesign. Return to the traced problem/scenario/decision, compare alternatives, and follow the baseline deviation procedure.
