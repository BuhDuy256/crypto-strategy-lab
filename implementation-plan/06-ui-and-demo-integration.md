# 06 - Interface Pages and Demo Integration

The pages, the signal and trade visualization the assignment asks for, and the run
documentation that makes every version demonstrable from a clean checkout.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

| Version | Slices |
|---|---|
| V1 | `UI-04`, `UI-05`, `DEMO-01` |
| V2 | `UI-02`, `UI-06` |
| V3 | `UI-03` |
| V5 | `UI-07` |

The Realtime page is not in this file. Its charts are built by `MKT-05`, `MKT-08`,
and `MKT-11` as part of the market vertical slice. The application shell and
navigation are `SETUP-06`. There is no `UI-01`.

## The one rule that applies to every slice here

The frontend contains no strategy, backtest, evaluation, or ranking logic. Every
number shown was computed by the backend and arrived through a transport contract. If
a page needs a value no endpoint returns, the fix is an endpoint, never a calculation
in React.

Each page slice in this file has matching backend slices that own the capabilities it
needs:

| Page | Backend slices that own its reads and writes |
|---|---|
| `UI-02` | `STRAT-05` (catalog), `STRAT-08` (save and evaluate composite) |
| `UI-03` | `EXP-10` (result and trades), `SEARCH-05` (leaderboard, progress, provenance), `SEARCH-02` (control), `STRAT-07` (generator catalog) |
| `UI-04` | `EXP-04` (start and status), `EXP-10` (result, metrics, assumptions, paged trades), `EXP-11` (annotations) |
| `UI-07` | `NEWS-07` (list, distribution, health) |

If a page needs something none of those provides, that is a missing backend slice to
report, not something to build in the browser. A page slice never adds a controller.

## What the sample interface images are, and are not

The images under `docs/requirements/sample-ui` are authoritative for **visible
layout, labels, and example flows only**. They are not authoritative for business
rules, validation, metric definitions, or acceptance criteria. Where an image implies
a rule, the rule comes from the official project source or the frozen architecture,
never from the picture.

Two things visible in the images are extensions rather than MVP scope, and neither is
planned: model-assisted extraction of news templates, and account or subscription
features.

---

# V1 slices

## UI-04 - Backtest page with metrics and trade table

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
A page that configures and runs a single backtest, shows it running and then
completed, and displays the four MVP metrics and a paginated trade table with entry,
exit, fees, slippage, and profit and loss per trade.

**Why this slice exists**
This page is V1's demo. It is the shortest complete path a person can walk from
choosing data to reading a result.

**Dependencies**
`EXP-10`, `MKT-05`.

**Authoritative references**
- Official project source sections 20, 26 and 37.
- Sample interface image "Backtest": the configuration bar, the metric tiles, the trade list with paging, and the backtest assumptions panel.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants): no business logic in the frontend.

**Architecture constraints**
- This slice adds **no backend code**. Every read it needs already exists: run status
  from `EXP-04`, result and metrics and assumptions and paged trades from `EXP-10`.
  If something is missing, stop and report it rather than adding a controller here.
- Every metric shown comes from the evaluator through the `EXP-10` query surface. The
  page computes nothing, not even a percentage.
- The execution assumptions actually used - capital, fee, slippage, fill rule - are
  displayed with the result, because the baseline requires them to be explicit rather
  than hidden.
- Because execution is asynchronous from V1, the page submits a run and then polls
  the status endpoint from `EXP-04`. It must handle queued, running, completed, and
  failed states, not assume a synchronous response.
- The trade table pages against the server using the `EXP-10` paging metadata. It
  does not load every trade at once and it does not count client-side.
- The result shown links to its frozen specification, using the identifier and hash
  `EXP-10` returns.

**Expected change surface**
Frontend only: the Backtest page, a configuration form, a run status poller, metric
tiles, a paginated trade table, an assumptions panel, the chart from `MKT-05`, and
API client methods over the existing endpoints.

**Acceptance criteria**
1. A backtest can be configured and started, and the page shows queued, running, and
   completed states as they happen.
2. A failed run shows its failure reason rather than hanging on running.
3. Total return, win rate, maximum drawdown, and number of trades are displayed, each
   matching the backend value exactly.
4. The trade table shows entry time, entry price, exit time, exit price, direction,
   fees, slippage, and profit and loss, and pages against the server.
5. The execution assumptions used are displayed alongside the result.
6. No arithmetic beyond display formatting exists in the page code.
7. A result with zero trades renders a clear empty state rather than an error or a
   division result.
8. Re-running the same configuration shows an identical result.
9. The diff contains no file under `apps/backend`. Every endpoint this page calls
   already existed before the slice started.

