# Realtime Market Flow

## Purpose

This sequence separates low-latency chart delivery from closed-candle correctness. Market Data owns normalization, deduplication, gap recovery, and durable candle state; the UI owns only independent subscriptions and presentation.

## Diagram

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as React SPA charts
    participant A as NestJS WebSocket Gateway
    participant D as PostgreSQL
    participant N as Redis Pub/Sub
    participant M as Market ingest
    participant B as Binance / provider

    U->>C: Change one chart's symbol / timeframe
    C->>A: Subscribe(subscriptionId, symbol, timeframe)
    A->>D: Query durable candle snapshot + watermark
    D-->>A: Snapshot
    A-->>C: Replace only the matching subscription
    Note over C,A: Other subscription IDs continue unchanged

    B-->>M: Provider market update
    M->>M: Normalize, validate, and deduplicate
    alt Closed candle
        M->>D: Upsert by candle identity + update dataset state
        D-->>M: Durable commit / watermark
    end
    M-->>N: Best-effort normalized live notification
    N-->>A: Ephemeral fan-out
    A-->>C: Forward only to matching subscription IDs

    Note over B,M: PROVIDER DISCONNECT AND GAP RECOVERY
    B-->>M: Connection lost
    M->>D: Record degraded provider health
    M->>B: Reconnect and request missing closed intervals via REST
    B-->>M: Recovery candles
    M->>M: Normalize, validate, deduplicate, detect remaining gaps
    M->>D: Upsert recovered candles and durable watermark
    M-->>N: Resume best-effort live notifications

    Note over C,D: CLIENT / API RECOVERY
    C->>A: Reconnect with subscription keys
    A->>D: Request fresh durable snapshot
    D-->>A: Reconciled snapshot + watermark
    A-->>C: Snapshot before live continuation
```

## Notes

- PostgreSQL candle/dataset state—not Pub/Sub—is the durable source of truth.
- Closed-candle correctness, provider health, reconnect, and gap repair belong to `ARC-MARKET`, never the UI.
- In-progress live notifications may be lost; reconnect restores a durable snapshot before live continuation.

## References

- [Baseline - ARC-MARKET](../architecture/architecture-baseline.md#arc-market---market-data)
- [Baseline - Runtime communication](../architecture/architecture-baseline.md#runtime-communication)
- [Baseline - Events](../architecture/architecture-baseline.md#events)
- [Proposal section 18.1 - Realtime market-data flow](../architecture/architecture-proposal.md#181-realtime-market-data-flow)
- [ADR-003 - Provider adapters](../adr/ADR-003-provider-adapters.md)
- [ADR-008 - Realtime delivery and recovery](../adr/ADR-008-realtime-delivery-recovery.md)
- [ADR-009 - Technology realization](../adr/ADR-009-technology-realization.md)
