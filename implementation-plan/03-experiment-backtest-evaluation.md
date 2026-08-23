# 03 - Experiment, Backtest, and Evaluation

Immutable run specifications, deterministic trade simulation, the four MVP metrics,
execution outside the request path behind a stable port, and the single transaction
that accepts a result with its provenance.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

| Version | Slices |
|---|---|
| V1 | `EXP-01`, `EXP-02`, `EXP-03`, `EXP-04`, `EXP-05`, `EXP-06`, `EXP-10`, `EXP-11` |
| V6 | `EXP-08`, `EXP-09`, `EXP-12` |

Write side and read side are separate slices. `EXP-06` accepts and stores a result;
`EXP-10` reads one back over HTTP. `EXP-07` does not exist - it was merged into
`EXP-06` because provenance cannot be captured after an immutable result already
exists, and its number is not reused.

## The execution seam

This is the most important evolution seam in the plan, and the one slice group where
V1 through V5 deliberately use a simpler realization than the frozen target.

```text
V1..V5   BacktestExecutor  ->  PostgresQueueBacktestExecutor  ->  backtest-runner process
V6       BacktestExecutor  ->  BullMQBacktestExecutor         ->  BullMQ worker process
```

What stays identical across that swap: the `BacktestExecutor` port, the
`BacktestRun` durable record, the idempotency key, the backtester, the evaluator, the
result committer, and every domain contract. Only the adapter and the worker's entry
point change.

**Architectural invariant 4 - backtest work never runs inside API request or
WebSocket execution - is satisfied from V1**, because the runner is a separate
process from the first version. That is the reason V1 pays for a separate process at
all rather than calling the backtester inline.

**This sequencing is approved.** The Project Owner accepted Alternative C on
2026-08-23. ADR-010 and baseline v1.2 authorize the PostgreSQL-backed adapter through
V5 and retain BullMQ as the mandatory V6 target. The original conflict and alternatives
remain in
[`deviation-proposal-001`](../docs/architecture/deviation-proposal-001-backtest-execution-transport.md).

## What V1 deliberately does not build

No transactional outbox, no inbox, no deduplication, no dispatcher, and no retry
matrix. In V1 through V5 there is no cross-process integration publication at all -
the runner commits the result and, from V3, updates the leaderboard projection in the
same transaction in the same process. There is no delivery gap to close, so an
outbox would be machinery guarding nothing.

V6 introduces the async delivery path and, with it, the outbox, the inbox, and the
failure matrix that `PROOF-RETRY-001` exercises.

## Accepted V1 execution model

The Project Owner accepted EXEC-A on 2026-08-23, so `EXP-02` has no human-decision
blocker. The exact capital, fee, slippage, fill, direction, rounding, sizing, stop,
tie-breaking, and final-liquidation rules are recorded in `JOURNAL.md`. They remain
fields of the immutable experiment specification, never constants hidden in the
backtest engine.

---

# V1 slices

## EXP-01 - Immutable run specification

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
A backtest run can be described as a draft, validated, and frozen at start with a
canonical content hash. After freezing, no field can change, and every later artefact
references the frozen specification.

**Why this slice exists**
Reproducibility is an explicit assignment question - how do you check which strategy
version produced a leaderboard row? ADR-006 makes it a data invariant rather than a
reporting promise, and the invariant has to exist before the first result is written.

**Dependencies**
`MKT-10`, `STRAT-02`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `ExperimentSpec` is immutable after start and includes every applicable reproducibility input.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules): the full ten-item list.
- [ADR-006](../docs/adr/ADR-006-immutable-experiment-provenance.md): draft, validate, freeze with a canonical content hash; never resolve a historical run from current defaults or latest aliases.

**Architecture constraints**
- Draft is editable. Frozen is not, enforced at the database level and not only in
  code.
- In V1 the specification records the dataset reference, the strategy reference with
  its explicit version and parameters, the execution model configuration, and the
  metric set version.
- V3 extends the same specification with search space, generator configuration and
  seed, ranking policy version, and stop conditions. That is an additive change to a
  draft-stage type, not a redesign - design the type so those fields can be added
  without altering what V1 already froze.
