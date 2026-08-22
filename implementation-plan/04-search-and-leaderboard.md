# 04 - Search, Ranking, Leaderboard, and Observability

The continuous loop that generates candidates and dispatches work, its durable
control state, the versioned ranking policy, the Top-K projection derived from
authoritative results, and the operational surface that makes all of it visible.

Read [`README.md`](README.md) first. Statuses live in [`TRACKING.md`](TRACKING.md).

## What this area must not become

The official source names the failure mode directly: one function that loops
forever, calculating, backtesting, saving, and updating the interface inline. The
architecture answer is already fixed - the coordinator owns run state and stop
policy, workers own execution, and the leaderboard is a projection. These slices
implement that split; they do not get to rearrange it.

Two rules to keep in view:

- **Stop conditions are durable Experiment state**, not broker settings. Pausing is
  not "stop consuming the queue".
- **No worker updates the leaderboard directly.** The projection is driven by the
  `StrategyEvaluated` event through the `EXP-09` consumer pattern.

## Blocked on a decision

`SEARCH-03` cannot start until ranking weights and the tie-break rule are supplied.
See "Open decisions" in
[`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md).

---

## SEARCH-01 - Search coordinator and stop conditions

**Outcome**
Starting an experiment runs a durable loop that asks the generator for candidates,
persists them with their job intent, dispatches work, and stops when a configured
stop condition is met. Run state survives a coordinator restart.

**Why this slice exists**
This is the assignment's Module 9. The explicit requirement is that the loop must
not run without control, and the coordinator is where that control lives.

**Dependencies**
`EXP-05`, `STRAT-07`.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the search coordinator owns run state and stop policy, requests candidates, and creates idempotent jobs.
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): pause, resume, cancel, and stop conditions are durable Experiment state and are not delegated to broker cancellation semantics.
- [ADR-004 - Decision](../docs/adr/ADR-004-asynchronous-experiment-processing.md).
- Official project source section 23: stop after a candidate count, after a duration, or after no improvement for a number of iterations.

**Architecture constraints**
- Run state lives in PostgreSQL. Losing the coordinator process must not lose the
  run.
- The coordinator decides when and how many candidates to request. The generator
  decides only what a candidate looks like.
- Backpressure is required: the coordinator must not generate and enqueue without
  limit while workers fall behind.
- Stop conditions are explicit configuration on the frozen specification.
- The coordinator dispatches through `EXP-04`. It does not enqueue directly.

**Expected change surface**
A run state table and transitions, the coordinator in `experiment/application`, the
stop policy evaluator, a backpressure limit, and a start endpoint in `ApiModule`.

**Acceptance criteria**
1. Starting an experiment freezes its specification and begins generating and
   dispatching candidates.
2. Each of the three stop conditions ends the run: maximum candidates, maximum
   duration, and no improvement after a configured number of iterations.
3. The run stops cleanly, records why it stopped, and dispatches nothing further.
4. Killing and restarting the coordinator resumes the run from durable state with
   no duplicated candidates and no lost progress.
5. In-flight work is bounded by a configured limit; the coordinator waits rather
   than growing the queue without limit.
6. Progress - candidates generated, dispatched, completed, failed - is queryable at
   any time.
7. A run cannot be started twice for the same experiment.

**Validation**
Integration tests for each stop condition, for restart recovery, and for the
backpressure bound. A manual run of a small experiment observed to completion.

**Out of scope**
Pause, resume, and cancel (`SEARCH-02`); ranking; projection.

**Proof relevance**
Directly required by `PROOF-SCALE-001` and `PROOF-CONTROL-001`.

---

## SEARCH-02 - Durable pause, resume, cancel, and dispatch reconciliation

**Outcome**
Pause, resume, and cancel are durable state transitions that converge even across
process restarts, and dispatch reconciliation repairs the difference between what
PostgreSQL believes about jobs and what the broker actually holds.

**Why this slice exists**
`PROOF-CONTROL-001` requires exactly this behaviour, including survival of an API
or coordinator restart. Reconciliation exists because a job row and a broker entry
can disagree after any crash.

**Dependencies**
`SEARCH-01`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): pause, resume, cancel, and stop conditions are durable Experiment state.
- [ADR-004 - Decision](../docs/adr/ADR-004-asynchronous-experiment-processing.md): the coordinator owns pause, resume, cancel, and dispatch reconciliation; broker controls do not define domain state; workers check cooperative cancellation at safe checkpoints.
- [Proof plan - PROOF-CONTROL-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- The requested state is durable. Convergence toward it is the coordinator's job.
- Pause stops new dispatch after convergence. Running jobs finish or stop at a
  checkpoint according to a documented, observable policy.
- Cancel prevents new work and marks pending work cancelled. Results already
  completed remain auditable even when excluded.
- Reconciliation is idempotent and safe to run repeatedly.
- Broker-level cancellation is an optimization, never the definition of cancelled.

**Expected change surface**
State transitions and their guards, pause, resume, and cancel commands and
endpoints, a reconciliation routine on coordinator start and on a schedule, and
worker checkpoint cooperation.

**Acceptance criteria**
1. Pause stops new dispatch, and the run reports paused only after convergence.
2. Resume continues from durable state with no duplicated or skipped candidates.
3. Cancel stops new dispatch, marks pending jobs cancelled, and leaves completed
   results intact and auditable.
4. Every one of the three survives a coordinator or API restart mid-transition.
5. Running-job behaviour under pause and under cancel is documented and observable
   in the run record.
6. Reconciliation detects a job marked dispatched with no broker entry and repairs
   it, and detects a broker entry with no job row and handles it safely.
7. Running reconciliation twice changes nothing the second time.

**Validation**
Integration tests for each transition, each with a restart injected mid-transition.
Reconciliation tests for both disagreement directions and for repeated runs.

**Out of scope**
Interface controls, which are `UI-03`.

**Proof relevance**
Directly claims `PROOF-CONTROL-001`.

---

## SEARCH-03 - Versioned ranking policy

**Outcome**
A versioned ranking policy turns a metric set into a comparable score with a
defined tie-break, and its identifier, version, and configuration are recorded on
every result it ranks.

**Why this slice exists**
The official source requires the group to state clearly how the score is computed.
The baseline requires it to be explicit versioned configuration rather than a
hidden default, because a changed weight silently reorders history otherwise.

**Dependencies**
`EXP-03`. **Blocked** until ranking weights and the tie-break rule are supplied.

**Authoritative references**
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 7.
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the ranking policy performs versioned score and tie-break calculation from metrics.
- Official project source sections 21 and 22.

**Architecture constraints**
- The policy takes a metric set and returns a score. It never reads trades, runs a
  strategy, or touches the database.
- Weights and thresholds are configuration carried on the frozen specification.
- The policy has an identifier and a semantic version, both recorded per result.
- Changing weights creates a new policy version. It never reinterprets old results.
- The tie-break is deterministic and total, so two results never compare as equal
  by accident.

**Expected change surface**
A ranking policy port and its first implementation, its configuration type,
registration, and tests.

**Acceptance criteria**
1. Given a metric set and a configuration, the score is deterministic and
   hand-checkable.
2. The tie-break produces a strict total order, and a test with identical metrics
   proves it.
3. Policy identifier, version, and configuration appear on the ranked result.
4. Two different policy versions can coexist, and results ranked under each keep
   their own version.
5. A second policy implementation can be registered with no change to any consumer.
6. Direction of each metric is explicit: higher return is better, lower drawdown is
   better, and the code says so rather than implying it through a sign.

**Validation**
Unit tests on hand-checked metric fixtures, a tie-break test, and a second-policy
registration test.

**Out of scope**
The projection, the leaderboard interface, and user-selected sorting, which is a
display concern in `UI-03`.

**Proof relevance**
Directly required by `PROOF-REP-001` item 7 and by `PROOF-DUP-001`, which compares
projection state under a fixed policy.

---

## SEARCH-04 - Leaderboard projection

**Outcome**
A consumer of `StrategyEvaluated` idempotently maintains a Top-K leaderboard
projection derived from authoritative results, using the experiment's ranking
policy. Duplicate and stale events leave the projection unchanged.

**Why this slice exists**
The assignment asks whether the leaderboard is stored or derived and requires the
choice to be explained. The baseline already chose derived, and this slice builds
that projection under the duplicate-safety rules from `EXP-09`.

**Dependencies**
`EXP-09`, `SEARCH-03`.

**Authoritative references**
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 8: the leaderboard is derived and traceable to immutable Experiment truth.
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): authoritative experiments and results are never reconstructed from the leaderboard projection.
- [ADR-005 - Decision](../docs/adr/ADR-005-transactional-results-leaderboard.md): an idempotent, rebuildable projection; a row links to result and immutable specification and is never authoritative.
- Official project source sections 21 and 22: Top-K, and a new candidate entering when it beats the current last place.

**Architecture constraints**
- The projection is derived. Deleting and rebuilding it must lose nothing.
- No worker writes it directly. Only the event consumer does.
- Each row links to its authoritative result and its immutable frozen
  specification.
- Projection updates are serialized or versioned per leaderboard, because ADR-005
  names rank races as a risk.
- A duplicate or stale event leaves the projection hash unchanged.
- Pub/Sub notification happens only after the projection commits.

**Expected change surface**
A leaderboard projection table migration, the projector built on the `EXP-09`
consumer pattern, a rebuild command, and the Pub/Sub notification after commit.

**Acceptance criteria**
1. An evaluated result better than the current last place enters the Top-K and
   displaces the previous last entry.
2. A result worse than the current last place does not enter.
3. Delivering the same event twice leaves the projection unchanged, proved by
   comparing a projection hash before and after.
4. Delivering a stale aggregate version leaves the projection unchanged.
5. Deleting and rebuilding the projection from authoritative results reproduces the
   same content and the same hash.
6. Every row links to its result and its frozen specification, and both links
   resolve.
7. Concurrent projection updates do not corrupt rank; a concurrency test proves it.
8. The best-effort notification is published only after the commit.

**Validation**
Integration tests for entry, rejection, duplicate, stale version, rebuild
equivalence, and concurrency. The duplicate and stale tests are the direct
rehearsal for `PROOF-DUP-001`.

**Out of scope**
The leaderboard page, sorting controls, and live push to the client
(`SEARCH-06`).

**Proof relevance**
Directly claims `PROOF-DUP-001` and contributes to `PROOF-REP-001`.

---

## SEARCH-05 - Experiment and leaderboard query surface

**Outcome**
Endpoints return the leaderboard with Top-K entries and their metrics, an
experiment's run state and progress, a result's trades, and a result's full
provenance.

**Why this slice exists**
The Discovery and Backtest pages need these four reads, and `PROOF-REP-001` needs
the provenance read to resolve the checklist for the current top entry.

**Dependencies**
`SEARCH-04`, `EXP-07`.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): experiment queries return run and job progress, failures, results, provenance, trades, and leaderboard views.
- [Baseline - Logical modules, ARC-API](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): query composition assembles read responses from module-owned query ports.
- Official project source sections 21, 26 and 40 question 8.

**Architecture constraints**
- The API composes reads from module query ports. It performs no metric or ranking
  calculation.
- Trades may be large; the trades read is paginated. The sample interface shows 178
  trades across 18 pages, so paging is expected, not optional.
- The provenance read returns the reproducibility checklist in one response.
- Sorting the leaderboard by a metric is a read concern and must not change the
  stored rank produced by the ranking policy.

**Expected change surface**
Query ports in `experiment/application`, controllers and DTOs in `ApiModule`,
response types in `packages/api-contracts`, and API client methods.

**Acceptance criteria**
1. The leaderboard read returns ranked entries with strategy composition, return,
   win rate, maximum drawdown, and number of trades.
2. The experiment progress read returns run state, counts of candidates generated,
   dispatched, completed, and failed, and the reason a stopped run stopped.
3. The trades read is paginated and returns entry time, entry price, exit time,
   exit price, direction, fees, slippage, and profit and loss per trade.
4. The provenance read returns the full reproducibility checklist for one result.
5. Sorting by a different metric changes display order only, and the stored rank is
   unchanged.
6. An unknown identifier returns a clear client error.

**Validation**
Endpoint integration tests for all four reads including paging and sorting. Read
one provenance response manually and check it against the baseline's ten-item list.

**Out of scope**
The pages themselves, which are `UI-03` and `UI-04`.

**Proof relevance**
Directly required by `PROOF-REP-001` and contributes to `PROOF-OBS-001`.

---

## SEARCH-06 - Live progress and leaderboard push

**Outcome**
The Discovery page receives live experiment progress and leaderboard changes over
the WebSocket gateway without polling and without a page reload.

**Why this slice exists**
The demo scenario shows a live candidate counter and a leaderboard that reorders
while the loop runs. It reuses the `WS-03` snapshot-then-live pattern, so this
slice is small.

**Dependencies**
`SEARCH-04`, `MKT-07`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): WebSocket carries subscription control, market updates, progress, degradation, and leaderboard notifications.
- [ADR-008](../docs/adr/ADR-008-realtime-delivery-recovery.md): best-effort fan-out after an authoritative commit, with durable snapshots for recovery.
- Official project source section 33 steps 8 and 9, and section 46 steps 4 and 5.

**Architecture constraints**
- Notification is best-effort. A missed message causes a snapshot refresh, never a
  wrong leaderboard.
- Notification is published only after the projection commits.
- The client subscribes per experiment with its own subscription identifier, the
  same pattern the charts use.
- Progress numbers come from durable state, not from counting messages received.

**Expected change surface**
Progress and leaderboard channels in the gateway, publication after the projection
commit, and SPA subscription handling on the Discovery page.

**Acceptance criteria**
1. Subscribing to an experiment returns a snapshot of progress and leaderboard,
   then live updates.
2. A leaderboard change reaches the client without polling and without a page
   reload.
3. Dropping the Pub/Sub path leaves the leaderboard correct on the next snapshot.
4. Chart subscriptions are unaffected by an experiment subscription and the
   reverse.
5. Unsubscribing or navigating away releases the subscription.

**Validation**
Integration tests for snapshot-then-live, isolation from chart subscriptions, and
recovery after a dropped notification. A manual run of a small experiment watched
live.

**Out of scope**
The Discovery page layout, which is `UI-03`.

**Proof relevance**
Contributes to `PROOF-OBS-001`.

---

## OPS-01 - Operational status surface

**Outcome**
One operational read exposes run state, queue depth and job state counts,
dispatcher lag, projection lag, retries, stalled and failed jobs, Redis persistence
health, provider health, worker count, and the current top entry.

**Why this slice exists**
`PROOF-OBS-001` lists these exact observations, and `PROOF-SCALE-001` needs several
of them as measurements. Collecting them in one place turns two proof runs from an
investigation into a single read.

**Dependencies**
`SEARCH-04`, `EXP-08`, `MKT-09`.

**Authoritative references**
- [Proof plan - PROOF-OBS-001](../docs/validation/architecture-proof-plan.md): the full correlation chain and the required query, metric, and log access.
- [Proof plan - PROOF-SCALE-001](../docs/validation/architecture-proof-plan.md): the telemetry it captures.
- Official project source section 32.7.

**Architecture constraints**
- The read composes from module query ports and broker inspection. It writes
  nothing.
- Correlation identifiers from `SETUP-07` must let a person follow one experiment
  to its candidate, job, attempt, result, outbox event, consumer record, and
  leaderboard entry.
- Queue and Redis facts come from the broker and Redis themselves, not from a
  cached guess.
- This is an operational surface, not an authentication-protected admin system.
  Authentication is out of baseline scope.

**Expected change surface**
An operational query composing module status reads, broker queue inspection, a
Redis health check, and one endpoint, plus a status area in the SPA shell.

**Acceptance criteria**
1. The read returns every item listed in the Outcome above.
2. Given an experiment identifier, a documented sequence of reads follows the whole
   correlation chain to the leaderboard entry.
3. Queue depth and job state counts match what the broker actually reports.
4. Dispatcher lag and projection lag are real ages, and they rise when their
   process is stopped.
5. Redis persistence mode and eviction policy are reported so they can be pasted
   into a proof record.
6. Worker count reflects the processes actually running.
7. Provider health reflects the degraded state that `MKT-09` records.

**Validation**
Tests asserting each field against a controlled state. Manually stop the dispatcher
and confirm its lag rises, then restart it and confirm it falls.

**Out of scope**
Dashboards, alerting, metric export to an external system, log shipping,
authentication.

**Proof relevance**
Directly claims `PROOF-OBS-001` and supplies the measurements for
`PROOF-SCALE-001`.
