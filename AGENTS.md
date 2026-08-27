# Cơm Tấm Má Tư — F&B Operations System

The F&B Operations System (`Hệ thống Vận hành F&B`) is the single-tenant
operating system of CTCP Chén Sứ for the multi-branch Cơm Tấm Má Tư chain:
sales, kitchen, stock, money, invoicing, and people on one operational data
source. Goals and scope boundary: ADR 0025.

Hierarchy: `Tenant (L0) → Branch (L1)`.

## Start Here

1. On a fresh checkout, or when graph freshness is unknown, run
   `corepack pnpm agent:start`. It refreshes CodeGraph only when status reports
   drift and installs the tracked `git-hooks/pre-push` hook (`core.hooksPath`).
   `corepack pnpm install` also runs the hook installer via `prepare`. IDE plugins
   and global skills are additive; they do not replace these rules.
2. Read `docs/agent/rules/engineering.md`, then only the topic rule needed.
   Next.js APIs for this checkout live in `apps/web/node_modules/next/dist/docs/`
   (`agentRules` is off so `next dest` does not rewrite this file).

| Signal | Read |
| --- | --- |
| Behavior, review, verification | `workflow.md` |
| Supabase, migration, RLS, auth, RPC | `database.md` |
| UI, UX, route surface, copy | `ui.md` |
| React/Next data-fetch or render performance | `react.md` |
| English vs Vietnamese language separation | `language.md` |
| External skill, plugin, browser, subagent | `skills.md`; add `orchestration.md` only for fan-out |
| Authority or onboarding | `references.md` |
| Notification, alert, scheduled report | `docs/spec/toast-notification-system.md` |
| PWA install, offline, OS support | `docs/spec/pwa.md` |

All rule paths above are under `docs/agent/rules/`. When `.codegraph/` exists,
use CodeGraph first for supported-source symbols, flows, callers, and impact.
Use `rg` or direct reads for SQL, config/docs, and exact literals. Re-run
`agent:start` after supported source or generated-type changes only when later
graph review depends on fresh edges. If `.codegraph/` is absent or unavailable,
use built-in search tools; indexing remains an owner decision.

## Critical Constraints

- TypeScript stays strict with `noUncheckedIndexedAccess: true`.
- Use `supabase-js`; never Prisma.
- Validate every Server Action input with Zod and never expose raw
  Supabase/Postgres `error.message` to clients.
- Client components may runtime-import only
  `@comtammatu/database/supabase/client`; database-barrel imports are type-only.
- Scope belongs in URL params, never `localStorage` or React Context.
- Multi-row correctness belongs in an atomic Postgres RPC.
- Before any migration apply, verify the target against `database.md`.
  Production apply requires explicit owner delegation in the current task.
- After applying SQL to the generated-type source schema, run
  `corepack pnpm db:types`.
- ACL source: `packages/shared/src/auth/module-acl.ts`. RLS/RPC remains final
  enforcement; UI visibility is not authorization.
- UI source (ordered 3+1): `docs/spec/design-system.md` (visual),
  `docs/spec/page-archetypes.md` (workflow), `docs/ref/screen-context-map.md`
  (audience/device); `docs/modules/ui.md` is the thin implementation map.
  Never create a parallel design system or put agent notes and implementation
  commentary in product UI.
- Comments are English and only explain non-obvious constraints. Delete retired
  code/docs cleanly; Git is the archive, so no tombstones or provenance notes.
- Do not create another agent wiki, task board, memory store, or rule tree.
  Use the existing owner mapped by `references.md`.
- Before modifying code for bug fixes, enforce the Reproduction-First contract
  (`workflow.md`): capture a failing test or verifiable runtime proof first.
- Before calling implementation complete, or before any owner-requested commit or
  push of code outside CI `paths-ignore`, run `corepack pnpm verify` — the same
  gate as the CI `gates` job (`deps:security`, `deps:audit`, `deps:boundaries`,
  `typecheck`, `lint`, `build`, `test`) and satisfy the Four-Tier Verification
  Harness (`workflow.md`). Read command output; Turbo cache replay is not fresh
  proof after deletions or cross-package test reads. The tracked `pre-push` hook
  enforces this on push.

## Communication And Git

- Owner-facing chat is Vietnamese. Everything else for agents and engineering
  is English — see `docs/agent/rules/language.md`.
- English (required): agent rules, specs, modules, plan/ADR/decisions,
  architecture notes, tasks, scripts prose, code identifiers, technical
  comments, commit subjects, APIs, schema, config, infrastructure.
- Vietnamese (required): product UI copy, end-user/owner business docs under
  `docs/ref/**`, and glossary `label_vi` terms. Follow `docs/ref/glossary.md`
  and `corepack pnpm lint:copy`.
- Do not commit or push unless the owner asks in the current task. Preserve
  unrelated dirty-tree work and stage only task-owned files.
- `CLAUDE.md` and runtime adapter directories are pointers/wiring, never
  parallel policy sources.

## Architecture

```text
Browser → proxy.ts (session + route/surface/network gates) → App Router → Supabase
Printing → apps/print-agent (Realtime + recovery polling) → ESC/POS LAN printers
```

Package manifests and the lockfile own framework versions; root `package.json`
owns the Node.js runtime requirement.

## Commands

```bash
corepack pnpm dev          # Turbopack development
corepack pnpm build        # Production build
corepack pnpm typecheck    # TypeScript checks
corepack pnpm lint         # Safety, contract, lifecycle, and ESLint gates
corepack pnpm test         # Test suites
corepack pnpm verify       # Dependency, boundary, type, lint, build, and test gate
corepack pnpm agent:start  # CodeGraph refresh + git hook install
corepack pnpm git:hooks:install  # Re-point core.hooksPath at git-hooks/
corepack pnpm db:types     # Regenerate database types after an applied migration
```