**Validation**
Component and integration tests including the zero-trade case, the failure case, and
the polling lifecycle. A manual run comparing displayed metrics against the query
response.

**Out of scope**
Chart markers, which are `UI-05`. Composites, discovery, news.

**Proof relevance**
Routine.

---

## UI-05 - Signal and trade visualization

**Version:** V1 · **Priority:** REQ · **Effort:** M

**Outcome**
A completed result draws its strategy's indicator overlays, its buy and sell markers,
and its entry, exit, stop loss, and take profit levels on the candlestick chart,
rendered from the generic annotation primitives.

**Why this slice exists**
The official source is explicit that showing a profit figure is not enough - the user
must see what the strategy did. It is also an MVP visualization requirement.

**Dependencies**
`UI-04`, `EXP-11`.

**Authoritative references**
- Official project source sections 5, 25 and 37: candlestick, volume, moving average, Bollinger bands, support and resistance zones, buy and sell signals, entry, stop loss, take profit.
- Sample interface image showing entry and exit markers, stop loss and take profit lines, and indicator overlays.
- The annotation primitives defined in `STRAT-01`.

**Architecture constraints**
- The renderer switches on **annotation primitive type**, never on strategy
  identifier. There is one renderer per primitive - `line`, `band`, `zone`, `level`,
  `marker` - and that set is closed.
- An unrecognized primitive type is skipped silently, so a strategy added later can
  never break the page.
- Overlay data comes from the annotations stored by `EXP-11`. The frontend never
  recomputes a moving average or a support zone.
- Markers come from trade records, not from re-deriving signals in the browser.

**Expected change surface**
Five primitive renderers, annotation fetching with the result, trade marker
rendering, and price line rendering.

**Acceptance criteria**
1. Buy and sell markers appear at the correct times for the selected result.
2. Entry, exit, stop loss, and take profit levels are drawn for a selected trade.
3. Moving average overlays render from stored `line` annotations.
4. A result containing an unknown annotation type renders the chart with the known
   overlays and no error.
5. No indicator arithmetic exists in frontend code.
6. Switching between results replaces overlays cleanly with no leftovers.
7. Grepping `apps/web` finds no strategy identifier used in a rendering decision.

**Validation**
Component tests for marker placement, level drawing, each primitive renderer, and the
unknown-annotation case. A manual comparison of drawn markers against the trade
table.

**Out of scope**
The trade-row interaction, which is `UI-06`. Drawing tools, user-added indicators.

**Proof relevance**
Contributes to `PROOF-EXT-001`: adding a strategy must not require frontend changes,
which is what criteria 4 and 7 protect.

---

## DEMO-01 - Run documentation and version demo script

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
The root `README.md` covers install, run, architecture, and demo, and a demo script
document holds the current version's numbered walkthrough. A clean checkout reaches a
working demo by following the README alone, with one documented Docker Compose
command bringing up the whole topology the version needs.

**Why this slice exists**
The deliverables list requires a README covering install, run, architecture, and
demo. Writing it in V1 and updating it per version means the demo path is always
current, rather than something reconstructed under pressure at the end.

**Dependencies**
`UI-04`, `UI-05`.

**Authoritative references**
- Official project source sections 45 and 46: the deliverables and the proposed demo scenario.
- [`VERSIONS.md`](VERSIONS.md): each version's demo scenario is the source for the script.
- [README.md](../README.md) as the current repository entry point.

**Architecture constraints**
- The documented path starts every process role explicitly, so the reader sees they
  are separate processes rather than one program.
- The demo must not need a manual database edit or a hidden step.
- Nothing in the demo may depend on a value that is not in configuration.
- The architecture section links to the frozen baseline, the diagram index, and the
  ADR list rather than restating them.
