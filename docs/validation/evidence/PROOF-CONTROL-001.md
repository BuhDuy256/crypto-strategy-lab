# PROOF-CONTROL-001 - Pause / Resume / Cancel / Stop Evidence

## Result

**PASS** on 2026-08-26, in the V3 PostgreSQL-executor realization. Every stop
condition ends a run, every control transition (pause, resume, cancel) works and
converges to the requested settled state rather than an optimistic one, durable
state survives a coordinator restart mid-transition, and running-candidate
behavior is cooperative and observable. This proof is re-run in V6 against the
BullMQ realization (SEARCH-07); the state machine and durability semantics proven
here are the ones that realization must preserve.

## Architecture trace

- Baseline: FROZEN v1.2, validation status `PENDING IMPLEMENTATION PROOFS`.
- Trace: P-2.4 -> QA-CTRL-001 -> D-05 -> ADR-004.
- Proof definition: `docs/validation/architecture-proof-plan.md`,
  `PROOF-CONTROL-001`.

## Code and dependency identity

- Base commit: `975ce6ac09f46e4dad8b40889363c0aae182ea64` (`feat(v3): done UI-03`).
- Version tag: none; the Project Owner has not created `v3.0-demo`.
- The proof ran on the implementation worktree. No commit or tag was created;
  Git actions require separate owner approval.
- pnpm lock SHA-256:
  `e37cb2406761a8c2e119990792f2c7f48f381c5188bff777cba8ac7a6fb29c54`.

## Environment and configuration

- OS: Windows_NT 10.0.26200.
- CPU: 11th Gen Intel(R) Core(TM) i5-11400F @ 2.60GHz.
- Memory: 17,042,784,256 bytes.
- Node.js: v25.9.0.
- PostgreSQL: `postgres:16-alpine`, Docker Compose service healthy, host port 5433.

## What the proof requires, and where each part is exercised

The control behavior is durable state in PostgreSQL, driven by the search
coordinator; the loop is not the source of truth, so a fresh coordinator
(modelling a process restart) recovers from the durable ledger. Each required
behavior is exercised by a named integration test against real PostgreSQL.

Stop conditions (`search-coordinator.test.ts`):

- Max candidate count - "stops after the maximum candidate count".
- Max duration - "stops after the maximum duration".
- No improvement - "stops after no improvement for the configured number of
  iterations".

User control transitions (`search-coordinator.test.ts`):

- Pause converges only after in-flight work drains - "pauses new submission and
  reports paused only after in-flight work drains".
- Resume continues from durable state with no duplicated candidates - "resumes
  from durable state after a pause without duplicating candidates".
- Cancel stops new submission, terminates pending work, and keeps completed
  results - "cancels new submission, terminates pending work, and keeps completed
  results".
- An illegal transition is rejected - "rejects an illegal control transition".

Durable state survives a coordinator restart, and dispatch converges to the
requested state (`search-coordinator.test.ts`):

- "converges a pause in progress after a coordinator restart".
- "converges a cancel in progress after a coordinator restart".
- "resumes from durable state after a coordinator restart without duplicating
  candidates".

Running-candidate behavior is cooperative and observable
(`search-coordinator.test.ts`):

- Cancel signals a running candidate cooperatively rather than killing it -
  "records the cooperative cancellation signal on a running candidate".
- A run abandoned by a dead runner is reclaimed and completes - "recovers a run
  abandoned by a dead runner and lets it complete"; the sweep is idempotent -
  "makes the stale-claim sweep idempotent".
- Progress is a complete, queryable snapshot - "submits generated candidates and
  reports progress".

API-process restart recovery (`search-experiment-host.test.ts`):

- On start the host relaunches a driving loop for every run still active in durable
  state - "relaunches a driving loop for every active run on resume-all"; resume
  and cancel relaunch the loop; pause needs no second loop; only one loop runs per
  experiment.

Transport mapping of the control endpoints (`search.controller.test.ts`): pause,
resume, and cancel map to the converging snapshot and to 409/404 as appropriate.

## Commands and automated evidence

```powershell
pnpm exec vitest run `
  apps/backend/src/modules/experiment/application/search-coordinator.test.ts `
  apps/backend/src/modules/experiment/application/search-experiment-host.test.ts `
  apps/backend/src/modules/api/search.controller.test.ts
```

Result: 31 tests passed across the three files (17 + 5 + 9). Full suite at the time
of the proof: 364/364 across 69 files, typecheck green across all three packages.

## Note on the requested-vs-converged distinction

The proof's "new dispatch converges to the requested state" is realized as a
durable status machine: `running -> pausing -> paused` and
`running|pausing|paused -> cancelling -> cancelled`. The transitional state is
written first and the coordinator converges toward the settled state inside its
tick, which is exactly why a restart mid-transition recovers and why the interface
shows the converged state, never an optimistic one. Broker/worker controls do not
define domain state (ADR-004); a running candidate is signalled cooperatively and
stops at the runner's existing safe checkpoint.
