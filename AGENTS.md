# Crypto Strategy Lab - Project Instructions

## Language and communication rules

- Chat/conversational responses: communicate with the user in Vietnamese. Use English only for proper nouns, technology names, or specialized technical terms where a Vietnamese translation would be confusing. Do not excessively mix English and Vietnamese in everyday sentences; keep the language natural and consistent to minimize the user's cognitive load.
- File generation/file outputs: any output intended to be saved as a file (code, documentation, configurations, etc.) must be written entirely in 100% English, using plain, basic, and simple vocabulary. Avoid complex, archaic, or overly formal words so the content stays accessible.

## Current mode

PROJECT MODE: IMPLEMENTATION AGAINST FROZEN ARCHITECTURE

ARCHITECTURE STATUS: FROZEN v1.2

VALIDATION STATUS: PENDING IMPLEMENTATION PROOFS

IMPLEMENTATION STATUS: IN PROGRESS

CURRENT PRODUCT VERSION: V4

Architecture baseline v1.2 is FROZEN with validation status PENDING IMPLEMENTATION PROOFS. `FROZEN` means normative, not empirically proven.

`IMPLEMENTATION STATUS` and `CURRENT PRODUCT VERSION` are separate facts. The first says whether application work has begun at all. The second names the only product version an agent is authorized to build right now. Both are set by the user. A coding agent never advances either one, and never creates a version tag.

Implementation work is planned as versioned slices. The entry point for any coding session is [`implementation-plan/README.md`](implementation-plan/README.md); live slice state is [`implementation-plan/TRACKING.md`](implementation-plan/TRACKING.md).

## Normative source hierarchy

1. `docs/architecture/architecture-baseline.md` (FROZEN v1.2)
2. Accepted ADRs in `docs/adr/`
3. Official project sources in `docs/requirements/`
4. Project coding and test conventions in `CODING_STANDARDS.md`
5. Agent judgment

## Architecture invariants

- Preserve the logical boundaries: API/Presentation, Market Data, Strategy, Experiment, and News Intelligence.
- Preserve each module's ownership, public contracts, and dependency directions.
- Domain logic depends on contracts/ports, never on exchange payloads, databases, queues, web frameworks, or UI code.
- Core backend and initial workers use Node.js + TypeScript; NestJS is limited to application composition and HTTP/WebSocket transport edges.
- Major logical modules map to explicit NestJS module/composition boundaries; cross-module access uses exported application/domain ports, never another module's repository, adapter, ORM model/repository, or private provider.
- BullMQ/Redis is the mandatory V6 correctness delivery path. V1 through V5 may run backtests through the PostgreSQL-backed durable executor authorized by ADR-010, always in a separate runner process. Redis Pub/Sub is only best-effort live/UI notification after authoritative state or projection commit; PostgreSQL remains authoritative truth.
- Python is optional only behind the framework-independent `SentimentAnalyzer` boundary when a selected model/library provides a concrete benefit.
- Logical boundaries are not deployment boundaries. Do not create a new service merely to represent a module.
- Cross-process work is at-least-once. Consumers must be idempotent and duplicate-safe.
- Experiment and leaderboard results must remain traceable to the complete immutable experiment specification.
- News or sentiment failure must not stop market charts or technical backtesting.
- Frontend code must not contain strategy, backtest, evaluation, or ranking business logic.
- Do not introduce microservices, event sourcing, general CQRS, Kubernetes, or a service mesh without an explicit architecture review.

## Architecture deviation procedure

The frozen architecture baseline is normative.

Do not alter architectural boundaries, dependency directions, contracts, ownership, communication style, persistence ownership, deployment model, or major accepted architectural decisions silently.

If implementation reveals a conflict:

1. Stop the affected work.
2. Identify the conflicting baseline section and ADR/problem branch.
3. Describe the implementation conflict and why the baseline may be insufficient.
4. Propose alternatives with benefits, costs, risks, and migration consequences.
5. Request explicit architecture review.
6. If accepted, add a superseding ADR and create a new baseline version; never rewrite decision history.

## Source discipline

- Treat the project specification as authoritative for behavior and deliverables.
- Treat the lecture slides as architecture-method guidance and candidate examples, not mandatory technologies.
- Treat the sample UI images as authoritative only for visible layout, labels, and example flows.
- Classify unsupported numbers or deployment conditions as design assumptions, not requirements.
- Keep facts, requirements, constraints, assumptions, and open questions distinct.

## Implementation discipline

