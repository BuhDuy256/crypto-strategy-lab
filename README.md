# Crypto Strategy Lab

Crypto Strategy Lab is an architecture-first platform for crypto market data, strategy experimentation, backtesting, candidate search/evaluation, and leaderboard analysis. It also includes an isolated news/sentiment capability and is designed around extensibility, failure isolation, and reproducible experiment results. The repository currently contains the accepted architecture and validation plan; application code has not been started.

## Current project status

- **Architecture:** `FROZEN v1.1`
- **Validation:** `PENDING IMPLEMENTATION PROOFS`
- **Implementation:** `NOT STARTED`

`FROZEN ≠ PROVEN`: the baseline is normative for implementation, but its proof obligations still require implementation evidence.

## Architecture at a glance

| Area | Selection |
|---|---|
| Architecture style | Modular Monolith with selectively separated process roles |
| Core backend | Node.js + TypeScript + NestJS |
| Frontend | React + TypeScript |
| Durable storage | PostgreSQL |
| Async processing | BullMQ + persistence-configured Redis |
| Realtime client transport | NestJS WebSocket Gateway |
| Best-effort live fan-out | Redis Pub/Sub after authoritative state/projection updates |
| Optional ML runtime | Python only behind `SentimentAnalyzer` when a selected model/library justifies it |

PostgreSQL is authoritative durable truth. BullMQ/Redis carries correctness-relevant asynchronous work; Redis Pub/Sub is only ephemeral notification.

## High-level project structure

```text
crypto-strategy-lab/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── .agents/
│   ├── architecture-freeze.yaml
│   ├── skill-manifest.yaml
│   ├── skill-lock.yaml
│   └── skills/
├── .claude/
│   ├── settings.json
│   └── skills/
├── .codex/
│   └── config.toml
├── docs/
│   ├── architecture/
│   │   ├── architecture-baseline.md
│   │   ├── architecture-baseline-v1.md
│   │   └── architecture-proposal.md
│   ├── adr/
│   │   └── ADR-001 ... ADR-009
│   ├── diagrams/
│   │   ├── README.md
│   │   └── 01 ... 10 architecture views
│   ├── requirements/
│   └── validation/
│       └── architecture-proof-plan.md
└── scripts/
    └── check-repo-governance.ps1
```

## Recommended review order

1. [Diagram index](docs/diagrams/README.md)
2. [Problem Tree](docs/diagrams/01-problem-tree.md)
3. [Decision Tree](docs/diagrams/02-decision-tree.md)
4. [System Context](docs/diagrams/03-system-context.md)
5. [Container / Runtime View](docs/diagrams/04-container-runtime-view.md)
6. [Module Boundaries](docs/diagrams/05-module-boundaries.md)
7. [Frozen architecture baseline v1.1](docs/architecture/architecture-baseline.md) — normative source
8. The ADRs relevant to the area under review
9. [Architecture Proof Plan](docs/validation/architecture-proof-plan.md)
10. [Architecture Proposal](docs/architecture/architecture-proposal.md) for deeper reasoning and trade-offs

The diagrams are the quick entry point, the baseline defines what implementation must obey, and the ADRs/proposal explain why those decisions were made.

## Main logical modules

- **ARC-API — API / Presentation:** Owns HTTP/WebSocket transport, DTO validation, client subscription/session state, push behavior, and query composition. It contains no strategy, backtest, ranking, or provider business logic.
- **ARC-MARKET — Market Data:** Owns provider adapters, normalized candles, ingestion, validation, deduplication, gap recovery, datasets, persistence, and provider health.
- **ARC-STRATEGY — Strategy:** Owns strategy contracts/implementations, registry metadata, normalized signals, composition policies, and `StrategyGenerator` contracts/implementations.
- **ARC-EXPERIMENT — Experiment:** Owns immutable experiment specifications, run control, candidate/job lifecycle, backtesting, evaluation, ranking, result acceptance, provenance, and leaderboard projection.
- **ARC-NEWS — News Intelligence:** Owns news collection/normalization, sentiment analysis adapters, inference lifecycle, versioned results, and sentiment-feature queries.

Cross-module access uses exported application/domain ports. A logical module is not automatically a deployment boundary.

## Key runtime flows

- [Experiment / Backtest Flow](docs/diagrams/06-experiment-backtest-flow.md)
- [Realtime Market Flow](docs/diagrams/07-realtime-market-flow.md)
- [News / Sentiment Flow](docs/diagrams/08-news-sentiment-flow.md)
- [Reproducibility / Provenance Map](docs/diagrams/09-reproducibility-provenance-map.md)
- [Proof Coverage Map](docs/diagrams/10-proof-coverage-map.md)

## Architecture decisions

- [ADR-001 — Modular Monolith with Process-Role Separation](docs/adr/ADR-001-modular-monolith-process-roles.md)
- [ADR-002 — Strategy Extensibility and Search Replaceability Contracts](docs/adr/ADR-002-strategy-and-search-contracts.md)
- [ADR-003 — Provider Adapters and Normalized Contracts](docs/adr/ADR-003-provider-adapters.md)
- [ADR-004 — Asynchronous Experiment Processing](docs/adr/ADR-004-asynchronous-experiment-processing.md)
- [ADR-005 — Transactional Results and Derived Leaderboard](docs/adr/ADR-005-transactional-results-leaderboard.md)
- [ADR-006 — Immutable Experiment Specification and Provenance](docs/adr/ADR-006-immutable-experiment-provenance.md)
- [ADR-007 — News Collection and Sentiment Isolation](docs/adr/ADR-007-news-sentiment-isolation.md)
- [ADR-008 — Realtime Delivery and Market Recovery](docs/adr/ADR-008-realtime-delivery-recovery.md)
- [ADR-009 — Technology Realization for Baseline v1.1](docs/adr/ADR-009-technology-realization.md)

## Development workflow

Future work follows a gated path from research/problem evidence to specification, architecture conformance, implementation tickets, TDD implementation, two-axis code review, and architecture proof. Architecture constraints apply throughout rather than as a one-time design step.

The [Development Workflow](docs/agents/development-workflow.md) identifies the repository-local skill, authoritative inputs, artifact, validation or human gate, next phase, and freeze constraint for each step. The [Architecture Proof Plan](docs/validation/architecture-proof-plan.md) remains authoritative for implementation evidence: `FROZEN` is not `PROVEN`.

## What the team should review now

- [ ] Are module responsibilities and data ownership clear?
- [ ] Are the allowed dependency directions acceptable?
- [ ] Does the NestJS module/composition mapping preserve the logical boundaries?
- [ ] Are PostgreSQL, BullMQ/Redis, and Redis Pub/Sub responsibilities distinct and acceptable?
- [ ] Is the transactional outbox → BullMQ durable delivery path acceptable?
- [ ] Is optional Python sufficiently isolated behind `SentimentAnalyzer`?
- [ ] Are the immutable provenance and reproducibility requirements realistic?
- [ ] Do any unresolved product policies block the first implementation slice?

Open product/configuration choices remain intentionally undecided: ranking weights and tie-breaking; capital, fee, slippage, fill, sizing, and stop defaults; concrete news providers and sentiment model; measurable performance targets and test hardware; authentication; and retention. The team should confirm or schedule these decisions rather than allowing hidden implementation defaults.

## Next phase

Implementation against the frozen baseline, starting with a Walking Skeleton / architecture proof-oriented vertical slice.

No application implementation is included in the current repository state.
