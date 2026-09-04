# Final pre-defense release plan

Authoritative short-term plan for the final release of Crypto Strategy Lab before
the oral defense. Separate from `implementation-plan/`, which stays the source of
truth for the versioned V1-V6 roadmap. This plan only closes the distance between
the certified V5 baseline and a defensible final release.

**Deadline: about one working day.** Every decision below is made against that
constraint. The objective is not a clean industrial release. The objective is:

```text
required functional closure
  -> minimum demo exposure
    -> minimum presentation hardening
      -> truthful documents
        -> one final release gate
          -> freeze
```

---

## Why this plan exists

A consistency audit of the official requirements against live backend contracts,
live frontend behavior, accepted ADRs, and recorded proof evidence found that
nearly the whole capability set is consistent. It found one functional
inconsistency and one class of presentation defects. Neither needs an
architecture change.

The goal is that six things agree: official requirements, backend behavior,
frontend behavior, accepted architecture decisions, what the demo does, and what
is claimed during the defense.

---

## The certified baseline this release started from

Historical: these were the facts when this plan was written, not the current state.
This release has since completed and been frozen at `v5.1-demo`; see the Status table
at the end and `implementation-plan/TRACKING.md`.

| Fact | Value |
|---|---|
| Certified baseline | V1 through V5 |
| Tag | `v5.0-demo` |
| Commit | `2b751f0` |
| Branch | `v5-news-and-sentiment` |
| Recorded suite result | 134 test files, 772 tests, exit 0. Recorded 2026-09-01; not re-run while this plan was written. |
| Proofs with recorded PASS evidence | `PROOF-EXT-001`, `PROOF-REPLACE-001`, `PROOF-PROVIDER-001`, `PROOF-CONTROL-001`, `PROOF-REP-001`, `PROOF-RT-001`, `PROOF-ISO-001`, `PROOF-ISO-002` |
| Proofs with no evidence file | `PROOF-SCALE-001`, `PROOF-RETRY-001`, `PROOF-DUP-001`, `PROOF-OBS-001` |
| Product version authorization | V5. This plan does not advance it. |

The four proofs without evidence are V6 concerns. They are not release blockers
and they are not claimable.

The eight proofs with recorded PASS evidence stay valid unless this release
materially affects them. Re-running a proof for ceremony is not planned work.

---

## Scope and cut-line

| Id | Title | Priority | File |
|---|---|---|---|
| `FIN-01` | Composite candidate execution path | MUST | [01-composite-discovery-closure.md](01-composite-discovery-closure.md) |
| `FIN-02` | Minimal composite discovery UI exposure | MUST | [01-composite-discovery-closure.md](01-composite-discovery-closure.md) |
| `FIN-03` | Demo-surface presentation hardening | MUST (observed breakage only) | [02-presentation-hardening.md](02-presentation-hardening.md) |
| `FIN-04` | Canonical demo flow | MUST | [03-documentation-and-evidence-sync.md](03-documentation-and-evidence-sync.md) |
| `FIN-05` | Truthfulness synchronization | MUST | [03-documentation-and-evidence-sync.md](03-documentation-and-evidence-sync.md) |
| `FIN-06` | Final gate and freeze | MUST | [04-final-certification-and-freeze.md](04-final-certification-and-freeze.md) |

### MUST finish before freeze

1. `FIN-01` functional closure.
2. Minimal `FIN-02` UI exposure.
3. Targeted validation of the three risky semantic invariants (`FIN-01`).
4. Demo-critical presentation fixes (`FIN-03`: Discovery and Realtime always;
   Backtest only if visibly broken in a real browser).
5. Canonical demo script (`FIN-04`).
6. Correct false or stale documents, and record the account limitation (`FIN-05`).
7. One repository-wide gate (`FIN-06`).
8. Generated-composite reproducibility check (`PROOF-REP-001`, in `FIN-06`).
9. Compose bring-up and canonical demo end to end (`FIN-06`).
10. Freeze-readiness report.

### CONDITIONAL MUST

- Backtest presentation, only if it is visibly broken or unreadable in a real
  browser with real data. Judge it on screen, not from a static class audit.

### STRETCH, only if a MUST is finished early and the item is genuinely cheap

- Strategy Engine styling beyond what the manual composite flow needs to operate.
- Shell and News polish.
- Dead utility-class removal outside the demo surfaces.

### DROP - post-defense work, not release-day work

- The combination policy catalog endpoint.
- Sourcing `StrategyEnginePage` policy options from a catalog.
- Re-running architecture proofs this release did not materially affect.
- Any documentation edit that does not change whether a statement is true.

