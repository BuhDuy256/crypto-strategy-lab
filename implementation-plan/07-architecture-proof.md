# 07 - Architecture Proof

Which product version each `PROOF-*` first becomes meaningful in, what has to be
demonstrated, and what evidence to record.

Read [`README.md`](README.md) first. Version scope is in [`VERSIONS.md`](VERSIONS.md);
statuses are in [`TRACKING.md`](TRACKING.md).

## What this file is and is not

[`docs/validation/architecture-proof-plan.md`](../docs/validation/architecture-proof-plan.md)
is authoritative for every proof definition, its steps, and its pass evidence. This
file adds one thing the proof plan cannot know: **which version each proof belongs
to**, and therefore when running it is meaningful rather than premature.

Nothing here changes a proof definition. If a proof step seems impossible against the
built system, that is a finding to report, not a definition to soften.

## Proofs are spread across versions on purpose

The earlier plan pushed nearly every proof to the end. That is the wrong shape for
this project. A proof is meaningful as soon as its architectural driver exists, and
proving something early is worth more than proving it late - it catches a design
error while changing the design is still cheap, and it gives each version an
architecture story rather than only a feature story.

```text
V1  PROOF-PROVIDER-001
V2  PROOF-EXT-001
V3  PROOF-REPLACE-001, PROOF-CONTROL-001, PROOF-REP-001
V4  PROOF-RT-001
V5  PROOF-ISO-001, PROOF-ISO-002
V6  PROOF-SCALE-001, PROOF-RETRY-001, PROOF-DUP-001, PROOF-OBS-001,
    PROOF-CONTROL-001 re-run
```

Eight of the twelve are complete before the reliability version starts. That is the
progressive story worth telling.

The four that wait for V6 wait because their drivers genuinely do not exist earlier:
there is no queue to scale, no broker redelivery to duplicate, no async gap to lose
work in, and no cross-process chain to correlate.

## How proof work relates to routine slices

Most slices are routine implementation. They carry a "Proof relevance" line and that
is all the ceremony they need. Running a proof is separate, deliberate work with its
own evidence record.

```text
routine slice  -> implement, test, review, done
proof run      -> prerequisites all DONE
                  -> set up the recorded environment
                    -> execute the proof plan steps exactly
                      -> record the evidence fields
                        -> pass, or return to the traced decision
```

Do not attach proof ceremony to a routine slice, and do not let a routine slice claim
a proof it only contributes to.

## Evidence record

Every proof run records the fields the proof plan's "Evidence conventions" section
lists: baseline version and relevant ADRs, code and build and dependency-lock
versions, environment and hardware and configuration, dataset or fixture identity,
commands and timestamps, logs and metrics and diffs and artefact hashes, and the
result with deviations and the follow-up decision.

Two of those get easier as versions land: `EXP-06` resolves build, runtime, and lock
identity from V1, and `OPS-01` reports operational telemetry and Redis settings from
V6. Use them rather than gathering values by hand.

Record the version tag the proof ran against. A proof passing at `v3.0-demo` and a
proof passing at `v6.0-demo` are different claims, especially for
`PROOF-CONTROL-001`, which is run twice against two different realizations.

Store each proof run record where the repository convention places it at that time.
The development workflow document states that no separate evidence directory exists
before implementation establishes one, so the first proof run in V1 decides the
location - propose it, do not invent it silently.

## Failure handling

A failed proof never authorizes a local document patch or a quiet redesign. Return to
the traced problem, quality scenario, and decision, compare alternatives, and follow
the deviation procedure in `AGENTS.md`. A failed proof is a valid and useful result; a
quietly weakened proof is not.

Because proofs now run early, a failure is more likely to be cheap. A `PROOF-EXT-001`
failure in V2 means fixing the strategy contract while four strategies exist. The
same failure discovered at the end would mean fixing it under a deadline.

---

## V1 - PROOF-PROVIDER-001 - Provider replaceability

**Prerequisites:** `MKT-01`, `MKT-02`, `MKT-03`, `MKT-04`, `MKT-05`

**Why this version**
The driver is the assignment's own question - how do you add OKX without changing the
frontend? Everything needed to answer it exists as soon as normalized candles reach a
chart. Nothing about search, realtime, or reliability affects the answer, so waiting
would only delay finding out the contract suite was written around Binance.

**What must be demonstrated**
A second provider - the fake one from `MKT-01`, or an approved OKX adapter - passes
the common contract suite, and its normalized candles are accepted by the chart and
by a dataset with no frontend and no strategy change.

**Work this proof adds**
Run the `MKT-01` contract suite against the second adapter. Point the chart and a
dataset at its normalized candles. Inspect the diff.

