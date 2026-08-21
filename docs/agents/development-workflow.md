# Development Workflow

## Purpose

This document routes project work to the repository-local skills and records the inputs and gates each phase requires. It orchestrates existing methods; it does not replace their `SKILL.md` instructions.

Apply authority in this order:

1. [Frozen architecture baseline v1.1](../architecture/architecture-baseline.md).
2. [Accepted ADRs](../adr/).
3. [Official project sources](../requirements/), within the authority of each source.
4. Project coding and testing conventions established during implementation.
5. Agent judgment and generic skill guidance.

Architecture constraints apply in every phase. `FROZEN` means normative for implementation; evidence remains `PENDING IMPLEMENTATION PROOFS` until the [Architecture Proof Plan](../validation/architecture-proof-plan.md) is executed.

## Phase router

| Phase and trigger | Skill or method | Required authoritative input | Artifact produced | Validation or human gate | Next phase | Architecture / freeze constraint |
|---|---|---|---|---|---|---|
| **Research / problem**: a factual, requirements, technology, or API question is unresolved | `research`; add `pdf` only when PDF layout or visual meaning must be checked | A concrete question, the source that is authoritative for it, and relevant existing project decisions | A cited Markdown note only when the finding has durable project value; otherwise a direct answer | Use primary sources; distinguish facts, requirements, constraints, assumptions, and open questions | Specification or architecture conformance | Research may explain or challenge a decision but cannot silently override requirements, the baseline, or an accepted ADR |
| **Specification**: the user explicitly requests a feature specification after behavior is agreed | `to-spec`; use `codebase-design` as a reference when the public test seam is genuinely unresolved | User intent and product behavior, relevant official requirements, current code when present, baseline and ADR constraints, and proposed public test seams | A reviewable feature specification in the configured GitHub issue tracker | Confirm test seams with the user; tracker publication is an external write and requires an explicit user request; use `ready-for-agent` only if it already exists | Architecture conformance, then tickets | A specification may select behavior within the baseline; it must not hide a new boundary, ownership, communication, persistence, or topology decision |
| **Architecture conformance / deviation**: a spec or implementation choice touches a module interface, dependency direction, data ownership, communication path, deployment role, or hard-to-reverse decision | Use `codebase-design` for seams inside the frozen architecture; use `domain-modeling` only for a resolved term or explicitly approved ADR; `improve-codebase-architecture` remains manual-only after implementation exists | Proposed behavior/design, baseline section, related ADRs, affected problem and quality scenario, and concrete evidence | A conformance decision; or, when conflict exists, a deviation proposal with alternatives and consequences | Any deviation requires explicit architecture review; acceptance requires a superseding ADR, a new baseline version, and updated freeze metadata | Tickets when conforming; otherwise stop for review | Never rewrite accepted ADR history or patch the frozen baseline in place |
| **Implementation planning / tickets**: an approved specification is ready to split and the user requests planning or publication | `to-tickets` | Full approved specification and comments, relevant baseline/ADRs/proofs, current codebase, and [issue-tracker rules](issue-tracker.md) | User-approved tracer-bullet tickets with explicit blocking edges and acceptance criteria | The user approves granularity and dependencies; publishing issues is an external write and requires an explicit request; do not invent labels | Implement any ticket on the unblocked frontier | Prefer proof-oriented vertical slices; a ticket must not introduce an unreviewed architecture change |
| **TDD / implementation**: a separate user request explicitly authorizes application implementation | `implement` orchestrates `tdd`; apply `karpathy-guidelines`; consult `codebase-design` only if an agreed seam needs clarification | One approved spec/ticket, pre-agreed public test seams, current code, baseline, related ADRs, and affected proof definitions | The smallest working vertical slice, behavior tests, and necessary implementation documentation | Red before green at each seam; run targeted tests/type checks regularly, the full relevant suite at the end, governance checks, and affected architecture proofs; commit or push only on a separate explicit request | Code review | Preserve all frozen boundaries, ownership, contracts, dependency directions, delivery semantics, and process-role rules; stop on conflict |
| **Code review**: the user requests review of a non-empty implementation diff from a fixed point | `code-review` | A resolvable fixed point, non-empty three-dot diff, originating specification when available, and repository standards including baseline/ADRs | Separate Standards and Spec reports | Resolve or explicitly accept findings within each axis; no spec means the Spec axis is reported as unavailable, not invented | Architecture proof / validation or further implementation | Architecture conformance is part of the Standards axis; review does not authorize edits unless the user also asks for changes |
| **Architecture proof / validation**: an implementation slice claims a frozen property, or validation status may advance | The proof plan and repository test tooling; use `tdd` for executable proof seams, `diagnosing-bugs` for a failing proof, and `research` only for an unresolved external semantic claim | Exact `PROOF-*` definition, baseline/ADRs, build and dependency-lock identities, environment/hardware/configuration, and dataset/fixture identity | A proof-run record containing the evidence fields required by the proof plan | Satisfy the proof's pass evidence. A failure returns to the traced problem/scenario/decision and may require architecture review | Next ticket, accepted completion, or deviation review | `FROZEN` is not `PROVEN`; a failed proof never authorizes a silent code or document redesign |

