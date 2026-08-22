# 05 - News and Sentiment

News collection behind a provider port, normalized and deduplicated items, sentiment
analysis behind a language-independent port, and the isolation that keeps a news or
model failure away from charts and backtests.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

| Version | Slices |
|---|---|
| V5 | `NEWS-01`, `NEWS-02`, `NEWS-03`, `NEWS-04`, `NEWS-05`, `NEWS-07` |
| V5 optional | `NEWS-06` |

Completing V5 completes the MVP list in section 37 of the official project source.

## Why this area is deliberately kept at arm's length

The assignment asks two direct questions: does the chart still work if the news
service fails, and does the strategy engine change if the sentiment model changes.
ADR-007 answers both by keeping collection and inference in separate components,
with Strategy seeing only a normalized sentiment feature.

The MVP requirement here is modest - collect, store, analyze - and this area should
stay modest. The architecture value is in the boundaries, not in model quality.

## How the pipeline works without a queue

V5 has no BullMQ; `MSG-01` and the routed queues arrive in V6. Collection and
inference are still fully isolated, using two independent stages in the news worker
process that communicate only through durable state:

```text
collector stage   -> writes NewsItem with analysisState = pending
analyzer stage    -> claims pending items, writes SentimentResult
```

Neither stage calls the other. A collector failure writes source health and stops; it
cannot invoke or fail the model path, which is exactly what ADR-007 requires. An
analyzer failure records an attempt and leaves the item intact and reclaimable.

`PROOF-ISO-001` and `PROOF-ISO-002` are both provable against this shape, because
they test process and component isolation, not the transport between them. In V6 the
stage boundary becomes a routed BullMQ queue with the `MSG-01` outbox; the stages
themselves do not change.

## Two decisions block work here

- `NEWS-02` needs concrete news sources. ADR-007 names licensing and rate policy as a
  real risk, so the sources need review before collection starts.
- `NEWS-04` needs the concrete sentiment model or service, which also decides whether
  the optional Python runtime behind `SentimentAnalyzer` is justified.

