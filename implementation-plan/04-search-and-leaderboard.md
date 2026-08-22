# 04 - Search, Ranking, Leaderboard, and Observability

The loop that generates candidates and dispatches work, its durable control state,
the versioned ranking policy, the Top-K projection, and the operational surface that
makes the whole thing visible.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

| Version | Slices |
|---|---|
| V3 | `SEARCH-03`, `SEARCH-01`, `SEARCH-02`, `SEARCH-04`, `SEARCH-05` |
| V6 | `SEARCH-06`, `SEARCH-07`, `OPS-01` |

## Build order inside V3

**`SEARCH-03` comes first**, before `SEARCH-01`. The no-improvement stop condition
needs a defined comparison criterion, and "improvement" is meaningless until a
ranking policy says what better means. The earlier plan had these the wrong way
round.

```text
SEARCH-03 (ranking policy)
  -> SEARCH-01 (coordinator, using it for the no-improvement condition)
    -> SEARCH-02 (control)
    -> SEARCH-04 (projection, using it for rank)
      -> SEARCH-05 (queries)
```

Ranking weights are a human decision. Resolve them during V2 so they do not stall
V3.

## What this area must not become

The official source names the failure mode directly: one function that loops forever,
calculating, backtesting, saving, and updating the interface inline. The split is
already fixed by the architecture - the coordinator owns run state and stop policy,
the generator proposes, the executor runs, the projector ranks. These slices
implement that split; they do not get to rearrange it.

## The projection seam

In V3 the leaderboard projection is updated **synchronously**, inside the same
transaction that accepts the result, by calling the projector directly. In V6 the
same projector is called by an event consumer instead.

That is not a shortcut around the frozen rule that a worker must not mutate the
leaderboard directly. What the rule forbids is bypassing the projector and writing
projection rows from arbitrary code. The projector still owns the projection, is
still idempotent, and is still rebuildable from authoritative results. Only who calls
it changes.

The consequence for V3: **build the projector as if it were already event-driven.**
Idempotent, version-checked, rebuildable, taking one evaluated result as input. If
V6's `EXP-09` has to modify it, the V3 seam was wrong.

---

# V3 slices

## SEARCH-03 - Versioned ranking policy

**Version:** V3 · **Priority:** REQ · **Effort:** S

**Outcome**
A versioned ranking policy turns a metric set into a comparable score with a defined
tie-break, and its identifier, version, and configuration are recorded on every
result it ranks.

**Why this slice exists**
The official source requires the group to state clearly how the score is computed.
The baseline requires it to be explicit versioned configuration rather than a hidden
default, because a changed weight silently reorders history otherwise. It comes first
in V3 because the coordinator's no-improvement stop condition depends on it.

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
- The tie-break is deterministic and total, so two results never compare as equal by
  accident.

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
The projection, the interface, and user-selected sorting, which is a display concern
in `UI-03`.

**Proof relevance**
Directly required by `PROOF-REP-001` item 7 and by `PROOF-DUP-001` in V6, which
compares projection state under a fixed policy.

---

## SEARCH-01 - Search coordinator and stop conditions

**Version:** V3 · **Priority:** REQ · **Effort:** L

**Outcome**
Starting an experiment runs a durable loop that asks the generator for candidates,
persists them with their run intent, submits them through the `BacktestExecutor`
port, and stops when a configured stop condition is met. Run state survives a
coordinator restart.

**Why this slice exists**
This is the assignment's Module 9. The explicit requirement is that the loop must not
run without control, and the coordinator is where that control lives.

**Dependencies**
`STRAT-07`, `EXP-05`, `SEARCH-03`.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the search coordinator owns run state and stop policy, requests candidates, and creates idempotent jobs.
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): pause, resume, cancel, and stop conditions are durable Experiment state and are not delegated to broker cancellation semantics.
- [ADR-004](../docs/adr/ADR-004-asynchronous-experiment-processing.md).
- Official project source section 23: stop after a candidate count, after a duration, or after no improvement for a number of iterations.

**Architecture constraints**
- Run state lives in PostgreSQL. Losing the coordinator process must not lose the
  run.
- The coordinator decides when and how many candidates to request. The generator
  decides only what a candidate looks like.
