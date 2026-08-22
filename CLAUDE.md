@AGENTS.md

## Claude Code delta

- Load project skills from `.claude/skills/`. Those entries are local links to the canonical `.agents/skills/` copies; a fresh clone has to bootstrap them once (see `README.md`, "Bootstrap Claude skills"). If a skill named by `AGENTS.md` or `docs/agents/development-workflow.md` is not available, say so instead of improvising a substitute.
- Treat `AGENTS.md` as the sole canonical shared project policy; do not duplicate it here or under `.claude/rules/`. The session flow, the work-unit rule, and the version-authorization rule live there.
