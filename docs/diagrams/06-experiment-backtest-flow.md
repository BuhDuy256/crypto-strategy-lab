# Experiment / Backtest Runtime Flow

## Purpose

This sequence follows an experiment from the user's command through immutable specification, durable work, authoritative result acceptance, leaderboard projection, and optional UI notification. It highlights the two at-least-once queue stages and their PostgreSQL consistency boundaries.

## Diagram

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant A as API
    participant E as Experiment / SearchCoordinator
    participant G as StrategyGenerator
    participant D as PostgreSQL
    participant Q as BullMQ / persistent Redis
    participant W as Backtest worker
    participant O as OutboxDispatcher
    participant P as LeaderboardProjector
    participant N as Redis Pub/Sub

    Note over U,E: COMMAND + DURABLE EXPERIMENT STATE
    U->>A: Create / start experiment command
    A->>E: Validate request and start
    E->>D: Validate and freeze ExperimentSpec + run state
    E->>G: Request candidate under durable limits / stop policy
    G-->>E: Immutable CandidateStrategy
    E->>D: Persist candidate + BacktestJob intent

    Note over E,W: DURABLE ASYNC BACKTEST WORK
    E->>Q: Enqueue immutable BacktestJob
    Q->>W: At-least-once job delivery
    W->>W: Deterministic backtest + evaluation
    W->>D: Atomic result, trade representation, provenance, completion, outbox
    D-->>W: Accepted once by idempotency key

    Note over D,P: DURABLE INTEGRATION + PROJECTION UPDATE
    O->>D: Read committed outbox entry
    D-->>O: StrategyEvaluated event
    O->>Q: Enqueue with stable event-derived job ID
    Q-->>O: Durable enqueue acknowledgement
    O->>D: Mark outbox delivered
    Q->>P: At-least-once projection work
    P->>D: Inbox/version checks + leaderboard projection commit

    Note over U,P: OPTIONAL BEST-EFFORT NOTIFICATION
    P-->>N: Publish LeaderboardUpdated after commit
    N-->>A: Ephemeral live fan-out
    A-->>U: WebSocket update
```

## Notes

- Pause, resume, cancel, and stop remain durable Experiment state; broker cancellation does not define domain state.
- The accepted trade representation is either direct rows or an immutable reference plus content hash.
- The worker never mutates the leaderboard; Pub/Sub loss cannot lose the committed result or projection.

## References

- [Baseline - Runtime communication](../architecture/architecture-baseline.md#runtime-communication)
- [Baseline - Persistence rules](../architecture/architecture-baseline.md#persistence-rules)
- [Proposal section 18.3 - Search to rank flow](../architecture/architecture-proposal.md#183-search---backtest---evaluate---rank-flow)
- [ADR-004 - Asynchronous experiment processing](../adr/ADR-004-asynchronous-experiment-processing.md)
- [ADR-005 - Transactional results and leaderboard](../adr/ADR-005-transactional-results-leaderboard.md)
- [ADR-006 - Immutable experiment provenance](../adr/ADR-006-immutable-experiment-provenance.md)