- Freezing computes a canonical content hash using the same helper `MKT-10` uses.
- Starting an incomplete specification for the capabilities it selected must be
  rejected.
- No field may hold "latest" or an equivalent alias.
- Experiment owns this data. No other module writes it.

**Expected change surface**
A migration for the specification table, the specification type in
`experiment/domain`, an application service for create, validate, and freeze, and
tests.

**Acceptance criteria**
1. A draft can be edited; a frozen specification cannot, and the attempt is rejected
   with a clear error.
2. Freezing produces a content hash, and freezing an identical specification produces
   the same hash.
3. Validation rejects a specification missing a field required by the capabilities it
   selected, naming the missing field.
4. The specification stores a dataset reference, never an inline range that could
   resolve differently later.
5. Every version-bearing reference is explicit; no alias is accepted.
6. A frozen specification can be read back and fully resolved after a process
   restart.
7. A database-level test confirms an update to a frozen row fails.

**Validation**
Tests for freeze immutability, hash stability, incomplete-specification rejection,
and alias rejection, plus the database-level test.

**Out of scope**
Running anything. Search configuration, which V3 adds.

**Proof relevance**
Directly required by `PROOF-REP-001` in V3.

---

## EXP-02 - Deterministic backtester

**Version:** V1 · **Priority:** CRIT · **Effort:** L

**Outcome**
Given a frozen specification, a resolved dataset, and an execution model
configuration, the backtester simulates trades and returns an ordered trade list plus
the strategy's annotations. The same inputs always produce the same output.

**Why this slice exists**
This is the assignment's Module 7 and the core of V1's demo. Determinism is what
makes `PROOF-REP-001` possible at all.

**Dependencies**
`EXP-01`. **Blocked** until the execution model defaults are supplied.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the backtester performs deterministic trade simulation.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 5.
- Official project source sections 19, 20 and 33.
- Sample interface panel of backtest assumptions: long and short supported, stop loss and take profit resolved against candle prices, reproducible results.

**Architecture constraints**
- The backtester is pure with respect to infrastructure. Candles arrive as data
  through the dataset port; it opens no connection and reads no table itself.
- Every execution assumption is a configuration field, never a constant.
- No look-ahead: a decision at bar `n` may use only information available at the
  close of bar `n`, and fills happen no earlier than the following bar unless the
  configured fill rule says otherwise, in which case that rule is explicit.
- Any random element must be seeded and the seed recorded. Prefer no randomness.
- The trade record carries entry time, entry price, exit time, exit price,
  direction, size, fees, slippage, and realized profit and loss.
- The backtester collects the annotations the strategy emits, so they can be stored
  once by `EXP-11` rather than recomputed by the frontend.

**Expected change surface**
The backtester in `experiment/domain`, the execution model configuration type, the
trade type, annotation collection, and tests with fixed candle and signal fixtures.

**Acceptance criteria**
1. A fixed candle series plus a fixed signal series produces a trade list identical
   across repeated runs and across two separate processes.
2. Fees and slippage are applied as configured and visible in each trade record.
3. Stop loss and take profit are evaluated against candle high and low, with the
   tie-breaking order documented when both are reachable in one candle.
4. Both long and short directions are simulated.
5. A hold signal opens nothing and closes nothing.
6. An open position at the end of the dataset is closed by an explicit documented
   rule rather than silently discarded.
7. No look-ahead: a test proves no decision uses a future bar.
8. Position sizing follows the configured rule, and the resulting quantity is
   recorded per trade.
9. Annotations emitted by the strategy are returned alongside the trades.

**Validation**
Unit tests on hand-checked fixtures covering each criterion. A determinism test that
runs the same input in two different processes and compares a canonical hash of the
trade list.

**Out of scope**
Metrics, persistence, queueing, the runner process, multi-asset portfolios.

**Proof relevance**
Directly required by `PROOF-REP-001` and by `PROOF-EXT-001`, which needs a
representative backtest to run unchanged.

---

