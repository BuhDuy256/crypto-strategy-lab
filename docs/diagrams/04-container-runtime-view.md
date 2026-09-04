# Container / Runtime View

## Purpose

This view shows the runtime roles and the semantics of their communication paths. It separates interactive traffic, durable asynchronous delivery, authoritative storage, and best-effort live notification.

## Diagram

```mermaid
flowchart LR
    User["User / browser"] --> SPA["React SPA"]
    SPA <-->|"INTERACTIVE<br/>HTTP + WebSocket"| API["NestJS Controllers<br/>+ WebSocket Gateway process"]

    Binance["Binance"] -->|"WebSocket + REST"| Market["Market ingest process"]
    News["News providers"] --> NewsWorker["News / sentiment<br/>worker process"]
    Model["Configured sentiment<br/>model runtime"] <-->|"SentimentAnalyzer boundary"| NewsWorker

    API -->|"commands / queries via module ports"| DB[("PostgreSQL<br/>AUTHORITATIVE DURABLE TRUTH")]
    Market -->|"closed candles / datasets"| DB
    NewsWorker -->|"items, attempts, sentiment results"| DB

    DB -->|"V1-V5: claimable BacktestRun"| Runner["Node.js / TypeScript<br/>backtest runner process"]
    Runner -->|"result + trades + provenance"| DB

    API -->|"V6 target: immutable BacktestJob"| Bull[("BullMQ on persistent Redis<br/>DURABLE ASYNC DELIVERY")]
    Bull -->|"V6: at-least-once"| Workers["Node.js / TypeScript<br/>BullMQ backtest worker process(es)"]
    Bull -->|"V6 routed integration work"| NewsWorker
    Workers -->|"V6: result + trade link + provenance + outbox transaction"| DB

    DB -->|"V6: committed outbox rows"| Dispatcher["V6 target:<br/>Outbox dispatcher process"]
    Dispatcher -->|"V6: enqueue; mark delivered only after ack"| Bull
    Bull -->|"V6: event-derived job; at-least-once"| Consumer["V6 target:<br/>Idempotent consumer / projector"]
    Consumer -->|"V6: authoritative state / projection commit"| DB

    Market -.->|"BEST-EFFORT live market notification"| PubSub[("Redis Pub/Sub<br/>EPHEMERAL LIVE FAN-OUT")]
    Consumer -.->|"V6: after authoritative commit"| PubSub
    PubSub -.->|"may be lost; recover from PostgreSQL"| API

    classDef interactive fill:#eef6ff,stroke:#2563eb,color:#172554;
    classDef durable fill:#ecfdf5,stroke:#047857,color:#052e16;
    classDef bestEffort fill:#fff7ed,stroke:#c2410c,color:#431407,stroke-dasharray: 5 5;
    class SPA,API interactive;
    class DB,Bull durable;
    class PubSub bestEffort;
```

## Notes

- Logical modules share one codebase; these role processes are not independently owned microservices.
- The API-to-PostgreSQL edge collapses in-process module calls for runtime readability; `ARC-API` does not access another module's repositories or tables directly.
- V1 through V5 use the PostgreSQL-backed durable executor authorized by ADR-010;
  the runner is a separate process and PostgreSQL owns claim/recovery state.
- BullMQ/Redis is the mandatory V6 correctness delivery path and requires
  persistence/no-arbitrary-eviction configuration.
- **Every edge and node marked `V6` is target architecture and is not implemented.**
  That includes BullMQ, the BullMQ worker processes, the outbox dispatcher, and the
  idempotent consumer/projector. The realized topology is the unmarked edges plus the
  `V1-V5` runner path. See [`docs/final-defense-notes.md`](../final-defense-notes.md).
- Redis Pub/Sub never proves durable delivery; PostgreSQL snapshots and projections are recovery truth.

## References

- [Baseline - Runtime communication](../architecture/architecture-baseline.md#runtime-communication)
- [Baseline - Deployment topology](../architecture/architecture-baseline.md#deployment-topology)
- [ADR-001 - Process-role separation](../adr/ADR-001-modular-monolith-process-roles.md)
- [ADR-004 - Asynchronous experiment processing](../adr/ADR-004-asynchronous-experiment-processing.md)
- [ADR-005 - Transactional results](../adr/ADR-005-transactional-results-leaderboard.md)
- [ADR-008 - Realtime delivery](../adr/ADR-008-realtime-delivery-recovery.md)
- [ADR-009 - Technology realization](../adr/ADR-009-technology-realization.md)
- [ADR-010 - Asynchronous execution sequencing](../adr/ADR-010-realization-sequencing-for-asynchronous-backtest-execution.md)