**Spare time after freeze readiness goes to oral-defense rehearsal, not to
dropped scope.** Rehearsal has a higher return than any item above.

A stretch or dropped item left undone is not a defect and is not recorded as one.

---

## Explicit non-scope

Nothing below is part of this release.

**Deferred late requirement.** Registration, login, sessions or tokens, a user
entity, per-user ownership, role-based access, tenant filtering, and any account
or subscription interface. The system is treated explicitly as single-operator.
Do not build a decorative login screen: a login form that authenticates nothing
is worse than an honest stated limitation, because it invites a question the
implementation cannot answer.

**Optional search methods.** Genetic, Bayesian, evolutionary, model-generated.
The official source calls these an extension. Generator replaceability is already
proven by `PROOF-REPLACE-001` with a real second generator.

**Optional strategy families.** Full Smart Money Concepts and full Wyckoff. The
official source asks only that the architecture can support them, which
`PROOF-EXT-001` demonstrates.

**Optional news machinery.** Model-assisted extraction, self-repairing templates,
source-management interface.

**Optional metrics.** Profit factor, Sharpe, currency-denominated tiles, win/loss
counters, equity sparklines. The mandatory metric set is total return, win rate,
maximum drawdown, and trade count, which is exactly what the backend returns.

**V6 architecture maturity.** BullMQ realization, transactional outbox, and the
scale, retry, duplicate, and observability proofs.

**Pixel reproduction of the sample images.** They were model-generated and are
authoritative only for visible layout, labels, and example flow.

---

## Known problems

### P1 - Automated discovery cannot run a composite candidate (MUST fix)

Verified at commit `2b751f0`:

- `random-strategy-generator.ts` already produces composite candidates.
- `search-coordinator.ts:433` throws `SEARCH_COMPOSITE_UNSUPPORTED` for any
  non-`single` candidate. This is the only hard block.
- `DiscoveryPage.tsx:227` sends `compositeSizes: [1]` and `policies: []`, which
  is the only reason that block is never reached at runtime.
- The read path is already composite-aware: `ApiLeaderboardStrategy` has a
  `composite` variant, the leaderboard query returns the candidate specification
  from the ledger without interpreting it, and `DiscoveryPage` already renders a
  composite entry.
- The compute path is already composite-aware: the backtest worker registers a
  composite execution strategy from an inline definition on its input.

The gap is narrow: the derived experiment specification the coordinator builds
has no way to carry a composite that is not a saved composite. See `FIN-01`.

### P2 - Policy options in the frontend are not metadata-driven (DROP)

The backend architecture supports versioned `CombinationPolicy` components
through `CombinationPolicyRegistry`, exactly as it supports strategies and
generators. What is missing is only the transport: there is no policy catalog
endpoint, so the two identifiers are literals in `StrategyEnginePage.tsx` and
adding a policy currently requires a frontend change.

**This is a UI integration limitation, not a domain architecture limitation.**
State it that way and never as "combination policies are not extensible", which
would be false about the architecture. Exact wording is fixed in `FIN-05`.

It does not block the demo, because `FIN-02` sends one known-good policy.
Dropped for this release.

### P3 - Dead styling on demo screens (MUST fix, partially)

Tailwind is not installed anywhere: no dependency in `apps/web/package.json`, no
entry in `pnpm-lock.yaml`, no `tailwind.config.*` or `postcss.config.*`. Four
files are nonetheless authored in Tailwind utility classes, which resolve to
nothing. Separately, nineteen semantic class names on `BacktestPage.tsx` and
`DiscoveryPage.tsx` have no rule in `index.css`.

Nothing here affects behavior or any proof. It affects whether the demo screens
look finished. Only the demo-critical part is in scope.

### P4 - Documents that are or will become false (MUST fix)

`docs/demo-script.md` still says the baseline is V1 through V4 and that V5 is not
frozen; V5 was frozen at `v5.0-demo` on 2026-09-01. `VERSIONS.md` states the
minimum product list is fully satisfied, which under the accepted requirement
reading becomes true only once `FIN-01` and `FIN-02` land.

### P5 - The deferred late requirement is undocumented (MUST fix)

Nothing in the repository records the account deferral, so nothing explains the
single-operator assumption to a reader or an examiner.

---

## Requirement decision already made

The owner has closed the ambiguity about automated discovery.

Manual composition satisfying the combination requirement, plus single-strategy
search satisfying the search requirement, is **not** the accepted reading.

Automated discovery must also generate composite candidates, and those candidates
must complete generation, persistence, execution, evaluation, ranking, and
leaderboard projection end to end.

