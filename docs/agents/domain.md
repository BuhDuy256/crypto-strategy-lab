# Domain docs

This repository uses a single project context. Agent workflows must consume domain and architecture information in the existing normative order rather than treating an optional glossary as a competing source of truth.

## Before exploring or changing the project

Read the sources relevant to the work in this order:

1. `docs/architecture/architecture-baseline.md` — frozen architecture baseline v1.2.
2. Accepted ADRs in `docs/adr/` that touch the area.
3. Official project sources in `docs/requirements/`.
4. `CONTEXT.md`, if it exists, for project vocabulary only.

`CONTEXT.md` is optional and should be created lazily only when a real terminology gap is resolved. It must not redefine a requirement, accepted ADR, or frozen architecture decision.

## Architecture and ADR guardrails

- Architecture friction is handled through the architecture deviation procedure in `AGENTS.md`.
- A skill that finds an ADR conflict must stop the affected change, identify the conflict, and request explicit architecture review.
- New architecture decisions use the repository's existing `docs/adr/ADR-NNN-*` format and are added only after explicit approval.
- Accepted ADRs are historical decision records. Supersede them; do not rewrite them.
