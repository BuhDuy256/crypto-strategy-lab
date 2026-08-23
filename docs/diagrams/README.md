# Architecture Diagrams

## Purpose

This directory is the diagram-first entry point to the Crypto Strategy Lab architecture. It gives readers a fast visual path into the problems, decisions, boundaries, runtime flows, provenance, and planned implementation proofs without repeating the full architecture reasoning.

The diagrams explain the architecture; they are not authoritative. If a diagram conflicts with a text artifact, use this order of precedence:

1. [Frozen architecture baseline v1.2](../architecture/architecture-baseline.md)
2. [Accepted ADRs](../adr/)
3. [Architecture proposal](../architecture/architecture-proposal.md)
4. [Architecture proof plan](../validation/architecture-proof-plan.md)
5. Diagram files in this directory

## Diagram index

| Diagram | Purpose | Main references |
|---|---|---|
| [01 - Problem Tree](01-problem-tree.md) | Show the architecture problems | Proposal sections 8 and 11 |
| [02 - Decision Tree](02-decision-tree.md) | Trace problems to decisions and realizations | Proposal sections 12-13; ADR-001 through ADR-009 |
| [03 - System Context](03-system-context.md) | Show actors and external systems | Baseline System boundaries; proposal section 15 |
| [04 - Container / Runtime View](04-container-runtime-view.md) | Show runtime roles and communication semantics | Baseline Runtime communication and Deployment topology; ADR-001/004/005/008/009 |
| [05 - Module Boundaries](05-module-boundaries.md) | Show logical ownership and allowed dependencies | Baseline Logical modules and Allowed dependency directions; ADR-001/002/003/007/009 |
| [06 - Experiment / Backtest Flow](06-experiment-backtest-flow.md) | Follow an experiment from command to notification | Baseline Runtime communication and Persistence rules; ADR-004/005/006 |
| [07 - Realtime Market Flow](07-realtime-market-flow.md) | Show live delivery and durable recovery | Baseline Runtime communication and Events; ADR-003/008/009 |
| [08 - News / Sentiment Flow](08-news-sentiment-flow.md) | Show model and provider isolation behind contracts | Baseline ARC-NEWS; ADR-007/009 |
| [09 - Reproducibility / Provenance Map](09-reproducibility-provenance-map.md) | Trace a leaderboard entry to immutable experiment truth | Baseline Reproducibility rules; ADR-005/006 |
| [10 - Proof Coverage Map](10-proof-coverage-map.md) | Map architecture claims to planned evidence | Architecture proof plan and related ADRs |

## Recommended reading order

1. [Problem Tree](01-problem-tree.md)
2. [Decision Tree](02-decision-tree.md)
3. [System Context](03-system-context.md)
4. [Container / Runtime View](04-container-runtime-view.md)
5. [Module Boundaries](05-module-boundaries.md)
6. [Experiment / Backtest Flow](06-experiment-backtest-flow.md), [Realtime Market Flow](07-realtime-market-flow.md), and [News / Sentiment Flow](08-news-sentiment-flow.md)
7. [Reproducibility / Provenance Map](09-reproducibility-provenance-map.md)
8. [Proof Coverage Map](10-proof-coverage-map.md)
9. [Frozen architecture baseline v1.2](../architecture/architecture-baseline.md)
10. The relevant [accepted ADRs](../adr/) and the [full proposal reasoning](../architecture/architecture-proposal.md)

Names such as `P-*`, `D-*`, `ADR-*`, `ARC-*`, and `PROOF-*` follow the traceability identifiers in the proposal and proof plan.