Closed. Do not reopen it and do not re-derive it from the official source during
implementation.

This is a realization completion inside contracts that already exist, not an
architecture change. If implementation discovers the existing contracts genuinely
cannot express it, that is an architecture deviation and the procedure in
`AGENTS.md` applies. Nothing found during verification suggests that will happen.

---

## Conceptual distinction that must survive

| Thing | What it is | Where it lives |
|---|---|---|
| Built-in strategy | A system-global definition | Strategy registry, assembled at startup |
| Saved composite strategy | A persistent composition a person deliberately created | `CompositeStrategyService`, persisted |
| Generated candidate | An experiment-scoped proposal from a generator | The candidate ledger of one search run |
| Result / leaderboard entry | The outcome of running a candidate | Experiment results and the Top-K projection |

A generated candidate must not become a saved composite strategy. A saved
composite is a durable object a person owns and reuses; a candidate is an
immutable experiment input. Collapsing them would, once accounts eventually
exist, silently create ownerless user data.

This directly shapes `FIN-01`: persisting every generated composite through
`CompositeStrategyService` so the runner can resolve it by identifier is
rejected.

---

## Order and its causal reason

```text
FIN-01 -> FIN-02 -> FIN-03 -> FIN-04 -> FIN-05 -> FIN-06
```

- `FIN-01` first because it is the only change that can fail for an unanticipated
  reason. It touches immutable specification content, therefore the canonical
  hash, therefore provenance and run idempotency. If it is harder than expected,
  that must surface in the first hour of the day, not the last.
- `FIN-02` next because offering composite sizes before the backend can execute a
  composite candidate produces an interface that reliably throws.
- `FIN-03` after the functional work because it touches the same two pages
  `FIN-02` changes. A second pass over a page is where a working control gets
  broken by accident.
- `FIN-04` after that because a script describing composite discovery cannot be
  rehearsed before composite discovery runs.
- `FIN-05` after that because the true statement about the system is only known
  once the code is final.
- `FIN-06` last by definition. It is the gate.

---

## Model and Context Budget Strategy

Model usage resets on a rolling window of roughly five hours. Reasoning budget is
therefore a release resource in the same way wall-clock time is, and it is spent
in exactly one place worth spending it: the semantics of `FIN-01`.

### Reasoning level per kind of work

| Level | Use for |
|---|---|
| **Sonnet XHigh** | `FIN-01` semantic implementation. Difficult `FIN-01` debugging. A final-gate regression whose cause is inside immutable specification content, provenance, canonical hashing, or composite resolution. Nothing else. |
| **Sonnet High** | `FIN-02`. Review of the `FIN-01` diff. Targeted backend debugging. Truthfulness review in `FIN-05`. Final-gate failures needing cross-file reasoning. |
| **Sonnet Medium** | Presentation and CSS work. Demo-script editing. Mechanical documentation synchronization. Governance and link fixes. Simple final-gate repairs. Routine test execution. |

Never spend XHigh on CSS, markdown, link fixes, formatting, or running tests.

These are defaults, not rules. Escalate when the problem in front of you actually
requires it, and say why in one line when you do.

### Per-task defaults

| Task | Default | Escalate when |
|---|---|---|
| `FIN-01` | XHigh | - |
| `FIN-01` diff review | High | Review finds a semantic doubt; then XHigh on that point only |
| `FIN-02` | High | - |
| `FIN-03` | Medium | A styling change appears to alter behavior |
| `FIN-04` | Medium | A script step turns out to claim something unproven |
| `FIN-05` | Medium | A truthfulness question needs cross-file reasoning; then High |
| `FIN-06` | Medium, High for real failures | A regression traces into specification, provenance, or composite resolution; then XHigh |

### Release-day execution windows

Three windows. The point is to protect expensive reasoning for the risky work,
not to consume a fixed number of hours. A window that finishes early simply moves
on.

**Window 1 - functional closure.**
`FIN-01` at XHigh. Status checkpoint at about two hours. Hard decision point at
about three hours (see stop-loss below). If healthy, `FIN-02` at High. Run the
functional checkpoint before leaving this window.

**Window 2 - demo hardening.**
`FIN-03`, then `FIN-04` and `FIN-05`, mainly at Medium. Escalate to High only if a
behavioral inconsistency is discovered.

**Window 3 - certification.**
`FIN-06` at Medium, rising to High for real failures. XHigh only for a hard
semantic regression inside `FIN-01`.

---

## Minimal startup context