## EXP-03 - Evaluator and the MVP metric set

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
From a trade list and the dataset, the evaluator computes the four MVP metrics -
total return, win rate, maximum drawdown, and number of trades - as a versioned
metric set.

**Why this slice exists**
The MVP names exactly these four. The official source also insists evaluation is
separate from strategy implementation, which is why this is its own component with
its own version rather than a method on the backtester.

**Dependencies**
`EXP-02`.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the evaluator calculates versioned metrics from simulation output and does not generate signals.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 7.
- Official project source sections 20 and 37.

**Architecture constraints**
- The evaluator reads simulation output. It never re-runs strategies and never
  generates a signal.
- The metric set has an identifier and a semantic version recorded on every result.
- Each metric has a documented formula, including its edge cases.
- Adding a metric later must not change the evaluator's callers.

**Expected change surface**
The evaluator and metric definitions in `experiment/domain`, a metric set version,
and tests.

**Acceptance criteria**
1. Total return, win rate, maximum drawdown, and number of trades are computed and
   match hand-checked values on a fixture.
2. Edge cases are explicit and tested: zero trades, all winning trades, all losing
   trades, and a single trade.
3. Maximum drawdown is computed from the equity curve, and the definition used -
   peak-to-trough on closed-trade equity, or on mark-to-market equity - is documented
   in one sentence next to the code.
4. The metric set carries an identifier and version, present in the output.
5. Adding a fifth metric in a test requires no change to any caller.
6. Metrics are pure functions of the trade list and dataset, with no clock or random
   input.

**Validation**
Unit tests per metric on fixtures, plus the edge-case tests and the added-metric
test.

**Out of scope**
Profit factor, Sharpe ratio, and other optional metrics the official source lists but
the MVP does not require. Ranking, which is `SEARCH-03`.

**Proof relevance**
Contributes to `PROOF-REP-001` item 7.

---

## EXP-04 - BacktestExecutor port and durable run record

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
A `BacktestExecutor` port, a durable `BacktestRun` record committed before any
execution is requested, a stable idempotency key, a claim-by-update mechanism so
exactly one runner picks up a run, and endpoints to start a backtest and read its
status.

**Why this slice exists**
It keeps backtest work out of the request path from V1, which is architectural
invariant 4 and one of the assignment's headline architecture questions. It is also
the seam that V6 swaps to BullMQ without touching the domain.

**Dependencies**
`EXP-01`.

