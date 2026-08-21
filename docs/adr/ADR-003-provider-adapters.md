# ADR-003 - Provider Adapters and Normalized Contracts

**Status:** ACCEPTED
**Decision ID:** D-03
**Related Problem IDs:** P-1.3, P-1.4, P-3.3, P-3.4, P-3.5
**Related Scenario IDs:** QA-MOD-003, QA-REL-001
**Original normative baseline:** [`architecture-baseline-v1.md`](../architecture/architecture-baseline-v1.md) v1; carried forward unchanged by [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

Binance is required initially, but the specification explicitly asks how another exchange can be added without frontend changes. News sources have the same variability. Provider payloads, connection behavior, identifiers, errors, timestamps, rate limits, and revisions differ.

## Decision

Define MarketDataProvider and NewsProvider ports. Each adapter translates source-specific behavior into validated normalized contracts owned by the receiving module. BinanceAdapter is the initial market implementation. Provider payloads never cross into Strategy, Experiment, or the frontend.

Market Data owns candle identity, closed/revision meaning, validation, deduplication, gap detection, recovery, and dataset manifests. News Intelligence owns NewsItem identity, normalization, source provenance, and deduplication.

## Alternatives considered

- **Frontend/domain calls provider directly:** lowest adapter code, highest coupling and credential/format leakage.
- **Generic dictionary/JSON wrapper:** hides source name but not semantic differences; errors move downstream.
- **Canonical internal contract with provider extensions:** useful only if core normalized semantics are explicit; selected contracts may retain opaque source metadata outside domain decisions.

## Why this option

Adapters isolate the exact variability named by the source while keeping one stable language for charts, strategies, experiments, news analysis, and future providers.

## Consequences

- Every provider needs a common conformance suite and explicit unsupported-capability behavior.
- Normalization can lose provider-specific details; preserve non-authoritative source metadata for diagnostics.
- Provider health/recovery remains inside the owning module.
- Dataset provenance always records provider identity and revision/watermark.

## Risks

- A “lowest common denominator” Candle/NewsItem may omit required future semantics.
- Timestamp/timeframe normalization errors can create silent gaps or look-ahead bias.
- News collection may violate provider terms if license/rate policy is not reviewed.

## Evidence / validation

- PROOF-PROVIDER-001 runs the provider contract against a second/fake adapter.
- PROOF-RT-001 exercises disconnect, gap recovery, and deduplication.
- Dataset/provenance tests verify provider and revision identity.

## Revisit triggers

- a provider has materially different market semantics not representable without corrupting Candle meaning;
- multi-exchange reconciliation becomes a domain requirement;
- news licensing requires storing references rather than content;
- provider-specific capability discovery must become user-visible.

## Affected architecture sections

Baseline: Market Data, News Intelligence, Contracts, Runtime communication, Data ownership, Reproducibility.
Proposal: sections 12 D-03, 17 ARC-MARKET/ARC-NEWS, 18.1/18.5, 19-21.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