A fresh session must not reread the repository or the ADR set. Read, in order,
and stop as soon as you can act:

1. This file.
2. The current `FIN-*` task file.
3. The most recent handoff record (see below).
4. Only the files named in that task's Expected change surface and Authoritative
   evidence.
5. An ADR only if live code appears to conflict with an architectural invariant.

Do not reopen the earlier audit reports unless the task explicitly depends on a
fact those reports dispute. Their conclusions are already carried into this plan.

### Handoff record

Each completed task leaves one short record. Six lines, not a journal:

```text
TASK:        <FIN-id>  <DONE | BLOCKED | REVERTED>
FILES:       <changed files>
INVARIANTS:  <which were confirmed, and how>
VALIDATION:  <what was run, and the result>
COMMIT:      <hash, if committed>
NEXT:        <next task, or the unresolved issue>
```

Keep it short enough that a fresh session resumes without reconstructing history.
Do not write a verbose session journal. The durable project record is
`JOURNAL.md`, written once in `FIN-05`.

---

## Checkpoints

Three, all cheap. None is a ceremony and none requires the repository-wide suite.

**Functional checkpoint - after `FIN-01` and `FIN-02`.**
Run one composite discovery, automated or manual. Confirm a composite reaches the
leaderboard. **If it does not, do not begin presentation work.** Styling a screen
whose central behavior is broken is the worst possible use of the remaining day.

**Demo checkpoint - during `FIN-03`.**
Look at Discovery, Realtime, and Backtest in a browser. Once the required demo
surfaces are usable, stop styling. Not "once the list is empty".

**Truth checkpoint - after `FIN-04` and `FIN-05`.**
Confirm the demo script and the final-defense notes make no claim beyond the
claimable set. No test run required.

`FIN-06` remains the only expensive repository-wide gate.

---

## Implementation-session output discipline

Before editing code, output at most five short bullets:

- intended change;
- invariant being protected;
- files to touch;
- targeted validation;
- stop condition.

Then implement. Do not re-explain the project architecture before every task; it
is in this file and in the task file, and repeating it costs budget that `FIN-01`
needs.

When debugging, one hypothesis at a time:

```text
symptom -> most likely violated invariant -> smallest inspection -> smallest experiment
```

Do not open large unrelated portions of the repository speculatively.

---

## Testing and token policy for this release

Owner-directed, for this release only. It does not change `AGENTS.md`,
`CODING_STANDARDS.md`, or the workflow documents, and must not be written back
into them as permanent policy.

**Inner loop.**

- No broad test review. Do not open unrelated test files to assess coverage.
- Do not add tests to increase coverage.
- Do not run the repository-wide suite during `FIN-01` through `FIN-05`.
- No separate code-review or test-review ceremony after each task.
- Use a directly affected existing test only when it is high information at low
  cost.
- Add a new test only when a high-risk invariant cannot be established cheaply
  any other way. `FIN-01` is the one place where that is true, and the three
  invariants are named in its file.
- Manual verification is enough when the change is presentation-only, the
  behavior is directly observable, a test would mostly assert implementation
  detail, or the risk of silent semantic corruption is low.

**Release gate, once.** Repository-wide validation runs exactly once, in
`FIN-06`.

**One hard operational warning.** The repository-wide suite resets the schemas of
whatever database its environment points at. Never point it at the database a
live Compose stack is using. Use a disposable database and drop it afterwards.
This has bitten the project before and the correct pattern is recorded in the
project journal.

---

## Stop-loss policy

Time pressure is expected. These fallbacks are decided in advance so they are not
improvised at hour nine.

| Situation | Fallback |
|---|---|
| `FIN-01` at about two hours | Status checkpoint, four questions. See the stop-loss section in the task file. |
| `FIN-01` at about three hours and still not under control | Hard release decision: finish only if the remaining work is bounded and nameable, otherwise restore the guard and document the limitation. Do not spend four or more hours merely understanding `FIN-01` while the rest of the release is untouched. |
| `FIN-01` proves significantly harder than expected | Do not half-land it. Either finish it safely, or restore the guard and document automated composite discovery as a known limitation in `FIN-05`. A clean limitation beats a demo path that throws or silently produces wrong results. |
| `FIN-02` running late | Ship the smallest UI able to trigger one known-good composite search: a composite-size control plus a hard-coded known-good policy. |
| `FIN-03` running late | Stop once Discovery and Realtime are visually usable. Backtest only if visibly broken. Leave the rest. |
| Final gate exposes a non-critical cosmetic problem | Record it. Do not reopen functional code unless it blocks the demo. |
| Final gate exposes a regression inside `FIN-01` | Owner decision: fix or revert. Present it with remaining time as the deciding factor. |

