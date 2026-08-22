# Implementation Plan

Entry point for any coding session that is asked to build Crypto Strategy Lab.

## What this folder is

This folder turns the frozen architecture and the official requirements into six
cumulative product versions, each broken into small implementation slices that one
AI coding session can finish.

```text
Frozen architecture + requirements
  -> product versions (VERSIONS.md)
    -> implementation slices (00-... to 07-...)
      -> coding agent
        -> code + tests + evidence
```

The organizing rule is that **every version is independently demoable**. If work
stops after any version, what exists is a coherent product, not a half-connected
set of mechanisms.

## What this folder is not

- It is **not** a source of architecture truth. It restates constraints; it never
  creates them.
- It is **not** a requirement document. It points at the official sources.
- It is **not** a place for conversation notes, debugging history, or unfinished
  work state. That belongs in `.scratch/checkpoints/`.
- It is **not** a Git or code status report. Live Git and live code are the truth
  about what exists.

## The five levels

```text
VERSIONS.md            what each product version must achieve, and its demo
TRACKING.md            which slice is READY / IN_PROGRESS / BLOCKED / DONE
00-... to 07-...       what one work unit must build
.scratch/checkpoints/  where unfinished execution stopped
Git, code, tests       what actually exists
```

Each level answers a different question. Never copy content between them. In
particular, a slice definition never goes into a checkpoint, and checkpoint detail
never goes into the plan.

## Source hierarchy

Apply authority in this order. This plan sits below all four.

1. [`docs/architecture/architecture-baseline.md`](../docs/architecture/architecture-baseline.md) - FROZEN v1.1.
2. Accepted ADRs in [`docs/adr/`](../docs/adr).
3. Official project sources in [`docs/requirements/`](../docs/requirements).
4. [`AGENTS.md`](../AGENTS.md) and [`docs/agents/development-workflow.md`](../docs/agents/development-workflow.md).
5. This implementation plan.

If this plan disagrees with any of the four above, the four above win and this plan
is wrong. Report the mismatch; do not follow the plan into a violation.

## Versions and the frozen architecture

The frozen baseline is the **final target**, reached at V6. Earlier versions may use
a simpler realization when all four of these hold:

1. the architectural driver for the heavier mechanism does not exist yet;
2. the simpler realization violates no module boundary, ownership rule, dependency
   direction, or domain contract;
3. a stable port exists so the later swap replaces an adapter, not the domain;
4. the evolution path is written down.

Every such simplification is listed in
[`VERSIONS.md`](VERSIONS.md) under "Planned realization evolution", with its driver,
its seam, and the version that closes it.

One of them - the backtest execution transport - conflicts with the frozen baseline
and is an **open architecture deviation awaiting formal review**. It blocks `EXP-04`.
See [`deviation-proposal-001`](../docs/architecture/deviation-proposal-001-backtest-execution-transport.md)
and "The one open architecture question" in `VERSIONS.md`. A coding session must not
resolve it, and must not start `EXP-04` until the review concludes.

This is not permission to simplify anything else. A simplification that is not in
that table has not been approved. Propose it; do not take it.

## How to choose work

1. Read [`AGENTS.md`](../AGENTS.md).
2. Read this file.
3. Read the **Current target version** section at the top of
   [`TRACKING.md`](TRACKING.md).
4. Read that version's entry in [`VERSIONS.md`](VERSIONS.md) so you know what the
   version has to achieve.
5. Pick one slice in [`TRACKING.md`](TRACKING.md) that is `READY` **and belongs to
   the current target version**.
6. Open only the plan file named in that row.

**Never start a slice from a later version**, even when its dependencies happen to
be satisfied. Finishing the current version is worth more than starting the next
one, because an unfinished version is not demoable. If the current version has no
`READY` slice, report that rather than reaching forward.

## How to implement a slice

```text
read the slice section in its plan file
  -> read only the authoritative sources it names
    -> inspect live code and Git state
      -> confirm every dependency slice is really DONE in code, not just in the tracker
        -> set the slice to IN_PROGRESS in TRACKING.md
          -> implement (tests first, per the tdd skill)
            -> run the slice's validation commands
              -> review the diff (code-review skill)
                -> set the slice to DONE with evidence
                  -> promote newly eligible slices from TODO to READY
```

That last step is not optional. When a slice becomes `DONE`, walk its direct
dependents; any whose dependencies are now all `DONE`, that are in the current
target version, and that have no blocker, move from `TODO` to `READY`. A tracker
where nothing is `READY` because nobody promoted anything is a broken tracker.

