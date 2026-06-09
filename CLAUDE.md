# Claude Code Compatibility Shim

Canonical agent instructions live in `AGENTS.md`.

Claude Code may read `CLAUDE.md` automatically, so this file is kept as a
stable pointer only. Do not duplicate project rules here. If anything conflicts,
`AGENTS.md` and the applicable files under `docs/agent/rules/` win.

Before implementation:

1. Read `AGENTS.md`.
2. Read `docs/agent/rules/engineering.md`.
3. Read `docs/agent/rules/skills.md` before selecting external skills, plugins,
   MCP tools, browser tools, or subagents.
4. Read any task-specific rules named by `AGENTS.md`.

Project-owned Agent Workspace config may live in the repository. Do not commit
secrets, MCP tokens, plugin caches, generated sessions, worktrees, or per-user
local state.
