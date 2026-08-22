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

### 2026-08-22 — V1 — Docker Compose integration gate (no slice)

**Decisions**

- Two run paths are now explicit. Host `pnpm` commands stay the normal way to build a
  slice; Docker Compose is the authoritative way to assemble a whole product version.
  Nothing forces a command, a test, or a coding session into a container. The rule is
  declared once in `AGENTS.md` under "Local development and full-system integration".
- The version-completion gate lives in `VERSIONS.md` as "Compose integration gate
  (every version)", stated once instead of copied into six Definition-of-Demoable
  lists. It complements the existing tests, boundary tests, and `PROOF-*` evidence and
  replaces none of them.
- `DEMO-01` owns building the Compose path rather than a new slice. It already recurs
  as an exit criterion of every version, which is exactly what a topology that grows
  with the roadmap needs; a new slice would have needed its own recurrence rule and
  the growth would have scattered into `WS-03`, `MKT-06`, and `NEWS-02`. Its effort
  moved `S` to `M` to pay for the Dockerfile and the application services. Slice count
  is unchanged at 62 required.
- `CODING_STANDARDS.md` and `docs/agents/development-workflow.md` were deliberately
  left alone. The standards file records code conventions and says it never creates
  architecture rules; the workflow router routes phases to skills, and a version exit
  gate is not a phase. Stating the rule there would have created a third and fourth
  copy of it.
- The governance validator gained eight static checks only: `docker-compose.yml` must
  exist, and the rule must still be stated in `AGENTS.md`, `VERSIONS.md`, and
  `README.md`. It deliberately does not start Docker and does not compare Compose
  services against a version's role list, because `VERSIONS.md` is the only source for
  that mapping and any such check would false-fail throughout V1.

**Deviations / debt**

- The full-system path does not exist yet, by design. `docker-compose.yml` still
  starts PostgreSQL only, which is what the completed setup slices needed. Nothing is
  containerized until `DEMO-01`, because before `EXP-05` and `UI-04` there is no
  assembled system to bring up. The cost is that container problems surface late in
  V1; accepted, since containerizing an empty shell proves nothing.
- `.env.example` still carries `POSTGRES_HOST=localhost`, correct for the host path
  and wrong for a container reaching PostgreSQL by service name. `DEMO-01` resolves it
  by supplying the value in the Compose service rather than by editing `.env`.
- The V1-to-V6 role table in the gate is a summary, not a source. If the review of
  `deviation-proposal-001` rejects the deviation, `SETUP-08`, `WS-02`, and `EXP-12`
  move into V1 and V1's row gains Redis.

**Validation**

- Governance validator: 1020 checks, only the three pre-existing, unrelated findings
  about the untracked scratch directory.
- Negative tests: removing `docker-compose.yml` reports the missing required file;
  breaking each of the seven text anchors in `AGENTS.md`, `VERSIONS.md`, and
  `README.md` produces seven distinct named failures. All anchors restored afterwards
  and the validator returned to the three pre-existing findings.

**Problems worth remembering**

- `SETUP-01` through `SETUP-06` were not touched and their acceptance criteria were
  not rewritten. `SETUP-02` had already required the Compose file to be structured so
  later versions can add services without rewriting it, so this gate continues that
  slice rather than contradicting it.

### 2026-08-22 — V1 — `.env` is not loaded by any command (no slice)

**Problems worth remembering**

- Nothing in the repository loads `.env`. `dotenv` is not a dependency, `vitest.config.ts`
  declares no `env` block and no setup file, and `platform/config.ts` reads
  `process.env` directly. So copying `.env.example` to `.env` does not put the values
  anywhere a process can see them. `pnpm run test`, `pnpm run migrate`, and
  `pnpm run start:api` all need the variables exported into the shell first.
- The documentation says otherwise. The root `README.md` "Local setup" step 1,
  `.env.example`'s own header, and the comment at the top of `database.test.ts` all
  imply the copy is enough. On a clean checkout with Docker running,
  `pnpm run test` still fails with `Missing required environment variable
  "POSTGRES_HOST"` from `platform/config.ts`.
- Verified during this session: with PostgreSQL healthy but the variables only in
  `.env`, 1 test file fails and 31 of 33 tests run. After exporting `.env` into the
  shell, all 33 tests in 10 files pass. The code is correct; the documented path is
  incomplete.
- Left unfixed on purpose. `SETUP-02` and `SETUP-04` are `DONE`, and closing this
  means either adding a `.env` loader or correcting the documented commands, which is
  an implementation decision for the user rather than a silent edit to completed
  slices. Whoever picks it up should also decide which of the two paths in
  `AGENTS.md` it belongs to, since the Compose path will supply these values through
  service environment rather than through `.env`.
- This is exactly the class of gap the Compose integration gate exists to catch: every
  slice's own validation passed, and the assembled clean-checkout path still did not
  work.

**Validation**

- At `b55a9d4`: `pnpm run typecheck` and `pnpm run lint` clean; `pnpm run test` 33
  passed / 10 files with `.env` exported and PostgreSQL healthy; governance validator
  1020 checks with only the three pre-existing unrelated findings.
