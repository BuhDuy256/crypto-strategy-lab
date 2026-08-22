# 07 - Architecture Proof

Which implementation slices each `PROOF-*` obligation needs before it can be run,
what behaviour has to be demonstrated, and what evidence to record.

Read [`README.md`](README.md) first. Statuses live in [`TRACKING.md`](TRACKING.md).

## What this file is and is not

[`docs/validation/architecture-proof-plan.md`](../docs/validation/architecture-proof-plan.md)
is authoritative for every proof definition, its steps, and its pass evidence. This
file adds one thing the proof plan cannot know: **which implementation slices must
exist first**, and therefore when running a given proof is meaningful rather than
premature.

Nothing here changes a proof definition. If a proof step seems impossible against
the built system, that is a finding to report, not a definition to soften.

## How proof work relates to routine slices

Most slices are routine implementation. They carry a "Proof relevance" line saying
whether they contribute to a later proof, and that is all the ceremony they need.
Running a proof is separate, deliberate work with its own evidence record.

```text
routine slice  -> implement, test, review, done
proof run      -> prerequisites all DONE
                  -> set up the recorded environment
                    -> execute the proof plan steps exactly
                      -> record the evidence fields
                        -> pass, or return to the traced decision
```

Do not attach proof ceremony to a routine slice, and do not let a routine slice
claim a proof it only contributes to.

## Evidence record

Every proof run records the fields the proof plan's "Evidence conventions" section
lists: baseline version and relevant ADRs, code and build and dependency-lock
versions, environment and hardware and configuration, dataset or fixture identity,
commands and timestamps, logs and metrics and traces and diffs and artefact hashes,
and the result with deviations and the follow-up decision.

Two of those become easy once implementation exists: `EXP-07` resolves build,
runtime, and lock identity, and `OPS-01` reports the operational telemetry and the
Redis persistence and eviction settings. Use them rather than gathering values by
hand.

Store each proof run record where the repository convention places it at that time.
The development workflow document states that no separate evidence directory exists
before implementation establishes one, so the first proof run decides the location -
propose it, do not invent it silently.

## Failure handling

A failed proof never authorizes a local document patch or a quiet redesign. Return
to the traced problem, quality scenario, and decision, compare alternatives, and
follow the deviation procedure in `AGENTS.md`. A failed proof is a valid and
useful result; a quietly weakened proof is not.

---

## Prerequisite map

| Proof | Requires these slices DONE | Meaningful to run when |
|---|---|---|
| `PROOF-EXT-001` Strategy extensibility | `SETUP-05`, `STRAT-01`, `STRAT-03`, `STRAT-05`, `EXP-03`, `EXP-06`, `UI-02` | The four MVP strategies run through a real backtest and appear in the interface from registry data |
| `PROOF-REPLACE-001` Search replaceability | `STRAT-06`, `STRAT-07`, `SEARCH-01`, `SEARCH-04`, `UI-03` | A complete Random Search run reaches the leaderboard |
| `PROOF-PROVIDER-001` Provider replaceability | `MKT-01`, `MKT-02`, `MKT-03`, `MKT-04`, `MKT-05` | Normalized candles reach charts and datasets through the port |
| `PROOF-SCALE-001` Worker scale and backpressure | `WS-02`, `EXP-04`, `EXP-05`, `EXP-06`, `SEARCH-01`, `OPS-01` | Workers commit results and queue telemetry is readable |
| `PROOF-CONTROL-001` Pause, resume, cancel, stop | `SEARCH-01`, `SEARCH-02`, `EXP-05`, `UI-03` | Durable control converges across restarts |
| `PROOF-RETRY-001` Partial failure retry | `EXP-06`, `EXP-08`, `EXP-09`, `SEARCH-04` | The whole path from result acceptance to projection exists |
| `PROOF-DUP-001` Duplicate and stale event | `EXP-08`, `EXP-09`, `SEARCH-04` | The projection is idempotent and hashable |
| `PROOF-ISO-001` News failure isolation | `NEWS-02`, `MKT-08`, `EXP-05`, `UI-07` | News collection can be switched off while charts and a technical backtest run |
| `PROOF-ISO-002` Sentiment failure isolation | `NEWS-03`, `NEWS-04`, `NEWS-05`, `UI-07` | Inference can be made unavailable with a policy in place |
| `PROOF-RT-001` Realtime recovery and chart isolation | `MKT-06`, `MKT-07`, `MKT-08`, `MKT-09` | Four subscriptions and gap recovery both work |
| `PROOF-REP-001` Leaderboard reproducibility | `MKT-10`, `EXP-01`, `EXP-02`, `EXP-07`, `SEARCH-03`, `SEARCH-04`, `SEARCH-05` | A leaderboard entry can be traced to a complete provenance record |
| `PROOF-OBS-001` Operational observability | `SETUP-07`, `OPS-01`, plus the slices of whichever proof it observes | Run during the scale and failure proofs, not on its own |

