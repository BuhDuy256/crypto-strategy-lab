# 06 - Interface Pages and Demo Integration

The remaining pages, the signal and trade visualization the assignment asks for,
and the end-to-end demo path that shows every architectural component working
together.

Read [`README.md`](README.md) first. Statuses live in [`TRACKING.md`](TRACKING.md).

## The one rule that applies to every slice here

The frontend contains no strategy, backtest, evaluation, or ranking logic. Every
number shown on these pages was computed by the backend and arrived through a
transport contract. If a page needs a value that no endpoint returns, the fix is an
endpoint, never a calculation in React.

The realtime page and its four charts were already built in area 01
(`MKT-05` and `MKT-08`). This area builds the other three pages plus the
visualization work.

## What the sample interface images are, and are not

The images under `docs/requirements/sample-ui` are authoritative for **visible
layout, labels, and example flows only**. They are not authoritative for business
rules, validation, metric definitions, or acceptance criteria. Where an image
implies a rule, the rule comes from the official project source or from the frozen
architecture, never from the picture.

Two things visible in the images are extensions rather than MVP scope, and neither
is planned here: model-assisted extraction of news templates, and account or
subscription features.

---

## UI-02 - Strategy Engine page

**Outcome**
A page that lists available strategies from the registry catalog, lets a user
select several, assign weights, choose a combination policy, and see the resulting
combined signal, then save the composite definition.

**Why this slice exists**
It makes composite strategies usable by a person, and it is the page that proves
the catalog is descriptor-driven: adding a strategy must make it appear here with
no frontend change.

**Dependencies**
`STRAT-05`, `STRAT-04`, `SETUP-06`.

**Authoritative references**
- Official project source sections 12, 13 and 14.
- Sample interface image "Strategy Engine & Loop Discovery": the single-strategy list, the combination selector, the weighted voting panel, and the combined signal display.
- [ADR-002 - Consequences](../docs/adr/ADR-002-strategy-and-search-contracts.md): frontend catalogs come from descriptor data.

**Architecture constraints**
- The strategy list, its parameters, and its categories all come from the catalog
  endpoint. No strategy name is written in frontend code.
- Parameter forms are rendered generically from the parameter schema.
- The combined signal shown is computed by the backend, never in the browser.
- Saving a composite creates an immutable definition.

**Expected change surface**
The Strategy Engine page, a generic parameter form component, a composite builder,
a combined-signal display, and one endpoint to evaluate or save a composite.

**Acceptance criteria**
1. Every registered strategy appears with its name, description, and category.
2. Selecting strategies and assigning weights builds a valid composite definition.
3. The combination policy is selectable, and the combined signal displayed comes
   from a backend response.
4. Registering a new strategy makes it appear with no change to any file under
   `apps/web`.
5. An invalid parameter value is rejected with the message the schema provides.
6. A saved composite is immutable and can be referenced later.

**Validation**
Component and integration tests including the new-strategy test in criterion 4.
A manual run building the composite from the assignment example.

**Out of scope**
Automatic candidate generation, backtesting from this page, strategy authoring.

**Proof relevance**
Directly required by `PROOF-EXT-001`, which requires no frontend core change when a
strategy is added.

---

## UI-03 - Discovery page

**Outcome**
A page that configures and starts a search run, shows live progress and the current
candidate count, shows the live Top-K leaderboard, and offers pause, resume, and
cancel.

**Why this slice exists**
This is the assignment's demo centrepiece: press start, watch candidates tested,
watch the leaderboard reorder. It is also the only place a person can exercise the
`SEARCH-02` control behaviour.

**Dependencies**
`SEARCH-06`, `SEARCH-05`, `SEARCH-02`.

**Authoritative references**
- Official project source sections 23, 33 and 46.
- Sample interface image "Loop Discovery", "Leaderboard (Top strategies)", "Phuong phap Discovery", and "Tien trinh Discovery".
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): progress and leaderboard notifications travel over WebSocket.

**Architecture constraints**
- Progress and leaderboard values come from durable state through the query and
  subscription surfaces. The page counts nothing itself.
- The search method selector lists generators from configuration, not from a
  hard-coded list, so a new generator appears without a frontend change.
- Stop conditions are entered as configuration on the experiment, not applied in
  the browser.
- Pause, resume, and cancel call the durable control endpoints and reflect the
  converged state, not the requested state.

**Expected change surface**
The Discovery page, a run configuration form, a progress panel, a leaderboard
table, control buttons, and subscription handling.

**Acceptance criteria**
1. A run can be configured with its dataset, search space, stop conditions, and
   generator, then started.
2. Progress updates live without polling and without a page reload.
3. The leaderboard reorders live when a better candidate is accepted.
4. Pause, resume, and cancel each work, and the page shows converged state rather
   than optimistic state.