**Evidence to record**
The contract suite result for both adapters, the diff showing no frontend change, and
a chart rendering the second provider's candles.

**Where a failure points**
Back to `MKT-01`. A contract suite only the Binance adapter can pass was written from
the Binance response rather than from the normalized contract.

---

## V2 - PROOF-EXT-001 - Strategy extensibility

**Prerequisites:** `STRAT-03`, `STRAT-05`, `UI-02`, `EXP-06`

**Why this version**
Adding a fifth strategy is only interesting once four exist, a real backtest runs
them, and the interface lists them from registry metadata. All three are true at the
end of V2 and none of them requires search or realtime.

**What must be demonstrated**
Adding `MACDStrategy` to a system that already has four strategies requires a
strategy implementation, a descriptor, a registration, and tests - and nothing else.

**Work this proof adds**
Implement `MACDStrategy` with its indicator, descriptor, registration, annotations,
and tests. Run the strategy contract tests and one representative backtest. Inspect
the diff.

This work is deliberately not planned as a routine slice, because the proof's value
comes from doing it against a finished system.

**Evidence to record**
The complete diff, plus explicit confirmation that no change appears in the
backtester, evaluator, provider adapters, persistence ownership, or anything under
`apps/web`; that the strategy appears through registry metadata rather than a
type-switch; that its annotations render through the existing primitive renderers;
and that a stored result carries the MACD identifier, version, and parameters.

**Where a failure points**
Back to `STRAT-01`'s contract and registry design and to ADR-002. If the frontend had
to change, either `STRAT-05` or `UI-02` embedded a strategy identifier, or `UI-05`
branched on strategy rather than on annotation primitive.

---

## V3 - PROOF-REPLACE-001 - Search replaceability

**Prerequisites:** `STRAT-06`, `STRAT-07`, `SEARCH-01`, `SEARCH-04`, `UI-03`

**Why this version**
There is no search algorithm to replace until V3 has one running end to end.

**What must be demonstrated**
A domain-guided or genetic generator implemented through `StrategyGenerator` runs
against the same downstream pipeline with no downstream change.

**Work this proof adds**
Run a fixed experiment under Random Search and record the result. Implement a second
generator through the port. Run it against the same pipeline. Compare downstream
diffs and contracts.

The official source describes domain-guided search as grouping strategies by category
- trend, momentum, volatility, structure, information - and requiring one from each
group. The `StrategyDescriptor` category field from `STRAT-01` already supports this,
which is why no contract change should be needed.

**Evidence to record**
Diffs showing the backtester, evaluator, ranking policy, leaderboard projector, and
the candidate and run schemas all unchanged; both runs' results; the generator
configuration and seed for each; and confirmation that the Discovery page needed no
change because it reads the generator catalog.

**Where a failure points**
Back to `STRAT-06` if the candidate contract leaked generator detail, `STRAT-07` if
the port took on lifecycle responsibility belonging to the coordinator, or `UI-03` if
the page hard-coded a generator list.

---

## V3 - PROOF-CONTROL-001 - Pause, resume, cancel, and stop

**Prerequisites:** `SEARCH-01`, `SEARCH-02`, `EXP-05`, `UI-03`

**Why this version**
The driver is a long-running loop a person needs to control, which V3 introduces.
Every step of the proof definition is exercisable against the PostgreSQL-executor
realization, because durable control state was never a broker feature.

**What must be demonstrated**
Every stop condition and every control transition works, durable state survives an
API or coordinator restart, new dispatch converges to the requested state, and
running-work behaviour is documented and observable.

**Work this proof adds**
Exercise maximum candidates, maximum duration, no improvement, pause, resume, and
cancel, each with a restart injected mid-transition.

**Evidence to record**
Run state before and after each transition and each restart, submission counts, what
happened to work already running, the recorded stop reason, and the version tag it
ran against.

**This proof is run twice.** V3 proves the control semantics. V6 re-runs it after
`SEARCH-07` to prove they survive the change to BullMQ. Record both, and label which
realization each ran against - a control proof against a PostgreSQL queue is not
automatically a control proof against a broker.

**Where a failure points**
Back to `SEARCH-02`. If a transition survived the restart but work state disagreed
afterwards, the stale-claim sweep is incomplete.

---

## V3 - PROOF-REP-001 - Leaderboard reproducibility

**Prerequisites:** `MKT-10`, `EXP-01`, `EXP-02`, `EXP-06`, `SEARCH-03`, `SEARCH-04`,
`SEARCH-05`

**Why this version**
A leaderboard entry to trace exists from V3. Waiting until V6 would risk discovering
a missing provenance field after hundreds of results had been accepted immutably -
and immutable means those results could never be repaired.