- The Compose topology contains only the roles the current version requires. Adding a
  later version's service early is a plan violation, not a convenience. The role list
  per version is in
  [`VERSIONS.md`](VERSIONS.md#compose-integration-gate-every-version).
- Host development stays fully supported. The Compose path is added beside the
  existing host commands, never in place of them.

**Expected change surface**
The root `README.md` install, run, architecture, and demo sections, a demo script
document, one Dockerfile that the backend process roles and the frontend build from,
application services added to the existing `docker-compose.yml` beside `postgres`,
and the environment wiring those services need.

**Acceptance criteria**
1. A clean checkout reaches a running system by following the README alone.
2. Every V1 demo step from `VERSIONS.md` can be performed in order.
3. Every process role has a documented start command, and the README says what each
   role does.
4. Any required backfill or seed step is a documented command, not a manual action.
5. The architecture section links rather than restates.
6. A person who has not seen the project before can complete the demo.
7. One documented command - `docker compose up --build`, or another single command the
   README names - brings up the version's whole required topology from a clean
   checkout: infrastructure services, backend process roles, and the frontend, with
   configuration already wired. Startup dependencies and health checks are used where
   they genuinely help and nowhere else.
8. The Compose topology contains no service that belongs only to a later version.
9. `.env.example` covers both run paths, including the values that differ between a
   process on the host and the same process in a container.
10. The README names the two paths and says which question each answers: host commands
    for coding and debugging, Compose for full-system integration and demo.

**Validation**
Perform the whole path on a clean checkout, ideally on a second machine. Bring the
topology up with the documented Compose command, confirm every required role is
running and healthy and that no later-version service is present, then walk the
version's demo scenario on that topology. Record where it breaks and fix the
documentation, not the reader. Evidence goes in this slice's Evidence cell in
[`TRACKING.md`](TRACKING.md), and in [`JOURNAL.md`](JOURNAL.md) when the run produced
durable history.

**Out of scope**
Deployment to a server, packaging for distribution, recorded video. Also deliberately
out of scope, because this is a demo and integration convenience rather than
production deployment engineering: Kubernetes, service mesh, production
orchestration, deployment pipelines, container image hardening, autoscaling, separate
per-environment Compose stacks, running the test suite or the quality commands inside
containers, and containerizing a later version's services early.

**Proof relevance**
Routine, but the documented commands become the environment record several proof runs
cite.

### This slice recurs

`DEMO-01` is completed once in V1 and then **updated as an exit criterion of every
later version**. Each version's Definition of Demoable includes walking its own demo
scenario on a clean checkout, which means the README, the demo script, and the Compose
topology must be current. That update is part of the version's final slice, not a new
slice each time.

This is why the Compose path has no slice of its own. A version that adds a process
role - the market ingest process in V4, the news worker in V5, the outbox dispatcher
and BullMQ workers in V6 - adds it to the Compose topology here, when that role
actually exists.

---

# V2 slices

## UI-02 - Strategy Engine page

**Version:** V2 · **Priority:** REQ · **Effort:** M

**Outcome**
A page that lists available strategies from the registry catalog, lets a person
select several, assign weights, choose a combination policy, see the resulting
combined signal, and save the composite.

**Why this slice exists**
It makes composite strategies usable by a person, and it is the page that proves the
catalog is descriptor-driven: adding a strategy must make it appear here with no
frontend change.

**Dependencies**
`STRAT-05`, `STRAT-08`.

**Authoritative references**
- Official project source sections 12, 13 and 14.
- Sample interface image "Strategy Engine": the single-strategy list, the combination selector, the weighted voting panel, and the combined signal display.
- [ADR-002 - Consequences](../docs/adr/ADR-002-strategy-and-search-contracts.md): frontend catalogs come from descriptor data.

**Architecture constraints**
- The strategy list, its parameters, and its categories all come from the `STRAT-05`
  catalog endpoint. No strategy name is written in frontend code.
- Parameter forms are rendered generically from the parameter schema.
- The combined signal shown comes from the `STRAT-08` evaluate endpoint, never from a
  calculation in the browser.
- Saving goes through `STRAT-08`, which validates and stores immutably.

**Expected change surface**
The Strategy Engine page, a generic parameter form component driven by the schema, a
composite builder, a weight editor, and a combined-signal display.

**Acceptance criteria**
1. Every registered strategy appears with its name, description, and category.
2. Parameter forms are generated from the schema, with no per-strategy form code.
3. Selecting strategies and assigning weights builds a valid composite definition.
4. The combination policy is selectable, and the combined signal displayed comes from
   a backend response.
5. Registering a new strategy makes it appear in the list and the builder with no
   change to any file under `apps/web`.
6. An invalid parameter value is rejected with the message the schema provides.
7. A saved composite can be selected on the Backtest page and backtested.

**Validation**
Component and integration tests including the new-strategy test in criterion 5. A
manual run building the composite from the assignment example and backtesting it.

**Out of scope**
Automatic candidate generation, strategy authoring, discovery.

**Proof relevance**
Directly required by `PROOF-EXT-001`, which requires no frontend core change when a
strategy is added.

---

## UI-06 - Trade detail and chart highlight

**Version:** V2 · **Priority:** REQ · **Effort:** S

**Outcome**
Clicking a row in the trade table highlights that trade's entry and exit on the chart
and moves the chart to that time range.

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
Component tests for selection, highlight replacement, and clearing. A manual check on
a result with more than one page of trades.

**Out of scope**
Editing trades, annotations, or exporting.

**Proof relevance**
Routine.

---

# V3 slices

## UI-03 - Discovery page

**Version:** V3 · **Priority:** REQ · **Effort:** L

**Outcome**
A page that configures and starts a search run, shows live progress and the candidate
count, shows the Top-K leaderboard as it reorders, offers pause and resume and
cancel, and opens any entry's result.

**Why this slice exists**
This is the assignment's demo centrepiece: press start, watch candidates tested,
watch the leaderboard reorder. It is also the only place a person can exercise the
`SEARCH-02` control behaviour.

**Dependencies**
`SEARCH-05`, `SEARCH-02`.

**Authoritative references**
- Official project source sections 23, 33 and 46.
- Sample interface image "Loop Discovery", "Leaderboard", "Discovery method", and "Discovery progress".
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants): no business logic in the frontend.