5. A completed run shows why it stopped.
6. Refreshing the page restores the correct live view from a snapshot.
7. Adding a second generator makes it selectable with no change under `apps/web`.

**Validation**
Integration tests for start, live progress, live leaderboard, and each control. A
manual run of the demo scenario watched from start to a stop condition.

**Out of scope**
Trade visualization, which is `UI-05`; the backtest form, which is `UI-04`.

**Proof relevance**
Contributes to `PROOF-CONTROL-001` and `PROOF-REPLACE-001` (the generator selector
must not need editing).

---

## UI-04 - Backtest page with metrics and trade table

**Outcome**
A page that configures and runs a single backtest, then shows the four MVP metrics
and a paginated trade table with entry, exit, fees, slippage, and profit and loss
per trade.

**Why this slice exists**
The MVP requires the metrics to be visible, and section 26 of the official source
requires the trade table. It is also the simplest path to a result for anyone
checking the system without running a whole search.

**Dependencies**
`SEARCH-05`, `EXP-06`.

**Authoritative references**
- Official project source sections 20, 26 and 37.
- Sample interface image "Backtest & Ket qua giao dich": the configuration bar, the metric tiles, the trade list with paging, and the backtest assumptions panel.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants): no business logic in the frontend.

**Architecture constraints**
- Every metric shown comes from the evaluator through the query surface. The page
  computes nothing, not even a percentage.
- The execution assumptions actually used - capital, fee, slippage, fill rule - are
  displayed with the result, because the baseline requires them to be explicit
  rather than hidden.
- The trade table pages against the server. It does not load every trade at once.
- The result shown links to its frozen specification.

**Expected change surface**
The Backtest page, a configuration form, metric tiles, a paginated trade table, and
an assumptions panel.

**Acceptance criteria**
1. A backtest can be configured and started, and its completion is reflected on the
   page.
2. Total return, win rate, maximum drawdown, and number of trades are displayed,
   each matching the backend value exactly.
3. The trade table shows entry time, entry price, exit time, exit price, direction,
   fees, slippage, and profit and loss, and pages against the server.
4. The execution assumptions used are displayed alongside the result.
5. No arithmetic beyond display formatting exists in the page code.
6. A result with zero trades renders a clear empty state rather than an error or a
   division result.

**Validation**
Component and integration tests including the zero-trade case. A manual run
comparing the displayed metrics against the query response.

**Out of scope**
Chart markers, which are `UI-05`; the trade-to-chart interaction, which is `UI-06`.

**Proof relevance**
Routine.

---

## UI-05 - Signal and trade visualization on the chart

**Outcome**
Selecting a result draws its strategy's indicator overlays, its buy and sell
markers, and its entry, exit, stop loss, and take profit levels on the candlestick
chart.

**Why this slice exists**
The official source is explicit that showing a profit figure is not enough - the
user must be able to see what the strategy did. It is also an MVP visualization
requirement.

**Dependencies**
`UI-04`, `MKT-05`, `STRAT-03`.

**Authoritative references**
- Official project source sections 5, 25 and 37: candlestick, volume, moving average, Bollinger bands, support and resistance zones, buy and sell signals, entry, stop loss, take profit.
- Sample interface image "Bieu do Backtest" showing entry and exit markers, stop loss and take profit lines, and indicator overlays.

**Architecture constraints**
- Overlay data comes from the strategy's visualization annotations, produced during
  the backtest. The frontend never recomputes a moving average or a support zone.
- Markers come from trade records, not from re-deriving signals in the browser.
- A strategy whose annotations the chart does not know how to draw degrades to no
  overlay rather than to an error, so a new strategy never breaks the page.

**Expected change surface**
Chart overlay rendering, marker rendering, price line rendering, and an endpoint or
response extension carrying annotations with a result.

**Acceptance criteria**
1. Buy and sell markers appear at the correct times for the selected result.
2. Entry, exit, stop loss, and take profit levels are drawn for a selected trade.
3. Indicator overlays render for moving average, Bollinger bands, and support and
   resistance zones from stored annotations.
4. A strategy with an unrecognized annotation type renders the chart with no
   overlay and no error.
5. No indicator arithmetic exists in frontend code.
6. Switching between results replaces overlays cleanly with no leftovers.

**Validation**
Component tests for marker placement, level drawing, and the unknown-annotation
case. A manual comparison of drawn markers against the trade table.

**Out of scope**
The trade-row interaction, which is `UI-06`; drawing tools; user-added indicators.

**Proof relevance**
Contributes to `PROOF-EXT-001`: adding a strategy must not require frontend
changes, which is what criterion 4 protects.

---

## UI-06 - Trade detail and chart highlight

