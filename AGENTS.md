# Crypto Strategy Lab - Project Instructions

## Language and communication rules

- Chat/conversational responses: communicate with the user in Vietnamese. Use English only for proper nouns, technology names, or specialized technical terms where a Vietnamese translation would be confusing. Do not excessively mix English and Vietnamese in everyday sentences; keep the language natural and consistent to minimize the user's cognitive load.
- File generation/file outputs: any output intended to be saved as a file (code, documentation, configurations, etc.) must be written entirely in 100% English, using plain, basic, and simple vocabulary. Avoid complex, archaic, or overly formal words so the content stays accessible.

## Current mode

PROJECT MODE: IMPLEMENTATION AGAINST FROZEN ARCHITECTURE

ARCHITECTURE STATUS: FROZEN v1.1

VALIDATION STATUS: PENDING IMPLEMENTATION PROOFS

IMPLEMENTATION STATUS: NOT STARTED

Architecture baseline v1.1 is FROZEN with validation status PENDING IMPLEMENTATION PROOFS. Application work may begin only when a separate user request explicitly asks for implementation; frozen means normative, not empirically proven.

## Normative source hierarchy

1. `docs/architecture/architecture-baseline.md` (FROZEN v1.1)
2. Accepted ADRs in `docs/adr/`
3. Official project sources in `docs/requirements/`
4. Project coding and test conventions established during implementation
5. Agent judgment

## Architecture invariants

- Preserve the logical boundaries: API/Presentation, Market Data, Strategy, Experiment, and News Intelligence.
- Preserve each module's ownership, public contracts, and dependency directions.
- Domain logic depends on contracts/ports, never on exchange payloads, databases, queues, web frameworks, or UI code.
- Core backend and initial workers use Node.js + TypeScript; NestJS is limited to application composition and HTTP/WebSocket transport edges.
- Major logical modules map to explicit NestJS module/composition boundaries; cross-module access uses exported application/domain ports, never another module's repository, adapter, ORM model/repository, or private provider.
- BullMQ/Redis is the correctness delivery path for asynchronous work; Redis Pub/Sub is only best-effort live/UI notification after authoritative state or projection commit; PostgreSQL remains authoritative truth.
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
- Keep CPU-heavy backtests in separate BullMQ worker processes, never in NestJS request or WebSocket execution.
- Commit at ticket boundaries and review each ticket's coherent diff (`code-review` skill) before starting the next unblocked ticket. Committing and pushing still require a separate explicit user request (see the `implement` guardrail below).

### Active-work checkpoints

A ticket that spans more than one session uses a compact, local checkpoint instead of relying on the previous chat:

- **Ending an unfinished session:** if a named ticket is still unfinished, create or update `.scratch/checkpoints/<ticket-ref>.md` from `.scratch/checkpoints/TEMPLATE.md`. Capture only durable active-work state — decisions and assumptions already accepted, work already done, validation already run and its result, the current failure and suspected cause, blockers, and the exact next action. Never dump the conversation transcript.
- **Resuming:** when asked to continue a named ticket, read its checkpoint if one exists, inspect the current Git/worktree state, and re-read the authoritative ticket/spec as needed. Reconcile the checkpoint against that live state and continue from the next valid action rather than redoing prior reasoning.
- **Staleness:** the checkpoint is advisory active-work state, not authoritative architecture or requirement truth. When it disagrees with live Git or ticket state, trust the live state and update or delete the checkpoint. Delete the checkpoint once the ticket passes its normal review/acceptance boundary.

## Required verification

Run the repository governance validator after changing governance, architecture documents, ADRs, or project skills:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

During implementation, also run the relevant tests and the architecture proofs affected by the change. Proof definitions live in `docs/validation/architecture-proof-plan.md`.

## Agent skills

### Development workflow

For research, specification, architecture-conformance, ticketing, implementation, review, bug diagnosis, or architecture-proof work, follow `docs/agents/development-workflow.md`. It routes each phase to the installed skills and names the required authoritative inputs and gates.

### Issue tracker

Project specifications and tickets are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

This is a single-context repository. Read the frozen baseline, accepted ADRs, and official requirements before any optional glossary material. See `docs/agents/domain.md`.

### Installation and safeguards

- The canonical repository-local skill copy is `.agents/skills/`; `.claude/skills/` may contain generated links to that shared copy rather than duplicate files.
- Every installed project skill must be represented in `.agents/skill-manifest.yaml` and `.agents/skill-lock.yaml`.
- Do not install, upgrade, or execute a third-party skill before inspecting its instructions, scripts, dependencies, license, and pinned provenance.
- Matt Pocock skills are subordinate to this file, the frozen baseline, accepted ADRs, and the architecture deviation procedure.
- `improve-codebase-architecture` is MANUAL-ONLY and analysis-only unless the user separately authorizes a change. It may surface candidates but must not redesign the frozen architecture or override accepted ADRs.
- `domain-modeling` may refine project vocabulary, but it must use the existing `docs/adr/ADR-NNN-*` convention and architecture deviation procedure. It must not rewrite accepted ADRs or redefine frozen architecture decisions.
- `implement` runs only for an explicit implementation request and must not commit or push unless the user explicitly requests those Git actions.