---

## Final Definition of Demoable

### A. Functionally demoable

On the Compose topology, end to end:

- realtime market chart fed by the exchange provider;
- four charts with independently changeable timeframes;
- strategy catalog served from the backend;
- manual composite creation, saved and backtested;
- automated discovery that generates composite candidates and ranks them;
- backtest producing trades;
- the four required evaluation metrics;
- trade visualization with entry and exit markers, plus a trade table;
- Top-K leaderboard containing at least one generated composite;
- news collection from a real configured source;
- sentiment classification with recorded model and input versions.

### B. Presentation demoable

Judged in a real browser with real data, never from a static class audit.

- Discovery is readable and clearly exposes composite discovery.
- Realtime visibly presents the four-chart experience, preferably two-by-two at a
  normal demo viewport.
- Backtest is readable, or was already readable and needed no work.
- No screen used in the demo has obvious visible breakage.
- No control implies a capability the backend does not have.

Perfect consistency across the application is not required and is not assessed.

### C. Architecture demoable

Every architecture claim made during the demo has recorded evidence. The
claimable set is exactly this:

| Claim | Evidence |
|---|---|
| A second market data provider needs no frontend change | `PROOF-PROVIDER-001` |
| A new strategy needs no downstream change | `PROOF-EXT-001` |
| A second search generator needs no downstream change | `PROOF-REPLACE-001` |
| Stop conditions and pause, resume, cancel survive a restart | `PROOF-CONTROL-001`, in the PostgreSQL-executor realization only |
| Realtime recovers from a provider outage with no gaps or duplicates | `PROOF-RT-001` |
| A leaderboard entry resolves to its frozen specification and reruns identically | `PROOF-REP-001` |
| News worker failure does not stop charts, backtests, or discovery | `PROOF-ISO-001` |
| Sentiment model failure does not stop news collection | `PROOF-ISO-002` |

Nothing outside this table may be claimed as proven. In particular: no queue
scaling claim, no candidate-volume claim, no outbox reliability claim, no broker
retry claim, no duplicate-safety claim, and no latency claim. `PROOF-RT-001`
disclaims a latency target in its own text.

### D. Release demoable

From the final intended commit: the repository-wide gate passes, governance
passes, Compose comes up through the documented command, the canonical demo runs
end to end on that topology, and no tracked document states something the code
does not do.

---

## Final freeze gate

1. Every MUST item is complete, or explicitly and durably recorded as not done
   with its reason.
2. The Definition of Demoable passes in all four sections.
3. The repository-wide gate is green at the final commit, run against a
   disposable database.
4. Governance passes on a clean checkout of that commit.
5. Compose comes up and the canonical demo runs on it.
6. No tracked document makes a claim the final code does not support.
7. `docs/final-defense-notes.md` exists, carries both the known limitations and
   the unsupported claims, and is linked from the demo script.

The freeze tag and any move of the product version remain owner decisions. No
coding agent creates a version tag.

---

## How a future coding session picks the next task

```text
frozen_implementation_plan/README.md
  -> the scope table above
    -> the first MUST task not yet complete, in order
      -> that task's file, read in full
        -> the last handoff record
          -> only the files that task names
            -> five bullets, then implement
              -> run only its targeted validation
                -> write the handoff record, update the status table below
```

Do not skip ahead. Do not run the full suite before `FIN-06`. Do not start a
STRETCH item while a MUST item is open. Do not start a DROP item at all.

If a task's stated problem turns out to be already solved or wrongly described,
stop, say so, and correct the task file before writing code.

---

## Status

This release is complete. It was executed on 2026-09-04 and frozen at `v5.1-demo`.

| Task | Status | Note |
|---|---|---|
| `FIN-01` | DONE | Composite candidates generate, execute, evaluate, rank, and project end to end. |
| `FIN-02` | DONE | Minimal composite discovery exposure on the Discovery page. |
| `FIN-03` | DONE | Demo-surface presentation hardening. |
| `FIN-04` | DONE | Canonical demo flow, `docs/demo-script.md`. |
| `FIN-05` | DONE | Truthfulness synchronization, `docs/final-defense-notes.md`. |
| `FIN-06` | DONE | Final gate passed; frozen at `v5.1-demo`. |

A presentation pass over the five demo pages was reopened by the owner after `FIN-06`
and is recorded in `implementation-plan/JOURNAL.md`. `implementation-plan/TRACKING.md`
remains the authoritative current-state view.