**Outcome**
Clicking a row in the trade table highlights that trade's entry and exit on the
chart and scrolls the chart to that time range.

**Why this slice exists**
Section 26 of the official source asks for it directly, and it is the small
interaction that makes the trade table understandable.

**Dependencies**
`UI-05`.

**Authoritative references**
- Official project source section 26.
- Sample interface image showing the trade list next to the chart.

**Architecture constraints**
- Selection state is interface state only. It changes nothing on the server.
- Highlighting uses the trade record already loaded. It triggers no recalculation.

**Expected change surface**
Selection state shared between the trade table and the chart, highlight rendering,
and chart range control.

**Acceptance criteria**
1. Clicking a trade row highlights its entry and exit on the chart.
2. The chart moves to show the selected trade's time range.
3. Selecting a different trade replaces the highlight.
4. Deselecting clears the highlight and leaves the chart usable.
5. Selecting a trade on a page other than the first works the same way.

**Validation**
Component tests for selection, highlight replacement, and clearing. A manual check
on a result with more than one page of trades.

**Out of scope**
Editing trades, annotations, or exporting.

**Proof relevance**
Routine.

---

## UI-07 - News page

**Outcome**
A page that lists collected news items with their source and time, shows the
sentiment distribution over a window, and shows collection and analysis health.

**Why this slice exists**
It makes the news pipeline visible, and it is where `PROOF-ISO-001` and
`PROOF-ISO-002` become observable to a person rather than only to a test.

**Dependencies**
`NEWS-05`, `SETUP-06`.

**Authoritative references**
- Official project source sections 27, 29 and 37.
- Sample interface image "News Crawler & Phan tich thi truong": the item list, the sentiment distribution, and the analyzed-count and source-coverage panels.

**Architecture constraints**
- Sentiment values come from the feature query. The page performs no aggregation of
  its own.
- Degraded collection or degraded analysis is shown explicitly, because that is the
  visible half of the isolation proofs.
- The page shows no model, artefact, or provider internal detail.
- A news failure must leave the rest of the application working, so this page must
  not be on any shared loading path.

**Expected change surface**
The News page, item list, sentiment distribution display, health indicators, and
their API client methods.

**Acceptance criteria**
1. Collected items are listed with title, source, published time, and related
   coins.
2. The sentiment distribution over a chosen window is displayed with its item
   count.
3. Collection health and analysis health are shown, including degraded states.
4. With the news worker stopped, the page shows degraded state and every other page
   still works.
5. With the model unavailable, the page shows analysis degraded while collected
   items still list.
6. No model or provider internal detail is visible.

**Validation**
Component and integration tests for the healthy, collection-degraded, and
analysis-degraded states. A manual run with each worker stopped in turn.

**Out of scope**
Model-assisted extraction templates and self-healing extraction visible in the
sample image - both are extensions, not MVP scope. Source configuration editing.

**Proof relevance**
Contributes to `PROOF-ISO-001` and `PROOF-ISO-002` as their user-visible evidence.

---

## DEMO-01 - End-to-end demo path and run documentation

**Outcome**
A single documented sequence starts every process, walks the demo scenario from the
official source, and works from a clean checkout. The root `README.md` explains
install, run, architecture, and demo.

**Why this slice exists**
The deliverables list requires a README covering install, run, architecture, and
demo, and requires a demo covering the whole flow. This slice makes that path real
and repeatable rather than something rediscovered on the day.

**Dependencies**
`UI-03`, `UI-06`, `UI-07`, `MKT-08`.

**Authoritative references**
- Official project source sections 45 and 46: the deliverables and the proposed demo scenario.
- [README.md](../README.md) as the current repository entry point.

**Architecture constraints**
- The documented path must start every process role explicitly, so the reader sees
  that they are separate processes rather than one program.
- The demo must not need a manual database edit or a hidden step.
- Nothing in the demo may depend on a value that is not in configuration.

**Expected change surface**
The root `README.md` install, run, architecture, and demo sections, a demo script
document, and any convenience command that starts the whole topology.

**Acceptance criteria**
1. A clean checkout reaches a running system by following the README alone.
2. All ten demo steps from the official source can be performed in order.
3. Every process role has a documented start command, and the README says what each
   role does.
4. Any required seed data or backfill step is a documented command, not a manual
   action.
5. The architecture section links to the frozen baseline, the diagram index, and
   the ADR list rather than restating them.
6. A person who has not seen the project before can complete the demo.

**Validation**
Perform the whole path on a clean checkout, ideally on a second machine or a fresh
container. Record where it breaks and fix the documentation, not the reader.

**Out of scope**
Deployment to a server, packaging for distribution, recorded video.

**Proof relevance**
Routine, but the demo path is the environment several proof runs are executed in,
so the recorded commands feed the proof evidence conventions.
