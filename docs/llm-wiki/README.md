# LLM Wiki — Cơm Tấm Má Tư

> Updated: 2026-05-09
> Purpose: fast orientation for LLM agents before planning or implementation.
> Rule: runtime and generated types win over older hand-written docs.

## Current Product Direction

Cơm Tấm Má Tư is an in-place restaurant operating platform rebuild, not a fork. The current strategic direction is:

- **Super App**: one coherent operating system for restaurant work.
- **Merchant Platform**: management and operating platform concept across existing workspaces, not a new `/merchant/*` route tree.
- **Cổng nhân viên**: employee self-service and role-gated handoff into operational workspaces.

Read the active route/workspace contracts first when a task touches navigation, route ownership, or workspace boundaries:

- `AGENTS.md`
- `docs/agent/rules/references.md`
- `docs/modules/web-app.md`
- `docs/modules/ui.md`
- `docs/plan/system-rebuild/01-BRAND-SOFTWARE-PROGRAM.md`
- `docs/plan/system-rebuild/05-MODULE-CATALOG.md`

Older Super App / Merchant Platform planning docs live in `docs/archive/plan/` and are context, not active contract.

## Runtime Snapshot

| Area | Current fact |
| --- | --- |
| Stack | Next.js 16.2, React 19.2, TypeScript 6.0, Tailwind 4.2, Zod 4, Turborepo 2.9, Node >= 24 |
| Package manager | `pnpm@10.33.0` |
| Web routes | App Router routes under `apps/web/app` |
| DB shape | `public`: 113 tables, 9 views, 212 functions in generated types |
| Migrations | 330 SQL files in `supabase/migrations` |
| Auth model | Auth v2: positions + permission grants; legacy `user_role` remains for route ACL |
| Primary architecture | `Browser -> proxy.ts -> App Router -> Supabase PostgREST/Auth/RLS`; optional feedback host split for `/r/*` |
| Verification for implementation | `pnpm typecheck && pnpm lint && pnpm build` |

## Source-Of-Truth Order

When sources disagree, use this order:

1. Runtime code and generated DB types.
2. `AGENTS.md` and `docs/agent/rules/*`.
3. `tasks/regressions.md`.
4. Current planning docs in `docs/plan/*`, especially the Super App rebuild doc.
5. Module docs in `docs/modules/*`.
6. Older archived plans and stale diagrams.

Known stale signals:

- Some older docs still describe `HQ -> Bếp trung tâm -> Chi nhánh`; current branch model uses `central_warehouse`, `central_kitchen`, and branch sites.
- Older docs may say 107 or 114 routes, or 102/109 tables. Current audit found 109 routes and 113 public tables.
- `docs/llm-wiki/` did not exist before this update even though `docs/ref/inventory-erp-gap-matrix.md` referenced `docs/llm-wiki/module-cards/inventory.md`.

## Must-Read Before Work

Always:

- `AGENTS.md`
- `docs/agent/rules/engineering.md`
- `docs/agent/rules/workflow.md`
- `docs/agent/rules/references.md`
- `tasks/regressions.md`

When touching DB/Auth/Server Actions:

- `docs/agent/rules/database.md`
- `docs/modules/auth.md`
- `docs/modules/database.md`

When touching UI/route surfaces/copy:

- `docs/agent/rules/ui.md`
- `docs/spec/design-system.md`
- `docs/modules/ui.md`
- `docs/ref/glossary.md`

When touching Super App/Merchant Platform IA:

- `docs/modules/web-app.md`
- `docs/llm-wiki/module-cards/web-app-routes.md`
- `docs/plan/system-rebuild/01-BRAND-SOFTWARE-PROGRAM.md`
- `docs/plan/system-rebuild/05-MODULE-CATALOG.md`

## Workspace Map

| Workspace | Canonical route | Owner job | Notes |
| --- | --- | --- | --- |
| Cổng nhân viên | `/employee/*` | self-service: clock, schedule, attendance, payslip, profile | all roles; handoff links are secondary |
| Admin foundation | `/admin/*` | tenant foundation, reports, settings, staff, feedback | not a catch-all for domain workflows |
| POS | `/br/[branchId]/pos` | sell, create orders, collect payments | branch-scoped, network gate in prod |
| KDS | `/br/[branchId]/kds` | kitchen ticket queue and bump/recall | branch-scoped |
| Branch settings | `/br/[branchId]/settings/*` | scoped POS/KDS/table/printer setup | manager/admin roles |
| Branch menu limits | `/br/[branchId]/menu-limits` | daily quota co-owned by manager/cashier/chef | distinct ACL module |
| Inventory | `/inventory/*` | procurement, stock, transfer, production, stocktake | canonical inventory surface |
| Finance | `/finance/*` | revenue, reconciliation, GL, HĐĐT, statements | owner/super_manager |
| HR | `/hr/*` | staff operations and payroll management | owner/super_manager |
| Menu | `/menu` | menu/catalog master data | manager/admin roles |
| Orders | `/orders` | cross-branch order visibility | manager/cashier roles |
| Notifications | `/notifications` | durable work feed | all staff |
| Public feedback | `/r/[token]/*` | QR feedback submission | public |

## Super App Guardrails

Do not create a new route because the product is being positioned as a Super App. A new `page.tsx` needs a durable user job, ACL boundary, data boundary, entity detail, line-heavy workflow, or shareable report filter.

Prefer:

- `Tabs` or query params for sub-views.
- `Sheet`, `Dialog`, or `AlertDialog` for contextual create/edit/confirm flows.
- Existing workspace ownership for domain work.

Do not:

- Create `/merchant/*` for MVP.
- Put management workflows in `/employee`.
- Put universal post-login discovery anywhere except `/portal`.
- Duplicate payment operations outside POS/Finance/Admin settings.
- Revive `/admin/inventory/*`; Inventory lives at `/inventory/*`.

## Module Cards

- [Auth & ACL](module-cards/auth-acl.md)
- [Web App & Routes](module-cards/web-app-routes.md)
- [Database & Supabase](module-cards/database-supabase.md)
- [UI & Design System](module-cards/ui-design-system.md)
- [POS & KDS](module-cards/pos-kds.md)
- [Inventory](module-cards/inventory.md)
- [Finance & Payments](module-cards/finance-payments.md)
- [HR & Employee](module-cards/hr-employee.md)
- [Print Agent & Branch Network](module-cards/print-agent-network.md)

## Current High-Risk Backlog

Use `tasks/todo.md` as the active work tracker, but do not overwrite user-local edits. As of the latest read:

- Fork strategy is abandoned; continue in `comtammatu`.
- External credentials still block VietQR/Momo/Viettel S-invoice production wiring.
- M4 payment hardening remains active: Momo tenant binding, stock-consumption result checks, server recompute totals, atomic webhook flow.
- Finance gaps remain around period-close guards and HĐĐT compliance workflows.
- Payroll/HR still has RLS, null branch manager, clock-code, and salary-audit gaps.
- Network gate still has per-agent token, rate-limit, permission, RLS, and soft-revoke race follow-ups.

## Agent Workflow Notes

- Feature, bug, and refactor work requires the 4-perspective debate protocol.
- Documentation-only changes may skip debate, but still verify diffs.
- Never revert unrelated dirty worktree changes.
- Use `rg`/`rg --files`; read `.context-graph/NAV.md` before broad code search when present.
- For UI work, state surface, primary user job, change type, primitives, and regression risks before editing runtime UI.