**Authoritative references**
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 4: backtest workers never run inside API request or WebSocket execution.
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `BacktestJob` is an immutable command with job, experiment, and candidate identifiers, an attempt number, and an idempotency key.
- [ADR-004](../docs/adr/ADR-004-asynchronous-experiment-processing.md): persist run intent in PostgreSQL before dispatch; require an idempotency key per logical execution.
- [`VERSIONS.md` - Planned realization evolution](VERSIONS.md#planned-realization-evolution).

**Architecture constraints**
- The port is the seam. Its signature must be satisfiable by a BullMQ adapter
  without change, so it must not expose anything PostgreSQL-specific: no cursor, no
  transaction handle, no polling notion.
- The run record is committed before execution is requested, never after.
- The command handed to a runner is immutable and self-contained: the runner
  resolves everything from identifiers plus durable state, never from in-memory
  state in the API process.
- The idempotency key is derived from the frozen specification hash and the engine
  execution identity. Re-submitting the same logical work produces the same key.
- Claiming is atomic - one conditional update, so two runners cannot both take a
  run. A claim carries a lease timestamp so a dead runner's claim can be recovered.
- PostgreSQL is the source of truth for run state. This stays true in V6, where
  BullMQ carries delivery but not truth.

**Expected change surface**
Migrations for the run and attempt tables, the executor port in
`experiment/application`, the PostgreSQL adapter in `experiment/infrastructure`,
start and status endpoints in `ApiModule`, contract types, and API client methods.

**Acceptance criteria**
1. Starting a backtest commits a run row before the executor is called.
2. The same logical work produces the same idempotency key on every attempt.
3. Submitting an already-running or already-completed idempotency key returns the
   existing run instead of creating a second one.
4. Two runners started at once claim different runs; no run is claimed twice.
5. A claim whose lease has expired can be reclaimed, and the reclaim is recorded as a
   new attempt.
6. Attempt history is recorded per run.
7. The status endpoint reports queued, running, completed, or failed, with a failure
   reason when failed.
8. The port exposes nothing that only a database-backed implementation could provide.

**Validation**
Integration tests for commit-before-execute, key stability, duplicate submission,
concurrent claiming with two runners, and lease expiry. Review the port signature
against criterion 8 explicitly before finishing.

**Out of scope**
The runner process itself, which is `EXP-05`. BullMQ, which is `EXP-12`. Retry
policy tuning, backpressure, and cancellation, which are `SEARCH-01` and `SEARCH-02`
in V3.

**Proof relevance**
Contributes to `PROOF-SCALE-001` and `PROOF-CONTROL-001`.

---

## EXP-05 - Backtest runner process

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
A separate `backtest-runner` process claims queued runs, resolves the frozen
specification and dataset, runs the backtester and evaluator, and hands the outcome
to result acceptance.

**Why this slice exists**
This is the process role that makes invariant 4 true and gives V1 an architecture
story worth demonstrating: stopping the API mid-backtest does not stop the backtest.

**Dependencies**
`EXP-04`, `EXP-03`.

**Authoritative references**
- [Baseline - Deployment topology](../docs/architecture/architecture-baseline.md#deployment-topology): roles share a build and use role-specific entry commands.
- [Baseline - NestJS realization invariants](../docs/architecture/architecture-baseline.md#nestjs-realization-invariants) item 7: workers use the same versioned contracts but execute outside the interactive process.
- [ADR-004](../docs/adr/ADR-004-asynchronous-experiment-processing.md): workers check cooperative cancellation at explicit safe checkpoints.

**Architecture constraints**
- The runner is its own operating-system process, sharing the build and differing
  only by entry command.
- It resolves inputs from durable state using identifiers. It trusts nothing carried
  only in memory.
- Cancellation is cooperative and checked at named checkpoints. Hard termination
  bypasses them, and that is documented rather than pretended away. The checkpoint
  mechanism exists in V1 even though `SEARCH-02` only uses it in V3.
- Concurrency is configuration, not code.
- The runner never writes another module's tables.

**Expected change surface**
The runner entry command, a claim-and-execute loop, input resolution, invocation of
the backtester and evaluator, checkpoint handling, graceful shutdown, and runner
configuration.

**Acceptance criteria**
1. The runner starts as its own process with its own start command.
2. Given a queued run, it resolves the frozen specification and dataset and produces
   trades, annotations, and metrics.
3. Two runners running at once never produce two results for one run.
4. Stopping the API process mid-run does not stop or corrupt the run.
5. Killing the runner mid-run leaves the run reclaimable, and a restarted runner
   completes it with the attempt count incremented.
6. Concurrency is set by configuration and changing it needs no code change.
7. Graceful shutdown finishes or releases the current claim rather than abandoning
   it silently.
8. The request identifier from the submitting request appears in the runner's logs
   and in the attempt record.

**Validation**
Integration tests with one and two runners, an API-stop test, and a
kill-and-restart test. Confirm through the boundary test that the runner imports no
other module's internals.

**Out of scope**
The result acceptance transaction, which is `EXP-06`. Search loop control, scale
measurement, BullMQ.

**Proof relevance**
Directly required by `PROOF-SCALE-001` and `PROOF-CONTROL-001`.

---

## EXP-06 - Result acceptance with provenance

**Version:** V1 · **Priority:** CRIT · **Effort:** M

**Outcome**
One PostgreSQL transaction commits the logical result identity, its metrics, its
completion state, its complete provenance record, and its trades. Exactly one result
exists per idempotency key, and it is immutable once accepted.

**Why this slice exists**
This is the correctness boundary of the whole system. Provenance capture is part of
this slice rather than a later one because an accepted result is immutable - there is
no valid state in which a result exists and its provenance does not yet.

**Dependencies**
`EXP-05`.

**Authoritative references**
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): the acceptance transaction commits result identity, metrics, completion state, required provenance references, and either trade rows or an immutable trade-data reference plus a content hash.
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `BacktestResult` is one logical result per idempotency key.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules): all ten items.
- [ADR-005](../docs/adr/ADR-005-transactional-results-leaderboard.md).
- [ADR-006 - Decision](../docs/adr/ADR-006-immutable-experiment-provenance.md): runtime and build provenance includes the Node.js runtime version, the dependency lock identity and hash, and the application and worker build identities; a Python runtime is recorded conditionally.

**Architecture constraints**
- One transaction, or nothing. There is no state in which a result exists without its
  provenance.
- Provenance is captured at acceptance time from the running process, never derived
  later from current state.
- No provenance value may come from a mutable default or a "latest" alias.
- Conditional fields - news input set, sentiment model, Python runtime - are recorded
  only when actually used, and their absence is explicit rather than implied.
- An unrecoverable external input must be labelled as such. The architecture must not
  claim reproducibility it cannot deliver.
- Re-running an accepted idempotency key returns the existing result instead of
  creating a second one.
- Accepted results are append-only. They are never edited.
- **V6 adds one thing to this transaction: an outbox row.** Nothing else about it
  changes. Structure the committer so that addition is a parameter, not a rewrite.

**Expected change surface**
Migrations for result, trade, and provenance tables, the result committer in
`experiment/application`, build and runtime identity capture at process start, a
provenance resolution query, and integration tests.

**Acceptance criteria**
1. A successful acceptance writes result, metrics, completion state, provenance, and
   trades in one transaction.
2. A failure at any point inside the transaction leaves no partial state.
3. Re-submitting an already accepted idempotency key returns the existing result and
   creates no second result and no second trade set.
4. An attempt to update an accepted result is rejected.
5. A completed result resolves every applicable item from the baseline's ten-item
   list.
6. Node.js version, dependency lock hash, application build identity, and runner
   build identity are present and correct for the process that produced the result.
7. A result whose provenance is incomplete for its selected capabilities cannot be
   accepted.
8. A resolution query returns the whole checklist for one result in one call, in a
   form a person can read during a proof run.
9. Every recorded random seed and every declared source of nondeterminism appears.

**Validation**
Integration tests with a real database covering successful acceptance, failure
inside the transaction, duplicate submission, immutability, and incomplete
provenance. Run the resolution query manually and check its output against the
baseline's ten-item list.

**Out of scope**
The outbox row and its dispatch, which are `EXP-08` in V6. The leaderboard
projection, which is `SEARCH-04` in V3. Reading a result back, which is `EXP-10` -
this slice is the write side only.

**Proof relevance**
Directly required by `PROOF-REP-001`, and the result-side half of
`PROOF-RETRY-001` in V6.

---

## EXP-10 - Single backtest result query surface

**Version:** V1 · **Priority:** CRIT · **Effort:** S

**Outcome**
HTTP reads that return a completed backtest result: its summary and status, the four
metrics, the execution assumptions actually used, its frozen specification reference,
and its trades with server-side paging. A missing or unfinished result returns a
clear, distinguishable response rather than an error the page has to guess at.

**Why this slice exists**
`EXP-06` is the write side. Nothing in V1 read a result back. `UI-04` needs every
item listed above, and without this slice a coding agent reaching `UI-04` would have
to invent controllers, DTOs, and paging inside a page slice - which is exactly the
hidden-backend-scope failure the plan forbids.

This is the read side of the same data `EXP-06` writes. It is deliberately small:
one query port, one controller, and the contract types.

**Dependencies**
`EXP-06`.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): experiment queries return run and job progress, failures, results, provenance, trades, and leaderboard views.
- [Baseline - Logical modules, ARC-API](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): query composition assembles read responses from module-owned query ports and contains no business logic.
- Official project source sections 20 and 26: the metrics, and the trade table with paging.

