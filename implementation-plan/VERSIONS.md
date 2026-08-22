# Product Versions

The roadmap. Six cumulative product versions, each one independently demoable.

Read [`README.md`](README.md) first. Slice status lives in [`TRACKING.md`](TRACKING.md).

## The rule this roadmap exists to enforce

> There must never be a state where most of the project is implemented but no
> completed version can be shown to anyone.

Every version below is a working product. If work stops after any tagged version,
what remains is coherent and demonstrable, not a half-connected set of mechanisms.

```text
V1  Backtesting Lab                          DEMOABLE
 |
V2  Extensible Strategy Engine               DEMOABLE
 |
V3  Automated Discovery                      DEMOABLE
 |
V4  Realtime Market Data                     DEMOABLE
 |
V5  News and Sentiment                       DEMOABLE - MVP COMPLETE
 |
V6  Async Execution, Reliability, Proofs     FINAL DEMO
```

The official project source's MVP list in section 37 is complete at the end of
**V5**. V6 adds no new user-facing capability; it evolves the architecture and
produces the remaining proof evidence. That split is deliberate: it means running
out of time during V6 costs architecture maturity, never MVP scope.

## How a version relates to the frozen architecture

The frozen baseline is the **final target**. Versions V1 through V5 reach that
target progressively. Where an intermediate version uses a simpler realization, it
does so behind a stable port so the later swap changes an adapter, not the domain.