- The coordinator submits through the `BacktestExecutor` port from `EXP-04`. It does
  not know whether the executor is PostgreSQL-backed or BullMQ-backed, which is what
  makes V6's swap invisible here.
- Backpressure is required: the coordinator must not generate and submit without
  limit while runners fall behind.
- Stop conditions are explicit configuration on the frozen specification. The
  no-improvement condition compares scores from `SEARCH-03`.
- This slice extends `EXP-01`'s specification with search fields. That is an additive
  change at draft stage, not a redesign.

**Expected change surface**
Run state and candidate table migrations, search fields added to the specification,
the coordinator in `experiment/application`, the stop policy evaluator, a
backpressure limit, and a start endpoint.

**Acceptance criteria**
1. Starting an experiment freezes its specification and begins generating and
   submitting candidates.
2. Each of the three stop conditions ends the run: maximum candidates, maximum
   duration, and no improvement after a configured number of iterations.
3. The no-improvement condition uses the `SEARCH-03` score, and its comparison window
   is configuration.
4. The run stops cleanly, records why it stopped, and submits nothing further.
5. Killing and restarting the coordinator resumes the run from durable state with no
   duplicated candidates and no lost progress.
6. In-flight work is bounded by a configured limit; the coordinator waits rather than
   growing the backlog without limit.
7. Progress - candidates generated, submitted, completed, failed - is queryable at any
   time.
8. A run cannot be started twice for the same experiment.
9. Candidates are append-only; a stored candidate cannot be edited.

**Validation**
Integration tests for each stop condition, for restart recovery, and for the
backpressure bound. A manual run of a small experiment observed to completion.

**Out of scope**
Pause, resume, and cancel, which are `SEARCH-02`. The projection and the interface.

**Proof relevance**
Directly required by `PROOF-CONTROL-001`, and by `PROOF-SCALE-001` in V6.

---

## SEARCH-02 - Durable pause, resume, and cancel

**Version:** V3 · **Priority:** REQ · **Effort:** M

**Outcome**
Pause, resume, and cancel are durable state transitions that converge even across
process restarts, and a stale-claim sweep recovers work abandoned by a dead runner.

**Why this slice exists**
`PROOF-CONTROL-001` requires exactly this behaviour, including survival of an API or
coordinator restart. The driver is the long-running loop that V3 introduces.

**Dependencies**
`SEARCH-01`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): pause, resume, cancel, and stop conditions are durable Experiment state.
- [ADR-004 - Decision](../docs/adr/ADR-004-asynchronous-experiment-processing.md): the coordinator owns pause, resume, and cancel; broker controls do not define domain state; workers check cooperative cancellation at safe checkpoints.
- [Proof plan - PROOF-CONTROL-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- The requested state is durable. Convergence toward it is the coordinator's job.
- Pause stops new submission after convergence. Running work finishes or stops at a
  checkpoint according to a documented, observable policy.
- Cancel prevents new work and marks pending work cancelled. Results already
  completed remain auditable even when excluded.
- The stale-claim sweep uses the lease from `EXP-04`. With a PostgreSQL run table
  there is only one source of state, so full reconciliation between a database and a
  broker has no meaning yet - that is `SEARCH-07` in V6.
- Cancellation reaches a running backtest through the cooperative checkpoints that
  `EXP-05` already provides.

**Expected change surface**
State transitions and their guards, pause, resume, and cancel commands and endpoints,
a stale-claim sweep on coordinator start and on a schedule, and worker checkpoint
cooperation.

**Acceptance criteria**
1. Pause stops new submission, and the run reports paused only after convergence.
2. Resume continues from durable state with no duplicated or skipped candidates.
3. Cancel stops new submission, marks pending work cancelled, and leaves completed
   results intact and auditable.
4. Every one of the three survives a coordinator or API restart mid-transition.
5. Running-work behaviour under pause and under cancel is documented and observable
   in the run record.
6. A run claimed by a killed runner is recovered by the stale-claim sweep and
   completed.
7. Running the sweep twice changes nothing the second time.

**Validation**
Integration tests for each transition, each with a restart injected mid-transition,
plus stale-claim recovery and sweep idempotence.

**Out of scope**
Broker reconciliation, which is `SEARCH-07`. Interface controls, which are `UI-03`.

**Proof relevance**
Directly claims `PROOF-CONTROL-001` in the PostgreSQL-executor realization. V6
re-runs the same proof against BullMQ.

---

## SEARCH-04 - Leaderboard projection

**Version:** V3 · **Priority:** REQ · **Effort:** M

**Outcome**
An idempotent, rebuildable Top-K projection derived from authoritative evaluated
results using the experiment's ranking policy. In V3 it is driven synchronously from
result acceptance; its logic is written so V6 can drive it from an event consumer
without change.

**Why this slice exists**
The assignment asks whether the leaderboard is stored or derived and requires the
choice to be explained. The baseline already chose derived. This slice builds that
projection with the duplicate-safety properties it will need in V6, before it needs
them.

**Dependencies**
`SEARCH-01`, `SEARCH-03`.

**Authoritative references**
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 8: the leaderboard is derived and traceable to immutable Experiment truth.
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): authoritative experiments and results are never reconstructed from the leaderboard projection.
- [ADR-005 - Decision](../docs/adr/ADR-005-transactional-results-leaderboard.md): an idempotent, rebuildable projection; a row links to result and immutable specification and is never authoritative.
- Official project source sections 21 and 22.
- The "projection seam" section at the top of this file.

