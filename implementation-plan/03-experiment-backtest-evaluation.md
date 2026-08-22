# 03 - Experiment, Backtest, and Evaluation

Immutable experiment specifications, deterministic trade simulation, the four MVP
metrics, the durable job path into separate worker processes, and the single
transaction that accepts a result together with its outbox event.

Read [`README.md`](README.md) first. Statuses live in [`TRACKING.md`](TRACKING.md).

## Why this area carries the most correctness rules

Everything the baseline says about at-least-once delivery, idempotency, the
transactional outbox, and reproducibility lands in these nine slices. Four
architecture proofs depend on them: `PROOF-RETRY-001`, `PROOF-DUP-001`,
`PROOF-SCALE-001`, and `PROOF-REP-001`.

Two rules are easy to break by accident and expensive to fix later:

1. **The outbox row is marked delivered only after BullMQ acknowledges the enqueue.**
   Not after a publish, not after a Pub/Sub notification, not optimistically.
2. **The consumer is idempotent regardless of the job identifier.** A stable
   event-derived job id is a first defence, but options that remove completed jobs
   release the id for reuse, so consumer-side deduplication is the real guarantee.

## Blocked on a decision

`EXP-02` cannot start until the execution model defaults are supplied: starting
capital, fee, slippage, fill rule, rounding, position sizing, and stop rules. The
baseline requires each of them to be resolvable from a completed result, which
means they must be specification fields with supplied values, not constants inside
the engine. See "Open decisions" in
[`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md).

---

## EXP-01 - Immutable experiment specification

**Outcome**
An experiment can be created as a draft, validated, and frozen at start with a
canonical content hash. After freezing, no field can change, and every later
artefact references the frozen specification.

**Why this slice exists**
Reproducibility is an explicit assignment question ("how do you check which
strategy version produced a leaderboard row?"). ADR-006 makes it a data invariant
rather than a reporting promise, and the invariant has to exist before the first
result is written.

**Dependencies**
`MKT-10`, `STRAT-06`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `ExperimentSpec` is immutable after start and includes every applicable reproducibility input.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules): the full ten-item list.
- [ADR-006](../docs/adr/ADR-006-immutable-experiment-provenance.md): draft, validate, freeze with a canonical content hash; never resolve a historical run from current defaults or latest aliases.

**Architecture constraints**
- Draft is editable. Frozen is not, at the database level and not only in code.
- The specification records the dataset reference, the search space and generator
  configuration and seed, the execution model configuration, the metric set version,
  the ranking policy version, and the stop conditions.
- Freezing computes a canonical content hash using the `STRAT-06` serializer.
- Starting an incomplete specification for the capabilities it selected must be
  rejected. A sentiment-using experiment without sentiment provenance fields is
  incomplete.
- Experiment owns this data. No other module writes it.

**Expected change surface**
A migration for experiment and specification tables, the specification type in
`experiment/domain`, an application service for create, validate, and freeze, and
tests.

**Acceptance criteria**
1. A draft can be edited; a frozen specification cannot, and the attempt is
   rejected with a clear error.
2. Freezing produces a content hash, and freezing an identical specification
   produces the same hash.
3. Validation rejects a specification that is missing a field required by the
   capabilities it selected, naming the missing field.
4. The specification stores a dataset reference, never an inline range that could
   resolve differently later.
5. Every version-bearing reference in the specification is explicit. No field may
   hold "latest" or an equivalent alias.
6. A frozen specification can be read back and fully resolved after a process
   restart.

**Validation**
Tests for freeze immutability, hash stability, incomplete-specification rejection,
and alias rejection. A database-level test that an update to a frozen row fails.

**Out of scope**
Running anything. Search control, jobs, and results come later.

**Proof relevance**
Directly required by `PROOF-REP-001`.

---

## EXP-02 - Deterministic backtester

**Outcome**
Given a frozen candidate, a dataset reference, and an execution model
configuration, the backtester simulates trades and returns an ordered trade list.
The same inputs always produce the same trades.

**Why this slice exists**
This is the assignment's Module 7 and the core of the experiment loop. Determinism
is what makes `PROOF-REP-001` possible at all.

**Dependencies**
`EXP-01`, `STRAT-04`. **Blocked** until the execution model defaults are supplied.

**Authoritative references**
- [Baseline - Logical modules, ARC-EXPERIMENT](../docs/architecture/architecture-baseline.md#logical-modules--bounded-contexts): the backtester performs deterministic trade simulation.
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 5: capital, side and position, fee, slippage, fill, rounding, stops and sizing rules.
- Official project source sections 19 and 20, and section 33 steps 3 and 4.
- Sample interface image "Gia dinh Backtest": long and short supported, stop loss and take profit resolved against candle prices, reproducible results.

**Architecture constraints**
- The backtester is pure with respect to infrastructure. Candles arrive as data
  through the dataset port; it opens no connection and reads no table itself.
- Every execution assumption is a configuration field, never a constant.
- No look-ahead: a decision at bar `n` may use only information available at the
  close of bar `n`, and fills happen no earlier than the following bar unless the
  configured fill rule says otherwise, in which case that rule is explicit.
- Any random element must be seeded and the seed recorded. Prefer no randomness at
  all.
- The trade record carries entry time, entry price, exit time, exit price,
  direction, size, fees, slippage, and realized profit and loss.

**Expected change surface**
The backtester in `experiment/domain`, the execution model configuration type, the
trade type, and tests with fixed candle and signal fixtures.

**Acceptance criteria**
1. A fixed candle series plus a fixed signal series produces a trade list that is
   identical across repeated runs and across two separate processes.
2. Fees and slippage are applied as configured and are visible in each trade
   record.
3. Stop loss and take profit are evaluated against candle high and low, with the
   tie-breaking order documented when both are reachable in one candle.
4. Both long and short directions are simulated.
5. A hold signal opens nothing and closes nothing.
6. An open position at the end of the dataset is closed by an explicit documented
   rule rather than silently discarded.
7. No look-ahead: a test that shifts the input series forward changes the output,
   and a test proves no decision uses a future bar.
8. Position sizing follows the configured rule, and the resulting quantity is
   recorded per trade.

**Validation**
Unit tests on hand-checked fixtures covering each criterion. A determinism test
that runs the same input twice in different processes and compares a canonical hash
of the trade list.

**Out of scope**
Metrics, persistence, queueing, workers, portfolio-level multi-asset simulation.

**Proof relevance**
Directly required by `PROOF-REP-001` and `PROOF-EXT-001` (which needs a
representative backtest to run unchanged).

---

## EXP-03 - Evaluator and the MVP metric set

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
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules) item 7: metric and ranking policy versions and configuration.
- Official project source sections 20 and 37.

**Architecture constraints**
- The evaluator reads simulation output. It never re-runs strategies and never
  generates a signal.
- The metric set has an identifier and a semantic version recorded on every result.
- Each metric has a documented formula, including its edge cases.
- Adding a metric later must not change the evaluator's callers.

**Expected change surface**
The evaluator and metric definitions in `experiment/domain`, a metric set version
constant, and tests.

**Acceptance criteria**
1. Total return, win rate, maximum drawdown, and number of trades are computed and
   match hand-checked values on a fixture.
2. Edge cases are explicit and tested: zero trades, all winning trades, all losing
   trades, and a single trade.
3. Maximum drawdown is computed from the equity curve, and the definition used
   (peak-to-trough on closed-trade equity, or on mark-to-market equity) is
   documented in one sentence next to the code.
4. The metric set carries an identifier and version, present in the output.
5. Adding a fifth metric in a test requires no change to any caller.
6. Metrics are pure functions of the trade list and dataset, with no clock or
   random input.

**Validation**
Unit tests per metric on fixtures, plus the edge-case tests and the added-metric
test.

**Out of scope**
Profit factor, Sharpe ratio, and other optional metrics (the official source lists
them but the MVP does not require them); ranking; persistence.

**Proof relevance**
Contributes to `PROOF-REP-001` item 7.

---

## EXP-04 - Candidate and job persistence with durable dispatch

**Outcome**
A candidate and its backtest job intent are persisted in PostgreSQL before the job
is dispatched to BullMQ, and each job carries a stable idempotency key derived from
the experiment, candidate, and engine execution.

**Why this slice exists**
ADR-004 requires job intent to be durable before dispatch so that broker delivery
can be reconciled after a crash. The idempotency key defined here is what makes
`EXP-06` and `PROOF-RETRY-001` work.

**Dependencies**
`EXP-01`, `STRAT-07`, `WS-02`.

**Authoritative references**
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `BacktestJob` is an immutable command with job, experiment, and candidate identifiers, an attempt number, and an idempotency key.
- [ADR-004 - Decision](../docs/adr/ADR-004-asynchronous-experiment-processing.md): persist experiment, candidate, and job intent in PostgreSQL; dispatch immutable commands through BullMQ; treat delivery as at-least-once and require an idempotency key per logical experiment, candidate, and engine execution.
- [Baseline - Data ownership](../docs/architecture/architecture-baseline.md#data-ownership).

**Architecture constraints**
- Job intent is committed to PostgreSQL before the enqueue, never after.
- The job command is immutable and self-contained: a worker resolves everything it
  needs from the identifiers in the job plus durable state, never from in-memory
  coordinator state.
- The idempotency key is derived from the frozen experiment, the candidate hash,
  and the engine execution identity. Re-dispatching the same logical work produces
  the same key.
- BullMQ is not the source of truth for job state. PostgreSQL is.
- A job identifier for BullMQ may be derived from the idempotency key, but the
  durable key is what guarantees correctness.

**Expected change surface**
Migrations for candidate, job, and attempt tables, a job repository, a dispatcher in
`experiment/application`, the job command contract, and tests.

**Acceptance criteria**
1. A candidate row is written with its content hash before any job exists.
2. A job row is committed before the enqueue call is made.
3. The same logical work produces the same idempotency key on every attempt.
4. If the enqueue fails after the job row is committed, the job remains in a
   dispatchable state and is retried, not lost.
5. Re-dispatching an already dispatched job does not create a second job row.
6. Attempt history is recorded per job.
7. Candidates are append-only; a stored candidate cannot be edited.

**Validation**
Integration tests for commit-before-enqueue, enqueue failure, duplicate dispatch,
and key stability. A crash injected between commit and enqueue must leave a
recoverable job.

**Out of scope**
Running the backtest, stop conditions, pause and resume, result acceptance.

**Proof relevance**
Contributes to `PROOF-RETRY-001`, `PROOF-SCALE-001`, and `PROOF-OBS-001`.

---

## EXP-05 - Backtest worker

**Outcome**
The backtest worker process consumes a `BacktestJob`, resolves the frozen
specification, candidate, and dataset, runs the backtester and evaluator, and hands
the outcome to result acceptance. It checks for cancellation at defined safe
checkpoints.

**Why this slice exists**
This is the process role that keeps central processing work out of the interactive
path, and it is the unit that `PROOF-SCALE-001` replicates.

**Dependencies**
`EXP-04`, `EXP-03`.

**Authoritative references**
- [Baseline - Architectural invariants](../docs/architecture/architecture-baseline.md#architectural-invariants) item 4: backtest workers never run inside API request or WebSocket execution.
- [ADR-004 - Decision](../docs/adr/ADR-004-asynchronous-experiment-processing.md): workers check cooperative cancellation at explicit safe checkpoints.
- [Baseline - NestJS realization invariants](../docs/architecture/architecture-baseline.md#nestjs-realization-invariants) item 7: workers use the same versioned contracts but execute outside the interactive process.

**Architecture constraints**
- The worker runs as its own process. It shares the build but not the entry
  command.
- The worker resolves inputs from durable state using identifiers in the job. It
  trusts nothing carried only in memory.
- Cancellation is cooperative and checked at named checkpoints. Hard termination
  bypasses them, and that behaviour is documented rather than pretended away.
- Worker concurrency is configuration, not code.
- The worker never writes another module's tables and never updates the
  leaderboard.

**Expected change surface**
The worker entry command, a job consumer, input resolution, invocation of the
backtester and evaluator, checkpoint handling, and worker configuration.

**Acceptance criteria**
1. The worker starts as its own process and processes jobs from its dedicated
   queue.
2. Given a job, it resolves the frozen specification, candidate, and dataset and
   produces trades and metrics.
3. Two workers running at once do not process the same job twice into two results.
4. Cancellation requested mid-run stops at the next checkpoint and records why.
5. Worker concurrency is set by configuration and changing it needs no code change.
6. A worker failure before completion leaves the job retryable with its attempt
   count incremented.
7. The correlation identifier from dispatch appears in the worker's logs and in the
   attempt record.

**Validation**
Integration tests with one and two workers, a cancellation test, and a
crash-and-retry test. Confirm through the boundary test that the worker imports no
other module's internals.

**Out of scope**
The result acceptance transaction (`EXP-06`), the outbox dispatcher, scale
measurement.

**Proof relevance**
Directly required by `PROOF-SCALE-001` and `PROOF-CONTROL-001`.

---

## EXP-06 - Result acceptance transaction

**Outcome**
One PostgreSQL transaction commits the logical result identity, its metrics, its
completion state, its provenance references, the outbox event, and either the trade
rows or an immutable trade-data reference with a content hash. Exactly one result
exists per idempotency key.

**Why this slice exists**
This transaction is the single most important correctness boundary in the system.
ADR-005 exists for it, and `PROOF-RETRY-001` tests failures on every side of it.

**Dependencies**
`EXP-05`.

**Authoritative references**
- [Baseline - Persistence rules](../docs/architecture/architecture-baseline.md#persistence-rules): the full acceptance-transaction sentence.
- [Baseline - Contracts](../docs/architecture/architecture-baseline.md#contracts): `BacktestResult` is one logical result per idempotency key.
- [ADR-005 - Decision](../docs/adr/ADR-005-transactional-results-leaderboard.md).
- [Proof plan - PROOF-RETRY-001](../docs/validation/architecture-proof-plan.md): the list of failure injection points.

**Architecture constraints**
- One transaction, or nothing. There is no state in which the result exists but its
  outbox row does not.
- The complete accepted trade result must be durably represented, either as trade
  rows or as an immutable trade-data reference plus a cryptographic content hash.
  No external object store is required.
- Re-running an accepted idempotency key returns the existing result instead of
  creating a second one.
- Accepted results are append-only. They are never edited.
- Publishing to Redis Pub/Sub is not part of this transaction and never substitutes
  for the outbox row.

**Expected change surface**
Migrations for result, trade, and outbox tables, the result committer in
`experiment/application`, the trade-artefact hashing path, and integration tests
with failure injection.

**Acceptance criteria**
1. A successful acceptance writes result, metrics, completion state, provenance
   references, trades or a hashed trade reference, and one outbox row in one
   transaction.
2. A failure at any point inside the transaction leaves no partial state.
3. Re-delivering an already accepted job returns the existing result and creates no
   second result, no second trade set, and no second outbox row.
4. A stored trade result can be verified against its recorded content hash.
5. An attempt to update an accepted result is rejected.
6. Failure injected after the commit but before the worker acknowledges completion
   still yields exactly one logical result on redelivery.
7. The outbox row carries a full event envelope: event id, type, schema version,
   aggregate id and version, timestamps, correlation id, causation id, payload.

**Validation**
Integration tests with a real database injecting failure before the transaction,
inside it, and after commit but before acknowledgement. Verify the trade content
hash. Confirm one result per key in every case.

**Out of scope**
Dispatching the outbox (`EXP-08`), consuming the event (`EXP-09`), the leaderboard
projection.

**Proof relevance**
Directly claims the result-side half of `PROOF-RETRY-001`.

---

## EXP-07 - Provenance capture

**Outcome**
Every accepted result records every applicable value from the baseline's ten
reproducibility items, including the Node.js runtime version, the dependency lock
identity, and the application and worker build identity.

**Why this slice exists**
`PROOF-REP-001` resolves the whole list from the current top leaderboard entry and
reruns it. Values not captured at acceptance time cannot be recovered afterwards.

**Dependencies**
`EXP-06`.

**Authoritative references**
- [Baseline - Reproducibility rules](../docs/architecture/architecture-baseline.md#reproducibility-rules): all ten items.
- [ADR-006 - Decision](../docs/adr/ADR-006-immutable-experiment-provenance.md): runtime and build provenance includes the Node.js runtime version, the dependency lock identity and hash, the application build and commit, and the worker build and commit; a Python runtime is recorded conditionally and is not a mandatory field.

**Architecture constraints**
- Provenance is captured at acceptance time from the running process, not derived
  later from current state.
- No provenance value may come from a mutable default or a "latest" alias.
- Conditional fields (news input set, sentiment model, Python runtime) are recorded
  only when actually used, and their absence is explicit rather than implied.
- An unrecoverable external input must be labelled as such. The architecture must
  not claim reproducibility it cannot deliver.

**Expected change surface**
A provenance record type, build and runtime identity capture at process start, the
provenance table or columns, and a resolution query returning the full checklist
for a result.

**Acceptance criteria**
1. A completed result resolves every applicable item from the baseline list.
2. Node.js version, dependency lock hash, application build identity, and worker
   build identity are present and correct for the process that produced the result.
3. Conditional fields are present when used and explicitly absent when not.
4. A resolution query returns the whole checklist for one result in one call, in a
   form a person can read during a proof run.
5. Every recorded random seed and every declared source of nondeterminism appears.
6. A result whose provenance is incomplete for its selected capabilities cannot be
   accepted.

**Validation**
A test asserting the full checklist is resolvable for a completed result. A test
that acceptance fails when a required provenance field is missing. Run the
resolution query manually and read the output.

**Out of scope**
The rerun and comparison itself, which is `PROOF-REP-001`.

**Proof relevance**
Directly required by `PROOF-REP-001`.

---

## EXP-08 - Outbox dispatcher

**Outcome**
A dispatcher process reads committed, undelivered outbox rows, enqueues each to
BullMQ with a stable event-derived job identifier, and marks the row delivered only
after BullMQ acknowledges the enqueue.

**Why this slice exists**
This is the second half of the transactional outbox and the place where "publish
succeeded" is most easily confused with "durably delivered". It is a named process
role in the baseline for exactly that reason.

**Dependencies**
`EXP-06`.

**Authoritative references**
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events): an outbox entry may be marked delivered only after the dispatcher receives successful BullMQ enqueue acknowledgement.
- [Baseline - Runtime communication](../docs/architecture/architecture-baseline.md#runtime-communication): the durable path from state through outbox, dispatcher, BullMQ, idempotent consumer, back to durable state.
- [ADR-005 - Decision](../docs/adr/ADR-005-transactional-results-leaderboard.md).
- [ADR-009 - Decision](../docs/adr/ADR-009-technology-realization.md): the stable event-derived job identifier, and why consumers still need inbox and version checks.

**Architecture constraints**
- Mark delivered **after** acknowledgement, never before, and never because a
  Pub/Sub publish succeeded.
- The job identifier is derived from the event identifier so a retry after an
  ambiguous failure does not multiply work. It is still not a correctness
  guarantee, because removing completed jobs frees the identifier.
- Dispatcher lag must be observable.
- The dispatcher is its own process role.
- Outbox rows need a retention or archival plan; ADR-005 names unbounded growth as
  a risk.

**Expected change surface**
The dispatcher entry command, a polling or notification-driven reader, enqueue with
acknowledgement handling, the delivered-marking update, a lag metric, and tests
with failure injection.

**Acceptance criteria**
1. A committed outbox row is enqueued exactly once in the normal path and then
   marked delivered.
2. A crash after commit but before enqueue leaves the row undelivered and eligible;
   a restart delivers it.
3. A crash after enqueue but before marking delivered leads to a retry, and the
   stable job identifier plus consumer deduplication means the downstream effect
   still happens once.
4. Dispatcher lag - the age of the oldest undelivered row - is queryable.
5. The dispatcher never marks a row delivered based on a Pub/Sub publish.
6. Dispatch order per aggregate is documented, and any ordering assumption is
   explicit.
7. A retention or archival approach for delivered rows exists and is documented.

**Validation**
Integration tests injecting failure at each of the three points named above.
Inspect the outbox table state after each. Query dispatcher lag with rows
deliberately held back.

**Out of scope**
The consumer, the leaderboard projection, Pub/Sub notification.

**Proof relevance**
Directly claims the dispatcher half of `PROOF-RETRY-001`.

---

## EXP-09 - Idempotent consumer and inbox

**Outcome**
A reusable consumer pattern that records event identifiers in an inbox, checks
aggregate versions, treats duplicate or stale delivery as a no-op, and commits its
effect and its inbox record in one transaction.

**Why this slice exists**
Every downstream consumer in the system (leaderboard projection, sentiment
handling, notification) needs the same guarantees. Building it once, with tests,
prevents each consumer from inventing a slightly different and slightly wrong
version.

**Dependencies**
`EXP-08`.

**Authoritative references**
- [Baseline - Events](../docs/architecture/architecture-baseline.md#events): consumers use event-identifier deduplication and inbox state plus aggregate-version checks; duplicate delivery must be a no-op; ordering assumptions must be explicit per aggregate or key.
- [ADR-005 - Decision](../docs/adr/ADR-005-transactional-results-leaderboard.md).
- [Proof plan - PROOF-DUP-001](../docs/validation/architecture-proof-plan.md).

**Architecture constraints**
- The inbox record and the consumer's effect commit in one transaction. Recording
  receipt separately reintroduces the gap the outbox closed.
- Duplicate delivery is a no-op and is observable, not silent.
- A stale aggregate version is ignored and observed, not applied.
- The inbox is owned by the consuming module.
- Inbox rows need a retention plan for the same reason outbox rows do.

**Expected change surface**
An inbox table migration, a consumer base pattern in `platform` or
`experiment/application`, deduplication and version checking, and tests.

**Acceptance criteria**
1. Processing an event commits its effect and its inbox record together.
2. Delivering the same event envelope twice produces one effect, and the second
   delivery is recorded as a duplicate.
3. Delivering a stale aggregate version leaves state unchanged and records that it
   was ignored.
4. A crash between receiving the event and committing leads to redelivery and one
   final effect.
5. A crash after committing but before acknowledging the job leads to redelivery
   that is recognized as a duplicate.
6. Duplicate and stale counts are queryable.
7. Ordering assumptions are documented per event type.

**Validation**
Integration tests covering duplicate delivery, stale version, and both crash
windows. These tests are the direct rehearsal for `PROOF-DUP-001`.

**Out of scope**
The leaderboard projection itself, which uses this pattern in `SEARCH-04`.

**Proof relevance**
Directly claims the consumer half of `PROOF-RETRY-001` and enables
`PROOF-DUP-001`.
