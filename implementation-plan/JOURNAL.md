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

### 2026-08-22 — V1 — cross-tool agent support (no slice)

**Decisions**

- Shared policy stays in `AGENTS.md` alone, for every assistant, not only Claude Code
  and Codex. A tool that reads its own instruction file is pointed at `AGENTS.md`
  instead of getting a copy; duplicated policy drifts and then two members' assistants
  follow different rules.
- Skills get a tool-independent fallback: every skill is plain Markdown at
  `.agents/skills/<name>/SKILL.md`, and an assistant with no skill system opens the
  file the phase router names. No per-tool skill wiring was added.

**Deviations / debt**

- `README.md` claimed "Codex reads `.agents/skills/` directly and needs no bootstrap
  step". That was never verified and is probably wrong: `.codex/` holds only
  `config.toml`, there is no `.codex/skills/`, and the manifest's `codex: true` records
  content compatibility, not a discovery mechanism. The claim is removed.

**Problems worth remembering**

- **Open question:** how Codex CLI actually discovers project skills, and whether it
  needs its own bootstrap like `.claude/skills/`. Until someone answers it, assume
  Codex loads no skill automatically and relies on the plain-Markdown fallback. The
  governance validator checks the Claude side only; extending it to Codex depends on
  that answer.

**Ending state**

- `AGENTS.md`, `README.md`, `CLAUDE.md`, and the validator's bootstrap hint updated.
  Validator: 858 checks, only the pre-existing untracked scratch directory reported.

### 2026-08-22 — V1 — skills committed for both assistants (no slice)

Supersedes the two entries above on how skills are distributed. Their reasoning about
avoiding duplication no longer applies; the decision below replaces it.

**Decisions**

- Skills are now committed three times: `.agents/skills/` canonical, plus mirrors at
  `.claude/skills/` and `.codex/skills/`. A clone needs no setup step and both
  assistants load the same set. This closes the open Codex question without answering
  it: `.codex/skills/` is where Codex looks, so how it discovers skills stopped
  mattering.
- Duplication was accepted because the drift objection is handled by tooling, not by
  discipline. The lock already carried a per-skill `treeSha256` over LF-normalized
  content; the validator now recomputes it for each mirror and fails on any drift or
  missing mirror. Cross-platform safe, because the hash normalizes line endings.
- The earlier design (canonical plus local links) was rejected on one concrete
  failure: the links were absolute paths into this machine's checkout, so moving or
  renaming the repository directory broke all twelve silently. A per-clone bootstrap
  step is also a step a teammate will skip.
- The lock and manifest were unified on one scheme, `canonicalDestination` plus
  `mirrors` plus `treeSha256`. The per-file `destinationHashes` variant that only
  `karpathy-guidelines` and `pdf` used is gone; those two now carry tree hashes like
  every other skill.

**Deviations / debt**

- Cost accepted: editing a skill means editing three copies plus one lock hash.
  Acceptable because these skills are pinned to upstream commit `0ab1b63` and are not
  expected to change during this project. If they start changing often, write a small
  sync script rather than relaxing the check.
- `.claude/skills/karpathy-guidelines/SKILL.md` was CRLF while the canonical copy was
  LF, so the two were never byte-identical. Re-copying from canonical fixed it. The
  tree hash normalizes line endings, so this class of mismatch cannot fail the build
  spuriously again.

**Validation**

- Governance validator: 1000 checks, only the pre-existing untracked scratch directory
  reported. All 14 `treeSha256` values verify against the canonical trees.
- Negative tests: appending a line to `.codex/skills/tdd/SKILL.md` reports that mirror
  out of sync; removing `.claude/skills/research` reports the skill missing and names
  the assistant that will not load it.

**Ending state**

- 14 skills, 43 files each, identical across all three trees (`diff -r` clean).
