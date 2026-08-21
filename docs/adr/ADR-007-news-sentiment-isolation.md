# ADR-007 - News Collection and Sentiment Isolation

**Status:** ACCEPTED
**Decision ID:** D-10
**Related Problem IDs:** P-1.4, P-4.1, P-4.2, P-5.5
**Related Scenario IDs:** QA-ISO-001, QA-ISO-002, QA-ML-001
**Normative baseline:** [`architecture-baseline.md`](../architecture/architecture-baseline.md) v1.1

## Context

News providers/parsers and sentiment models change/fail for different reasons. The project explicitly asks whether News failure leaves charts working and whether a model can be replaced without changing Strategy. Crawling and model inference also have external/security/resource profiles unlike market charts or technical backtests.

## Decision

Keep News Intelligence as one logical module with separate components/ports:

```text
NewsProvider -> Collector -> normalized NewsItem -> SentimentAnalyzer -> SentimentResult
```

Route collection and sentiment work to queues/workers isolated from market and backtest workers. Persist normalized items, attempts/failures, model/artifact/input versions, and results. Expose a normalized SentimentFeature query to experiment context assembly; Strategy never imports a concrete model or crawler.

Realize News Intelligence in the Node.js/TypeScript core and bind a replaceable implementation to the framework-independent `SentimentAnalyzer` port. That implementation may be Node-compatible, hosted, or later Python-backed when a selected model/library provides a concrete benefit. Strategy and Experiment know only the normalized sentiment contract; the collector does not depend directly on a Python model.

Collector failure does not invoke or fail the model path. Model failure blocks/degrades only sentiment-dependent candidates according to explicit policy.

## Alternatives considered

- **Crawler/model inside API:** simplest calls but couples external failures and heavy inference to interactive paths.
- **Crawler directly calls a fixed model:** fewer components but provider/model changes ripple together.
- **Independent news and model microservices:** maximum deployment independence but unnecessary network/operations complexity for MVP.
- **Logical boundaries + routed worker role:** selected.

## Why this option

It supplies the failure/change isolation demanded by the sources without creating independent services. It also records the provenance needed when sentiment affects an experiment.

## Consequences

- News/sentiment results are eventually available.
- Dependent candidates need an explicit missing/stale-sentiment policy.
- Provider and model adapters get independent contract tests.
- The module may later split process queues without changing public contracts.
- Introducing a Python model runtime adds an operational/runtime boundary but does not change the core module or domain contracts.

## Risks

- Hostile/untrusted content can stress parsers or prompt-based models.
- Licensing may prohibit storing full content.
- Model aliases/endpoints may change without immutable artifacts.
- Stale sentiment windows can be silently misused if timestamps/quality are not explicit.

## Evidence / validation

- PROOF-ISO-001 disables News and verifies market/technical paths.
- PROOF-ISO-002 disables inference and verifies conditional degradation.
- Model/provider contract tests replace each adapter independently.
- PROOF-REP-001 checks news/input/model/preprocessing provenance when applicable.

## Revisit triggers

- model resource/latency needs independent service deployment;
- public crawling introduces stronger sandbox/network/security requirements;
- licensing requires a different NewsItem storage contract;
- sentiment becomes a realtime low-latency dependency with a new availability target.

## Affected architecture sections

Baseline: News Intelligence, Runtime communication, Data ownership, Reproducibility, Deployment.
Proposal: sections 12 D-10, 17 ARC-NEWS, 18.5/18.6, 19-23.

## Supersedes / Superseded by

Supersedes: none.
Superseded by: none.