**What must be demonstrated**
The current top leaderboard entry resolves every applicable field in the baseline's
ten-item reproducibility list, and rerunning it on the identified dataset, build, and
configuration reproduces the trades or the artefact and metric hashes - with no value
obtained from a mutable default or a current registry alias.

**Work this proof adds**
Resolve the checklist through the `SEARCH-05` provenance read, rerun the entry, and
compare canonically. If nondeterminism was declared, apply the recorded tolerance and
explain it.

Include one check the earlier plan did not have: **create a dataset snapshot, then
force a candle revision in its range, then re-resolve the snapshot** and confirm it
still returns the original series. That is the append-only revision mechanism from
`MKT-03` and `MKT-10` doing its job, and it is the difference between a
reproducibility claim and a reproducibility promise.

**Evidence to record**
The full resolved checklist, the rerun command and environment, the canonical trade
comparison or the artefact and metric hash comparison, the snapshot-stability check,
and an explicit statement for each field that it came from stored provenance rather
than current state.

**Where a failure points**
Back to `EXP-06` if a field was not captured, `EXP-01` if the specification allowed
an alias, `MKT-10` or `MKT-03` if the dataset resolved differently, or `EXP-02` if
the simulation was not deterministic.

---

## V4 - PROOF-RT-001 - Realtime recovery and chart isolation

**Prerequisites:** `MKT-06`, `MKT-07`, `MKT-09`, `MKT-11`

**Why this version**
There is no live connection to disconnect before V4.

**What must be demonstrated**
Four subscriptions with distinct identifiers and timeframes; changing one resets only
that one; a controlled provider disconnect is followed by reconnect, correct
missing-interval calculation, REST recovery, deduplication, and resume; and an API or
client restart returns a durable snapshot before live continuation.

**Work this proof adds**
Execute the five steps in the proof plan against the assembled system, and capture the
end-to-end latency distribution for later comparison against an agreed budget.

Binance disconnects any stream connection at the 24-hour mark, so a long run also
exercises this path without a deliberate interruption. That is a useful second
observation, not a substitute for the controlled test.

**Evidence to record**
Subscription state before and after the timeframe change, the gap query result over
the outage range showing no unresolved gap and no duplicate, confirmation that
unrelated subscriptions did not reset and that no full page reload occurred,
confirmation that no in-progress tick was persisted, and the latency distribution with
the hardware it was measured on.

**Where a failure points**
Back to `MKT-09` for gap or duplicate problems, `MKT-07` for subscription isolation
problems, or `MKT-06` if a tick reached durable storage.

---

## V5 - PROOF-ISO-001 - News failure isolation

**Prerequisites:** `NEWS-02`, `MKT-11`, `EXP-05`, `UI-07`

**Why this version**
Both sides of the isolation claim have to exist: a news pipeline to break and a market
and backtest path to keep working. V5 is the first version with both.

The proof does not need BullMQ. It tests process and component isolation, and the
news worker is a separate process from V5.

**What must be demonstrated**
With the news worker or provider disabled, market chart subscriptions and a
technical-only backtest both keep working while News reports a degraded or failed
state.

**Work this proof adds**
Disable the news worker and the provider in turn while continuously exercising four
chart subscriptions and running a technical-only experiment.

**Evidence to record**
News health state during the outage, chart subscription continuity, the successful
technical backtest result, the successful discovery run, and confirmation that no
shared path failed.

**Where a failure points**
Back to `NEWS-02` if the news worker shared a process with other work, or `UI-07` and
`NEWS-07` if a news read sat on a shared loading path.

---

## V5 - PROOF-ISO-002 - Sentiment failure isolation

**Prerequisites:** `NEWS-03`, `NEWS-04`, `NEWS-05`, `UI-07`

**Why this version**
There is no model to make unavailable before V5.

**What must be demonstrated**
With model inference unavailable, analysis attempts and retries are recorded,
sentiment-dependent candidates block or degrade according to the explicit policy, and
non-sentiment strategies and backtests keep working.

**Work this proof adds**
Make inference unavailable, then run both a sentiment-dependent candidate and a
technical-only experiment. If `NEWS-06` was skipped as optional, use a
sentiment-requiring context assembly directly rather than a full strategy - the claim
is about the policy, not about the strategy.

**Evidence to record**
Recorded attempts and their failure reasons, the policy applied to the dependent
candidate and where that is visible in the result, the collector still storing items
during the model outage, and the successful technical run.

**Where a failure points**
Back to `NEWS-03` if a failure lost the normalized item, or `NEWS-05` if the missing
and stale policy was implicit rather than configured and recorded.

---

## V6 - PROOF-SCALE-001 - Worker scale and backpressure