**Architecture constraints**
- Progress and leaderboard values come from durable state through `SEARCH-05`. The
  page counts nothing itself.
- In V3 the page **polls** the progress snapshot. V6's `SEARCH-06` replaces the poll
  with a push of the same snapshot shape, so the page's rendering does not change.
  Structure the data layer so the source can be swapped without touching the
  components.
- The search method selector lists generators from the `STRAT-07` catalog, never from
  a hard-coded list, so a new generator appears without a frontend change.
- Stop conditions are entered as configuration on the experiment, not applied in the
  browser.
- Pause, resume, and cancel call the durable control endpoints and reflect the
  converged state, not the requested state.

**Expected change surface**
The Discovery page, a run configuration form, a generator selector fed by the
catalog, a progress panel, a leaderboard table, control buttons, a polling data
layer, and result detail navigation.

**Acceptance criteria**
1. A run can be configured with its dataset, search space, stop conditions, and
   generator, then started.
2. Progress updates visibly while the run proceeds, without a page reload.
3. The leaderboard reorders as better candidates are accepted.
4. Pause, resume, and cancel each work, and the page shows converged state rather
   than optimistic state.
5. A completed run shows why it stopped.
6. Refreshing the page restores the correct view from a snapshot.
7. Adding a second generator makes it selectable with no change under `apps/web`.
8. Clicking a leaderboard entry opens its trades, its chart overlays, and its
   provenance.
9. The data layer's source is swappable without changing any component.

**Validation**
Integration tests for start, progress updates, leaderboard reordering, each control,
and refresh recovery. A manual run of the demo scenario from start to a stop
condition.

**Out of scope**
Live push, which is `SEARCH-06` in V6. Trade visualization, which already exists from
`UI-05`.

**Proof relevance**
Contributes to `PROOF-CONTROL-001` and `PROOF-REPLACE-001` - the generator selector
must not need editing.

---

# V5 slices

## UI-07 - News page

**Version:** V5 · **Priority:** REQ · **Effort:** M

**Outcome**
A page that lists collected news items with their sources, shows the sentiment
distribution over a window, and shows collection and analysis health.

**Why this slice exists**
It makes the news pipeline visible, and it is where `PROOF-ISO-001` and
`PROOF-ISO-002` become observable to a person rather than only to a test.

**Dependencies**
`NEWS-07`, `SETUP-06`.

**Authoritative references**
- Official project source sections 27, 29 and 37.
- Sample interface image "News Crawler": the item list, the sentiment distribution, and the analyzed-count and source-coverage panels.

**Architecture constraints**
- Every value comes from the `NEWS-07` endpoints. The page performs no aggregation of
  its own.
- Degraded collection or degraded analysis is shown explicitly, because that is the
  visible half of the isolation proofs.
- The page shows no model, artefact, or provider internal detail.
- The page must not be on any shared loading path, so a news failure cannot affect
  another page.

**Expected change surface**
The News page, item list with paging, sentiment distribution display, health
indicators, and their API client methods.

**Acceptance criteria**
1. Collected items are listed with title, source, published time, and related coins.
2. The sentiment distribution over a chosen window is displayed with its item count.
3. Collection health and analysis health are shown, including degraded states.
4. With the news worker stopped, this page shows degraded state and every other page
   still works normally.
5. With the model unavailable, the page shows analysis degraded while collected items
   still list.
6. No model or provider internal detail is visible.

**Validation**
Component and integration tests for the healthy, collection-degraded, and
analysis-degraded states. A manual run with each process stopped in turn, checking
every other page still works.

**Out of scope**
Model-assisted extraction templates and self-healing extraction visible in the sample
image - both are extensions, not MVP scope. Source configuration editing.

**Proof relevance**
Contributes to `PROOF-ISO-001` and `PROOF-ISO-002` as their user-visible evidence.
