# Cơm Tấm Má Tư — Restaurant Management System

Single-tenant multi-branch (CTCP). Hierarchy: `Tenant (L0) → Branch (L1)`. Stack: Next.js 16.2 · React 19.2 · TS 6.0 (strict, `noUncheckedIndexedAccess`) · Tailwind 4.2 · Zod 4 · Turborepo 2.9 · Node ≥24 · Supabase (PostgREST + Auth).

> "Minimum code that solves the problem. Touch only what you must."

## Commands

`pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm db:types` (after migration applied)

## Constraints

- MUST run `pnpm typecheck && pnpm lint && pnpm build` before marking task complete
- MUST validate Server Action inputs với Zod 4 (`{ error: ... }`, `z.email()`)
- MUST dùng supabase-js (NEVER Prisma); multi-item atomic writes → Postgres RPC
- NEVER return raw Supabase/Postgres `error.message` to client
- NEVER import `@comtammatu/database` barrel trong `"use client"` — dùng `/supabase/client`
- NEVER store scope in localStorage/Context — URL params only (e.g. `?branchId=`)
- Migrations: dev/test qua `supabase db push` được phép; production = file → PR → merge → owner apply manually. Sau apply → `pnpm db:types`
- ACL single source: route-level `packages/shared/src/auth/module-acl.ts`; row-level `staff_permissions` + `has_permission(branch, key)` SQL helper; key catalog `packages/shared/src/auth/permissions.ts`
- UI MUST đi theo shadcn preset `b1GN1lxvE` (`docs/spec/design-system.md` + `docs/modules/ui.md`). Compose từ `packages/ui/src/components/*` + `@/components/form`. NEVER fake primitives bằng `div`/`span`/`p`, NEVER fork primitive, NEVER theme layer / `app-*` / per-surface `theme.css`. NEVER raw Tailwind palette ngoài `packages/ui/src/styles/*.css` — dùng semantic tokens (`bg-success`, `text-warning`, `border-destructive`, `--tier-*`); NEVER arbitrary dimensions (`w-[200px]`, `text-[10px]`). Trước UI rebuild đọc design-system.md → ui.md → `tasks/regressions.md` và state surface + user job + primitives + regression risks

## Architecture

`Browser → proxy.ts (auth + ACL) → App Router → Supabase`. Proxy file: `apps/web/proxy.ts` exports `proxy(request: NextRequest)`. JWT claims: `{ tenant_id, branch_id|null, user_role }`. Routes: `/admin/*` (manager+), `/br/[branchId]/{pos,kds}`, `/employee`, `/login`. DB types: money `NUMERIC(15,2)`, time `TIMESTAMPTZ`, PK `BIGINT GENERATED ALWAYS AS IDENTITY`, text `TEXT`.

## Things That Will Bite You

- RLS blocked writes return `{ data: null, error: null }` — no error thrown
- Auth hook MUST be `SECURITY DEFINER` hoặc JWT mất custom claims silently
- New tables cần explicit `GRANT ... TO authenticated`
- UNIQUE constraints: `UNIQUE(field, tenant_id)` không phải `UNIQUE(field)`
- TypeScript 6: packages dùng `process.env` cần `"types": ["node"]` trong tsconfig

## References

- **Codebase map (read first):** `docs/CODEBASE_MAP.md` → routes vào `docs/modules/*` (auth, database, web-app, ui, security, infrastructure), `docs/plan/*` (roadmap, decisions), `docs/spec/*` (architecture, database-schema, design-system), `docs/ref/*` (business-context, inventory, einvoice-tax, payroll-pit, labor-contracts, glossary)
- **Code navigation:** `.context-graph/NAV.md` (931 nodes, 296 files với file:line) — đọc trước khi grep
- **Meta:** `tasks/regressions.md` (named failure rules), `tasks/lessons.md`, `tasks/todo.md`

## Team Workflow — 4-Agent Debate (mandatory)

Every task (feature/bug/refactor) MUST qua 4 agents trước khi code. Skip CHỈ cho: typo <3 LOC, docs-only, dep bump.

| Role     | Agent                        | Asks                                          |
| -------- | ---------------------------- | --------------------------------------------- |
| PM       | `oh-my-claudecode:planner`   | scope, MVP, acceptance criteria               |
| BA       | `oh-my-claudecode:analyst`   | business rules, edge cases, data flow         |
| Sr. Dev  | `oh-my-claudecode:architect` | architecture, plan, risks, affected files    |
| QA/QC    | `oh-my-claudecode:critic`    | test plan, regression risks, quality gates    |

Flow: spawn 4 song song với task + `CLAUDE.md` + `tasks/regressions.md` → synthesize agreements/conflicts → unified contract → Sr. Dev implement → verify với QA + BA + PM + green build. Full protocol: wiki `team-agent-workflow-4-agent-debate.md`.

## gstack

For all web browsing use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`.
