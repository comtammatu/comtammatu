# Codebase Map — Cơm Tấm Má Tư

> **Audience:** New engineers onboarding, feature owners, sprint planners
> **Primary goals:** (1) Understand system structure and auth flow, (2) know where to add features, (3) estimate blast radius of changes
> **Decision milestone:** Sprint planning, onboarding, architecture review
> **Out of scope:** Business requirements (see `docs/ref/`), detailed task tracker (see `tasks/todo.md`)

## How To Use This Map

- Runtime architecture, package graph, and current code-placement rules:
  `docs/spec/architecture.md`.
- Work status changes daily: `tasks/todo.md`; do not copy it into architecture
  docs.
- Product Dual Thesis has two halves: **`Quản lý hệ thống`**
  (`control_surface`) and **`Vận hành bán hàng`**
  (`branch_surface` + `station_chrome`).
- Package manifests own exact framework and dependency versions.

## Module Index

| Module         | Doc                                            | Purpose                                                 | Risk Level                  |
| -------------- | ---------------------------------------------- | ------------------------------------------------------- | --------------------------- |
| Auth & ACL     | [auth.md](modules/auth.md)                     | JWT claims, role hierarchy, RLS, proxy routing          | **High** — gates all access |
| Database       | [database.md](modules/database.md)             | Supabase clients, types, migrations, RLS policies       | **High** — data integrity   |
| Finance        | [finance.md](modules/finance.md)               | Finance Basic boundary, daily money, HĐĐT, payables     | **High** — cash/legal data  |
| Inventory      | [inventory.md](ref/inventory.md)               | Procurement, site inventory, production, and transfers  | **High** — stock integrity  |
| Web App        | [web-app.md](modules/web-app.md)               | Next.js routes, layouts, server actions, surface shells | Medium                      |
| UI             | [ui.md](modules/ui.md)                         | Má Tư DS application, shared components, surfaces       | Low                         |
| Security       | [security.md](modules/security.md)             | Rate limiting (Upstash Redis)                           | Medium                      |
| Infrastructure | [infrastructure.md](modules/infrastructure.md) | Monorepo, build, deploy, environment                    | Medium                      |
| Feedback       | [feedback.md](modules/feedback.md)             | Operator feedback capture and review boundary           | Medium                      |

## Documentation Index

When you need deeper navigation by document type:

- [docs/README.md](README.md) — shared entry for all docs
- [agent/rules/skills.md](agent/rules/skills.md) — routing for external skills, plugins, MCP/browser tools, and subagents
- [docs/ref/glossary.md](ref/glossary.md) — single canonical glossary for the repo
- [docs/architecture/README.md](architecture/README.md) — system architecture and cross-cutting docs
- [ref/README.md](ref/README.md) — canonical reference docs
- [runbooks/README.md](runbooks/README.md) — readiness and smoke gates
## Authority And Change Routing

This file answers where code belongs and which files have high blast radius. It
does not restate agent workflow or architecture contracts:

- Authority and source selection: `docs/agent/rules/references.md` and
  `docs/agent/rules/skills.md`.
- Review depth, task lifecycle, and completion gates:
  `docs/agent/rules/workflow.md`.
- Current architecture, package graph, and placement contract:
  `docs/spec/architecture.md`.
- Auth/route authority: `docs/modules/auth.md`, with ACL ownership in
  `packages/shared/src/auth/module-acl.ts` and route resolution in
  `packages/shared/src/auth/route-resolution.ts`.
- Database mutation authority: `docs/agent/rules/database.md` and
  `docs/modules/database.md`; multi-row correctness belongs in an RPC.
- UI authority: `docs/agent/rules/ui.md` and `docs/spec/design-system.md`.

### Project Placement Matrix

Use this matrix when adding or moving files. It is the practical replacement for "where should this live?"

| Change type                                  | Primary location                                                    | Must check                                                                                | Avoid                                                  |
| -------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| New protected route                          | `apps/web/app/(protected)/...`                                      | `proxy.ts`, `route-resolution.ts`, `module-acl.ts`, module doc                            | Duplicating ACL in layouts/pages                       |
| New Server Action                            | Adjacent `actions.ts` under route family                            | Zod schema, `withAction`/auth helper, RLS/RPC contract                                    | Returning raw Supabase error messages                  |
| Logic used by one route family               | Beside the route or its route-family `_lib`                         | Existing route adapters and tests                                                         | Importing route-private code from a sibling domain     |
| Logic reused by multiple web route families  | `apps/web/lib/<domain>/...`                                         | Existing web-domain module and callers                                                    | Creating a package for one runtime                     |
| Stable contract reused by multiple runtimes  | Existing `packages/*` export                                        | Real second consumer, explicit export, `workspace:*` dependency                           | Source-path aliases that bypass package exports        |
| New database mutation spanning multiple rows | `supabase/migrations/*.sql` RPC + typed caller                      | RLS, GRANTs, `corepack pnpm db:types` after apply                                         | Multi-query partial writes in Server Actions           |
| New Supabase client usage                    | Explicit `packages/database` subpath for the runtime                | Import boundary in `docs/agent/rules/engineering.md`                                      | Root runtime barrel imports                            |
| New reusable UI component                    | `packages/ui/src/components/*`                                      | `docs/spec/design-system.md`, Má Tư DS shared components, `scripts/check-ui-contract.mjs` | Page-local one-off component clones                    |
| New route-specific UI composition            | `apps/web/app/**/_components` or route folder                       | `docs/spec/design-system.md`, Má Tư DS shared components, surface adapters                | New visual language outside design system              |
| New print behavior                           | `apps/print-agent/src/*` plus branch settings route if configurable | Branch-scoped config, no deploy-only layout changes                                       | Hardcoded receipt/format changes per branch            |
| New skill/plugin/tool routing rule           | `docs/agent/rules/skills.md` plus relevant entrypoint docs          | `AGENTS.md`, `docs/agent/rules/references.md`, `docs/agent/rules/workflow.md`             | Divergent workspace-only rules, secrets, plugin caches |
| New operational rule/runbook                 | `docs/modules/*`, `docs/runbooks/*`, `tasks/*`                      | `docs/agent/rules/references.md`                                                          | Separate agent-only doc trees                          |

Inventory topology and procurement flow are canonical in
`docs/ref/inventory.md`; this navigation file does not mirror that changing
domain contract.

## Landing Files (High Blast Radius)

These files have the widest downstream dependency. Changes here ripple across the system.

| File                                            | Importers                          | Impact                                                    |
| ----------------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `packages/shared/src/auth/module-acl.ts`        | proxy.ts, admin shell, all layouts | Adding/removing modules affects routing, nav, and ACL     |
| `packages/shared/src/auth/types.ts`             | Every auth-aware file              | Changing roles or JWT shape breaks auth chain             |
| `packages/shared/src/auth/scope.ts`             | proxy.ts, layouts, server actions  | Changing claim extraction breaks session                  |
| `packages/database/src/types/database.types.ts` | All server code                    | Auto-generated — regenerate with `corepack pnpm db:types` |
| `apps/web/proxy.ts`                             | Next.js middleware entry           | Single point of auth enforcement                          |
