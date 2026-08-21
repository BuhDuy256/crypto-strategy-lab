# Project Skill Evaluation

Evaluation date: 2026-08-21

Discovery covered the OpenAI curated index at commit `49f948faa9258a0c61caceaf225e179651397431`, the repository's existing skills, and bounded GitHub searches for ADR, C4, and software-architecture agent skills. The OpenAI experimental index did not exist at the pinned revision. Broad external searches did not yield a precise, sufficiently trustworthy architecture workflow, so no third-party catalog skill was installed.

## Decisions

| Name | Source / version | License | Purpose and relevance | Compatibility | Scripts / dependencies | Security considerations | Destination | Decision |
|---|---|---|---|---|---|---|---|---|
| `karpathy-guidelines` | Existing repository input; repository commit `fde223be44a322eb192dd6f39fa9f3cdadd55e72`; original upstream unknown | MIT (declared in skill) | Later implementation discipline: simplicity, explicit assumptions, surgical changes, verification | Codex and Claude instruction format | Instruction-only; no dependencies | No scripts or tools. Upstream provenance is incomplete, so upgrades are prohibited until a source is identified. | `.agents/skills/karpathy-guidelines`, `.claude/skills/karpathy-guidelines` | Retain and mirror |
| `pdf` | `openai/skills`, `skills/.curated/pdf`, commit `49f948faa9258a0c61caceaf225e179651397431` | Apache-2.0 | Required to extract and visually inspect the two authoritative PDFs | Codex and Claude | No scripts. Recommends Poppler and `pdfplumber`; both were already available. | All files were inspected at the pinned commit. No executable content; no new dependency was installed. | `.agents/skills/pdf`, `.claude/skills/pdf` | Install |
| `security-threat-model` | `openai/skills`, `skills/.curated/security-threat-model`, commit `49f948faa9258a0c61caceaf225e179651397431` | Apache-2.0 | Potential security architecture review | Codex and Claude | Instruction-only; two Markdown references; no scripts | Requires a separate assumption-validation pause and explicitly says not to trigger for general architecture work. Using it here would exceed its declared scope. | None | Reject for bootstrap; reconsider only on an explicit threat-model request |

## Deferred categories

- `security-best-practices`: defer until application technologies and implementation code exist; a bootstrap-only repository has no code surface to review.
- Browser/UI automation skills: defer until a runnable frontend exists.
- CI repair and code-review automation skills: defer until CI and application code exist.
- External ADR/C4 skills: defer. The bounded search produced broad catalogs rather than a precise, pinned, clearly licensed workflow that improved on the mandatory bootstrap process.

No skill recommendation is treated as an architectural justification. Architectural decisions remain traceable to project sources, scenarios, forces, and trade-offs.
