# Proof Coverage Map

## Purpose

This map connects architecture problems and quality scenarios to their accepted decisions and planned implementation proofs. These are proof obligations, not completed evidence; the baseline remains `PENDING IMPLEMENTATION PROOFS`.

## Diagram

```mermaid
flowchart LR
    EXT["P-1.1 / QA-MOD-001<br/>Add MACD"] --> DEXT["D-02 / ADR-002<br/>strategy registry contract"] --> PEXT["PROOF-EXT-001<br/>extensibility"]
    REPLACE["P-1.2 / QA-MOD-002<br/>Replace search"] --> DREPLACE["D-04 / ADR-002<br/>StrategyGenerator port"] --> PREPLACE["PROOF-REPLACE-001<br/>replaceability"]
    PROVIDER["P-1.3 + P-3.5 / QA-MOD-003<br/>Replace provider"] --> DPROVIDER["D-03 / ADR-003<br/>provider adapter contract"] --> PPROVIDER["PROOF-PROVIDER-001<br/>provider replaceability"]

    SCALE["P-2.* / QA-SCAL-001<br/>Worker scale + backpressure"] --> DSCALE["D-01 + D-05<br/>ADR-001 + ADR-004"] --> PSCALE["PROOF-SCALE-001<br/>scale evidence"]
    CONTROL["P-2.4 / QA-CTRL-001<br/>Pause / resume / cancel / stop"] --> DCONTROL["D-05 / ADR-004<br/>durable coordinator state"] --> PCONTROL["PROOF-CONTROL-001<br/>control evidence"]
    RETRY["P-2.3 + P-4.3 / QA-REL-002<br/>Partial failure / retry"] --> DRETRY["D-06 / ADR-005<br/>transaction + outbox + idempotency"] --> PRETRY["PROOF-RETRY-001<br/>retry safety"]
    DUP["P-4.5 / QA-REL-002<br/>Duplicate / stale event"] --> DDUP["D-06 + D-09 / ADR-005<br/>dedup + versioned projection"] --> PDUP["PROOF-DUP-001<br/>duplicate safety"]

    NEWS["P-4.1 / QA-ISO-001<br/>News failure"] --> DNEWS["D-10 / ADR-007<br/>isolated pipeline"] --> PNEWS["PROOF-ISO-001<br/>news isolation"]
    SENT["P-4.2 / QA-ISO-002<br/>Sentiment failure"] --> DSENT["D-10 / ADR-007<br/>SentimentAnalyzer boundary"] --> PSENT["PROOF-ISO-002<br/>sentiment isolation"]
    RT["P-3.* / QA-REL-001 + QA-RT-001<br/>Disconnect / chart isolation"] --> DRT["D-03 + D-07<br/>ADR-003 + ADR-008"] --> PRT["PROOF-RT-001<br/>realtime recovery"]
    REP["P-5.* / QA-REP-001<br/>Leaderboard traceability"] --> DREP["D-08 + D-09<br/>ADR-006 + ADR-005"] --> PREP["PROOF-REP-001<br/>reproducibility"]
    OBS["P-2.6 + P-6.2 / QA-OBS-001<br/>Operational correlation"] --> DOBS["D-01 + D-05<br/>ADR-001 + ADR-004"] --> POBS["PROOF-OBS-001<br/>observability"]

    classDef proof fill:#f3f4f6,stroke:#4b5563,color:#111827,stroke-dasharray: 5 5;
    class PEXT,PREPLACE,PPROVIDER,PSCALE,PCONTROL,PRETRY,PDUP,PNEWS,PSENT,PRT,PREP,POBS proof;
```

## Notes

- Dashed proof nodes indicate planned evidence; none of these proofs is complete yet.
- Each proof records environment, build/configuration, fixture identity, commands, telemetry, result, and artifact hashes.
- A failed proof triggers the baseline deviation procedure; it does not authorize a silent diagram or architecture change.

## References

- [Architecture Proof Plan](../validation/architecture-proof-plan.md)
- [Proposal - Quality Attribute Scenarios](../architecture/architecture-proposal.md#10-quality-attribute-scenarios)
- [Proposal - Candidate solution analysis](../architecture/architecture-proposal.md#12-candidate-solution-analysis)
- [Baseline - Accepted ADRs](../architecture/architecture-baseline.md#accepted-adrs)