- Prefer the simplest implementation that satisfies the baseline.
- Add a strategy through the strategy contract and registry; do not add type-switch chains.
- Add a market/news provider through its provider port and normalized contract.
- Add a search method through `StrategyGenerator`; downstream experiment components must not change.
- Keep application modules in one codebase unless an accepted ADR explicitly permits a split.
- Never overwrite versioned strategy, dataset, model, engine, or experiment inputs used by completed runs.
- Make retries, cancellation, pause/resume, outbox publication, and projection updates observable and testable.
- Keep CPU-heavy backtests outside NestJS request and WebSocket execution: a separate PostgreSQL-backed runner process in V1 through V5, then separate BullMQ worker processes in V6.
- Follow `CODING_STANDARDS.md` for naming, TypeScript usage, module surfaces, error handling, logging, validation placement, migrations, tests, formatting, and commit messages. It records conventions this codebase already uses; it does not create architecture rules.
- Commit at slice boundaries and review each slice's coherent diff (`code-review` skill) before starting the next unblocked slice. Committing and pushing still require a separate explicit user request (see the `implement` guardrail below).

### Local development and full-system integration

Two run paths exist, and they answer different questions. Neither replaces the other.

- **Host development path.** Run services directly with `pnpm` or the repository's normal host commands whenever that is faster for coding, testing, debugging, hot reload, or focused slice work. This is the default while a slice is being built. Nothing requires a command, a test, or a coding session to run inside a container.
- **Full-system integration and demo path.** Docker Compose is the authoritative way to assemble a whole product version. Every completed version must bring up the complete process topology that version requires, from a clean checkout, through the documented Compose command.

```text
coding / debugging            -> host pnpm commands are allowed
integration / version demo    -> Docker Compose is the canonical full-system path
```

Three rules follow from that split:

- **A version is not integration-demo ready merely because host tests pass.** Its assembled topology must also come up through the documented Compose path. This is the Compose integration gate in [`implementation-plan/VERSIONS.md`](implementation-plan/VERSIONS.md), and it complements unit and integration tests, boundary tests, the Definition of Demoable, and architecture proofs rather than replacing any of them.
- **Version N must not start containers or services that belong only to a later version.** The Compose topology grows with the roadmap. Do not add Redis, BullMQ, outbox infrastructure, news services, or any other later-version machinery early just to have one large Compose file. `VERSIONS.md` is the only source for which roles a version requires.
- **Do not bypass the gate because the application worked on your own machine.** "It runs here" is not evidence about the assembled system, which is exactly the failure this gate exists to catch.

`DEMO-01` in [`implementation-plan/06-ui-and-demo-integration.md`](implementation-plan/06-ui-and-demo-integration.md) owns building and updating the Compose path, once in V1 and then as an exit criterion of every later version. Compose validation evidence is recorded through the existing `TRACKING.md` and `JOURNAL.md` conventions; there is no separate log.

### The implementation work unit

For Crypto Strategy Lab implementation, **the plan slice is the work unit**. Do not run `to-tickets` over a slice: the slice already carries an outcome, dependencies, architecture constraints, acceptance criteria, and validation. Mirror one slice into a GitHub issue only when the user explicitly asks for tracker visibility, and then one issue per slice. `to-spec` and `to-tickets` remain available for work that is not a planned slice.

### Session flow

A coding session starts here:

```text
AGENTS.md
  -> implementation-plan/README.md
    -> implementation-plan/TRACKING.md (current target version, next allowed action)
      -> that version's entry in implementation-plan/VERSIONS.md
        -> implementation-plan/JOURNAL.md, when history explains the current state
          -> verify Git, code, and tests against what the tracker claims
            -> take one READY slice inside the current target version
```

A coding session ends here:

```text
run the slice's validation
  -> update TRACKING.md (status, evidence, readiness promotion, header fields)
    -> append a JOURNAL.md entry when the session produced durable history
      -> write .scratch/checkpoints/<slice-id>.md only if a slice is left unfinished
        -> stop
```

### Version authorization

**Being assigned V(N+1) does not authorize implementing V(N+1).** Authorization comes from repository state, never from an instruction alone.

Before starting a new product version, verify from the repository that V(N) actually passed:

1. every required slice of V(N) is `DONE` in `TRACKING.md` **and** present in code;
2. every condition in V(N)'s Definition of Demoable in `VERSIONS.md` passes;
3. V(N)'s demo scenario runs end to end on a clean checkout, on the topology brought up through the documented Docker Compose path;
4. V(N)'s required architecture proofs/evidence are recorded;
5. Git, code, and tests agree with what the tracker claims.

