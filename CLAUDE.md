# Claude Code Compatibility Shim

Canonical agent instructions live in `AGENTS.md`.

Claude Code may read `CLAUDE.md` automatically, so this file is kept as a
stable pointer only. Do not duplicate project rules here. If anything conflicts,
`AGENTS.md` and the applicable files under `docs/agent/rules/` win.

Before implementation:

1. Read `AGENTS.md`.
2. Read `docs/agent/rules/engineering.md`.
3. Read any task-specific rules named by `AGENTS.md`.

Keep machine-local agent configuration out of the repository. Do not commit
`.claude/`, `.codex/`, `.agents/`, MCP tokens, plugin caches, or per-user tool
settings.