Every such simplification is listed in
[Planned realization evolution](#planned-realization-evolution) below with its
driver, its seam, and the version that closes it. Nothing is simplified silently.

One divergence is an open architecture deviation awaiting formal review, and it blocks
`EXP-04`. It is described in
[The one open architecture question](#the-one-open-architecture-question).

---

## V1 - Backtesting Lab

**Tag:** `v1.0-demo`

### Goal

Load real Binance historical candles, run one strategy over them, and see the
simulated trades and the four required metrics.

### User-visible scope

A person can pick a symbol, timeframe, and date range; load the candles; see them
as a candlestick chart; choose the moving-average strategy and its parameters; run
a backtest; and read the resulting trades, buy and sell markers, and the four
metrics.

### Included implementation slices

25 slices.

| File | Slices |
|---|---|
| [00](00-setup-and-walking-skeleton.md) | `SETUP-01`, `SETUP-02`, `SETUP-03`, `SETUP-04`, `SETUP-05`, `SETUP-06` |
| [01](01-market-and-realtime.md) | `MKT-01`, `MKT-02`, `MKT-03`, `MKT-04`, `MKT-05`, `MKT-10` |
| [02](02-strategy-and-composition.md) | `STRAT-01`, `STRAT-02` |
| [03](03-experiment-backtest-evaluation.md) | `EXP-01`, `EXP-02`, `EXP-03`, `EXP-04`, `EXP-05`, `EXP-06`, `EXP-10`, `EXP-11` |
| [06](06-ui-and-demo-integration.md) | `UI-04`, `UI-05`, `DEMO-01` |

Six of the twenty-five are one-time environment setup. The functional product is
nineteen slices.

### Architecture maturity introduced

- React SPA and NestJS API as separate deployables, with no business logic in the
  frontend.
- The five frozen logical modules exist as real NestJS composition boundaries with
  explicit exported port surfaces.
- Automated boundary tests reject forbidden imports from the first week.
- `MarketDataProvider` port with Binance behind it, plus a provider contract suite
  that a second provider must pass.
- `Strategy` contract: a pure function of a supplied context, with a versioned
  descriptor and a registry. No type-switching on strategy kind.
- Evaluator separated from strategy implementation and from the backtester.
- `BacktestExecutor` port, with execution already outside the HTTP request path in
  its own process.
- Reproducible execution inputs: an immutable frozen run specification, an
  immutable dataset snapshot, and append-only candle revisions.
- Write side and read side as separate slices - `EXP-06` accepts a result, `EXP-10`
  serves it - so no page ever owns an endpoint.
- Generic visualization annotation primitives, so the chart never branches on a
  strategy identifier.

### Demo scenario

1. Start PostgreSQL, the API process, the backtest runner process, and the SPA.
2. Open the Backtest page. Choose BTCUSDT, `5m`, and a date range.
3. Load history. The chart renders the candles; the status line names the dataset
   snapshot and its hash.
4. Choose the moving-average strategy and set fast and slow periods.
5. Run the backtest. The page shows it running, then completed.
6. Read the trade table: entry time, entry price, exit time, exit price, direction,
   fees, slippage, profit and loss.
7. Read the four metrics: total return, win rate, maximum drawdown, number of
   trades.
8. See buy and sell markers and the moving-average overlay on the chart.
9. Re-run the same specification and show the result is identical.
10. Show the architecture point: the runner is a separate process, so stopping the
    API mid-backtest does not stop the backtest.

### Definition of Demoable

All must pass:

- A clean checkout reaches step 10 by following the root `README.md` alone.
- The four metrics match hand-checked values on a fixture.
- Re-running an identical specification produces an identical trade list.
- A frozen specification cannot be edited.
- The boundary test passes.
- The provider contract suite passes for both Binance and the fake provider.
- No strategy identifier appears as a literal anywhere in `apps/web`.
- Stopping the API process mid-backtest does not stop or corrupt the run.

### Architecture evidence

`PROOF-PROVIDER-001` - provider replaceability. The fake provider from `MKT-01`
already passes the contract suite, and its normalized candles render on the chart
with no frontend change. This proof is cheap here and it is real.

### Deferred to next version

Only one strategy exists, so there is nothing to combine and nothing to search. A
strategy catalog has no second entry to list. That is acceptable because the
extensibility claim is only interesting once there is something to extend, and V2
exists to demonstrate exactly that.

### Git checkpoint

`git tag v1.0-demo` on `main`, by the user, after every Definition-of-Demoable
condition passes.

---

## V2 - Extensible Strategy Engine

**Tag:** `v2.0-demo`

### Goal

Four independent strategies plus composite strategies, proving that adding a
strategy touches the strategy module and nothing else.

### User-visible scope

A person can browse a strategy catalog that the system generates from its own
registry, combine several strategies into a composite with weights and a
combination rule, save that composite, and backtest it exactly like a single
strategy. Four charts with independent timeframes are on screen.

### Included implementation slices

7 slices.

| File | Slices |
|---|---|
| [01](01-market-and-realtime.md) | `MKT-08` |
| [02](02-strategy-and-composition.md) | `STRAT-03`, `STRAT-04`, `STRAT-05`, `STRAT-08` |
| [06](06-ui-and-demo-integration.md) | `UI-02`, `UI-06` |

### Architecture maturity introduced

- Strategy registry with four registered strategies and no conditional dispatch.
- Immutable `CompositeStrategy` definitions.
- Versioned `CombinationPolicy` as its own replaceable component, independent of
  which strategies it combines.
- A frontend catalog driven entirely by descriptor metadata and parameter schemas,
  so a new strategy appears with no frontend change.
- The four-chart dashboard layout with per-chart state isolation, which V4 later
  subscribes to live data.

### Demo scenario

1. Open the Realtime page. Four charts show BTCUSDT at `5m`, `15m`, `1h`, `4h`.
2. Change chart 1 from `5m` to `1h`. Only chart 1 reloads.
3. Open the Strategy Engine page. All four strategies are listed with categories
   and parameter forms generated from their schemas.
4. Select moving average, RSI, and support/resistance; assign weights `0.2`, `0.3`,
   `0.5`; choose the weighted policy with threshold `0.3`.
5. Show the combined signal the backend computes for the current data.
6. Save the composite and run a backtest on it from the Backtest page.
7. Compare its metrics against the single moving-average result from V1.
8. Click a trade row; the chart scrolls to and highlights that trade.
9. Show the architecture point: the backtester, evaluator, and chart were not
   modified to support composites.

### Definition of Demoable

- All four strategies produce correct signals on hand-checked fixtures.
- Both combination policies reproduce the worked examples from the official source.
- Registering a new strategy makes it appear in the catalog and in the composite
  builder with zero change under `apps/web`.
- A saved composite is immutable and backtests through the same path as a single
  strategy.
- Changing one chart's timeframe leaves the other three untouched.
- Everything in V1's Definition of Demoable still passes.

### Architecture evidence

`PROOF-EXT-001` - strategy extensibility. Add `MACDStrategy` and inspect the diff.
This is the version where that proof first becomes meaningful, because four
strategies and a real backtest already exist for it to be added to.

### Deferred to next version

Candidates are still chosen by a person. No automated search, no ranking, no
leaderboard. Acceptable because the extensibility claim is now proved, and search
replaceability is a separate claim that V3 sets up properly.

### Git checkpoint

`git tag v2.0-demo`.

---

## V3 - Automated Discovery

**Tag:** `v3.0-demo`

### Goal

The system generates candidate strategies on its own, backtests and evaluates them
in a controlled loop, and maintains a Top-K leaderboard.

### User-visible scope

A person can configure a search space and stop conditions, press start, watch the
candidate count rise and the leaderboard reorder, pause and resume and cancel the
run, and click a leaderboard entry to see its trades, its chart overlays, and the
full record of what produced it.

### Included implementation slices

8 slices.

| File | Slices |
|---|---|
| [02](02-strategy-and-composition.md) | `STRAT-06`, `STRAT-07` |
| [04](04-search-and-leaderboard.md) | `SEARCH-01`, `SEARCH-02`, `SEARCH-03`, `SEARCH-04`, `SEARCH-05` |
| [06](06-ui-and-demo-integration.md) | `UI-03` |

### Architecture maturity introduced

- `StrategyGenerator` port with a seeded, reproducible random generator behind it.
- Immutable `CandidateStrategy` with canonical content hashing.
- A search coordinator that owns run state and stop policy, separate from the
  generator that proposes candidates and the executor that runs them.
- Durable pause, resume, and cancel that survive a coordinator restart.
- Versioned ranking policy as its own component.
- An idempotent, rebuildable Top-K projection that is derived from authoritative
  results and never authoritative itself.
- Full provenance resolution from a leaderboard entry back to its frozen
  specification.

### Demo scenario

1. Open the Discovery page. Configure the search space, a candidate limit, and the
   random generator.
2. Press start. The candidate counter rises and the leaderboard fills and reorders.
3. Pause. New dispatch stops. Resume. It continues from where it stopped.
4. Restart the API process mid-run and show the run state survived.
5. Let a stop condition fire. The page shows why the run stopped.
6. Click the top entry. Its trades and chart overlays appear.
7. Open its provenance record and read the full reproducibility checklist.
8. Re-run the top entry from its recorded specification and show identical results.
9. Show the architecture point: the generator is selectable and the backtester,
   evaluator, ranking policy, and leaderboard know nothing about how a candidate
   was produced.

### Definition of Demoable

- All three stop conditions work: candidate limit, duration limit, no improvement.
- Pause, resume, and cancel each survive a process restart.
- The same seed and search space produce the same candidate sequence across two
  runs.
- A better candidate enters the Top-K and displaces the last entry; a worse one
  does not.
- Deleting and rebuilding the projection reproduces the same content and hash.
- Every leaderboard row resolves to its result and its frozen specification.
- Everything in V1 and V2 still passes.

### Architecture evidence

- `PROOF-REPLACE-001` - implement a second generator through the port and show no
  downstream diff.
- `PROOF-CONTROL-001` - exercise every stop condition and control transition with
  a restart injected. Provable here in the PostgreSQL-executor realization; re-run
  in V6 against the BullMQ realization.
- `PROOF-REP-001` - resolve the full reproducibility checklist for the top entry
  and rerun it.

Three proofs at one version. This is the strongest architecture story in the
roadmap, and it arrives before any of the reliability machinery.

### Deferred to next version

Charts still show historical snapshots only. Acceptable because realtime is a
separate quality with its own driver, and the four-chart layout it needs already
exists from V2.

### Git checkpoint

`git tag v3.0-demo`.

---

## V4 - Realtime Market Data

**Tag:** `v4.0-demo`

### Goal

The four charts update live from Binance, each independently, and survive a
provider disconnect without losing candles.

### User-visible scope

A person sees four charts updating live at different timeframes, changes one
timeframe without disturbing the others, watches the system report degraded during
a deliberate provider interruption, and sees the missing candles filled in
automatically when the connection returns.

### Included implementation slices

5 slices.

| File | Slices |
|---|---|
| [00](00-setup-and-walking-skeleton.md) | `WS-03` |
| [01](01-market-and-realtime.md) | `MKT-06`, `MKT-07`, `MKT-09`, `MKT-11` |

### Architecture maturity introduced

- A market ingest process owning the provider connection lifecycle, separate from
  the API process.
- NestJS WebSocket Gateway with per-chart subscription identifiers and a
  snapshot-then-live protocol.
- Redis Pub/Sub introduced strictly as best-effort ephemeral fan-out, published
  only after an authoritative commit.
- The explicit two-channel model: an in-progress candle is an ephemeral tick and is
  never persisted; a closed candle is persisted first and only then announced.
- Gap detection, REST recovery, and deduplication owned by Market Data rather than
  by the interface.

### Demo scenario

1. Start PostgreSQL, Redis, the API, the market ingest process, the runner, and the
   SPA.
2. Open the Realtime page. Four charts at `5m`, `15m`, `1h`, `4h` update live.
3. Point out the forming candle moving, then settling when it closes.
4. Change chart 1 to `1m`. Only chart 1 resets; the other three keep streaming.
5. Kill the network to the ingest process. The health indicator goes degraded; the
   charts keep their data.
6. Restore it. The ingest reconnects, calculates the missing closed intervals,
   fetches them over REST, and the charts fill in.
7. Run a gap query over the outage range and show no unresolved gap and no
   duplicate.
8. Reload the page and show it recovers from a durable snapshot, not from replayed
   messages.
9. Show the architecture point: stopping Redis stops live push but does not stop
   candle ingestion, and a refresh still shows correct data.

### Definition of Demoable

- Four live subscriptions run at once with distinct identifiers.
- Changing one timeframe resets only that subscription; no full page reload occurs.
- A controlled disconnect is followed by reconnect, correct missing-interval
  calculation, recovery, and resume, with no unresolved gap and no duplicate.
- Stopping Redis leaves committed candles intact and a fresh snapshot correct.
- No in-progress candle is ever written as a closed candle.
- Everything in V1 to V3 still passes.

### Architecture evidence

`PROOF-RT-001` - realtime recovery and chart isolation. Every step of that proof is
exercised by the demo scenario above.

### Deferred to next version

News and sentiment do not exist yet. Acceptable because the news pipeline shares
nothing with the market path - which is precisely the isolation claim V5 proves.

### Git checkpoint

`git tag v4.0-demo`.

---

## V5 - News and Sentiment

**Tag:** `v5.0-demo` - **MVP COMPLETE**

### Goal

Collect news from a configured source, store it normalized, analyze its sentiment,
and show that neither a news failure nor a model failure touches charts or
backtests.

### User-visible scope

A person can see collected news items with their sources, see the sentiment
distribution over a window, see collection and analysis health, and watch the rest
of the application keep working while the news worker is switched off.

### Included implementation slices

6 slices, plus 1 optional.

| File | Slices |
|---|---|
| [05](05-news-and-sentiment.md) | `NEWS-01`, `NEWS-02`, `NEWS-03`, `NEWS-04`, `NEWS-05`, `NEWS-07` |
| [06](06-ui-and-demo-integration.md) | `UI-07` |

Optional, not part of exit criteria: `NEWS-06` (sentiment as a strategy).

### Architecture maturity introduced

- `NewsProvider` port with its own contract suite, mirroring the market provider
  pattern.
- A news worker process with its own failure domain, separate from market ingest
  and from the backtest runner.
- `SentimentAnalyzer` as a framework- and language-independent port, with a durable
  inference lifecycle recording attempts, failures, and model versions.
- A normalized sentiment feature query with an explicit missing-and-stale policy,
  so Strategy never learns what the model is.

### Demo scenario

1. Start the full topology including the news worker.
2. Open the News page. Collected items list with source, time, and related coins.
3. Show the sentiment distribution over the last window and the analyzed count.
4. Stop the news worker. The News page reports collection degraded.
5. Switch to the Realtime page - charts still stream. Run a backtest - it still
   completes. Run a discovery loop - it still ranks.
6. Restart the news worker; collection resumes and catches up.
7. Make the model unreachable. Collection keeps storing items; the analysis health
   goes degraded and failed attempts are recorded with reasons.
8. Show a sentiment-dependent candidate applying the configured missing-sentiment
   policy rather than silently using stale data.
9. Show the architecture point: the collector never calls the model, and the
   strategy never imports either one.

### Definition of Demoable

- Collection stores normalized, deduplicated items from a real configured source.
- Sentiment results carry model, artefact, and input versions with no alias.
- With the news worker stopped, charts, backtests, and discovery all still work.
- With the model unreachable, items are still collected and failures are recorded.
- A technical-only experiment produces no call to the sentiment port at all.
- Everything in V1 to V4 still passes.
- The official source's MVP list in section 37 is fully satisfied.

### Architecture evidence

- `PROOF-ISO-001` - news failure isolation.
- `PROOF-ISO-002` - sentiment failure isolation.

### Deferred to next version

The backtest executor still uses the PostgreSQL run queue rather than BullMQ, there
is no transactional outbox, and there is no operational telemetry surface. All
three are architecture-maturity concerns with no MVP requirement behind them, and
V6 exists to close them.

### Git checkpoint

`git tag v5.0-demo`. This is the safety tag. Everything after it is architecture
evolution, so this tag must remain demoable no matter how V6 goes.

---

## V6 - Async Execution, Reliability, and Architecture Proofs

**Tag:** `v6.0-demo`

### Goal

Replace the PostgreSQL run queue with BullMQ workers, add the transactional outbox
and idempotent consumers, expose operational telemetry, and produce the remaining
proof evidence.

### User-visible scope

Almost none, deliberately. The same demo flows work. What changes is that a person
can now watch queue depth and worker counts, start more workers and see throughput
rise, and observe the system survive injected crashes.

### Included implementation slices

9 slices.

| File | Slices |
|---|---|
| [00](00-setup-and-walking-skeleton.md) | `SETUP-08`, `SETUP-09`, `WS-02`, `MSG-01` |
| [03](03-experiment-backtest-evaluation.md) | `EXP-08`, `EXP-09`, `EXP-12` |
| [04](04-search-and-leaderboard.md) | `SEARCH-06`, `SEARCH-07`, `OPS-01` |

### Architecture maturity introduced

- BullMQ on persistence-configured Redis as the durable command path, replacing the
  PostgreSQL run queue behind the unchanged `BacktestExecutor` port.
- Separate backtest worker processes that scale by replica count.
- Reliable messaging primitives in `platform`, with each module owning its own
  outbox and inbox tables.
- Transactional outbox with delivered-only-after-acknowledgement semantics.
- Idempotent consumers with event deduplication and aggregate-version checks.
- Live progress and leaderboard push replacing polling.
- An operational status surface and end-to-end correlation across every process
  role.

### Demo scenario

1. Start the full topology with one backtest worker.
2. Run a discovery loop and show queue depth, job states, and worker count on the
   operational surface.
3. Start a second and third worker. Show throughput rising and no duplicate result.
4. Follow one correlation identifier from experiment through candidate, job,
   attempt, result, outbox event, consumer record, to leaderboard entry.
5. Kill a worker mid-backtest. Show the job retried and exactly one result
   committed.
6. Kill the outbox dispatcher between commit and acknowledgement. Show the event
   delivered once after restart.
7. Deliver a duplicate evaluation event. Show the leaderboard projection hash
   unchanged.
8. Show Redis persistence mode and eviction policy, and explain why they matter.
9. Show the architecture point: the domain, backtester, evaluator, and result
   committer are unchanged from V5. Only the executor adapter and the delivery path
   changed.

### Definition of Demoable

- Worker count is a configuration change, not a code change, and adding workers
  produces no duplicate logical result.
- Every failure injection point in `PROOF-RETRY-001` yields exactly one result.
- A duplicate or stale event leaves the projection hash unchanged.
- The correlation chain is followable end to end.
- Redis reports persistence enabled and `noeviction`.
- Every V1 to V5 demo scenario still works unchanged.

### Architecture evidence

- `PROOF-SCALE-001` - worker scale and backpressure.
- `PROOF-RETRY-001` - partial failure retry.
- `PROOF-DUP-001` - duplicate and stale event.
- `PROOF-OBS-001` - operational observability.
- `PROOF-CONTROL-001` re-run against the BullMQ realization.

### Deferred beyond this project

Multi-exchange reconciliation, multiple trading pairs, advanced search algorithms,
authentication, retention automation, and deployment beyond a local topology. All
are named as extensions by the official source and none has a driver here.

### Git checkpoint

`git tag v6.0-demo`.

Because V6 replaces the execution transport, consider doing it on a branch
(`v6-async`) and merging only when V6's Definition of Demoable passes. That keeps
`main` demoable throughout. This is the only version where a branch is worth the
ceremony.

---

## Planned realization evolution

Each row is an intermediate simplification, its driver, its seam, and the version
that closes it. The domain contract in the middle column does not change across the
transition - only the adapter behind it does.

| Concern | V1 to V5 realization | Stable seam | Final realization | Closes at |
|---|---|---|---|---|
| Backtest execution transport | `PostgresQueueBacktestExecutor` - a durable run table with claim-by-update, drained by a separate runner process | `BacktestExecutor` port; `BacktestRun` durable record | `BullMQBacktestExecutor` with worker processes on a dedicated queue | V6 `EXP-12` |
| Leaderboard update delivery | The runner calls `LeaderboardProjector` inside the result acceptance transaction | `LeaderboardProjector`, idempotent and rebuildable from V3 | Outbox row, dispatcher, BullMQ, idempotent consumer, same projector | V6 `EXP-08`, `EXP-09` |
| Reliable messaging | Not present - no cross-process integration publication exists | `platform/messaging` primitives | Generic outbox and inbox primitives with module-owned tables | V6 `MSG-01` |
| Live chart data | Snapshot on request; four charts with independent timeframes | Candle query port; per-chart subscription identifier | Live ingest process, WebSocket subscriptions, Pub/Sub fan-out | V4 `MKT-06`, `MKT-07`, `MKT-11` |
| Discovery progress | The Discovery page polls a status read | Progress query port with a snapshot shape | The same snapshot, then live push over WebSocket | V6 `SEARCH-06` |
| Correlation and logging | Structured logs with a per-request identifier | Structured logger in `platform` | Versioned event envelope with correlation and causation identifiers across roles | V6 `SETUP-09` |
| Redis configuration | Absent in V1 to V3; plain instance for Pub/Sub in V4 and V5 | Configuration only | Persistence enabled, `noeviction`, verified | V6 `SETUP-08` |
| Dispatch reconciliation | Stale-claim timeout on the run table | Coordinator reconciliation routine | Broker versus database reconciliation | V6 `SEARCH-07` |

### What stays unchanged across every transition

`Candle`, `DatasetRef`, `StrategyDescriptor`, `Strategy`, `Signal`,
`CompositeStrategy`, `CombinationPolicy`, `CandidateStrategy`, `ExperimentSpec`,
`BacktestResult`, the backtester, the evaluator, the ranking policy, the
leaderboard projector's logic, and every module boundary and ownership rule.

That list is the point. If a V6 slice needs to change something on it, the seam was
wrong and it is a plan mismatch to report, not to work around.

---

## Why each heavy mechanism waits

Each row names the architectural driver that must exist before the mechanism is
justified, and why that driver is absent earlier.

| Mechanism | Driver | Absent until | Arrives |
|---|---|---|---|
| BullMQ and Redis-backed queueing | Automated search generates more backtest work than one runner can absorb, and interactive traffic must not compete with it | Search does not exist before V3, and one runner absorbs V3's demo load | V6 |
| Separate worker replicas | Measured throughput demand | No measurement exists until a search loop runs | V6 |
| Transactional outbox | An accepted durable result must update a *different* durable projection in *another* process under crash and retry | Until V6 the projection is updated in the same transaction in the same process, so there is no gap to close | V6 |
| Inbox and deduplication | Delivery is at-least-once | No broker means no redelivery and no duplicates | V6 |
| Cross-process correlation envelope | Debugging and proof across several independent runtime roles | V1 has two processes and a request identifier in logs is enough | V6 |
| Operational status surface | Proving scale and failure behaviour needs queue depth, dispatcher lag, and projection lag | None of those quantities exist before V6 | V6 |
| Dispatcher and projection lag telemetry | A dispatcher and an async projection exist | Neither exists before V6 | V6 |
| Broker dispatch reconciliation | Durable job state and broker state can disagree | With a PostgreSQL run table there is only one source of state | V6 |
| Exhaustive crash injection | The functional spine must exist to inject crashes into | Injecting crashes into an unfinished pipeline tests nothing | V6 |
| Redis persistence and eviction configuration | BullMQ correctness depends on it | Redis carries only best-effort Pub/Sub in V4 and V5, where losing a message is already handled by snapshot refresh | V6 |
| Retention and archival policy | Outbox and inbox tables grow | Those tables do not exist before V6 | V6, as a documented decision rather than a blocker |
| Pause, resume, cancel | A long-running loop a person needs to control | No loop before V3 | V3 |
| Live WebSocket push | Charts must update without polling | No live data source before V4 | V4 |
| Provider gap recovery | A long-lived provider connection that will certainly drop, since Binance closes every stream connection at the 24-hour mark | No live connection before V4 | V4 |

None of these are deleted. Every one has a version and a driver.

---

## The one open architecture question

**`EXP-04` is BLOCKED pending formal architecture review.** Not an informal
acknowledgement - a review under the `AGENTS.md` deviation procedure.

The frozen baseline states the runtime path as
`API/coordinator -> workers: immutable BullMQ commands through Redis`, and
architectural invariant 11 makes BullMQ the correctness delivery path. V1 through V5
instead use a PostgreSQL run table with claim-by-update, drained by a separate runner
process. ADR-004 and ADR-009 both name a PostgreSQL queue as an alternative they
considered and did **not** select.

`AGENTS.md` lists "communication style" among the things that may not be altered
without explicit architecture review, and both it and the baseline require a
superseding ADR plus a new baseline version if a deviation is accepted. An earlier
draft of this plan claimed a short acknowledgement was enough. That was wrong against
this repository's own governance, and it has been corrected.

The full write-up - stopped work, exact conflicting sections, what is and is not in
conflict, four alternatives with costs and migration consequences, and the proposed
resolution - is in
[`deviation-proposal-001`](../docs/architecture/deviation-proposal-001-backtest-execution-transport.md).

Summary of what is at stake:

- Architectural invariant 4 - backtest work never runs inside API request or
  WebSocket execution - **is satisfied from V1**. The runner is a separate process.
  That is why the proposal is not "run it inline".
- Module boundaries, ownership, dependency directions, domain contracts, and
  PostgreSQL's authority are all unchanged.
- The target architecture is unchanged. This is about *when* BullMQ appears, not
  *whether*.

**If the review rejects the proposal**, `SETUP-08`, `WS-02`, and `EXP-12` move into
V1 and `EXP-04` drops its claim path. V1 grows from 25 to roughly 28 slices and its
first demonstrable backtest arrives later. Nothing else changes, because the port and
the domain contracts are identical either way.

A coding session must not make this call, and must not start `EXP-04` until the
review concludes. `SETUP-01` through `SETUP-06` are unaffected by the outcome and can
proceed now.

---

## Retired slices from the pre-version plan

For anyone reading the plan as committed in `cdac819`.

| Retired ID | What happened |
|---|---|
| `WS-01` | Merged into `MKT-04`. Its purpose was to prove the SPA-to-HTTP-to-port-to-PostgreSQL round trip on scaffolding that was then deleted. `MKT-04` proves the same path on real candles, so the scaffolding slice was pure overhead. |
| `SETUP-07` | Split. Basic structured logging with a request identifier merged into `SETUP-03` (V1). The versioned event envelope and cross-process correlation became `SETUP-09` (V6), where the driver exists. |
| `EXP-07` | Merged into `EXP-06`. Provenance capture cannot follow result acceptance, because an accepted result is immutable. See issue C in the plan review. |

## New slices introduced by this refactor

| New ID | Version | Why it exists |
|---|---|---|
| `SETUP-08` | V6 | Redis persistence and eviction configuration, split out of the old `SETUP-02` because it only matters once BullMQ exists. |
| `SETUP-09` | V6 | Event envelope and cross-process correlation, split out of the old `SETUP-07`. |
| `MSG-01` | V6 | Generic reliable-messaging primitives in `platform`, so Experiment and News share a mechanism without News depending on Experiment. Resolves issue B. |
| `MKT-11` | V4 | Binds the V2 four-chart layout to live subscriptions, split out of the old `MKT-08`. |
| `STRAT-08` | V2 | Composite definition persistence and endpoint. The old `UI-02` silently assumed a save capability that no backend slice owned. Resolves part of issue E. |
| `EXP-10` | V1 | Single backtest result query surface. `EXP-06` was the write side only, so `UI-04` silently owned the result, metrics, assumptions, and paged-trades reads. Reusing the retired `EXP-07` number was avoided so the retired-slice row above stays unambiguous. |
| `EXP-11` | V1 | Visualization annotation contract and capture. Resolves issues F and G. |
| `EXP-12` | V6 | The BullMQ backtest executor that replaces the PostgreSQL run queue behind the unchanged port. |
| `SEARCH-07` | V6 | Broker dispatch reconciliation, split out of the old `SEARCH-02`. |
| `NEWS-07` | V5 | News list, health, and sentiment query surface. The old `UI-07` assumed endpoints no backend slice owned. Resolves part of issue E. |

Slice count moved from 56 to 63. The increase is entirely from splitting slices at
version boundaries and from adding the backend capabilities the old interface slices
silently assumed. Every added slice is smaller than the one it came from.
