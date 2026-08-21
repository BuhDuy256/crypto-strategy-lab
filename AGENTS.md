# Crypto Strategy Lab - Project Instructions

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

## Required verification

Run the repository governance validator after changing governance, architecture documents, ADRs, or project skills:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-repo-governance.ps1
```

During implementation, also run the relevant tests and the architecture proofs affected by the change. Proof definitions live in `docs/validation/architecture-proof-plan.md`.

## Project skills

- Codex project skills live under `.agents/skills/`.
- Claude project skills live under `.claude/skills/`.
- Every installed project skill must be represented in `.agents/skill-manifest.yaml` and `.agents/skill-lock.yaml`.
- Do not install, upgrade, or execute a third-party skill before inspecting its instructions, scripts, dependencies, license, and pinned provenance.
