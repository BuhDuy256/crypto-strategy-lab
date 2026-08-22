@AGENTS.md

## Claude Code delta

- Load project skills from `.claude/skills/`. It is a committed mirror of the canonical `.agents/skills/`, so a fresh clone needs no setup. Changing a skill means changing all three copies plus the lock (see `AGENTS.md`). If a skill named by `AGENTS.md` or `docs/agents/development-workflow.md` is not available, say so instead of improvising a substitute.
- Treat `AGENTS.md` as the sole canonical shared project policy; do not duplicate it here or under `.claude/rules/`. The session flow, the work-unit rule, and the version-authorization rule live there.
