# Final defense notes

Two short lookup lists for the oral defense: what the system does not do, and
what must not be claimed as proven. Read together with
[`demo-script.md`](demo-script.md).

## Known limitations

### 1. Single operator (deferred account requirement)

The current certified realization assumes one operator. Account-based ownership
was introduced as a late requirement after the existing baseline. It was not
included in the final pre-defense realization. Supporting it would introduce
identity propagation and ownership enforcement, especially for user-created
saved composite strategies.

There is no registration, login, session, token, user entity, role-based
access, or tenant filtering anywhere in the system, and none should be implied
or demonstrated.

### 2. Frontend combination-policy options are not metadata-driven

The backend architecture supports versioned CombinationPolicy components, but
selectable policy options in the current frontend are not metadata-driven.
Adding a new policy therefore currently requires a frontend change because no
policy catalog endpoint exists.

This is a UI integration limitation, not a domain architecture limitation. The
`CombinationPolicyRegistry` itself is already versioned and extensible; only
the transport that would let the frontend discover a policy is missing.

### 3. Sentiment as a strategy is not reachable from the Backtest page

`news-sentiment` is a real strategy and declares
`requiredInputs: ["sentiment-series"]`. The Backtest page collects a dataset window
only, so it can supply price bars and nothing else, and it therefore offers only
strategies whose declared inputs it can satisfy.

This is a deliberate boundary, not a defect to apologise for: a control that cannot
satisfy its own contract would fail at freeze with `EXPERIMENT_FIELD_REQUIRED`. The
capability is exercised through the API and in tests. Do not demonstrate it by
clicking, and do not claim a sentiment configuration UI exists.

## Claims not supported by evidence

Only the eight rows in
[`frozen_implementation_plan/README.md`](../frozen_implementation_plan/README.md#c-architecture-demoable)
section C may be claimed as proven during the defense. Everything below is
explicitly **not** supported by current evidence — that means it has not been
measured or proven, not that the architecture could never support it:

- Queue scalability, including the 100,000-candidate target.
- Any candidate throughput figure, scaling factor, or capacity projection.
- BullMQ as the final execution realization — V6 is not implemented.
- Transactional-outbox reliability.
- Broker retry correctness.
- Duplicate-delivery safety.
- A measured realtime latency guarantee (`PROOF-RT-001` disclaims a latency
  target in its own text).
- Any other V6 property (operational telemetry, the scale/retry/duplicate/
  observability proofs) as implemented or certified.

### The one performance thing that *is* measured

Backtest duration and a one-versus-three runner-replica comparison were measured on a
single developer laptop at small scale, and recorded in
[`evidence-performance-and-scale.md`](evidence/evidence-performance-and-scale.md).

What that permits saying: worker count is a deployment change rather than a code
change; several runner processes share one PostgreSQL queue without producing a
duplicate result; per-backtest duration is stored durably and can be queried.

What it does **not** permit saying: any of the bullets above. The observed speedup was
roughly 1.5x on three replicas, the two configurations' timing ranges overlap, and the
largest workload measured was 24 candidates. `PROOF-SCALE-001` remains open.

## Where the evidence is

[`docs/evidence/README.md`](evidence/README.md) indexes every architecture claim, its
evidence, and the four proofs that have none.