**Architecture constraints**
- The projection is derived. Deleting and rebuilding it must lose nothing.
- The projector is the only code that writes projection rows. Nothing else does, in
  any version.
- The projector takes one evaluated result and is idempotent on it, keyed by result
  identity and aggregate version. Applying the same result twice changes nothing.
- Each row links to its authoritative result and its immutable frozen specification.
- Projection updates are serialized or versioned per leaderboard, because ADR-005
  names rank races as a risk.
- **Write it as if it were already event-driven.** Its input is a result, not a
  transaction handle or a callback context.

**Expected change surface**
A leaderboard projection table migration, the projector in `experiment/application`,
a synchronous call from the acceptance path, a rebuild command, and tests.

**Acceptance criteria**
1. An evaluated result better than the current last place enters the Top-K and
   displaces the previous last entry.
2. A result worse than the current last place does not enter.
3. Applying the same result twice leaves the projection unchanged, proved by
   comparing a projection hash before and after.
4. Applying a stale aggregate version leaves the projection unchanged.
5. Deleting and rebuilding the projection from authoritative results reproduces the
   same content and the same hash.
6. Every row links to its result and its frozen specification, and both links resolve.
7. Concurrent projection updates do not corrupt rank; a concurrency test proves it.
8. The projector's public function takes an evaluated result and nothing
   transaction-specific or caller-specific.

**Validation**
Integration tests for entry, rejection, duplicate application, stale version, rebuild
equivalence, and concurrency. The duplicate and stale tests are the direct rehearsal
for `PROOF-DUP-001` in V6.

**Out of scope**
The leaderboard page, sorting controls, live push, and the event consumer.

**Proof relevance**
Contributes to `PROOF-REP-001`, and enables `PROOF-DUP-001` in V6.

---

## SEARCH-05 - Experiment and leaderboard query surface

**Version:** V3 · **Priority:** REQ · **Effort:** M

**Outcome**
Endpoints return the leaderboard with Top-K entries and their metrics, an
experiment's run state and progress, a result's full provenance checklist, and a
result's chart annotations recomputed on demand. The result and trades reads come
from `EXP-10` unchanged.

**Why this slice exists**
The Discovery page needs the leaderboard and progress reads, and `PROOF-REP-001`
needs the provenance read to resolve the checklist for the current top entry.

This slice **extends** the `EXP-10` query surface from V1. It does not reimplement
the single-result or trades read. Clicking a leaderboard entry opens the same result
endpoint the Backtest page already uses, which is why a leaderboard result and a
manually-run result look identical to the interface.

**Dependencies**
`SEARCH-04`, `EXP-10`.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): experiment queries return run and job progress, failures, results, provenance, trades, and leaderboard views.
- [Baseline - Logical modules, ARC-API](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): query composition assembles read responses from module-owned query ports.
- Official project source sections 21, 26 and 40 question 8.

