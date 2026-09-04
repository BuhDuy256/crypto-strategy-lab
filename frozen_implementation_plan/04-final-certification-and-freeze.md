# FIN-06 - Final gate and freeze

**Status:** DONE · **Priority:** MUST · **Reasoning level:** Medium,
rising to High for real failures. XHigh only for a semantic regression inside
`FIN-01` — that is, one whose cause is in immutable specification content,
provenance, canonical hashing, or composite resolution.

Read [README.md](README.md) first. This runs once, after every other task. It is
the release gate, not an inner-loop command.

---

## Problem

Targeted validation proves a change did what it intended. It does not prove the
assembled system still works. Only the second question matters for a release.

This release deliberately did not run the repository-wide suite after each task.
That is a sound speed optimization with one consequence: regressions accumulate
silently until this point. That is exactly why this task exists and cannot be
skipped or partially performed.

---

## Ordered procedure

Nine steps. Cheap, high-information checks first.

### 1. Confirm the tree is final

Working tree clean, every intended change committed, on the intended branch.
Nothing below is meaningful about an uncommitted state.

### 2. Governance

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

Cheap and fast, and it catches broken links before any expensive step.

**Known local-only failure.** The validator scans the working tree, not the Git
index, and it fails when a discarded-material directory is present at the
repository root. At the time this plan was written, three such failures existed
locally from a git-ignored, untracked directory holding earlier audit notes. That
directory is not committed, so a clean checkout is unaffected. If those three
failures are the only ones reported, they are not release blockers. Any other
failure is. Confirm the count and the messages rather than assuming.

### 3. Repository-wide gate, once

Run the full typecheck, lint, and test gate.

**The one hard operational rule.** The suite resets the schemas of whatever
database its environment points at. Point it at a disposable database, never at
the database a live Compose stack is using and never at the protected main
database. Drop the disposable database afterwards. This has caused a real
incident in this project and the correct pattern is recorded in the project
journal; follow it rather than improvising.

If a live Compose stack is running, stop it first or ensure the environment
cannot reach its database.

### 4. Repair actual regressions

Fix, rerun, repeat until green. Two rules:

- Fix the cause, not the assertion. A test weakened to pass converts a known
  defect into an unknown one.
- If a failure reveals a real defect in `FIN-01`, that is a functional problem,
  not a test problem. Say so, and apply the stop-loss policy: fix or revert, as
  the owner decides.

### 5. Re-run PROOF-REP-001 against the generated-composite path

This is the only proof this release materially affects, because `FIN-01` changes
frozen specification content and therefore the canonical hash. Re-running it
against a generated composite also produces a stronger instance of the same
property.

**Do not re-run the other proofs by default.** `PROOF-CONTROL-001`,
`PROOF-REPLACE-001`, `PROOF-EXT-001`, `PROOF-RT-001`, `PROOF-PROVIDER-001`,
`PROOF-ISO-001`, and `PROOF-ISO-002` already have recorded PASS evidence at the
certified V5 baseline. Re-run one only if step 3 or step 4 exposed a regression
in the property it covers. Recertifying architecture for ceremony is not release
work, and Compose plus the canonical demo carry more evidence than re-running
unrelated proof scripts.

Record every proof actually re-run. Never record a proof as passing if it was not
executed.

### 6. Compose bring-up

From a clean checkout, bring up the topology through the documented command.
Confirm the expected V5 roles are present and healthy, and that no role belonging
to a later version has appeared. A queue worker or an outbox dispatcher here
would mean something was pulled in early.

### 7. Canonical demo end to end

Execute the `FIN-04` script end to end on that topology. Not a partial pass, and
not on host processes. The composite discovery step has never been demonstrated
before; give it real attention.

### 8. Manual visual sanity pass

Walk the demo screens. Confirm nothing looks broken and no control implies a
capability that does not exist. A non-critical cosmetic problem found here is
recorded, not fixed — do not reopen functional code unless it blocks the demo.

### 9. Synchronize state and report

Update `TRACKING.md` with the final commit, the date, and the gate result. Append
the `JOURNAL.md` entry. Record any proof evidence re-run. Where this contradicts
what `FIN-05` wrote, observed behavior wins.

Then report:

```text
FREEZE READINESS: <READY | NOT READY>

Gate results:
  governance         <pass/fail>
  repository suite   <counts, exit code>
  PROOF-REP-001      <pass/fail, composite instance>
  other proofs       <re-run only if a regression required it, or "none">
  compose bring-up   <pass/fail>
  canonical demo     <pass/fail>
  visual sanity      <pass/fail>

Definition of Demoable:
  A functionally demoable   <pass/fail, failing items named>
  B presentation demoable   <pass/fail>
  C architecture demoable   <pass/fail>
  D release demoable        <pass/fail>

Not done, and why:
  - <item>

Claims that must not be made:
  - <pointer to docs/final-defense-notes.md>
```

Then stop implementing and switch to defense preparation. Any budget left after
freeze readiness goes to rehearsal, not to dropped scope.

---

## Architecture constraints

- No coding agent creates a version tag. The freeze tag is an owner action.
- No coding agent advances the product version. It stays V5.
- Do not add V6 infrastructure to the Compose topology.
- Do not record a proof as passing unless it was executed in this session.

---

## Acceptance criteria

1. Governance passes, or fails only with the known local-only directory failures.
2. The repository-wide gate is green, run against a disposable database that was
   dropped afterwards.
3. `PROOF-REP-001` re-run and recorded, against a generated composite.
4. Compose comes up with the V5 role set and nothing later.
5. The canonical demo runs end to end on that topology.
6. All four Definition of Demoable sections assessed, with failing items named.
7. `TRACKING.md` and `JOURNAL.md` reflect reality at the final commit.
8. The freeze-readiness report is delivered.
9. No version tag created and the product version not advanced.

---

## Explicit non-goals

- No new features, however small. A change after the gate invalidates the gate.
- No opportunistic refactoring.
- No V6 work.
- No performance measurement, and therefore no scaling claim.
- No new proof definitions.
- No re-run of proofs this release did not materially affect.

---

## What failure of this task would imply

A red gate means one of two things, and distinguishing them matters.

If a targeted change broke something outside its own area, that is the expected
cost of the relaxed inner-loop policy and it is repairable. Repair it.

If the failure is in `FIN-01`, the honest options are to fix it or to revert the
functional closure and freeze with the limitation documented. A release that
throws during the demo is worse than a release with a stated, understood gap. The
choice is the owner's, with remaining time as the deciding factor.

Reporting a green gate that was not observed is not an option under any time
pressure.
