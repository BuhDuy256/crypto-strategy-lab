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

## Claims not supported by evidence

Only the eight rows in
[`frozen_implementation_plan/README.md`](../frozen_implementation_plan/README.md#c-architecture-demoable)
section C may be claimed as proven during the defense. Everything below is
explicitly **not** supported by current evidence — that means it has not been
measured or proven, not that the architecture could never support it:

- Queue scalability, including the 100,000-candidate target.
- Measured candidate throughput of any kind.
- BullMQ as the final execution realization — V6 is not implemented.
- Transactional-outbox reliability.
- Broker retry correctness.
- Duplicate-delivery safety.
- A measured realtime latency guarantee (`PROOF-RT-001` disclaims a latency
  target in its own text).
- Any other V6 property (operational telemetry, the scale/retry/duplicate/
  observability proofs) as implemented or certified.
- A rerun of `PROOF-REP-001` specifically for a **generated composite**
  candidate. The single-strategy case is proven on the certified baseline; the
  composite-specific rerun is `FIN-06` work and has not happened yet.
