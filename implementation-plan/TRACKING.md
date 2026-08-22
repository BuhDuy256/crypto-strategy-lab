# Implementation Tracking

Two questions this file answers:

1. **Which version are we trying to complete?**
2. **What is the next `READY` slice inside that version?**

Read [`README.md`](README.md) first. Version scope and demo contracts are in
[`VERSIONS.md`](VERSIONS.md).

---

# Current target version

## V1 - Backtesting Lab

**Nothing is implemented.** The repository is documentation only: no `apps/`, no
`packages/`, no lock file.

**Start here: `SETUP-01`.**

| | |
|---|---|
| Target version | **V1 - Backtesting Lab** |
| V1 slices | 25 |
| V1 `DONE` | 0 |
| V1 `READY` | 1 (`SETUP-01`) |
| V1 `IN_PROGRESS` | 0 |
| V1 `BLOCKED` | 2 (`EXP-02` execution defaults, `EXP-04` architecture review) |
| V1 `TODO` | 22 |
| V1 demo readiness | Not yet - see V1's Definition of Demoable in `VERSIONS.md` |

**Do not start a V2 or later slice**, even if its dependencies are satisfied.
Finishing V1 makes the project demoable; starting V2 early does not.

**Last reviewed:** 2026-08-22, against commit `cdac819` with a clean working tree.

---

## Status vocabulary

| Status | Meaning |
|---|---|
| `TODO` | Defined, but at least one dependency is not `DONE`, or it belongs to a later version. Do not start. |
| `READY` | Every dependency is `DONE`, nothing external is blocking, **and it is in the current target version**. Pick from here. |
| `IN_PROGRESS` | A session is working on it. Unfinished state is in `.scratch/checkpoints/<slice-id>.md`. |
| `BLOCKED` | Something outside coding must happen first. The Blocker column says what. |
| `DONE` | Acceptance criteria met, validation run, diff reviewed. The Evidence column says where to look. |

## Priority

| Priority | Meaning |
|---|---|
| `CRIT` | On the critical path to the current target version's demo. Delaying it delays the demo. |
| `REQ` | Required for the version's exit criteria, but not on the critical path. |
| `OPT` | Optional. Excluded from the version's exit criteria. May be skipped entirely. |

## Rules

- Only mark a slice `READY` when every dependency is genuinely `DONE` **in the
  code**, not merely in this table. Check the tree before you trust the row.
- A slice outside the current target version is never `READY`.
- `BLOCKED` outranks `TODO`, because a blocker can be resolved in parallel and
  someone needs to see it. `BLOCKED` must always name the blocker.
- **Readiness promotion is mandatory.** When you mark a slice `DONE`, walk its
  direct dependents. Every dependent whose dependencies are now all `DONE`, that is
  in the current target version, and that has no blocker, moves `TODO` to `READY`.
  Do this in the same edit as the `DONE`.
- `DONE` must point at concrete evidence: a commit, a test command, a proof record.
  "It works" is not evidence.
- Keep one, or at most a few, slices `IN_PROGRESS`.
- No conversational detail here. Unfinished inner-task state belongs in
  `.scratch/checkpoints/`.
- Statuses reflect reality, not intent. Architecture documents existing is not
  implementation progress.
- A coding agent never changes the target version and never creates a Git tag.

---

# V1 - Backtesting Lab (target)

