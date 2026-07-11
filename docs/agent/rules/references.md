# Agent Reference Map

Use this index to find authority. Load only the sources needed for the task;
runtime adapters, local tool state, and `tasks/todo.md` are not parallel SSOTs.

## System Sources

- Agent entrypoint: `AGENTS.md`
- Tool/subagent routing: `docs/agent/rules/skills.md`
- Cross-runtime review: `docs/agent/rules/orchestration.md`
- Codebase/module index: `docs/CODEBASE_MAP.md`
- Architecture: `docs/spec/architecture.md`, `docs/architecture/README.md`
- Auth and ACL: `docs/modules/auth.md`
- Database: `docs/modules/database.md`, `docs/spec/database-schema.md`
- UI: `docs/spec/design-system.md`, `docs/spec/page-archetypes.md`,
  `docs/modules/ui.md`, `docs/ref/screen-context-map.md`
- Routes/scopes: `docs/spec/role-route-matrix.md`
- Notifications: `docs/spec/toast-notification-system.md`
- Finance: `docs/modules/finance.md`
- Infrastructure: `docs/modules/infrastructure.md`

## Runtime Adapters

Adapter directories wire tools back to repo authority; they do not own rules.

| Runtime      | Entrypoint                     | MCP config           | Production DB guard                                                               |
| ------------ | ------------------------------ | -------------------- | --------------------------------------------------------------------------------- |
| Claude Code  | `CLAUDE.md` shim → `AGENTS.md` | `.mcp.json`          | `.claude/settings.json` → canonical guard                                         |
| Codex        | `AGENTS.md`                    | `.codex/config.toml` | `.codex/hooks.json` → canonical guard                                             |
| Cursor/other | Adapter-local pointer required | Adapter-specific     | Unregistered: read-only until adapter is added and guard-sync registration exists |

The production guard contract spans the Environment Registry in `database.md`,
`scripts/guard-prod-db.mjs`, and every adapter registered by
`scripts/check-guard-sync.mjs`. A runtime without an adapter is unguarded; use
only read-only/plan/ask/sandbox review until it is registered. Keep secrets,
tokens, caches, generated sessions, worktrees, and local state untracked.

## Intentional Mirror

Only the `MIRROR:constraints` block is duplicated between `AGENTS.md` and
`engineering.md`; `corepack pnpm lint:rules-mirror` enforces equality. Commands
and architecture live only in `AGENTS.md`.

## Planning And Knowledge

- Active work: `tasks/todo.md`
- Decisions/parked options: `docs/plan/adr/`; legacy index:
  `docs/plan/decisions.md`
- Regressions: `tasks/regressions.md`
- Retrospectives: `tasks/lessons.md`
- Runbooks: `docs/runbooks/README.md`
- Business/domain index: `docs/ref/README.md`
- Vocabulary: `docs/ref/glossary.md`
- Operational data: `docs/ref/operational-data-contract.md`
- Legal register: `docs/ref/legal-framework-2026.md`

One fact has one owner. Prefer a deterministic guard/test over recurring prose.
Promote stable contracts to the owning source, park only owner-kept options with
a revisit trigger, and delete superseded plans/audits; git/PR history is the
archive. Do not create snapshot backlogs, agent-only doc trees, or tool-specific
authority files.

Generated route-matrix content stays inside its markers and is refreshed by
`corepack pnpm gen:route-matrix`. Disposable OKF export uses
`corepack pnpm docs:okf` under `.tmp/okf/`; it is never authority.