## Parallel opportunity

Three proofs sit on largely independent prerequisite chains and can be run by
different sessions once their prerequisites are met: `PROOF-PROVIDER-001` (market
chain only), `PROOF-EXT-001` (strategy chain plus a backtest), and
`PROOF-RT-001` (market and realtime chain only). The reliability group -
`PROOF-RETRY-001`, `PROOF-DUP-001`, `PROOF-SCALE-001` - shares the same
prerequisites and is most efficient run together in one session on one environment.

---

## PROOF-EXT-001 - Strategy extensibility

**What must be demonstrated**
Adding `MACDStrategy` to a system that already has four strategies requires a
strategy implementation, a descriptor, a registration, and tests - and nothing
else.

**Work this proof adds**
Implement `MACDStrategy` with its indicator, descriptor, registration, and tests,
then run the strategy contract tests and one representative backtest, then inspect
the diff. This work is deliberately not planned as a routine slice, because the
proof's value comes from doing it against a finished system.

**Evidence to record**
The complete diff, plus explicit confirmation that no change appears in the
backtester, evaluator, ranking policy, provider adapters, persistence ownership, or
frontend core; that the strategy appears through registry metadata rather than a
type-switch; and that a stored result carries the MACD strategy identifier,
version, and parameters.

**Where a failure points**
Back to `STRAT-01`'s contract and registry design and to ADR-002. If the frontend
had to change, `STRAT-05` or `UI-02` embedded a strategy identifier somewhere.

---

## PROOF-REPLACE-001 - Search replaceability

**What must be demonstrated**
A domain-guided or genetic generator implemented through `StrategyGenerator` runs
against the same downstream pipeline with no downstream change.

**Work this proof adds**
Run a fixed experiment under Random Search and record the result. Implement a second
generator through the port. Run it against the same pipeline. Compare downstream
diffs and contracts.

The official source describes domain-guided search as grouping strategies by
category - trend, momentum, volatility, structure, information - and requiring one
from each group. The `StrategyDescriptor` category field from `STRAT-01` already
supports this, which is why no contract change should be needed.

**Evidence to record**
Diffs showing the backtester, evaluator, ranking policy, leaderboard projector, and
the candidate and job schemas all unchanged; both runs' results; and the generator
configuration and seed for each.

**Where a failure points**
Back to `STRAT-06` (the candidate contract leaked generator detail) or `STRAT-07`
(the port took on lifecycle responsibility that belongs to the coordinator).

---

## PROOF-PROVIDER-001 - Provider replaceability

**What must be demonstrated**
A second provider - a fake one, or an approved OKX adapter - passes the common
provider contract suite, and its normalized candles are accepted by charts and
experiments with no frontend and no strategy change.

**Work this proof adds**
Implement the second adapter and run the `MKT-01` contract suite against it, then
point a chart and an experiment at its normalized candles.