Demo contract: [`VERSIONS.md` V1](VERSIONS.md#v1---backtesting-lab)

## V1 critical path

The longest dependency chain in V1 is eighteen slices. Nothing shortens the demo more
than keeping this chain moving.

```text
SETUP-01 -> SETUP-02 -> SETUP-03 -> SETUP-04 -> SETUP-05
  -> MKT-01 -> MKT-02 -> MKT-03 -> MKT-10
    -> EXP-01 -> EXP-02 -> EXP-03 -> EXP-05 -> EXP-06 -> EXP-10
      -> UI-04 -> UI-05 -> DEMO-01
```

The other seven V1 slices are still required for the demo, but they have slack and
can be done alongside the chain rather than blocking it:

| Slice | Must be done before | Slack |
|---|---|---|
| `SETUP-06` | `MKT-04` | Can start right after `SETUP-03` |
| `MKT-04` | `MKT-05` | Can start right after `MKT-03` |
| `MKT-05` | `UI-04` | Can start right after `MKT-04` |
| `STRAT-01` | `STRAT-02` | Can start right after `SETUP-05` |
| `STRAT-02` | `EXP-01` | Can start right after `STRAT-01` |
| `EXP-04` | `EXP-05` | Can start right after `EXP-01` |
| `EXP-11` | `UI-05` | Can start right after `EXP-10` |

Two branches run in parallel with the chain from `SETUP-05` onward: the strategy
branch (`STRAT-01`, `STRAT-02`) and the chart branch (`SETUP-06`, `MKT-04`,
`MKT-05`). Neither is on the longest chain, so a second session can take one of them
without contending for the same files.

Effort is relative only. `S` is a focused session, `M` is a full session, `L` is
more than one session.

## V1 slices

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Evidence | Plan |
|---|---|---|---|---|---|---|---|---|
| SETUP-01 | CRIT | S | Workspace, TypeScript, quality commands | **READY** | - | | | [00](00-setup-and-walking-skeleton.md) |
| SETUP-02 | CRIT | S | PostgreSQL topology and configuration | TODO | SETUP-01 | | | [00](00-setup-and-walking-skeleton.md) |
| SETUP-03 | CRIT | M | NestJS API, module skeleton, logging | TODO | SETUP-01, SETUP-02 | | | [00](00-setup-and-walking-skeleton.md) |
| SETUP-04 | CRIT | M | Migrations and module-owned schemas | TODO | SETUP-02, SETUP-03 | | | [00](00-setup-and-walking-skeleton.md) |
| SETUP-05 | CRIT | M | Architecture boundary tests | TODO | SETUP-03, SETUP-04 | | | [00](00-setup-and-walking-skeleton.md) |
| SETUP-06 | REQ | M | React SPA workspace and shell | TODO | SETUP-01, SETUP-03 | | | [00](00-setup-and-walking-skeleton.md) |
| MKT-01 | CRIT | M | Candle contract, provider port, contract suite | TODO | SETUP-05 | | | [01](01-market-and-realtime.md) |
| MKT-02 | CRIT | M | Binance historical adapter | TODO | MKT-01 | | | [01](01-market-and-realtime.md) |
| MKT-03 | CRIT | M | Candle persistence with immutable revisions | TODO | MKT-02, SETUP-04 | | | [01](01-market-and-realtime.md) |
| MKT-04 | REQ | S | Candle history endpoint | TODO | MKT-03, SETUP-06 | | | [01](01-market-and-realtime.md) |
| MKT-05 | REQ | M | Single candlestick chart | TODO | MKT-04 | | | [01](01-market-and-realtime.md) |
| MKT-10 | CRIT | S | Dataset snapshot and manifest | TODO | MKT-03 | | | [01](01-market-and-realtime.md) |
| STRAT-01 | REQ | M | Strategy contract, descriptor, registry, annotations | TODO | SETUP-05 | | | [02](02-strategy-and-composition.md) |
| STRAT-02 | REQ | M | Indicator primitives and the first strategy | TODO | STRAT-01 | | | [02](02-strategy-and-composition.md) |
| EXP-01 | CRIT | M | Immutable run specification | TODO | MKT-10, STRAT-02 | | | [03](03-experiment-backtest-evaluation.md) |
| EXP-02 | CRIT | L | Deterministic backtester | **BLOCKED** | EXP-01 | Execution model defaults not supplied | | [03](03-experiment-backtest-evaluation.md) |
| EXP-03 | CRIT | M | Evaluator and the MVP metric set | TODO | EXP-02 | | | [03](03-experiment-backtest-evaluation.md) |
| EXP-04 | CRIT | M | BacktestExecutor port and durable run record | **BLOCKED** | EXP-01 | Deviation proposal 001 not yet reviewed | | [03](03-experiment-backtest-evaluation.md) |
| EXP-05 | CRIT | M | Backtest runner process | TODO | EXP-04, EXP-03 | | | [03](03-experiment-backtest-evaluation.md) |
| EXP-06 | CRIT | M | Result acceptance with provenance | TODO | EXP-05 | | | [03](03-experiment-backtest-evaluation.md) |
| EXP-10 | CRIT | S | Single backtest result query surface | TODO | EXP-06 | | | [03](03-experiment-backtest-evaluation.md) |
| EXP-11 | REQ | S | Visualization annotation capture | TODO | EXP-10, STRAT-01 | | | [03](03-experiment-backtest-evaluation.md) |
| UI-04 | CRIT | M | Backtest page with metrics and trades | TODO | EXP-10, MKT-05 | | | [06](06-ui-and-demo-integration.md) |
| UI-05 | REQ | M | Signal and trade visualization | TODO | UI-04, EXP-11 | | | [06](06-ui-and-demo-integration.md) |
| DEMO-01 | CRIT | S | Run documentation and V1 demo script | TODO | UI-04, UI-05 | | | [06](06-ui-and-demo-integration.md) |

## V1 proof

| ID | Proof | Status | Prerequisites | Evidence |
|---|---|---|---|---|
| PROOF-PROVIDER-001 | Provider replaceability | TODO | MKT-01, MKT-02, MKT-03, MKT-04, MKT-05 | |

## V1 blockers needing a human

| Blocker | Blocks | What is needed |
|---|---|---|
| Execution model defaults: starting capital, fee, slippage, fill rule, rounding, position sizing, stop rules | `EXP-02` | Supplied values. The baseline requires these to be specification fields, not constants inside the engine. |
| **Architecture review** of the backtest execution transport sequence | `EXP-04` | An explicit accept or reject of [`deviation-proposal-001`](../docs/architecture/deviation-proposal-001-backtest-execution-transport.md). This is a formal architecture deviation under `AGENTS.md`, not an informal acknowledgement - the frozen baseline names BullMQ as the runtime path and the plan's V1 to V5 realization does not use it. |

Both can be resolved now, in parallel with `SETUP-01` through `SETUP-06`. Neither
blocks the six setup slices, and neither changes them: `SETUP-01` to `SETUP-06` are
identical whether the deviation is accepted or rejected.

If the deviation is **rejected**, V1 grows to roughly 28 slices as `SETUP-08`,
`WS-02`, and `EXP-12` move into it and `EXP-04` drops its claim path. The critical
path lengthens; nothing else in the plan changes.

---

# V2 - Extensible Strategy Engine

Demo contract: [`VERSIONS.md` V2](VERSIONS.md#v2---extensible-strategy-engine)

Not the target version. Every slice stays `TODO` until V1 is complete and the user
names V2 as the target.

| ID | Priority | Effort | Slice | Status | Depends on | Plan |
|---|---|---|---|---|---|---|
| STRAT-03 | REQ | M | The remaining three MVP strategies | TODO | STRAT-02 | [02](02-strategy-and-composition.md) |
| STRAT-04 | REQ | M | Composite strategy and combination policy | TODO | STRAT-03 | [02](02-strategy-and-composition.md) |
| STRAT-05 | REQ | S | Strategy catalog query and endpoint | TODO | STRAT-03, SETUP-06 | [02](02-strategy-and-composition.md) |
| STRAT-08 | REQ | S | Composite persistence and endpoint | TODO | STRAT-04 | [02](02-strategy-and-composition.md) |
| MKT-08 | REQ | M | Four charts with independent timeframes | TODO | MKT-05 | [01](01-market-and-realtime.md) |
| UI-02 | REQ | M | Strategy Engine page | TODO | STRAT-05, STRAT-08 | [06](06-ui-and-demo-integration.md) |
| UI-06 | REQ | S | Trade detail and chart highlight | TODO | UI-05 | [06](06-ui-and-demo-integration.md) |

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-EXT-001 | Strategy extensibility | TODO | STRAT-03, STRAT-05, UI-02, EXP-06 |

---

# V3 - Automated Discovery

Demo contract: [`VERSIONS.md` V3](VERSIONS.md#v3---automated-discovery)

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Plan |
|---|---|---|---|---|---|---|---|
| STRAT-06 | REQ | M | Candidate contract and canonical hashing | TODO | STRAT-04 | | [02](02-strategy-and-composition.md) |
| STRAT-07 | REQ | M | Generator port, random search, generator catalog | TODO | STRAT-06 | | [02](02-strategy-and-composition.md) |
| SEARCH-03 | REQ | S | Versioned ranking policy | TODO | EXP-03 | Ranking weights and tie-break rule not supplied | [04](04-search-and-leaderboard.md) |
| SEARCH-01 | REQ | L | Search coordinator and stop conditions | TODO | STRAT-07, EXP-05, SEARCH-03 | | [04](04-search-and-leaderboard.md) |
| SEARCH-02 | REQ | M | Durable pause, resume, cancel | TODO | SEARCH-01 | | [04](04-search-and-leaderboard.md) |
| SEARCH-04 | REQ | M | Leaderboard projection | TODO | SEARCH-01, SEARCH-03 | | [04](04-search-and-leaderboard.md) |
| SEARCH-05 | REQ | M | Experiment and leaderboard query surface | TODO | SEARCH-04, EXP-06 | | [04](04-search-and-leaderboard.md) |
| UI-03 | REQ | L | Discovery page | TODO | SEARCH-05, SEARCH-02 | | [06](06-ui-and-demo-integration.md) |

`SEARCH-03` comes **before** `SEARCH-01`, because the no-improvement stop condition
needs a defined comparison criterion. Ranking weights are a human decision that
should be resolved during V2 so it does not stall V3.

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-REPLACE-001 | Search replaceability | TODO | STRAT-06, STRAT-07, SEARCH-01, SEARCH-04, UI-03 |
| PROOF-CONTROL-001 | Pause, resume, cancel, stop | TODO | SEARCH-01, SEARCH-02, EXP-05, UI-03 |
| PROOF-REP-001 | Leaderboard reproducibility | TODO | MKT-10, EXP-01, EXP-02, EXP-06, SEARCH-03, SEARCH-04, SEARCH-05 |

---

# V4 - Realtime Market Data

Demo contract: [`VERSIONS.md` V4](VERSIONS.md#v4---realtime-market-data)

| ID | Priority | Effort | Slice | Status | Depends on | Plan |
|---|---|---|---|---|---|---|
| WS-03 | REQ | M | WebSocket gateway, Redis, Pub/Sub fan-out | TODO | SETUP-06, MKT-04 | [00](00-setup-and-walking-skeleton.md) |
| MKT-06 | REQ | L | Binance live ingest process | TODO | MKT-03, WS-03 | [01](01-market-and-realtime.md) |
| MKT-07 | REQ | M | Chart subscription protocol | TODO | MKT-06, MKT-05 | [01](01-market-and-realtime.md) |
| MKT-11 | REQ | M | Four live chart subscriptions | TODO | MKT-07, MKT-08 | [01](01-market-and-realtime.md) |
| MKT-09 | REQ | L | Gap detection, recovery, provider health | TODO | MKT-06, MKT-02 | [01](01-market-and-realtime.md) |

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-RT-001 | Realtime recovery and chart isolation | TODO | MKT-06, MKT-07, MKT-09, MKT-11 |

---

# V5 - News and Sentiment (MVP complete)

Demo contract: [`VERSIONS.md` V5](VERSIONS.md#v5---news-and-sentiment)

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Plan |
|---|---|---|---|---|---|---|---|
| NEWS-01 | REQ | M | News contract, provider port, contract suite | TODO | SETUP-05 | | [05](05-news-and-sentiment.md) |
| NEWS-02 | REQ | M | Collection worker and first provider adapter | TODO | NEWS-01, SETUP-04 | Concrete news sources not approved | [05](05-news-and-sentiment.md) |
| NEWS-03 | REQ | M | Analyzer port, result contract, lifecycle | TODO | NEWS-02 | | [05](05-news-and-sentiment.md) |
| NEWS-04 | REQ | M | First real sentiment analyzer | TODO | NEWS-03 | Sentiment model or service not chosen | [05](05-news-and-sentiment.md) |
| NEWS-05 | REQ | S | Sentiment feature query and degradation policy | TODO | NEWS-04 | | [05](05-news-and-sentiment.md) |
| NEWS-07 | REQ | S | News list, health, and sentiment query surface | TODO | NEWS-05 | | [05](05-news-and-sentiment.md) |
| UI-07 | REQ | M | News page | TODO | NEWS-07, SETUP-06 | | [06](06-ui-and-demo-integration.md) |
| NEWS-06 | **OPT** | M | Sentiment as a strategy | TODO | NEWS-05, STRAT-04 | | [05](05-news-and-sentiment.md) |

`NEWS-06` is optional. It is **not** part of V5's exit criteria and V5 is demoable
without it. Build it only if V5 finishes early.

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-ISO-001 | News failure isolation | TODO | NEWS-02, MKT-11, EXP-05, UI-07 |
| PROOF-ISO-002 | Sentiment failure isolation | TODO | NEWS-03, NEWS-04, NEWS-05, UI-07 |

---

# V6 - Async Execution, Reliability, and Proofs

Demo contract: [`VERSIONS.md` V6](VERSIONS.md#v6---async-execution-reliability-and-architecture-proofs)

Consider a `v6-async` branch for this version, since it replaces the execution
transport. `main` at `v5.0-demo` must stay demoable throughout.

| ID | Priority | Effort | Slice | Status | Depends on | Blocker | Plan |
|---|---|---|---|---|---|---|---|
| SETUP-08 | REQ | S | Redis persistence and eviction for BullMQ | TODO | WS-03 | Retention policy for outbox and inbox rows | [00](00-setup-and-walking-skeleton.md) |
| SETUP-09 | REQ | M | Event envelope and cross-process correlation | TODO | SETUP-03 | | [00](00-setup-and-walking-skeleton.md) |
| WS-02 | REQ | M | BullMQ round trip in a separate worker process | TODO | SETUP-08, SETUP-09 | | [00](00-setup-and-walking-skeleton.md) |
| MSG-01 | REQ | M | Reliable messaging primitives | TODO | WS-02 | | [00](00-setup-and-walking-skeleton.md) |
| EXP-12 | REQ | M | BullMQ backtest executor | TODO | WS-02, EXP-05 | | [03](03-experiment-backtest-evaluation.md) |
| EXP-08 | REQ | M | Experiment outbox dispatcher | TODO | MSG-01, EXP-06 | | [03](03-experiment-backtest-evaluation.md) |
| EXP-09 | REQ | M | Experiment idempotent consumer | TODO | EXP-08 | | [03](03-experiment-backtest-evaluation.md) |
| SEARCH-07 | REQ | M | Broker dispatch reconciliation | TODO | EXP-12, SEARCH-02 | | [04](04-search-and-leaderboard.md) |
| SEARCH-06 | REQ | M | Live progress and leaderboard push | TODO | EXP-09, MKT-07 | | [04](04-search-and-leaderboard.md) |
| OPS-01 | REQ | M | Operational status surface | TODO | EXP-08, SEARCH-06, MKT-09 | | [04](04-search-and-leaderboard.md) |

| ID | Proof | Status | Prerequisites |
|---|---|---|---|
| PROOF-SCALE-001 | Worker scale and backpressure | TODO | EXP-12, SEARCH-01, OPS-01 |
| PROOF-RETRY-001 | Partial failure retry | TODO | EXP-08, EXP-09, EXP-12, SEARCH-04 |
| PROOF-DUP-001 | Duplicate and stale event | TODO | EXP-08, EXP-09, SEARCH-04 |
| PROOF-OBS-001 | Operational observability | TODO | SETUP-09, OPS-01, plus the proof it accompanies |
| PROOF-CONTROL-001 | Re-run against the BullMQ realization | TODO | SEARCH-07 |

---

# Totals

| Version | Slices | Optional | Proofs |
|---|---|---|---|
| V1 | 25 | 0 | 1 |
| V2 | 7 | 0 | 1 |
| V3 | 8 | 0 | 3 |
| V4 | 5 | 0 | 1 |
| V5 | 7 | 1 | 2 |
| V6 | 10 | 0 | 4 + 1 re-run |
| **Total** | **62** | **1** | **12** |

Sixty-three slice identifiers exist; `NEWS-06` is the optional one, so sixty-two are
required work.

Advancing the repository's validation status from `PENDING IMPLEMENTATION PROOFS`
is a change to the frozen baseline's metadata. It requires the proof evidence
**and** explicit user approval. A coding agent never changes it.