**Architecture constraints**
- The API composes reads from module query ports. It performs no metric or ranking
  calculation.
- **Reuse, do not duplicate.** The result summary and the paginated trades read
  already exist from `EXP-10`. Adding a second result endpoint for leaderboard
  entries would mean two shapes for the same data and two places to fix a bug.
- The provenance read returns the reproducibility checklist in one response,
  extending the specification reference `EXP-10` already returns.
- Sorting the leaderboard by a metric is a read concern and must not change the stored
  rank produced by the ranking policy.
- **Annotations for a search result are recomputed on demand**, by re-running its
  frozen specification through the deterministic backtester. `EXP-11` explains why
  they are not stored for every candidate. The recompute is cached for the duration
  of a request or briefly, never persisted as authoritative.
- The progress read returns a complete snapshot shape, so V6's live push can send the
  same shape without a second contract.

**Expected change surface**
Leaderboard, progress, and provenance query ports in `experiment/application`, their
controllers and DTOs in `ApiModule`, an annotation recompute path, response types in
`packages/api-contracts`, and API client methods. The `EXP-10` result and trades
endpoints are reused as they are.

**Acceptance criteria**
1. The leaderboard read returns ranked entries with strategy composition, return, win
   rate, maximum drawdown, and number of trades.
2. The progress read returns run state, counts of candidates generated, submitted,
   completed, and failed, and the reason a stopped run stopped.
3. Opening a leaderboard entry's result and trades uses the `EXP-10` endpoints with
   no new endpoint and no changed response shape.
4. The provenance read returns the full reproducibility checklist for one result.
5. The annotation read for a search result recomputes and returns the same
   annotations the original run produced, proved by comparison against a stored
   single-run result.
6. Sorting by a different metric changes display order only, and the stored rank is
   unchanged.
7. An unknown identifier returns a clear client error.
8. The progress response is a complete snapshot, not a delta.

**Validation**
Endpoint integration tests for the leaderboard, progress, provenance, and annotation
reads, plus sorting and the recompute equivalence in criterion 5. Confirm criterion 3
by checking that no new result or trades controller was added. Read one provenance
response manually and check it against the baseline's ten-item list.

**Out of scope**
The pages themselves, which are `UI-03`. Live push, which is `SEARCH-06`.

**Proof relevance**
Directly required by `PROOF-REP-001`.

---

# V6 slices

## SEARCH-06 - Live progress and leaderboard push

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
The Discovery page receives live experiment progress and leaderboard changes over the
WebSocket gateway, replacing the polling it used in V3.

**Why this slice exists**
V3's Discovery page polls the `SEARCH-05` snapshot, which works and demos fine. Push
becomes worthwhile in V6 because the projection is now updated by a consumer in
another process, and because the gateway and Pub/Sub already exist from V4.

**Dependencies**
`EXP-09`, `MKT-07`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): WebSocket carries subscription control, market updates, progress, degradation, and leaderboard notifications.
- [ADR-008](../docs/adr/ADR-008-realtime-delivery-recovery.md): best-effort fan-out after an authoritative commit, with durable snapshots for recovery.
- Official project source section 33 steps 8 and 9.

**Architecture constraints**
- Notification is best-effort. A missed message causes a snapshot refresh, never a
  wrong leaderboard.
- Notification is published only after the projection commits.
- The client subscribes per experiment with its own subscription identifier, the same
  pattern the charts use.
- The pushed payload is the same snapshot shape `SEARCH-05` already returns, so
  polling remains a working fallback rather than dead code.
- Progress numbers come from durable state, not from counting messages received.

**Expected change surface**
Progress and leaderboard channels in the gateway, publication after the projection
commit in `EXP-09`, and SPA subscription handling replacing the poll on the Discovery
page.

**Acceptance criteria**
1. Subscribing to an experiment returns a snapshot, then live updates.
2. A leaderboard change reaches the client without polling and without a page reload.
3. Dropping the Pub/Sub path leaves the leaderboard correct on the next snapshot.
4. Chart subscriptions are unaffected by an experiment subscription and the reverse.
5. Unsubscribing or navigating away releases the subscription.
6. Disabling push falls back to the V3 polling path with no functional loss.

