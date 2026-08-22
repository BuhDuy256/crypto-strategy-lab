# Implementation Journal

Durable history of implementation sessions, one section per product version, newest
entry last inside its version.

Read [`README.md`](README.md) first. Current state is in [`TRACKING.md`](TRACKING.md);
this file is why the current state looks the way it does.

## What belongs here

Only what a later team member cannot cheaply reconstruct from `TRACKING.md`, Git, or
the code:

- an implementation decision that closes an open choice, especially one that differs
  from the plan's recommended default;
- a deviation or piece of technical debt handed forward, and what would repay it;
- a validation or proof result that matters beyond the session that ran it;
- a problem that is likely to resurface, with what was learned about it;
- the ending state of the session, and the commit it corresponds to.

## What must never go here

- prompts, AI output, transcripts, or reasoning traces;
- every command that was run;
- temporary compile or debug errors that were fixed in the same session;
- slice definitions, acceptance criteria, or dependencies — those live in the area
  plan files and never move;
- per-slice status — that is `TRACKING.md` and only `TRACKING.md`;
- detailed unfinished-task state — that is `.scratch/checkpoints/<slice-id>.md`,
  which is local and git-ignored. Put only the part others need here.

If an entry restates something already in `TRACKING.md`, delete it from the entry.

## How to write an entry

Append; do not rewrite history. Correct an earlier entry with a new one that says
what changed and why. Keep an entry to roughly fifteen lines. Write only the fields
that have something to say, in this order:

```markdown
### YYYY-MM-DD — <version> — <slices worked on>

**Decisions**
- <choice made, and the reason it beat the alternative>

**Deviations / debt**
- <what was left imperfect, what would repay it, what it blocks if anything>

**Validation**
- <what was run, and the result>

**Problems worth remembering**
- <what is likely to resurface>

**Ending state**
- <where the work stopped, and the commit>
```

A session that only moved slices through their normal path, with no decision, no
deviation, and no surprise, does not need an entry. `TRACKING.md` already covers it.

---

## V1 - Backtesting Lab

### 2026-08-22 — V1 — SETUP-01 through SETUP-06

**Decisions**

- Database access is the `pg` client plus a hand-rolled SQL-first migration runner,
  not Drizzle or Kysely as `00-setup-and-walking-skeleton.md` recommends. Plain SQL
  files and a small runner keep module-owned schemas visible and avoid pulling a
  query builder in before any table exists. Revisit when real query surfaces arrive
  (`MKT-03` onward); the seam is `platform/database.ts`, so a builder can be adopted
  without touching domain code.
- Architecture boundary enforcement is a hand-rolled regex import scanner plus a pure
  rule engine, run as an ordinary Vitest test, rather than a lint plugin. It keeps
  the six rules readable in one file and each rule independently testable.
- Vitest, pnpm workspaces, Vite + React, and `lightweight-charts` follow the plan's
  recommended defaults; no deviation to record.

**Validation**

- Whole stack brought up together after all six slices: `pnpm install`,
  `typecheck`, `lint`, `test` (33 tests / 10 files, database-backed included) pass.
- PostgreSQL reaches healthy; a row survives a container restart and a full recreate.
- Config fail-fast proven by unsetting `POSTGRES_HOST`.
- `migrate` from empty creates exactly the four module schemas; a second `migrate` is
  a no-op; `migrate:reset` empties the database; re-`migrate` restores it.
- API starts without PostgreSQL; `/health` returns `{"status":"ok"}`; request id is
  generated when absent and preserved when supplied; clean SIGTERM shutdown.
- Each of the six boundary rules proven with a temporary violating fixture, then
  reverted; tree confirmed clean afterwards.
- SPA serves all five routes, proxies `/api/health`, and builds for production.
- Governance validator: one finding, the pre-existing untracked scratch directory at
  the repository root, unrelated to any `SETUP-*` slice.

**Problems worth remembering**

- The untracked scratch directory at the repository root (holding earlier workflow
  analyses) predates this work and fails the governance validator by design. Delete
  it, or move what is worth keeping into `docs/`, to get a clean validation pass.

**Ending state**

- All six V1 setup slices `DONE`, committed as `a46dd38`. `MKT-01` and `STRAT-01`
  are the next `READY` slices. No slice left unfinished, so no checkpoint exists.

### 2026-08-22 — V1 — repository workflow governance (no slice)

**Decisions**

- Team handoff state stays in `TRACKING.md` rather than a separate handoff file, to
  avoid a second competing status artifact. `JOURNAL.md` was added for durable
  history only, which nothing previously owned.
- `.claude/skills/` stays a local runtime representation of the canonical, tracked
  `.agents/skills/`. Skill content is not duplicated into Git; the governance
  validator now fails when the Claude-side representation is missing, so an
  under-equipped environment is reported instead of silently degrading.
- Two governance-validator defects were fixed because they hid the rules above. It
  scanned `node_modules` for obsolete process references (false positives), and it
  gated its entire deep-check block on *any* earlier failure, so one unrelated
  finding silently skipped roughly 800 checks. The gate is now missing required
  files only. Check count went from 34 reported to 858 actually run.

**Deviations / debt**

- `IMPLEMENTATION STATUS` was `NOT STARTED` in `AGENTS.md` and `README.md`, and the
  governance validator pinned that exact string, while six slices were already
  complete. Status vocabulary is now `IN PROGRESS` plus a separate
  `CURRENT PRODUCT VERSION`, so advancing a version no longer requires changing
  vocabulary. Both remain user-set; no agent advances them.

**Ending state**

- Governance and workflow documents updated. No application code touched.