**Evidence to record**
The contract suite result for both adapters, the diff showing no frontend or
strategy change, and a chart rendering the second provider's candles.

**Where a failure points**
Back to `MKT-01`. A contract suite that only the Binance adapter can pass was
written from the Binance response rather than from the normalized contract.

---

## PROOF-SCALE-001 - Worker scale and backpressure

**What must be demonstrated**
Increasing worker count changes deployment configuration only, produces no
duplicate logical result, keeps memory bounded under backpressure, and identifies
the observed bottleneck.

**Work this proof adds**
Establish a reproducible central-processing-bound job fixture and a calibrated
candidate count. Run with worker counts of one, two, and as many as the test
hardware supports. Capture the telemetry the proof plan lists, most of which
`OPS-01` already exposes. Increase candidate count toward the source's very-large
challenge until a bottleneck appears or the agreed limit is reached.

**Evidence to record**
Everything the proof plan lists, plus the exact hardware. No linear-scaling claim is
permitted without measurements, and the numbers are only valid for the recorded
hardware.

**Where a failure points**
Back to `EXP-04` and `EXP-05` if duplicates appear, or to `SEARCH-01` if memory
grows without bound, which would mean backpressure was not enforced.

---

## PROOF-CONTROL-001 - Pause, resume, cancel, and stop

**What must be demonstrated**
Every stop condition and every control transition works, durable state survives an
API or coordinator restart, new dispatch converges to the requested state, and
running-job behaviour is documented and observable.

**Work this proof adds**
Exercise maximum candidates, maximum duration, no improvement, pause, resume, and
cancel, each with a restart injected mid-transition.

**Evidence to record**
Run state before and after each transition and each restart, dispatch counts,
what happened to jobs already running, and the recorded stop reason.

**Where a failure points**
Back to `SEARCH-02`. If a transition survived the restart but jobs disagreed with
the database afterwards, dispatch reconciliation is incomplete.

---

## PROOF-RETRY-001 - Partial failure retry

**What must be demonstrated**
Failure injected at nine named points around the result, outbox, dispatcher, and
consumer boundaries still yields exactly one logical result per idempotency key, a
completely represented trade result, consistent metrics and state and provenance
and outbox, eventual delivery, one logical state transition, and visible attempt
history.

**Work this proof adds**
Inject failure at each of the nine points the proof plan lists. Most already have
an integration test from `EXP-06`, `EXP-08`, and `EXP-09`; the proof run repeats
them against the assembled system and records the evidence.

**Evidence to record**
Per injection point: the observed state of result, trades, outbox, inbox, and
projection; the attempt history for worker, dispatcher, and consumer; and the
verified trade content hash. Note explicitly that a Redis Pub/Sub publish does not
satisfy this proof.

**Where a failure points**
Back to `EXP-06` if the acceptance transaction was not truly atomic, to `EXP-08` if
a row was marked delivered before acknowledgement, or to `EXP-09` if the inbox
record did not commit with its effect.

---

## PROOF-DUP-001 - Duplicate and stale event

**What must be demonstrated**
The same `StrategyEvaluated` envelope delivered twice, followed by a stale aggregate
version, leaves the leaderboard projection hash and rank unchanged, with
deduplication evidence recorded.

**Work this proof adds**
Deliver the duplicate and then the stale event against the assembled system, and
compare projection hashes before and after.

**Evidence to record**
Projection hash and rank before and after each delivery, the inbox and
deduplication records, and the duplicate and stale counters from `EXP-09`.

**Where a failure points**
Back to `SEARCH-04` if the projection was not idempotent, or to `EXP-09` if the
aggregate-version check was missing.

---

## PROOF-ISO-001 - News failure isolation

**What must be demonstrated**
With the news worker or provider disabled, market chart subscriptions and a
technical-only backtest both keep working while News reports a degraded or failed
state.

**Work this proof adds**
Disable the news worker and the provider in turn while continuously exercising four
chart subscriptions and running a technical-only experiment.

