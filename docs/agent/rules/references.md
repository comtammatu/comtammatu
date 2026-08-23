# Agent Reference Map

Use this index to find authority. Load only the sources needed for the task;
runtime adapters, local tool state, and `tasks/todo.md` are not parallel SSOTs.

## System Sources

HOT — load by default for matching work:

- Agent entrypoint: `AGENTS.md`
- Tool/subagent routing: `docs/agent/rules/skills.md`
- Cross-runtime review: `docs/agent/rules/orchestration.md`
- Codebase/module index: `docs/CODEBASE_MAP.md`
- Architecture: `docs/spec/architecture.md`, `docs/architecture/README.md`
- Auth and ACL: `docs/modules/auth.md` (includes ADR 0015 cutover pointer)
- Database: `docs/modules/database.md`, `docs/spec/database-schema.md`
- UI (ordered 3+1): `docs/spec/design-system.md` (visual) →
  `docs/spec/page-archetypes.md` (workflow) →
  `docs/ref/screen-context-map.md` (audience/device; Product UX spine §1A
  actor x job x plane per route family, before compose) ->
  `docs/modules/ui.md` (thin implementation map). Product Dual Thesis in
  `docs/spec/architecture.md`. Not a parallel DS or root `DESIGN.md`; optional
  local Stitch mirror `.stitch/DESIGN.md` (non-SSOT, untracked). Target-only
  docs under `docs/architecture/target-*` are future.
- Routes/scopes: `docs/spec/role-route-matrix.md`
- Notifications: `docs/spec/toast-notification-system.md`
- PWA (install, offline, OS matrix): `docs/spec/pwa.md`
- Finance: `docs/modules/finance.md`
- Inventory: `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`
- Infrastructure: `docs/modules/infrastructure.md`
- Vocabulary / language: `docs/ref/glossary.md`,
  `docs/agent/rules/language.md`
- Operational data: `docs/ref/operational-data-contract.md`
- Business/domain index: `docs/ref/README.md`

## Warm Sources

On-demand legal/tax/finance deep refs (not default System Sources):

- Legal register: `docs/ref/legal-framework-2026.md`
- E-invoice / VAT / CIT: `docs/ref/einvoice-tax.md`
- Assets / VAT / F&B profit ladder: `docs/ref/finance-assets-vat-fnb.md`
- Accounting books TT133/TT99: `docs/ref/accounting-books-tt133-tt99.md`
- Payroll PIT / labor contracts: `docs/ref/payroll-pit.md`,
  `docs/ref/labor-contracts.md`
- Business boundary: `docs/ref/business-context.md`

## Agent Entrypoints Per IDE

Adapter directories wire tools back to repo authority; they do not own rules.

| Runtime      | Entrypoint                     | MCP config                            | Production DB guard                                                               |
| ------------ | ------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------- |
| Claude Code  | `CLAUDE.md` shim → `AGENTS.md` | Plugin/runtime config; no tracked file | Optional local `.claude/settings.json` → canonical guard                          |
| Codex        | `AGENTS.md`                    | Optional local `.codex/config.toml`   | Optional local `.codex/hooks.json` → canonical guard                              |
| Cursor/other | Adapter-local pointer required | Adapter-specific                      | Unregistered: read-only until adapter is added and guard-sync registration exists |

Tool and plugin routing lives in `docs/agent/rules/skills.md`. There is no
tracked `.agents/skills` bundle. Global skill catalogs, plugin caches, and
per-user plugin state are additive only. Local Claude/Codex adapter files are
optional and untracked; when present they may enable plugins or MCP servers but
cannot replace or alter project policy.
`corepack pnpm agent:start` refreshes CodeGraph
([`colbymchenry/codegraph`](https://github.com/colbymchenry/codegraph)) when
`.codegraph/` exists and installs the tracked `pre-push` verify hook.

The production guard contract spans the Environment Registry in `database.md`,
`scripts/guard-prod-db.mjs`, and `scripts/check-guard-sync.mjs`. An optional
local `.codex/config.toml` may pin a read-only Production MCP binding; when
absent, project-less direct MCP reads fail closed. A runtime without an adapter
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

One fact has one owner. Prefer a deterministic guard/test over recurring prose.
Promote stable contracts to the owning source, park only owner-kept options with
a revisit trigger, and delete superseded plans/audits; git/PR history is the
archive. Do not create snapshot backlogs, agent-only doc trees, or tool-specific
authority files.

Generated route-matrix content stays inside its markers and is refreshed by
`corepack pnpm gen:route-matrix`. Disposable OKF export uses
`corepack pnpm docs:okf` under `.tmp/okf/`; it is never authority.