**Architecture constraints**
- The controller composes from an Experiment query port. It never touches a
  repository and never computes a metric or a percentage.
- Every metric returned is the value `EXP-03` computed and `EXP-06` stored. Nothing
  is recalculated at read time.
- The execution assumptions returned are the ones recorded on the frozen
  specification, not current configuration. This is what makes the assumptions panel
  in `UI-04` honest rather than decorative.
- Trades page server-side. The sample interface shows 178 trades across 18 pages, so
  paging is expected, not optional.
- The result response carries the frozen specification identifier and its content
  hash, so a person can trace what produced it.
- Response types live in `packages/api-contracts`.
- **This slice owns the single-result read for every later version.** `SEARCH-05` in
  V3 extends this surface with leaderboard, progress, provenance-checklist, and
  annotation-recompute reads; it does not reimplement the result or trades read.

**Expected change surface**
A result query port in `experiment/application`, a controller and DTOs in
`ApiModule`, response types in `packages/api-contracts`, API client methods in
`apps/web`, and integration tests.

**Acceptance criteria**
1. The result read returns status, the four metrics, the execution assumptions used,
   the frozen specification identifier and hash, and completion timestamps.
2. The trades read is paginated server-side and returns entry time, entry price, exit
   time, exit price, direction, size, fees, slippage, and profit and loss per trade.