**Evidence to record**
News health state during the outage, chart subscription continuity, the successful
technical backtest result, and confirmation that no shared path failed.

**Where a failure points**
Back to `NEWS-02` if the news worker shared a queue with backtest work, or to
`UI-07` if the news page sat on a shared loading path.

---

## PROOF-ISO-002 - Sentiment failure isolation

**What must be demonstrated**
With model inference unavailable, analysis attempts and retries are recorded,
sentiment-dependent candidates block or degrade according to the explicit policy,
and non-sentiment strategies and backtests keep working.

**Work this proof adds**
Make inference unavailable, then run both a sentiment-dependent candidate and a
technical-only experiment.

**Evidence to record**
Recorded attempts and their failure reasons, the policy applied to the dependent
candidate and where that is visible in the result, and the successful technical
run.

**Where a failure points**
Back to `NEWS-03` if a failure lost the normalized item, or to `NEWS-05` if the
missing and stale policy was implicit rather than configured and recorded.

---

## PROOF-RT-001 - Realtime recovery and chart isolation

**What must be demonstrated**
Four subscriptions with distinct identifiers and timeframes; changing one resets
only that one; a controlled provider disconnect is followed by reconnect, correct
missing-interval calculation, REST recovery, deduplication, and resume; and an API
or client restart returns a durable snapshot before live continuation.

**Work this proof adds**
Execute the five steps in the proof plan against the assembled system, and capture
the end-to-end latency distribution for later comparison against an agreed budget.

Note that Binance disconnects any stream connection at the 24-hour mark, so a long
run also exercises this path without a deliberate interruption. That is a useful
second observation, not a substitute for the controlled test.

**Evidence to record**
Subscription state before and after the timeframe change, the gap query result over
the outage range showing no unresolved gap and no duplicate, confirmation that
unrelated subscriptions did not reset and that no full page reload occurred, and
the latency distribution with the hardware it was measured on.

**Where a failure points**
Back to `MKT-09` for gap or duplicate problems, or to `MKT-07` for subscription
isolation problems.

---

## PROOF-REP-001 - Leaderboard reproducibility

**What must be demonstrated**
The current top leaderboard entry resolves every applicable field in the baseline's
ten-item reproducibility list, and rerunning it on the identified dataset, build,
and configuration reproduces the trades or the artefact and metric hashes - with no
value obtained from a mutable default or a current registry or model alias.

**Work this proof adds**
Resolve the checklist through the `SEARCH-05` provenance read, rerun the entry, and
compare canonically. If nondeterminism was declared, apply the recorded tolerance
and explain it.

**Evidence to record**
The full resolved checklist, the rerun command and environment, the canonical trade
comparison or the artefact and metric hash comparison, and an explicit statement for
each field that it came from stored provenance rather than from current state.

**Where a failure points**
Back to `EXP-07` if a field was not captured, to `EXP-01` if the specification
allowed an alias, to `MKT-10` if the dataset resolved differently, or to `EXP-02`
if the simulation was not deterministic.

---

## PROOF-OBS-001 - Operational observability

**What must be demonstrated**
Correlation from experiment through candidate, BullMQ job, attempt, result, outbox
event, consumer and inbox record, to leaderboard entry, plus query, metric, and log
access to run state, queue depth and job states, dispatcher lag, projection lag,
latency, retries and stalls and failures, Redis persistence and eviction health,
provider health and gaps, worker counts, and the current leader.

**Work this proof adds**
None on its own. Run it during the scale and failure proofs, following one
correlation identifier the whole way through and reading the `OPS-01` surface at
each stage.

**Evidence to record**
The correlation chain for one experiment with the identifier visible at every hop,
and one `OPS-01` reading per stage of the proof it accompanies.

**Where a failure points**
Back to `SETUP-07` if the identifier did not cross a process boundary, or to
`OPS-01` if a required observation is not exposed.
