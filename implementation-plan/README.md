# Implementation Plan

Entry point for any coding session that is asked to build Crypto Strategy Lab.

## What this folder is

This folder turns the frozen architecture and the official requirements into
small, ordered implementation slices that one AI coding session can finish.

```text
Frozen architecture + requirements
  -> implementation plan (this folder)
    -> coding agent
      -> code + tests + evidence
```

Each slice states what to build, why it exists, what it depends on, which
architecture rules apply, when it is done, and how to check it.

## What this folder is not

- It is **not** a source of architecture truth. It restates constraints; it never
  creates them.
- It is **not** a requirement document. It points at the official sources.
- It is **not** a place for conversation notes, debugging history, or unfinished
  work state. That belongs in `.scratch/checkpoints/`.
- It is **not** a Git or code status report. Live Git and live code are the truth
  about what exists.

## Source hierarchy

Apply authority in this order. This plan sits below all four.

1. [`docs/architecture/architecture-baseline.md`](../docs/architecture/architecture-baseline.md) - FROZEN v1.1.
2. Accepted ADRs in [`docs/adr/`](../docs/adr).
3. Official project sources in [`docs/requirements/`](../docs/requirements).
4. [`AGENTS.md`](../AGENTS.md) and [`docs/agents/development-workflow.md`](../docs/agents/development-workflow.md).
5. This implementation plan.

If this plan disagrees with any of the four above, the four above win and this
plan is wrong. Report the mismatch; do not follow the plan into a violation.

## How to choose work

1. Read [`AGENTS.md`](../AGENTS.md).
2. Read this file.
3. Open [`TRACKING.md`](TRACKING.md).
4. Pick one slice whose status is `READY`. If several are `READY`, prefer the one
   that unblocks the most other slices (the "Unblocks" column shows this).
5. Open only the plan file named in that row. Do not read every plan file.

Status meanings are defined in `TRACKING.md`.

## How to implement a slice

```text
read the slice section in its plan file
  -> read only the authoritative sources it names
    -> inspect live code and Git state
      -> confirm every dependency slice is really DONE in code, not just in the tracker
        -> set the slice to IN_PROGRESS in TRACKING.md
          -> implement (tests first, per the tdd skill)
            -> run the slice's validation commands
              -> run the repository governance check if governance docs changed
                -> review the diff (code-review skill)
                  -> set the slice to DONE with evidence in TRACKING.md
```

Follow [`docs/agents/development-workflow.md`](../docs/agents/development-workflow.md)
for which skill each phase uses. Committing and pushing still require a separate
explicit user request.

Do not start a second slice while one is `IN_PROGRESS` in your own session.

## Interrupted work

If a session ends before a slice is finished, write or update
`.scratch/checkpoints/<slice-id>.md` using `.scratch/checkpoints/TEMPLATE.md`.

`AGENTS.md` owns the checkpoint rules (what to write, how to resume, when it is
stale, when to delete it). This plan does not redefine them.

The split is:

| Question | Answer lives in |
|---|---|
| What should be built, and roughly how far along is the project? | `implementation-plan/` |
| Where exactly did unfinished work stop, and what is the next action? | `.scratch/checkpoints/<slice-id>.md` |
| What actually exists right now? | Git, the code, and the test run |

Never copy checkpoint detail into this folder, and never copy slice definitions
into a checkpoint.

## Architecture conflicts

If implementing a slice would require breaking a frozen boundary, ownership rule,
dependency direction, contract, communication path, persistence rule, or
deployment rule:

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

- `TRACKING.md` - status, evidence links, and blocker text for slices it worked on.
- `.scratch/checkpoints/*` - its own active-work state.

A coding agent must **not** silently change:

- a slice's outcome or scope;
- a slice's architecture constraints;
- a slice's acceptance criteria;
- the dependency graph;
- a proof mapping in `07-architecture-proof.md`.

If reality contradicts the plan - a dependency is unnecessary, an acceptance
criterion is impossible, a named file layout does not fit, an assumption is wrong -
report the mismatch and propose the plan change. Wait for the user before editing
the slice definition. Bending the plan until the written code looks correct is the
failure mode this rule exists to prevent.

Adding a genuinely missing slice is also a plan change: propose it, do not just
write it.

## Assumptions this plan makes

These are plan assumptions, not frozen decisions. They may be changed by the user
at any time; changing them changes only this plan, never the architecture.

- The MVP scope is the list in section 37 of the official project source. Optional
  extensions in section 38 are out of scope unless a slice says otherwise.
- One trading pair (BTCUSDT) and the timeframe set `1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d`
  are enough for the MVP. Multi-coin is an extension.
- Process roles share one build and differ only by entry command, as the baseline
  permits.
- Open configuration values (fees, slippage, capital, ranking weights, news sources,
  sentiment model) are supplied as explicit versioned configuration. Their concrete
  values still need human sign-off; see "Open decisions" in
  [`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md).

## Plan files

| File | Area |
|---|---|
| [`TRACKING.md`](TRACKING.md) | Status of every slice; start here after this file |
| [`00-setup-and-walking-skeleton.md`](00-setup-and-walking-skeleton.md) | Environment readiness and the end-to-end skeleton |
| [`01-market-and-realtime.md`](01-market-and-realtime.md) | Binance data, normalized candles, charts, realtime, recovery |
| [`02-strategy-and-composition.md`](02-strategy-and-composition.md) | Strategy contract, four MVP strategies, composition, generators |
| [`03-experiment-backtest-evaluation.md`](03-experiment-backtest-evaluation.md) | Immutable specs, backtest, metrics, durable result path |
| [`04-search-and-leaderboard.md`](04-search-and-leaderboard.md) | Search loop, control, ranking, Top-K projection, observability |
| [`05-news-and-sentiment.md`](05-news-and-sentiment.md) | News collection, sentiment analysis, isolation |
| [`06-ui-and-demo-integration.md`](06-ui-and-demo-integration.md) | Remaining pages, signal/trade visualization, demo path |
| [`07-architecture-proof.md`](07-architecture-proof.md) | Which slices each `PROOF-*` needs, and what evidence to record |