If any of the five fails, refuse and report in this shape:

```text
V(N+1) NOT AUTHORIZED

Previous version:
  <V(N)>, <its real state>

Missing:
  - <what is not done, per condition>

Current READY work:
  - <READY slices inside the current target version, or "none">
```

A coding agent never creates a version tag and never advances `CURRENT PRODUCT VERSION`. Both remain explicit user decisions.

### Active-work checkpoints

Work that spans more than one session uses a compact, local checkpoint instead of relying on the previous chat. The file is named for the work it tracks: `<slice-id>` for a planned slice, the ticket reference for work outside the plan.

- **Ending an unfinished session:** if the named work is still unfinished, create or update `.scratch/checkpoints/<slice-id>.md` from `.scratch/checkpoints/TEMPLATE.md`. Capture only durable active-work state — decisions and assumptions already accepted, work already done, validation already run and its result, the current failure and suspected cause, blockers, and the exact next action. Never dump the conversation transcript.
- **Resuming:** when asked to continue named work, read its checkpoint if one exists, inspect the current Git/worktree state, and re-read the authoritative slice or spec as needed. Reconcile the checkpoint against that live state and continue from the next valid action rather than redoing prior reasoning.
- **Staleness:** the checkpoint is advisory active-work state, not authoritative architecture or requirement truth. When it disagrees with live Git or slice state, trust the live state and update or delete the checkpoint. Delete the checkpoint once the slice passes its normal review/acceptance boundary.
- **Not durable across people:** `.scratch/checkpoints/*.md` is git-ignored, so it never reaches another team member. When a session ends with a slice unfinished, the parts that others need must also exist in tracked state: set the slice to `IN_PROGRESS` in `TRACKING.md` with one line saying where it stopped, and put any decision, deviation, or problem that outlives this session into `JOURNAL.md`. Do not copy checkpoint detail into either file.

## Required verification

Run the repository governance validator after changing governance, architecture documents, ADRs, or project skills:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

During implementation, also run the relevant tests and the architecture proofs affected by the change. Proof definitions live in `docs/validation/architecture-proof-plan.md`.

## Agent skills

### Development workflow

For research, specification, architecture-conformance, implementation, review, bug diagnosis, or architecture-proof work, follow `docs/agents/development-workflow.md`. It routes each phase to the installed skills and names the required authoritative inputs and gates.

For building a planned slice, the plan is the entry point: `implementation-plan/README.md`, then `implementation-plan/TRACKING.md`. The router says which skill each phase uses; the plan says which work is authorized.

### Issue tracker

Project specifications and tickets are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Read the frozen baseline, accepted ADRs, and official requirements before any optional glossary material. See `docs/agents/domain.md`.

### Installation and safeguards

- `.agents/skills/` is the canonical skill set. Edit a skill there and nowhere else.
- `.claude/skills/` and `.codex/skills/` are committed mirrors of it, so a clone needs no setup step and Claude Code and Codex load the same skills. **Change a skill in all three, in the same commit**, then update `treeSha256` in `.agents/skill-lock.yaml`. The governance validator hashes each mirror against the canonical tree and fails on any drift or missing mirror, so this is enforced, not a convention to remember.
- **If your assistant has no skill system:** every skill is plain Markdown at `.agents/skills/<name>/SKILL.md`. When `docs/agents/development-workflow.md` names a skill for the phase you are in, open that file and follow it. Say which skill you read. Never invent a substitute method for a named skill, and never guess what a skill says without opening it.
- Every installed project skill must be represented in `.agents/skill-manifest.yaml` and `.agents/skill-lock.yaml`.
- Do not install, upgrade, or execute a third-party skill before inspecting its instructions, scripts, dependencies, license, and pinned provenance.
- Matt Pocock skills are subordinate to this file, the frozen baseline, accepted ADRs, and the architecture deviation procedure.
- `improve-codebase-architecture` is MANUAL-ONLY and analysis-only unless the user separately authorizes a change. It may surface candidates but must not redesign the frozen architecture or override accepted ADRs.
- `domain-modeling` may refine project vocabulary, but it must use the existing `docs/adr/ADR-NNN-*` convention and architecture deviation procedure. It must not rewrite accepted ADRs or redefine frozen architecture decisions.
- `implement` runs only for an explicit implementation request and must not commit or push unless the user explicitly requests those Git actions.