Both are in the decisions table in
[`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md). Resolve them
during V4 so they do not stall V5.

## The Python question

The baseline allows Python **only** behind the `SentimentAnalyzer` port, and only
when a selected model or library gives a concrete benefit. The default is a
Node-compatible or hosted implementation. Choosing Python changes the adapter and the
deployment and adds conditional provenance fields; it changes no contract and no
other module. Choosing it without that concrete benefit would be adding technology
without a traced problem, which the baseline forbids.

---

## NEWS-01 - News item contract, provider port, and contract suite

**Version:** V5 · **Priority:** REQ · **Effort:** M

**Outcome**
A normalized `NewsItem` type, a `NewsProvider` port, deterministic normalization and
deduplication, and a reusable contract suite that any news provider adapter must
pass. A fake provider passes the suite.

**Why this slice exists**
The official source states plainly that the system must not be tied to one crawler.
This port and this suite are that statement in code, and they mirror the shape that
already worked for market providers in `MKT-01`.

**Dependencies**
`SETUP-05`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `NewsItem` carries normalized source and content identity and provenance.
- [ADR-003](../docs/adr/ADR-003-provider-adapters.md): News Intelligence owns news item identity, normalization, source provenance, and deduplication.
- [ADR-007 - Decision](../docs/adr/ADR-007-news-sentiment-isolation.md): the pipeline shape from provider through collector to normalized item to analyzer to result.
- Official project source sections 27 and 28.

**Architecture constraints**
- `NewsItem` carries identifier, title, content, source, published time, collected
  time, related coins, the source link, and an analysis state.
- Item identity is deterministic so the same article from the same source
  deduplicates reliably.
- The contract lives in `news/domain` with no framework, HTTP, or database import.
- News Intelligence must never import Strategy or Experiment internals.
- The collector never calls a model. That coupling is exactly what ADR-007 forbids.
- Hostile or malformed content is an expected input, not an exceptional one.

**Expected change surface**
`news/domain` item type, the provider port, normalization and deduplication rules, a
reusable contract suite, and a fake provider.

**Acceptance criteria**
1. `NewsItem` exists with the fields listed above.
2. The contract suite checks required fields, timestamp normalization to a single
   timezone, stable identity, deduplication of the same article, and clear behaviour
   for an unreachable source.
3. The fake provider passes the whole suite.
4. The same article collected twice produces one item.
5. Malformed or oversized content is rejected or truncated by a documented rule
   rather than crashing the collector.
6. Nothing in `news/domain` imports a model, a framework, or a database.

**Validation**
Run the contract suite against the fake provider and against a deliberately broken
fake.

**Out of scope**
Any real source, persistence, sentiment, scheduling.

**Proof relevance**
Contributes to `PROOF-ISO-001`.

---

## NEWS-02 - Collection worker and first provider adapter

**Version:** V5 · **Priority:** REQ · **Effort:** M

**Outcome**
A news worker process collects from at least one real configured source through the
`NEWS-01` port, normalizes and deduplicates the items, and commits them with an
analysis state of pending. Source health is recorded.

**Why this slice exists**
It delivers the collect and store halves of the MVP news pipeline and creates the
failure surface that `PROOF-ISO-001` later switches off.

**Dependencies**
`NEWS-01`, `SETUP-04`. **Blocked** until concrete news sources are approved.

**Authoritative references**
- [Baseline - Deployment topology](../docs/architecture/architecture-baseline.md#deployment-topology): a news and sentiment worker process role.
- [ADR-007 - Decision](../docs/adr/ADR-007-news-sentiment-isolation.md): route collection and sentiment work away from market and backtest workers; collector failure does not invoke or fail the model path.
- Official project source section 27.
- The "How the pipeline works without a queue" section at the top of this file.

**Architecture constraints**
- The news worker is its own process. It never shares a process with the backtest
  runner or with market ingest.
- The collector writes items with analysis state pending and stops. It never calls
  the analyzer, directly or indirectly.
- Collection commits items in one transaction. In V6 an outbox row joins that
  transaction through `MSG-01`; structure the commit so that is an addition, not a
  rewrite.
- Collector failure records source health and does not raise an error outside News.
- Rate limits and terms of use for the configured source are respected; a source is
  configuration, not a constant.
- News Intelligence owns its tables. Nothing else writes them.

**Expected change surface**
Migrations for news item and source health tables, the first real provider adapter,
the news worker entry command, a collection scheduler and a manual trigger, and
tests.

**Acceptance criteria**
1. The adapter passes the `NEWS-01` contract suite unchanged.
2. A collection run stores new items and skips already-seen ones.
3. Stored items have analysis state pending.
4. A source that fails records degraded source health and does not raise an error
   outside News.
5. No sentiment code path is reached by collection, proved by a test that fails if
   the collector references the analyzer.
6. The news worker runs as its own process, provable by stopping the backtest runner
   and seeing collection continue, and the reverse.
7. Collection can be triggered manually as well as on a schedule.

**Validation**
Adapter tests against recorded fixtures, the no-analyzer-reference test, isolation
tests stopping each process in turn, and a manual collection run inspected in the
database.

**Out of scope**
Sentiment analysis, the news page, multi-source aggregation beyond the first adapter.

**Proof relevance**
Directly required by `PROOF-ISO-001`.

---

## NEWS-03 - Analyzer port, result contract, and inference lifecycle

**Version:** V5 · **Priority:** REQ · **Effort:** M

**Outcome**
A framework- and language-independent `SentimentAnalyzer` port, a versioned
`SentimentResult`, and a durable inference lifecycle stage that claims pending items,
records attempts and failures, and stores results with their model and input
versions. A fake analyzer proves the lifecycle.

**Why this slice exists**
This port is the boundary the assignment asks about - if the sentiment model changes,
is the strategy engine affected? Building the lifecycle before any real model means
the model choice cannot leak into it.

**Dependencies**
`NEWS-02`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `SentimentResult` carries a news reference, label and score, model, artefact and version, input and preprocessing version, timestamp, and status.
- [ADR-007 - Decision](../docs/adr/ADR-007-news-sentiment-isolation.md): the analyzer port is framework and language independent; model failure records an attempt and a retry or degraded state without losing the normalized item.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 8.

**Architecture constraints**
- The port names no model, no library, and no language. It maps an item and an input
  version to a versioned result.
- The analyzer stage claims pending items from durable state. It is never called by
  the collector.
- Every inference attempt is durable, including failures, with a reason.
- Model identifier, artefact identity, model version, input version, and
  preprocessing version are recorded on every result.
- A model alias such as "latest" is not acceptable as recorded provenance.
- Model failure never loses the normalized item.
- Claiming uses the same lease pattern as `EXP-04`, so a dead worker's claim is
  recoverable.

**Expected change surface**
The analyzer port, the result type, migrations for result and attempt tables, the
analyzer stage in the news worker, and a fake analyzer for tests.

**Acceptance criteria**
1. The port has no model-specific or language-specific type in its signature.
2. A successful inference commits a result with the full version set and moves the
   item out of pending.
3. A failed inference records the attempt with its reason and leaves the item intact
   and retryable.
4. Retries are bounded and their policy is explicit; exhausted retries leave a
   visible degraded state rather than a silent gap.
5. Two analyzer stages running at once never analyze the same item twice.
6. Recorded model provenance contains no alias.
7. Swapping the fake analyzer for another fake requires only a binding change.

**Validation**
Lifecycle integration tests for success, failure, retry exhaustion, concurrent
claiming, and lease recovery, all using fake analyzers.

**Out of scope**
Any real model, the sentiment feature query, the news page.

**Proof relevance**
Directly required by `PROOF-ISO-002` and contributes to `PROOF-REP-001` item 8.

---

## NEWS-04 - First real sentiment analyzer

**Version:** V5 · **Priority:** REQ · **Effort:** M

**Outcome**
One real analyzer is bound to the `NEWS-03` port and classifies collected items as
positive, neutral, or negative with a score, recording its full version set.

**Why this slice exists**
It completes the MVP's analyze step. Because `NEWS-03` did the lifecycle work, this
slice is only an adapter.

**Dependencies**
`NEWS-03`. **Blocked** until the model or service is chosen.

**Authoritative references**
- [Baseline - Technology decisions](../docs/architecture/architecture-baseline.md#technology-decisions): Python is optional only behind the `SentimentAnalyzer` boundary when a selected model or library provides a concrete benefit.
- [ADR-007](../docs/adr/ADR-007-news-sentiment-isolation.md).
- Official project source section 29.

**Architecture constraints**
- The implementation lives entirely in `news/infrastructure`. Strategy and Experiment
  never learn what it is.
- The model artefact identity is pinned. A moving endpoint or a floating alias must
  be labelled as not reproducible rather than recorded as if it were.
- If a Python runtime is used, it sits behind the port as its own process or service,
  and its runtime and dependency identity join the recorded provenance.
- Adding this implementation must change no contract and no other module.

**Expected change surface**
The analyzer adapter, its configuration, its provenance capture, its binding, and
tests. Possibly a model runtime container if Python is chosen.

**Acceptance criteria**
1. Real items are classified into positive, neutral, or negative with a score.
2. The recorded provenance identifies the model, its artefact, and its version
   precisely enough to run it again.
3. If the artefact cannot be pinned, the result is explicitly labelled as not
   reproducible.
4. The diff touches `news/infrastructure`, configuration, and tests only.
5. Making the model unavailable produces recorded failed attempts, not a crash and
   not a lost item.
6. Classification runs on the news worker, never in the API process.

**Validation**
Tests on a labelled sample set with an accuracy figure recorded for information
rather than as a gate. An availability test with the model deliberately unreachable.
Inspect the diff for criterion 4.

**Out of scope**
Model training, accuracy tuning, multiple competing models, price prediction.

**Proof relevance**
Directly required by `PROOF-ISO-002`.

---

## NEWS-05 - Sentiment feature query and degradation policy

**Version:** V5 · **Priority:** REQ · **Effort:** S

**Outcome**
A `SentimentFeature` query returns time-windowed normalized sentiment for a symbol
without exposing the model, and an explicit policy states what happens to a
sentiment-dependent candidate when sentiment is missing or stale.

**Why this slice exists**
This is the only surface Strategy and Experiment may use, and ADR-007 warns that a
stale sentiment window can be silently misused if timestamps and quality are not
explicit.

**Dependencies**
`NEWS-04`.

**Authoritative references**
- [Baseline - Allowed dependency directions](../docs/architecture/architecture-baseline.md#allowed-dependency-directions): Experiment may depend on the News Intelligence sentiment-feature port when requested.
- [ADR-007 - Decision and Risks](../docs/adr/ADR-007-news-sentiment-isolation.md): a normalized sentiment feature query; dependent candidates need an explicit missing or stale sentiment policy.
- Official project source section 30.

**Architecture constraints**
- The feature exposes normalized values and their quality, never model internals.
- Every response carries its window, its item count, its freshness, and its quality
  state.
- The missing and stale policy is explicit configuration - block, degrade, or
  substitute - and is recorded on any result that used it.
- A technical-only experiment must never touch this path.

**Expected change surface**
The feature query in `news/application`, its export from `NewsModule`, the policy
type and its evaluation, and tests.

**Acceptance criteria**
1. A windowed query returns aggregate sentiment plus item count, window bounds, and
   freshness.
2. No model, artefact, or provider detail appears in the response.
3. Missing sentiment yields the configured behaviour, and the choice is visible in
   the response.
4. Stale sentiment beyond the configured age is reported as stale rather than
   returned as current.
5. A result produced with sentiment records the window identity and the model
   versions used.
6. A technical-only experiment produces no call to this port, proved by a test.

**Validation**
Tests for the windowed query, the missing case, the stale case, and the
technical-only isolation case.

**Out of scope**
The news page, which is `UI-07`. A sentiment strategy, which is `NEWS-06`.

**Proof relevance**
Directly required by `PROOF-ISO-002` and contributes to `PROOF-REP-001` item 8.

---

## NEWS-07 - News list, health, and sentiment query surface

**Version:** V5 · **Priority:** REQ · **Effort:** S

**Outcome**
Endpoints return collected news items with paging, the sentiment distribution over a
window, and collection and analysis health.

**Why this slice exists**
The News page needs these three reads. The earlier plan gave the page to a slice with
no backend slice owning the endpoints it required.

**Dependencies**
`NEWS-05`.

**Authoritative references**
- [Baseline - Logical modules, ARC-NEWS](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): News Intelligence owns sentiment-feature queries and degraded state.
- Sample interface image showing the item list, the sentiment distribution, the analyzed count, and source coverage.
- Official project source sections 27 and 29.

**Architecture constraints**
- The API composes from the News query port. It performs no aggregation of its own.
- The distribution is computed by News, not by the page.
- Health reads expose degraded states explicitly, because they are the visible half
  of the isolation proofs.
- No model, artefact, or provider internal detail is exposed.
- The news reads must not sit on any shared loading path, so that a News failure
  cannot affect another page.

**Expected change surface**
Query ports in `news/application`, controllers and DTOs in `ApiModule`, response
types in `packages/api-contracts`, and API client methods.

**Acceptance criteria**
1. The item list is paginated and returns title, source, published time, related
   coins, and analysis state.
2. The distribution read returns positive, neutral, and negative proportions with the
   item count and window bounds.
3. The health read reports collection health and analysis health, including degraded
   states with reasons.
4. All three degrade gracefully when the news worker is stopped, returning a
   degraded state rather than an error.
5. No model or provider internal detail appears in any response.
6. A failure in these endpoints cannot affect the chart, backtest, or discovery
   endpoints, proved by a test.

**Validation**
Endpoint integration tests for healthy, collection-degraded, and analysis-degraded
states, plus the isolation test in criterion 6.

**Out of scope**
The page, which is `UI-07`. Source configuration editing.

**Proof relevance**
Directly required by `PROOF-ISO-001` and `PROOF-ISO-002`.

---

## NEWS-06 - Sentiment as a strategy (optional)

**Version:** V5 · **Priority:** OPTIONAL · **Effort:** M

**This slice is optional.** It is not part of V5's Definition of Demoable, and V5 is
complete without it. Build it only if V5 finishes with time to spare. Do not let it
block the version, and do not treat it as required work in the tracker.

**Outcome**
A `NewsSentimentStrategy` registered through the `STRAT-01` contract, consuming
sentiment through the `AnalysisContext` and producing buy, sell, or hold from a
threshold. It can be combined with technical strategies.

**Why this slice exists**
The official source calls this "an interesting architecture point" and the demo
scenario adds it at step 9. It is not in the MVP list in section 37, which is why it
is optional. It is the cheapest possible demonstration that the strategy contract is
not limited to technical analysis.

**Dependencies**
`NEWS-05`, `STRAT-04`.

**Authoritative references**
- Official project source section 30 and section 46 steps 9 and 10.
- [ADR-002](../docs/adr/ADR-002-strategy-and-search-contracts.md): a new strategy is an implementation plus a descriptor plus registration.
- [ADR-007](../docs/adr/ADR-007-news-sentiment-isolation.md): Strategy never imports a concrete model or crawler.

**Architecture constraints**
- The strategy declares sentiment as a required input in its descriptor. It does not
  fetch it.
- The context supplies sentiment through the `NEWS-05` port. The strategy never
  imports anything from News.
- Adding it must change no existing strategy, no combination policy, and no backtest,
  evaluation, or ranking code.
- A candidate using this strategy is subject to the missing and stale sentiment
  policy.

**Expected change surface**
The strategy implementation, its descriptor, its registration, context assembly
extended to supply the sentiment feature when a descriptor requires it, and tests.

**Acceptance criteria**
1. The strategy produces buy above a configured positive threshold, sell below a
   configured negative threshold, and hold otherwise.
2. Thresholds and the window come from the descriptor's parameter schema.
3. It combines with technical strategies through the existing composite and policy
   types with no change to either.
4. The diff touches no existing strategy and no backtest, evaluation, or ranking
   code.
5. With sentiment missing, the configured policy applies and is visible in the
   result.
6. It appears in the strategy catalog with no frontend change.

**Validation**
Unit tests for each signal case, a composite test combining it with a technical
strategy, and a missing-sentiment test. Inspect the diff for criterion 4.

**Out of scope**
Price prediction, market regime detection, model-driven strategy generation.

**Proof relevance**
A second, harder demonstration of `PROOF-EXT-001`'s claim - that the strategy
contract accepts a non-technical input. `PROOF-EXT-001` itself already passed in V2
using MACD, so nothing depends on this.