3. Paging metadata is returned - total count, page size, page number - so the page
   can render a pager without counting.
4. A result that does not exist returns a not-found response distinguishable from a
   result that exists but has not completed.
5. A failed run's read returns its failure reason.
6. A result with zero trades returns an empty page with a total of zero, not an
   error.
7. No metric, percentage, or aggregate is computed in the controller.
8. The response types are shared with the SPA through `api-contracts` and the SPA
   compiles against them.

**Validation**
Integration tests for the result read, the paged trades read across more than one
page, zero trades, not-found, not-yet-complete, and failed. Confirm the SPA type-checks
against the shared contract types.

**Out of scope**
The page itself, which is `UI-04`. Annotations, which `EXP-11` adds to this surface.
The full provenance checklist read and the leaderboard and progress reads, which are
`SEARCH-05` in V3. Run status polling, which `EXP-04` already owns.

**Proof relevance**
Routine. `SEARCH-05` extends it in V3 for `PROOF-REP-001`.

---

## EXP-11 - Visualization annotation capture

**Version:** V1 · **Priority:** REQ · **Effort:** S

**Outcome**
The annotations a strategy emitted during a backtest are stored with the result and
returned to the interface, so the chart can draw indicator overlays without
recomputing anything.

**Why this slice exists**
The MVP requires buy and sell signals and entry and exit points on the chart, and the
frozen architecture forbids the frontend from computing indicators. Something has to
carry the overlay data from the backtest to the chart, and nothing in the earlier
plan owned that.

**Dependencies**
`EXP-10`, `STRAT-01`.

**Authoritative references**
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants): the frontend holds no strategy, backtest, evaluation, or ranking logic.
- Official project source sections 25 and 26.
- The annotation primitives defined in `STRAT-01`.

**Architecture constraints**
- Annotations are the generic primitives from `STRAT-01`. Nothing strategy-specific
  is stored.
- Annotations are stored **only for single-backtest runs**. For search runs in V3,
  storing an annotation series per candidate would multiply storage by the candidate
  count for data almost nobody looks at.
- Because the backtester is deterministic, annotations for any stored result can be
  recomputed on demand by re-running its frozen specification. `SEARCH-05` exposes
  that path in V3. This is the reason determinism is worth what it costs.
- The stored annotation series is bounded; a documented cap with an explicit
  downsampling rule applies rather than storing an unbounded series.

**Expected change surface**
An annotation storage column or table, capture during acceptance for single runs, an
annotation field or sub-read added to the `EXP-10` result surface, contract types,
and tests.

**Acceptance criteria**
1. A single backtest result stores the annotations its strategy emitted.
2. The result read returns annotations in the generic primitive form.
3. A composite result returns each component's annotations, tagged by component.
4. Annotation volume is bounded by the documented cap, and the downsampling rule is
   applied consistently.
