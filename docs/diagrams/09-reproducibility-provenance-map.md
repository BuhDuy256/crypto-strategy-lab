# Reproducibility / Provenance Map

## Purpose

This map traces a leaderboard position back through the accepted result to the complete immutable experiment context. A Top #1 result is reproducible only when every applicable branch resolves to a fixed value, version, identity, or content hash.

## Diagram

```mermaid
flowchart TB
    TOP["Current Top #1 claim"] --> LE["LeaderboardEntry<br/>derived, rebuildable projection"]
    LE --> BR["BacktestResult<br/>authoritative accepted result"]
    BR --> ES["ExperimentSpec<br/>immutable after start + canonical content hash"]

    BR --> TRADES["Complete trade representation<br/>direct rows OR immutable reference + content hash"]
    BR --> EXECREC["Attempts, result artifact hashes,<br/>timestamps, and accepted data-quality exceptions"]

    ES --> STRAT["Strategy IDs / semantic versions / parameters<br/>component order"]
    ES --> COMBO["Combination-policy ID / version / config"]
    ES --> GEN["Generator ID / version<br/>search config / space / seed"]
    ES --> DATA["DatasetRef<br/>manifest, provider, symbols, range, timeframe,<br/>timezone, watermark / revision, integrity reference"]
    ES --> EXEC["Capital, side / position, fees, slippage, fills,<br/>rounding, stops, sizing rules"]
    ES --> BUILD["Backtest engine, Node.js runtime, dependency lock,<br/>application + worker build / commit, deterministic config"]
    ES --> RANK["Metric and ranking-policy versions / config"]
    ES --> NEWS["When applicable: news input-set identity,<br/>model / artifact / input / preprocessing versions"]
    ES --> RANDOM["All random seeds and nondeterminism declarations"]

    ONLY["Strategy version alone<br/>is insufficient"] -.->|"cannot substitute for full context"| ES

    classDef truth fill:#ecfdf5,stroke:#047857,color:#052e16;
    classDef warning fill:#fff7ed,stroke:#c2410c,color:#431407,stroke-dasharray: 5 5;
    class BR,ES truth;
    class ONLY warning;
```

## Notes

- The leaderboard is never reconstructed as source truth; it links to the result and immutable specification.
- Historical reruns never resolve fields from current defaults, latest aliases, or mutable provider data.
- Deterministic reruns compare canonical trade/metric artifacts; declared nondeterminism uses the recorded tolerance.

## References

- [Baseline - Reproducibility rules](../architecture/architecture-baseline.md#reproducibility-rules)
- [Baseline - Persistence rules](../architecture/architecture-baseline.md#persistence-rules)
- [Proposal section 21 - Reproducibility model](../architecture/architecture-proposal.md#21-reproducibility-model)
- [ADR-005 - Transactional results and leaderboard](../adr/ADR-005-transactional-results-leaderboard.md)
- [ADR-006 - Immutable experiment specification](../adr/ADR-006-immutable-experiment-provenance.md)
- [PROOF-REP-001](../validation/architecture-proof-plan.md#proof-rep-001---leaderboard-reproducibility)
