# Cơm Tấm Má Tư — Bộ phần mềm quản lý vận hành và bán hàng

Bộ phần mềm cho CTCP Chén Sứ / Cơm Tấm Má Tư, single-tenant và multi-branch.
Nhiệm vụ: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng, kho trừ
đúng, và quản lý nhìn được tình trạng vận hành thật theo ngày.

Hierarchy: `Tenant (L0) → Branch (L1)`.

## Start Here

1. On a fresh checkout, or when graph freshness is unknown, run
   `corepack pnpm agent:start`. It verifies the tracked skill bundle and refreshes
   CodeGraph only when status reports drift.
2. Read `docs/agent/rules/engineering.md`, then only the topic rule needed:

| Signal | Read |
| --- | --- |
| Behavior, review, verification | `workflow.md` |
| Supabase, migration, RLS, auth, RPC | `database.md` |
| UI, UX, route surface, copy | `ui.md` |
| External skill, plugin, browser, subagent | `skills.md`; add `orchestration.md` only for fan-out |
| Authority or onboarding | `references.md` |
| Notification, alert, scheduled report | `docs/spec/toast-notification-system.md` |

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
- Before calling implementation complete, run
  `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`;
  add targeted tests and `corepack pnpm verify` when the blast radius warrants it.

## Communication And Git

- Owner-facing chat is Vietnamese. Agent-to-agent text, code, identifiers,
  comments, and commit subjects are English.
- New owner/domain docs under `docs/ref/`, `docs/architecture/`, and
  `docs/plan/` default to Vietnamese. Agent rules, technical specs/modules,
  ADRs, and `tasks/` default to English. Preserve an existing file's language.
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
corepack pnpm agent:start  # Skill check + status-first CodeGraph refresh
corepack pnpm db:types     # Regenerate database types after an applied migration
```
