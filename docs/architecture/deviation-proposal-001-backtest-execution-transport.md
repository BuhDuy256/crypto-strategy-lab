# Deviation Proposal 001 - Backtest Execution Transport Sequencing

**Status:** PROPOSED - REQUIRES EXPLICIT ARCHITECTURE REVIEW
**Raised:** 2026-08-22
**Raised by:** implementation planning, before any application code exists
**Normative baseline:** [`architecture-baseline.md`](architecture-baseline.md) v1.1 (FROZEN)
**Related ADRs:** [ADR-004](../adr/ADR-004-asynchronous-experiment-processing.md), [ADR-009](../adr/ADR-009-technology-realization.md), [ADR-001](../adr/ADR-001-modular-monolith-process-roles.md)
**Blocks:** implementation slice `EXP-04` in `implementation-plan/`

This document follows steps 1 to 4 of the architecture deviation procedure in
`AGENTS.md` and requests step 5. It changes nothing. No ADR is written and no
baseline text is edited, because `docs/agents/domain.md` states that new
architecture decisions "are added only after explicit approval".

---

## 1. Affected work, stopped

Implementation slice `EXP-04` (`BacktestExecutor` port and durable run record) and
everything downstream of it. `EXP-04` is marked `BLOCKED` in
`implementation-plan/TRACKING.md` pending the outcome of this review.

Work not affected and safe to proceed: `SETUP-01` through `SETUP-06`, the market
data slices, and the strategy slices. None of them depends on the outcome.

## 2. The conflicting baseline sections and ADR branches

| Source | Exact statement | Conflict |
|---|---|---|
| Baseline, Runtime communication | "API/coordinator -> workers: immutable BullMQ commands through Redis, delivered at least once to separate Node.js/TypeScript worker processes." | The proposed intermediate realization dispatches through a PostgreSQL run table, not BullMQ. |
| Baseline, Architectural invariants item 11 | "BullMQ is the correctness delivery path, Redis Pub/Sub is a best-effort notification path, and PostgreSQL remains authoritative durable truth." | For V1 to V5 the correctness delivery path would be PostgreSQL, not BullMQ. |
| Baseline, Deployment topology | Initial role 4: "one or more Node.js/TypeScript BullMQ backtest worker processes on a dedicated queue" | The intermediate role is a runner process claiming rows, not a BullMQ worker. |
| Baseline, Technology decisions | "BullMQ + Redis for durable asynchronous job and integration-work delivery" | Same conflict, stated as a technology selection. |
| ADR-004, Alternatives considered | "PostgreSQL polling queue: durable and fewer dependencies, but requires custom claiming/retry/visibility/control logic." | The proposed intermediate realization is the alternative this ADR explicitly did **not** select. |
| ADR-009, Candidates | "PostgreSQL polling remains a simpler-dependency fallback but would require custom claiming, retry, stalled-work, and operational controls." | Same. Named as a fallback, not as an authorized intermediate step. |

Related problem and scenario branches: P-2.1, P-2.2, P-2.5 (candidate generation
outpacing backtest capacity, scaling by worker count) and QA-SCAL-001.

### What is *not* in conflict

These are stated so the review can see the deviation's true width. Each was checked
against the baseline text, not assumed.

- **Architectural invariant 4** - "Backtest workers never run inside API
  request/WebSocket execution" - is **satisfied from V1**. The intermediate
  realization runs backtests in a separate operating-system process. This is the
  reason the proposal is not "run the backtest inline in the request".
- **Persistence ownership** is unchanged. PostgreSQL is authoritative in both
  realizations; the baseline already says "Redis is not authoritative for
  experiments, results, candles, news, or provenance".
- **Module boundaries, ownership, dependency directions, and domain contracts** are
  unchanged.
- **The transactional outbox** is not weakened. In V1 to V5 there is no
  cross-process integration publication at all, so no outbox obligation is skipped;
  the outbox arrives in V6 together with the async delivery it exists to protect.
- **The target architecture is unchanged.** This proposal is about *when* BullMQ
  appears, not *whether* it does.

### Scope of the deviation in time

Versions V1 to V5 of the implementation plan. It closes at V6, slice `EXP-12`.

## 3. The conflict, and why the baseline may be insufficient

The baseline describes a **target state**. It is silent on **realization
sequencing** - the order in which a target state is reached by an implementation
that starts from an empty repository.

Its "Normative for" line scopes it to application implementation following
repository setup, which is the state the repository is in now. Nothing in it
distinguishes:

- *the architecture the finished system must have*, from
- *the mechanism that must exist in the first working increment*.

Because it does not draw that distinction, a plan that reaches the frozen target
progressively reads as a conflict even when it converges exactly.

The concrete pressure is this. Building BullMQ, Redis, worker processes, and their
configuration before the first backtest can be demonstrated adds roughly five slices
of infrastructure ahead of any user-visible behaviour, for an architectural driver -
automated candidate generation outpacing one runner - that does not exist until V3
of the plan. ADR-004's own context sentence names that driver: "Candidate generation
can outpace CPU-heavy backtesting". Until a generator exists, it cannot.

For a course project with a fixed deadline, the risk that materializes is not a
wrong architecture. It is a repository where most of the infrastructure is built and
nothing can be demonstrated.

## 4. Alternatives, with benefits, costs, risks, and migration consequences

### Alternative A - Build BullMQ and Redis in V1 (no deviation)

- **Benefits:** the frozen path from the first commit; no review needed; no
  migration later; `PROOF-SCALE-001` and `PROOF-RETRY-001` become possible earlier.
- **Costs:** roughly five extra slices before the first demonstrable backtest -
  Redis with persistence and eviction configuration, a BullMQ round trip, worker
  process wiring, job contracts, and idempotency handling. Redis enters the topology
  in V1 for a correctness path with no load on it.