5. No strategy identifier drives the storage or the read.
6. Re-running a stored specification reproduces identical annotations.

**Validation**
Tests for capture, read, composite tagging, the cap, and reproducibility.

**Out of scope**
Drawing, which is `UI-05`. On-demand recomputation for search results, which is
`SEARCH-05` in V3.

**Proof relevance**
Contributes to `PROOF-EXT-001`: a new strategy must render without a frontend
change, which the generic primitives are what make possible.

---

# V6 slices

## EXP-12 - BullMQ backtest executor

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
`BullMQBacktestExecutor` replaces `PostgresQueueBacktestExecutor` behind the
unchanged `BacktestExecutor` port. Backtests run in BullMQ worker processes that
scale by replica count.

**Why this slice exists**
This is the version where the driver finally exists: an automated search loop
generates more work than one runner absorbs, and worker count needs to be a
deployment parameter rather than a code change. It also brings the realization to the
frozen target.

**Dependencies**
`WS-02`, `EXP-05`.

**Authoritative references**
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): immutable BullMQ commands through Redis, delivered at least once to separate worker processes.
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 11.
- [ADR-004](../docs/adr/ADR-004-asynchronous-experiment-processing.md).
- [`VERSIONS.md` - Planned realization evolution](VERSIONS.md#planned-realization-evolution).

**Architecture constraints**
- The port, the run record, the idempotency key, the backtester, the evaluator, and
  the result committer are unchanged. If any of them needs a change, the V1 seam was
  wrong and that is a plan mismatch to report.
- PostgreSQL remains the source of truth for run state. BullMQ carries delivery.
- Delivery is at-least-once; the existing idempotency key already handles duplicates.
- The BullMQ job identifier is derived from the idempotency key, with the caveat from
  `WS-02` that job-id uniqueness is not a correctness guarantee.
- Worker count is configuration.
- Backtest work runs on a dedicated queue, separate from news and sentiment work.

**Expected change surface**
The BullMQ adapter in `experiment/infrastructure`, the worker entry command, the job
contract in `messaging-contracts`, configuration binding to select the executor, and
tests.

**Acceptance criteria**
1. Switching the executor is a configuration change; both adapters satisfy the same
   port and the same tests.
2. The domain, backtester, evaluator, and result committer diffs are empty for this
   slice.
3. Duplicate job delivery still produces exactly one result.
4. Killing a worker mid-run leaves the run retryable and eventually completed once.
5. Worker count is configuration, and running three workers produces no duplicate
   result.
6. Every `EXP-05` acceptance criterion still passes against the new executor.

**Validation**
Run the `EXP-04` and `EXP-05` test suites against both adapters. Inspect the diff for
criterion 2. A manual run with three workers.

**Out of scope**
The outbox and consumer, which are `EXP-08` and `EXP-09`. Scale measurement, which is
`PROOF-SCALE-001`.

**Proof relevance**
Directly required by `PROOF-SCALE-001` and `PROOF-RETRY-001`.

---

## EXP-08 - Experiment outbox dispatcher

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
The result acceptance transaction gains an outbox row, and a dispatcher process
reads committed undelivered rows, enqueues each to BullMQ with a stable event-derived
job identifier, and marks the row delivered only after BullMQ acknowledges.

**Why this slice exists**
V6 moves the leaderboard projection into a different process, which creates a window
between committing a result and updating the projection. The outbox is what closes
that window. Before V6 the window did not exist.

**Dependencies**
`MSG-01`, `EXP-06`.

**Authoritative references**
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events): an outbox entry may be marked delivered only after the dispatcher receives successful BullMQ enqueue acknowledgement.
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): the durable path from state through outbox, dispatcher, BullMQ, idempotent consumer, back to durable state.
- [ADR-005](../docs/adr/ADR-005-transactional-results-leaderboard.md).
- [ADR-009 - Decision](../docs/adr/ADR-009-technology-realization.md).

**Architecture constraints**
- Uses the generic mechanism from `MSG-01`. This slice adds Experiment's binding and
  its events, not a second implementation.
