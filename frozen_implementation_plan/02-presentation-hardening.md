# FIN-03 - Demo-surface presentation hardening

**Status:** NOT STARTED · **Priority:** MUST, observed breakage only ·
**Reasoning level:** Medium

Read [README.md](README.md) first. This is demo hardening, not frontend cleanup.
It is also the task most likely to break something that works, so its constraints
are tighter than its size suggests.

---

## Goal

**Canonical demo surfaces have no obvious visible layout breakage.**

That is the whole goal. It is deliberately not "every class has a CSS rule" and
not "no Tailwind-like class remains anywhere". A dead class on a screen nobody
opens during the demo costs nothing and is not release work.

---

## Start by looking, not by reading

The static class audit below is background, not a backlog. Turning it into a
worklist is how this task swallows an afternoon.

Before changing anything:

1. Run the application.
2. Open the canonical demo screens with real data.
3. Write down the concrete visible breakage you actually see.
4. Fix only what is on that list and release-relevant.

A class that resolves to nothing but produces an acceptable-looking screen is not
a release problem. Judge on screen.

No screenshot-diff and no pixel-matching workflow.

---

## Background: what the static audit found

Two defects, both verified in live code at commit `2b751f0`.

**Dead utility classes.** Four files are authored in Tailwind utility classes and
Tailwind is not installed: no `tailwindcss`, `postcss`, or `autoprefixer` in
`apps/web/package.json`, no Tailwind entry in `pnpm-lock.yaml`, no
`tailwind.config.*` or `postcss.config.*` anywhere. Every one of those class
names resolves to nothing.

| File | Utility-class attributes |
|---|---|
| `apps/web/src/pages/StrategyEnginePage.tsx` | 73 |
| `apps/web/src/components/ChartWidget.tsx` | 21 |
| `apps/web/src/components/GenericParameterForm.tsx` | 9 |
| `apps/web/src/pages/RealtimePage.tsx` | 7 |

The visible consequence on Realtime is concrete: the intended two-by-two chart
grid is expressed as a Tailwind grid, so the four charts stack in a single
column, and the fixed chart height is also dead.

**Undefined semantic classes.** `BacktestPage.tsx` and `DiscoveryPage.tsx` use
nineteen semantic class names with no rule in `apps/web/src/index.css`:

```text
assumptions-panel   configuration-panel  controls            detail-provenance
detail-trades       discovery-page       entry-detail        error
leaderboard-heading leaderboard-panel    metrics             pagination
progress-counts     progress-panel       results-panel       run-status
search-space        strategy-option      trades-table
```

These are the two most important screens in the demo and the least styled.

---

## Why this matters

Every mandatory behavior already works; the frontend is functionally much
stronger than it looks. In a live defense the visible surface is the only
evidence most of the room processes in real time, and an unstyled screen reads as
an unfinished screen.

The reverse is the reason for the constraints: a polished screen with a broken
control is worse than an ugly screen that works. Presentation work at this stage
is pure downside risk if it touches behavior.

---

## Priority order

**MUST**

1. **Discovery** — readable, and clearly exposing composite discovery. This is
   the screen that carries the one new capability in the release.
2. **Realtime** — visibly presents the required four-chart experience, preferably
   two-by-two at a normal demo viewport, at a usable chart height.

**CONDITIONAL MUST**

3. **Backtest** — only if it is visibly broken or unreadable in the actual
   browser. If it already reads acceptably, do nothing to it.

**STRETCH**

4. **Strategy Engine** — beyond what the manual composite flow needs to operate.
5. **Shell and navigation** polish.
6. **News** polish.
7. Dead-class cleanup anywhere.

**Demo checkpoint.** Once the MUST surfaces are usable, stop styling. Not once
the list below is empty.

---

## Mechanism

**Use the existing CSS approach. Change the smallest surface necessary.**

`index.css` already defines a coherent semantic vocabulary for the shell, health
indicators, News, and charts. Extend it. Match the existing visual language; do
not invent a second one.

Installing Tailwind is rejected: it adds three dependencies and build
configuration to the release-day critical path, and its base layer resets element
styling globally, so it would restyle every currently working screen as a side
effect. Inline styles are rejected: that would be a third styling system in the
same application.

Do not introduce any other styling system. If the existing approach turns out to
fail for a concrete reason, say so and stop rather than switching halfway.

---

## Dependencies

`FIN-01` and `FIN-02`. `FIN-02` edits `DiscoveryPage`, which is also the first
page in the priority order. Styling it first means styling it twice, and the
second pass over a page is where a working control gets broken by accident.

---

## Expected change surface

Frontend only.

| Area | Expected change |
|---|---|
| `apps/web/src/index.css` | Rules for the class names behind observed breakage on Discovery, plus rules for anything introduced when Realtime's dead utilities are replaced. |
| `RealtimePage.tsx`, `ChartWidget.tsx` | Replace the dead grid and height utilities with real CSS. Preserve every `data-*` attribute exactly. |
| `DiscoveryPage.tsx` | Markup changes only where a rule needs a hook. Prefer writing rules for the class names that already exist. |
| `BacktestPage.tsx` | Only if visibly broken in the browser. |
| `StrategyEnginePage.tsx`, `GenericParameterForm.tsx`, `AppShell.tsx` | Only if visibly broken. |

---

## Architecture constraints

- No business logic enters the frontend. No metric, profit figure, win count,
  score, or rank may be computed in React. A styling pass is a tempting place to
  add a small calculation and it must not happen.
- Preserve every `data-*` attribute on `ChartWidget` and the chart components.
  `PROOF-RT-001` reads them. Breaking one silently invalidates recorded evidence
  and turns a cosmetic task into an evidence task.
- Preserve every accessible name, `aria-label`, `role`, and heading association.
- Do not add any control for a capability the backend lacks.
- Do not restructure routing or component boundaries.

---

## Acceptance criteria

1. Discovery is readable and clearly exposes composite discovery.
2. Realtime shows four charts, preferably two-by-two, at a usable height.
3. Backtest is readable, either because it was fixed or because it never needed
   fixing.
4. No screen used in the canonical demo has obvious visible layout breakage.
5. Every `data-*` attribute present before this task is still present.
6. No behavior changed.

---

## Targeted validation

- Manual visual pass over the demo screens against a running backend, so real
  data states appear rather than empty ones. This is the primary validation.
- Typecheck the web package if markup was edited.
- Run a frontend test file only if behavioral markup actually changed. A pure CSS
  change needs no test run.

Do not write CSS tests. Do not assert class names in tests. Do not run the whole
frontend suite for a styling change. Do not run the repository-wide suite here.

---

## Explicit non-goals

- No reproduction of the sample images. They are authoritative only for visible
  layout, labels, and example flow.
- No sidebar, logo, account card, settings screen, or subscription block.
- No new metric tiles, sparklines, or currency figures.
- No new page, route, or component.
- No animation, theming system, or design-token layer.
- No dependency added.
- No broad CSS cleanup. No sweep for dead classes outside the demo surfaces.

---

## Documentation and proof impact

None, provided criterion 4 holds. Nothing here touches a decision. The demo
script may reference screens by their final appearance; that is `FIN-04`.

---

## What failure of this task would imply

Nothing technical. Every requirement stays satisfied and every proof stays valid.
The cost is entirely in the room: functionally complete screens that read as
unfinished, and an examiner forming an impression from the weakest available
signal.