**Validation**
Integration tests for snapshot-then-live, isolation from chart subscriptions,
recovery after a dropped notification, and the polling fallback.

**Out of scope**
The Discovery page layout, which is `UI-03`.

**Proof relevance**
Contributes to `PROOF-OBS-001`.

---

## SEARCH-07 - Broker dispatch reconciliation

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
The coordinator detects and repairs disagreement between what PostgreSQL believes
about a run and what BullMQ actually holds.

**Why this slice exists**
Once BullMQ carries delivery, two independent stores hold state about the same work
and they can disagree after any crash. Before V6 there was only one store, so this
had nothing to reconcile.

**Dependencies**
`EXP-12`, `SEARCH-02`.

**Authoritative references**
- [ADR-004 - Decision](../docs/adr/ADR-004-asynchronous-experiment-processing.md): the coordinator owns dispatch reconciliation; broker controls do not define domain state.
- [Proof plan - PROOF-CONTROL-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- PostgreSQL is authoritative. Reconciliation repairs the broker's view or the run
  record to match durable truth, never the reverse.
- Reconciliation is idempotent and safe to run repeatedly.
- Broker-level cancellation is an optimization, never the definition of cancelled.
- It runs on coordinator start and on a schedule.

**Expected change surface**
A reconciliation routine comparing run records against broker job state, repair
actions for each disagreement direction, and tests.

**Acceptance criteria**
1. A run marked submitted with no broker job is detected and re-submitted.
2. A broker job with no run record is detected and handled safely without creating a
   phantom result.
3. A run marked cancelled with a live broker job has that job removed.
4. Running reconciliation twice changes nothing the second time.
5. Every disagreement it repairs is logged with enough detail to explain it.
6. `PROOF-CONTROL-001` passes against the BullMQ realization.

**Validation**
Integration tests creating each disagreement direction deliberately, plus a repeat
run. Re-run the `PROOF-CONTROL-001` scenarios.

**Out of scope**
The control transitions themselves, which are `SEARCH-02`.

**Proof relevance**
Required to re-run `PROOF-CONTROL-001` in V6.

---

## OPS-01 - Operational status surface

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
One operational read exposes run state, queue depth and job state counts, dispatcher
lag, projection lag, retries, stalled and failed jobs, Redis persistence health,
provider health, worker count, and the current top entry.

**Why this slice exists**
`PROOF-OBS-001` lists these exact observations and `PROOF-SCALE-001` needs several as
measurements. It arrives in V6 because most of the quantities it reports - queue
depth, dispatcher lag, projection lag - do not exist before V6 creates the things
that produce them.

Before V6, the `SEARCH-05` progress read already tells a person what a run is doing,
which is all V3 needs.

**Dependencies**
`EXP-08`, `SEARCH-06`, `MKT-09`.

**Authoritative references**
- [Proof plan - PROOF-OBS-001](../docs/validation/architecture-proof-plan.md): the full correlation chain and the required query, metric, and log access.
- [Proof plan - PROOF-SCALE-001](../docs/validation/architecture-proof-plan.md): the telemetry it captures.
- Official project source section 32.7.

**Architecture constraints**
- The read composes from module query ports and broker inspection. It writes nothing.
- Correlation identifiers from `SETUP-09` must let a person follow one experiment to
  its candidate, job, attempt, result, outbox event, consumer record, and leaderboard
  entry.
- Queue and Redis facts come from the broker and Redis themselves, not from a cached
  guess.
- This is an operational surface, not an authentication-protected admin system.
  Authentication is outside baseline scope.

**Expected change surface**
An operational query composing module status reads, broker queue inspection, a Redis
health check, one endpoint, and a status area in the SPA shell.

**Acceptance criteria**
1. The read returns every item listed in the Outcome above.
2. Given an experiment identifier, a documented sequence of reads follows the whole
   correlation chain to the leaderboard entry.
3. Queue depth and job state counts match what the broker actually reports.
4. Dispatcher lag and projection lag are real ages, and they rise when their process
   is stopped.
5. Redis persistence mode and eviction policy are reported so they can be pasted into
   a proof record.
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