- Experiment owns its outbox table, in its own schema.
- Mark delivered **after** acknowledgement, never before, and never because a Pub/Sub
  publish succeeded.
- The outbox row is added to the existing `EXP-06` transaction as a parameter. The
  rest of that transaction does not change.
- Dispatcher lag must be observable.
- The dispatcher is its own process role.

**Expected change surface**
An Experiment outbox table migration, the outbox row inside the acceptance
transaction, the dispatcher entry command binding `MSG-01`, event definitions in
`messaging-contracts`, a lag metric, and tests with failure injection.

**Acceptance criteria**
1. Result acceptance now commits result, provenance, trades, and outbox row together.
2. A committed outbox row is enqueued exactly once in the normal path and then marked
   delivered.
3. A crash after commit but before enqueue leaves the row undelivered and eligible; a
   restart delivers it.
4. A crash after enqueue but before marking delivered leads to a retry, and the
   downstream effect still happens once.
5. Dispatcher lag - the age of the oldest undelivered row - is queryable.
6. The dispatcher never marks a row delivered based on a Pub/Sub publish.
7. Dispatch order per aggregate is documented, and any ordering assumption is
   explicit.
8. Every `EXP-06` acceptance criterion still passes.

**Validation**
Integration tests injecting failure at each of the three points named above. Inspect
the outbox table state after each. Query lag with rows deliberately held back.

**Out of scope**
The consumer, which is `EXP-09`. News's outbox binding, which is `NEWS-02`.

**Proof relevance**
Directly claims the dispatcher half of `PROOF-RETRY-001`.

---

## EXP-09 - Experiment idempotent consumer

**Version:** V6 · **Priority:** REQ · **Effort:** M

**Outcome**
A consumer bound to `MSG-01` receives `StrategyEvaluated` events from BullMQ,
deduplicates by event identifier, checks aggregate version, and drives the
leaderboard projection - which becomes asynchronous without its logic changing.

**Why this slice exists**
Delivery is at-least-once once BullMQ is in the path, so duplicate and out-of-order
delivery become real. This slice makes them harmless.

**Dependencies**
`EXP-08`.

**Authoritative references**
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events): consumers use event-identifier deduplication and inbox state plus aggregate-version checks; duplicate delivery must be a no-op.
- [ADR-005](../docs/adr/ADR-005-transactional-results-leaderboard.md).
- [Proof plan - PROOF-DUP-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- Uses the generic mechanism from `MSG-01`. Experiment owns its inbox table.
- The inbox record and the consumer's effect commit in one transaction.
- Duplicate delivery is a no-op and is observable, not silent.
- A stale aggregate version is ignored and observed, not applied.
- **The `SEARCH-04` projector's logic does not change.** V3 called it synchronously;
  V6 calls the same projector from a consumer. If the projector needs modifying, the
  V3 seam was wrong.
- Pub/Sub notification happens only after the projection commits.

**Expected change surface**
An Experiment inbox table migration, the consumer binding `MSG-01`, the call into the
existing projector, and tests.

**Acceptance criteria**
1. Processing an event commits its effect and its inbox record together.
2. Delivering the same event twice produces one projection change, and the second is
   recorded as a duplicate.
3. Delivering a stale aggregate version leaves the projection unchanged and records
   that it was ignored.
4. A crash between receiving and committing leads to redelivery and one final effect.
5. A crash after committing but before acknowledging leads to redelivery recognized
   as a duplicate.
6. Duplicate and stale counts are queryable.
7. The `SEARCH-04` projector source is unchanged by this slice.
8. Every `SEARCH-04` acceptance criterion still passes with the projection now
   asynchronous.

**Validation**
Integration tests covering duplicate delivery, stale version, and both crash windows.
Inspect the diff for criterion 7. These tests are the direct rehearsal for
`PROOF-DUP-001`.

**Out of scope**
News's consumer binding. The projection logic itself, which is `SEARCH-04`.

**Proof relevance**
Directly claims the consumer half of `PROOF-RETRY-001` and enables
`PROOF-DUP-001`.