Follow [`docs/agents/development-workflow.md`](../docs/agents/development-workflow.md)
for which skill each phase uses. Committing and pushing still require a separate
explicit user request.

## Slices are the work unit

An implementation slice **is** the coding work unit. Do not run `to-tickets` over a
slice to split it further - the slice already carries an outcome, dependencies,
architecture constraints, acceptance criteria, and validation, which is exactly
what a ticket would carry.

Publish a GitHub issue per slice only if the user asks for tracker visibility, and
then one issue per slice, not one per acceptance criterion.

## Completing a version

When every slice in the current target version is `DONE`:

1. Run the version's **Definition of Demoable** conditions from `VERSIONS.md`.
   Every one must pass.
2. Walk the version's **Demo scenario** end to end on a clean checkout.
3. Run the version's **Architecture evidence** proofs, if it has any.
4. Report to the user that the version meets its exit criteria.

Then stop.

**A coding agent never tags a version and never advances the target version.** Both
are the user's decision. The agent reports readiness; the user tags
(`git tag vN.0-demo`) and names the next target.

## Interrupted work

If a session ends before a slice is finished, write or update
`.scratch/checkpoints/<slice-id>.md` using `.scratch/checkpoints/TEMPLATE.md`.

`AGENTS.md` owns the checkpoint rules - what to write, how to resume, when it is
stale, when to delete it. This plan does not redefine them.

## Architecture conflicts

If implementing a slice would require breaking a frozen boundary, ownership rule,
dependency direction, contract, or persistence rule:

```text
STOP the affected work
  -> name the exact baseline section and ADR in conflict
    -> describe the conflict and the concrete evidence
      -> propose alternatives with costs and consequences
        -> request explicit architecture review
```

Do not redesign the architecture, do not edit the baseline or an accepted ADR, and
do not quietly reword this plan so the conflict disappears. The full procedure is
in `AGENTS.md` under "Architecture deviation procedure".

## Plan maintenance

A coding agent may update on its own:

- `TRACKING.md` - status, evidence, blocker text, and readiness promotion for slices
  it worked on.
- `.scratch/checkpoints/*` - its own active-work state.

A coding agent must **not** silently change:

- a slice's outcome, scope, architecture constraints, or acceptance criteria;
- the dependency graph;
- which version a slice belongs to;
- anything in `VERSIONS.md`;
- a proof mapping in `07-architecture-proof.md`.

If reality contradicts the plan - a dependency is unnecessary, an acceptance
criterion is impossible, a named layout does not fit, an assumption is wrong -
report the mismatch and propose the change. Wait for the user before editing.
Bending the plan until the written code looks correct is the failure mode this rule
exists to prevent.

## Assumptions this plan makes

Plan assumptions, not frozen decisions. The user may change any of them; changing
one changes only this plan, never the architecture.

- The MVP scope is the list in section 37 of the official project source, and it is
  complete at the end of V5. Section 38 extensions are out of scope unless a slice
  says otherwise.
- One trading pair (BTCUSDT) and the timeframe set
  `1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d` are enough. Multi-coin is an extension.
- Process roles share one build and differ only by entry command, as the baseline
  permits.
- Open configuration values are supplied as explicit versioned configuration. Their
  concrete values need human sign-off; see "Open decisions" in
  [`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md).

## Plan files

| File | Contents |
|---|---|
| [`VERSIONS.md`](VERSIONS.md) | The roadmap. Six versions, each with a demo contract. Read this second. |
| [`TRACKING.md`](TRACKING.md) | Current target version and the status of every slice. Read this third. |
| [`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md) | Environment and platform foundations, across every version |
| [`01-market-and-realtime.md`](01-market-and-realtime.md) | Binance data, normalized candles, charts, realtime, recovery |
| [`02-strategy-and-composition.md`](02-strategy-and-composition.md) | Strategy contract, the MVP strategies, composition, generators |
| [`03-experiment-backtest-evaluation.md`](03-experiment-backtest-evaluation.md) | Frozen specifications, backtest, metrics, result acceptance |
| [`04-search-and-leaderboard.md`](04-search-and-leaderboard.md) | Search loop, control, ranking, Top-K projection, observability |
| [`05-news-and-sentiment.md`](05-news-and-sentiment.md) | News collection, sentiment analysis, isolation |
| [`06-ui-and-demo-integration.md`](06-ui-and-demo-integration.md) | Pages, visualization, run documentation |
| [`07-architecture-proof.md`](07-architecture-proof.md) | Which version each `PROOF-*` first becomes meaningful in |

Area files are organized by architectural area, not by version, because a slice
keeps its architectural home as the product evolves. `VERSIONS.md` and
`TRACKING.md` are the version-first views.