**Prerequisites:** `EXP-12`, `SEARCH-01`, `OPS-01`

**Why this version**
There is no worker replica count to change and no queue depth to measure until
BullMQ replaces the single runner.

**What must be demonstrated**
Increasing worker count changes deployment configuration only, produces no duplicate
logical result, keeps memory bounded under backpressure, and identifies the observed
bottleneck.

**Work this proof adds**
Establish a reproducible processing-bound job fixture and a calibrated candidate
count. Run with worker counts of one, two, and as many as the test hardware supports.
Capture the telemetry the proof plan lists, most of which `OPS-01` exposes. Increase
candidate count toward the source's very-large challenge until a bottleneck appears or
the agreed limit is reached.

**Evidence to record**
Everything the proof plan lists, plus the exact hardware. No linear-scaling claim is
permitted without measurements, and the numbers are only valid for the recorded
hardware.

A useful extra comparison, since both realizations exist: the single-runner throughput
from V5 against the one-worker BullMQ throughput at V6. If BullMQ is slower at one
worker, that is worth stating honestly alongside its scaling behaviour.

**Where a failure points**
Back to `EXP-12` if duplicates appear, or `SEARCH-01` if memory grows without bound,
which would mean backpressure was not enforced.

---

## V6 - PROOF-RETRY-001 - Partial failure retry

**Prerequisites:** `EXP-08`, `EXP-09`, `EXP-12`, `SEARCH-04`

**Why this version**
Six of the nine injection points in the proof definition are about the outbox,
dispatcher, and consumer boundaries, none of which exist before V6. Running the proof
earlier would test three points and claim twelve.

**What must be demonstrated**
Failure injected at nine named points around the result, outbox, dispatcher, and
consumer boundaries still yields exactly one logical result per idempotency key, a
completely represented trade result, consistent metrics and state and provenance and
outbox, eventual delivery, one logical state transition, and visible attempt history.

**Work this proof adds**
Inject failure at each of the nine points the proof plan lists. Most already have an
integration test from `EXP-06`, `EXP-08`, and `EXP-09`; the proof run repeats them
against the assembled system and records the evidence.

**Evidence to record**
Per injection point: the observed state of result, trades, outbox, inbox, and
projection; the attempt history for worker, dispatcher, and consumer; and the
verified trade content hash. Note explicitly that a Redis Pub/Sub publish does not
satisfy this proof.

**Where a failure points**
Back to `EXP-06` if the acceptance transaction was not truly atomic, `EXP-08` if a row
was marked delivered before acknowledgement, or `EXP-09` if the inbox record did not
commit with its effect.

---

## V6 - PROOF-DUP-001 - Duplicate and stale event

**Prerequisites:** `EXP-08`, `EXP-09`, `SEARCH-04`

**Why this version**
Duplicate delivery requires a broker that can redeliver. Before V6 the projection is
called once, in-process, inside a transaction.

The projector's idempotence was still built and tested in V3 by `SEARCH-04`, which is
why this proof should pass on the first attempt. If it does not, the V3 seam was
wrong and that is the more valuable finding.

**What must be demonstrated**
The same `StrategyEvaluated` envelope delivered twice, followed by a stale aggregate
version, leaves the leaderboard projection hash and rank unchanged, with deduplication
evidence recorded.

**Work this proof adds**
Deliver the duplicate and then the stale event against the assembled system, and
compare projection hashes before and after.

**Evidence to record**
Projection hash and rank before and after each delivery, the inbox and deduplication
records, and the duplicate and stale counters.

**Where a failure points**
Back to `SEARCH-04` if the projection was not idempotent, or `EXP-09` if the
aggregate-version check was missing.

---

## V6 - PROOF-OBS-001 - Operational observability

**Prerequisites:** `SETUP-09`, `OPS-01`, plus the slices of whichever proof it
accompanies

**Why this version**
The correlation chain the proof requires - experiment, candidate, job, attempt,
result, outbox event, consumer, leaderboard entry - has four links that only exist in
V6.

**What must be demonstrated**
Correlation across that whole chain, plus query, metric, and log access to run state,
queue depth and job states, dispatcher lag, projection lag, latency, retries and
stalls and failures, Redis persistence and eviction health, provider health and gaps,
worker counts, and the current leader.

**Work this proof adds**
None on its own. Run it during the scale and failure proofs, following one correlation
identifier the whole way through and reading the `OPS-01` surface at each stage.

**Evidence to record**
The correlation chain for one experiment with the identifier visible at every hop, and
one `OPS-01` reading per stage of the proof it accompanies.

**Where a failure points**
Back to `SETUP-09` if the identifier did not cross a process boundary, or `OPS-01` if
a required observation is not exposed.