### Bug and performance branch

When behavior is broken, throwing, failing, or slow, use `diagnosing-bugs` before choosing a fix. The required input is the exact user-visible symptom plus a reproducible environment or redacted artifact. Produce a tight red-capable loop, a minimized reproduction, and a falsifiable diagnosis. Add a fix and regression test only when the user request authorizes a fix, then resume review and any affected proof.

## Artifact conventions

Use existing strong examples before adding a template. Include only traceability fields that apply; never fabricate an identifier to fill a form.

| Artifact | Project convention | Template decision |
|---|---|---|
| Research note | State the question and source authority; cite primary sources beside claims; separate findings from assumptions, open questions, and project implications | No fixed template or directory yet. Create a note only for a real durable finding and match the repository location established at that time |
| Problem statement | Use hierarchical `P-*` branches that name a pressure without selecting technology, following the proposal's Problem Tree | The proposal is the example; do not create a second template |
| Quality scenario | Use `QA-*` with source, stimulus/environment, affected artifact, required response, and measurable outcome | The proposal's Quality Attribute Scenarios table is the example |
| Feature specification | Use the installed `to-spec` sections. Under Implementation Decisions, link applicable requirement, `P-*`, `QA-*`, baseline section, ADR, and intended `PROOF-*` | The installed skill is sufficient; no repository copy of its template |
| ADR | Follow the existing `ADR-NNN-*` structure: status, decision and related problem/scenario IDs, normative baseline, context, decision, alternatives, rationale, consequences, risks, evidence, revisit triggers, affected sections, and supersession | Existing accepted ADRs are the template and immutable history. New ADRs require explicit architecture approval |
| Architecture proof | Use the proof definition and Evidence conventions in the Architecture Proof Plan; retain the `PROOF-*` ID and link the resulting evidence from its implementation ticket or review record | The proof plan is authoritative; no separate template or evidence directory before implementation establishes one |
| Implementation ticket | Use the installed `to-tickets` issue format and add an **Architecture / proof trace** containing the applicable spec, baseline section, ADRs, and `PROOF-*` IDs | The installed skill plus this trace field is sufficient |
| Code review | Use the installed two-axis Standards / Spec report from a pinned fixed point; include the baseline and affected ADRs among standards sources | The installed skill is sufficient; no separate template |

The established architecture trace is:

```text
source / requirement -> P-* -> QA-* -> D-* -> ADR-* -> ARC-* -> PROOF-* -> implementation evidence
```

Ordinary feature work references the applicable portion of this chain. New architecture identifiers or changes enter only through explicit architecture review.

## Orchestration decision

Do not add a project-specific orchestration skill now. The pointer in `AGENTS.md`, this phase router, and the installed atomic skills provide sufficient selection guidance without duplicating skill logic. Reconsider only if future sessions repeatedly choose the wrong phase or skill despite these pointers, and obtain structural approval before adding one.