- **Risks:** the highest-risk failure mode for this project is arriving at the
  deadline with infrastructure and no demo. This alternative maximizes the
  infrastructure built before the first demo.
- **Migration consequences:** none.

### Alternative B - Run the backtest synchronously inside the HTTP request

- **Benefits:** the smallest possible V1; one slice fewer than the proposal.
- **Costs:** conflicts with architectural invariant 4 directly.
- **Risks:** invariant 4 is one of the assignment's own headline architecture
  questions ("should 1000 backtests run sequentially in one function, or through a
  job queue and workers?"). Violating it damages the thing the project is graded on.
- **Migration consequences:** larger than the proposal's, because the call site
  moves from a request handler into a worker.
- **Not recommended.**

### Alternative C - PostgreSQL-backed durable executor behind the `BacktestExecutor` port, until V6 (proposed)

- **Benefits:** invariant 4 satisfied from V1; PostgreSQL stays authoritative;
  Redis stays out of the topology until a driver exists; the first demonstrable
  backtest arrives roughly five slices earlier; the run table, attempt history, and
  idempotency key are all reused unchanged by the BullMQ realization.
- **Costs:** claiming, lease expiry, and stale-claim recovery must be written by
  hand - exactly the cost ADR-004 and ADR-009 predicted. Estimated at one slice
  (`EXP-04`) plus a sweep in `SEARCH-02`. Two adapters exist between V6 and the
  removal of the first one.
- **Risks:** (1) the port could accidentally leak polling semantics, making the V6
  swap invasive - mitigated by an explicit acceptance criterion on `EXP-04` that the
  port "exposes nothing that only a database-backed implementation could provide";
  (2) the intermediate could quietly become permanent - mitigated by the closure
  condition below; (3) hand-written claiming could be subtly wrong - mitigated by
  the concurrency tests already specified in `EXP-04` and `EXP-05`.
- **Migration consequences:** at V6, `EXP-12` adds a second adapter behind the same
  port. The `BacktestExecutor` port, the `BacktestRun` record, the idempotency key,
  `Backtester`, `Evaluator`, `ResultCommitter`, `ExperimentSpec`, and every other
  domain contract are unchanged. `EXP-12` carries an acceptance criterion that their
  diffs are empty.

### Alternative D - Proceed without review

Rejected. `AGENTS.md` forbids altering communication style silently, and the
implementation plan documenting the change does not make it approved.

## 5. Request for explicit architecture review

Review is requested on Alternative C. Three outcomes are possible, and the plan is
prepared for each.

### If accepted

Step 6 of the deviation procedure applies: a superseding ADR and a new baseline
version, without rewriting decision history. Proposed shape, for the reviewer to
accept, amend, or reject - **not written until approved**:

- **ADR-010 - Realization sequencing for asynchronous backtest execution.** Status
  ACCEPTED, Decision ID D-13, superseding nothing and amending the realization
  timing in ADR-004 and ADR-009 without changing their selected target.
- **Baseline v1.2**, adding a short "Realization sequencing" clause to the Runtime
  communication section, along the lines of:

  > Final target realization: BullMQ and Redis asynchronous execution.
  >
  > Permitted intermediate realization: a PostgreSQL-backed durable executor behind
  > the same `BacktestExecutor` port, until the asynchronous scale and reliability
  > driver is activated.
  >
  > Conditions, all of which must hold for the intermediate realization to remain
  > permitted:
  > 1. backtest execution runs outside the API and WebSocket process;
  > 2. durable run state remains PostgreSQL-authoritative;
  > 3. domain and application contracts do not depend on PostgreSQL polling or
  >    claiming semantics;
  > 4. the later migration replaces the adapter and transport only, not
  >    `Backtester`, `Evaluator`, `ResultCommitter`, `ExperimentSpec`, or any other
  >    domain contract;
  > 5. no correctness-relevant cross-process integration publication exists while
  >    the intermediate realization is in use; the moment one does, the transactional
  >    outbox and BullMQ obligations apply in full.
  >
  > The intermediate realization is closed when the target realization lands. The
  > closure is recorded as proof evidence, not as a silent removal.

- **Freeze record** `.agents/architecture-freeze.yaml` updated to the new baseline
  version and hash, and the governance validator re-run.

Condition 5 is the one worth the reviewer's attention. It is what keeps this
proposal from becoming a general licence to defer reliability mechanisms: the
outbox is deferred only because nothing it protects exists yet.

### If accepted only as a time-boxed deviation record

If the reviewer prefers not to re-version the baseline for a temporary sequencing
decision, an accepted deviation record referencing this document is sufficient,
provided it names the same five conditions and the closure point. The baseline text
then stays at v1.1 and the deviation is visible beside it.

### If rejected

`implementation-plan/` moves `SETUP-08` (Redis), `WS-02` (BullMQ round trip), and
`EXP-12` (BullMQ executor) into V1, and drops the PostgreSQL claim path from
`EXP-04`. V1 grows from 25 to roughly 28 slices and its first demonstrable backtest
moves later. Nothing else in the plan changes, because the port and the domain
contracts are identical either way. This is a scope decision, not a redesign.

## 6. Closure

If accepted, this deviation closes when `EXP-12` lands in V6. At that point:

- the BullMQ realization satisfies the frozen Runtime communication statement and
  invariant 11 as written;
- `PROOF-SCALE-001` and `PROOF-RETRY-001` are run against it;
- `PROOF-CONTROL-001` is re-run, because a control proof against a PostgreSQL run
  table is not automatically a control proof against a broker;
- this document is marked CLOSED with a reference to the proof evidence.

Until then, the deviation is open and visible. It is not resolved by the passage of
time or by the plan continuing to describe it.
