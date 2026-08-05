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
  `docs/modules/ui.md`, `docs/ref/screen-context-map.md`; Product Dual Thesis
  in `docs/spec/architecture.md`; optional Stitch mirror `.stitch/DESIGN.md`
  (non-SSOT). Target-only docs under `docs/architecture/target-*` are future.
- Routes/scopes: `docs/spec/role-route-matrix.md`
- Notifications: `docs/spec/toast-notification-system.md`
- Finance: `docs/modules/finance.md`
- Inventory: `docs/ref/inventory.md`
- Infrastructure: `docs/modules/infrastructure.md`
- Legal/tax/payroll/HĐĐT: `docs/ref/legal-framework-2026.md` first, then
  `docs/ref/payroll-pit.md`, `docs/ref/einvoice-tax.md`,
  `docs/ref/labor-contracts.md`, and `docs/ref/business-context.md` as applicable

## Agent Entrypoints Per IDE

Adapter directories wire tools back to repo authority; they do not own rules.

| Runtime      | Entrypoint                     | MCP config                            | Production DB guard                                                               |
| ------------ | ------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------- |
| Claude Code  | `CLAUDE.md` shim → `AGENTS.md` | Plugin/runtime config; no tracked file | `.claude/settings.json` → canonical guard                                         |
| Codex        | `AGENTS.md`                    | `.codex/config.toml`                  | `.codex/hooks.json` → canonical guard                                             |
| Cursor/other | Adapter-local pointer required | Adapter-specific                      | Unregistered: read-only until adapter is added and guard-sync registration exists |

The tracked capability contract and required bundle are
`docs/agent/rules/skills.md` and `.agents/skills/`. Its exact tree is locked by
`docs/agent/skills-manifest.json`; every fresh checkout must pass
`corepack pnpm agent:start` before agent work, and CI verifies the skill bundle
in `lint`.
Global skill catalogs, plugin caches, and per-user plugin state are additive only.
`.claude/settings.json` enables the shared Claude plugin subset;
`.codex/config.toml` registers Codex MCP servers. Neither adapter can replace or
alter project policy or the required bundle.

The production guard contract spans the Environment Registry in `database.md`,
`scripts/guard-prod-db.mjs`, the pinned Codex MCP binding in
`.codex/config.toml`, and every adapter registered by
`scripts/check-guard-sync.mjs`. Project-less direct MCP reads are accepted only
when that Codex binding is mechanically verified. A runtime without an adapter
is unguarded; use only read-only/plan/ask/sandbox review until it is registered.
Keep secrets, tokens, caches, generated sessions, worktrees, and local state
untracked.

## Entrypoint Boundary

`AGENTS.md` owns startup, communication, and hard constraints.
`engineering.md` owns import boundaries and Git conventions; it points to the
entrypoint instead of copying policy. Full architecture authority remains in the
System Sources above.

## Planning And Knowledge

- Active work: `tasks/todo.md`
- Architecture decisions and parked options: `docs/plan/adr/`; compatibility index:
  `docs/plan/decisions.md`
- Regressions: `tasks/regressions.md`
- Prose-only learning staging: `tasks/lessons.md`
- Runbooks: `docs/runbooks/README.md`
- Business/domain index: `docs/ref/README.md`
- Vocabulary: `docs/ref/glossary.md`
- Terminology synonym bans (lint): `docs/ref/terminology-synonyms.json`
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
