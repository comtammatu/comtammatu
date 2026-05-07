> ARCHIVED 2026-05-07 — Folded into 01-BRAND-SOFTWARE-PROGRAM.md

# Super App - Merchant Platform Rebuild

> Status: planning baseline  
> Date: 2026-05-06  
> Scope: in-place rebuild of the current `comtammatu` project direction. This supersedes the abandoned fork strategy as the active product direction, but it does not replace existing module specs.
> Next contract: `docs/plan/merchant-platform-ia-contract.md`

## Core Decision

The next major rebuild should position the product as a restaurant operating platform with a unified entry experience, but it must not create route or layout sprawl.

Use these terms carefully:

- **Cổng nhân viên**: the employee-facing portal for daily self-service and work handoff.
- **Merchant Platform**: the management and operating platform concept across the existing route families.
- **Super App**: the product strategy of one coherent operating system, not a license to duplicate workflows under a new route tree.

Do **not** create `/merchant/*` for the MVP. Merchant Platform is an information architecture and navigation layer over existing workspaces, not a new URL family.

## Why This Rebuild Exists

The current product already has deep modules: POS, KDS, Menu, Stock, Finance, HR, Settings, and Employee self-service. The risk is no longer lack of features. The risk is that staff and managers face too many pages, too many layouts, and too many places that appear to do the same job.

This rebuild should make the software easier to adopt from traditional restaurant operations:

- Paper timekeeping -> Cổng nhân viên.
- Verbal order flow -> POS/KDS.
- Stock notebook or spreadsheet -> Inventory.
- Payroll spreadsheet -> HR/payroll.
- Owner monitoring -> Admin, Finance, Reports.

The product should feel like one operating system, but each job still needs one canonical place to happen.

## Product Shape

```text
Cổng nhân viên
  -> self-service first
  -> role-gated handoff to POS/KDS/domain workspaces

Merchant Platform
  -> tenant and branch management
  -> domain workspaces
  -> reporting and finance control
  -> configuration and access control

Frontline workspaces
  -> POS
  -> KDS
  -> branch-specific operations
```

The same ACL, tenant/branch model, design system, and terminology source apply across all three.

## Non-Goals

- Do not build a generic consumer super app.
- Do not add `/merchant/*` unless a later ADR proves a durable job, ACL boundary, and data boundary that existing workspaces cannot own.
- Do not turn `/employee` into a second admin shell.
- Do not duplicate POS/KDS, HR, Inventory, Finance, or Settings under new names.
- Do not introduce a new visual system, route theme, or surface-specific component library.
- Do not store branch or employee scope in `localStorage` or React Context.

## Canonical Route Ownership

| User job | Canonical route family | Supporting surfaces | Not allowed |
| --- | --- | --- | --- |
| Know what to do today | `/employee` | notifications, role-gated links | dashboard mosaic inside employee |
| Clock in/out | `/employee/clock` | `/employee` summary card | HR admin page as staff entry point |
| View shifts | `/employee/schedule` | HR publishes schedules | duplicate schedule editor in employee |
| View attendance history | `/employee/attendance` | HR admin audit | tenant-wide attendance in employee |
| View payslip | `/employee/payslip` | `/hr/payroll` release flow | draft payroll visibility in employee |
| Manage staff and permissions | `/admin/staff`, `/hr/*` | employee profile self-view | CRUD staff inside employee |
| Sell and collect payment | `/br/[branchId]/pos` | employee handoff link | payment workflow in `/merchant/*` |
| Cook and bump tickets | `/br/[branchId]/kds` | employee handoff link | KDS queue inside employee/admin |
| Configure payment providers | `/admin/settings/payments` | Finance/payment reports | merchant credentials in POS UI |
| Reconcile payments | `/finance/*` | POS payment state | separate merchant reconciliation route |
| Manage stock/procurement/production | `/inventory/*` | Admin reports | revive `/admin/inventory/*` |
| Configure branch POS/KDS/tables/printers | `/admin/settings/*`, `/br/[branchId]/settings` where scoped | employee handoff only | branch settings in employee |
| Review owner-level performance | `/admin/dashboard`, `/admin/reports`, `/finance/*` | domain drilldowns | KPI wall in employee |

If a new workflow does not fit this table, update the table before adding a route.

## Route Creation Rule

A new `page.tsx` is allowed only when the workflow needs at least one of these:

- durable URL and browser history for a real user job
- distinct ACL/module key
- distinct tenant/branch/employee data boundary
- detail page for a real entity
- long form or line-heavy workflow that cannot fit a sheet/dialog
- report view that needs shareable filters

Use the existing route with `Tabs`, query params, `Sheet`, `Dialog`, or `AlertDialog` when the change is only:

- filter
- sort
- view mode
- status segment
- short create/edit form
- destructive confirmation
- contextual detail

## Layout Contract

Limit the rebuild to these layout patterns:

- Employee mobile shell for `/employee/*`.
- Shared app shell with sidebar and breadcrumb for admin and domain workspaces.
- POS operational layout for `/br/[branchId]/pos`.
- KDS operational queue layout for `/br/[branchId]/kds`.
- Table/list/detail patterns for management surfaces.
- Sheet/dialog/alert dialog for contextual actions.

Do not create a new shell for every role. Role changes should alter navigation and action availability, not produce separate layouts for the same job.

## Navigation Contract

### Cổng nhân viên

Primary navigation stays narrow:

- Hôm nay
- Lịch ca
- Ngày công
- Phiếu lương
- Cá nhân

Operational handoff links are secondary and role-gated:

- POS
- KDS
- branch settings or domain workspace links only when ACL allows

The first viewport should answer:

- Have I clocked in?
- What is my next shift?
- What action should I take now?
- Is there a role-specific operational handoff?

### Merchant Platform

Merchant Platform navigation is a curated grouping over existing route families:

- Quản trị: `/admin/*`
- Bán hàng: `/br/[branchId]/pos`, `/orders`
- Bếp: `/br/[branchId]/kds`
- Kho hàng: `/inventory/*`
- Kế toán: `/finance/*`
- Nhân sự & tiền lương: `/hr/*`
- Cấu hình: `/admin/settings/*`

The route owner does not change when the navigation label changes.

## Data And ACL Contract

- Employee self-service must resolve the employee server-side from `auth.uid()` and current claims. Do not accept `employeeId` from URL or client state.
- Branch-scoped work uses URL/path scope: `/br/[branchId]/*` or `?branchId=`.
- ACL source remains `packages/shared/src/auth/module-acl.ts`.
- Navigation and app discovery must reflect the same ACL source.
- Server Actions must validate inputs with Zod and return safe Vietnamese errors.
- Multi-item atomic writes must use Postgres RPCs.
- Raw Supabase/Postgres error messages must never reach clients.

## Rebuild Waves

### Wave 0 - Product Contract

Lock this document as the rebuild contract.

Acceptance:

- `/merchant/*` is explicitly out of MVP.
- Route ownership matrix is accepted.
- Page vs tab/query/sheet/dialog rule is accepted.
- Cổng nhân viên and Merchant Platform terms are defined before UI copy changes.

### Wave 1 - IA Audit

Audit current routes against the ownership matrix.

Scope:

- Identify duplicate workflow entry points.
- Mark support/debug routes that should not appear in primary nav.
- Find dead or legacy admin routes, especially old inventory/admin overlaps.
- Verify nav config, route resolution, and app discovery align.

Acceptance:

- Every user job has one canonical route.
- Every route has one primary user job.
- Every primary nav item has an ACL source and owner surface.

### Wave 2 - Cổng Nhân Viên Rebuild

Keep `/employee` narrow and task-led.

Scope:

- First viewport: clock state, next shift, next action.
- Keep schedule, attendance, payslip, and profile as self-service.
- Demote POS/KDS/domain links to secondary handoff.
- Hide support/debug routes from primary nav.

Acceptance:

- Staff can complete daily self-service without seeing management workflows.
- Managers still see their own self-service before management handoff links.
- Payslip shows only released/paid self data.
- Mobile first viewport is not crowded.

### Wave 3 - Merchant Navigation Consolidation

Create the Merchant Platform feel through navigation and workspace consistency, not new route trees.

Scope:

- Normalize admin/domain workspace entry points.
- Ensure settings, finance, inventory, HR, POS, and KDS have clear owners.
- Reduce duplicate dashboard cards and app launcher patterns.

Acceptance:

- Managers know where each job lives.
- Existing modules feel like one product without duplicating workflows.
- Route labels and Vietnamese copy match glossary/shared labels.

### Wave 4 - Frontline Operational Surfaces

Refit POS and KDS as frontline workspaces.

Scope:

- POS: next safe action, compact context after session/table lock, cart only for new order.
- KDS: queue-first, compact filters, one visual source of truth for ticket urgency/status.
- Handoff from employee stays link-based and role-gated.

Acceptance:

- Cashier and kitchen flows do not require navigating through admin.
- Payment remains POS-owned.
- Cooking remains KDS-owned.

### Wave 5 - Management And Control Surfaces

Tighten admin, inventory, finance, HR, and settings.

Scope:

- Management pages prefer tables, filters, forms, queues, and exceptions.
- Reports answer operational decisions, not decorative dashboard needs.
- Settings remain configuration surfaces, not daily work dashboards.

Acceptance:

- Owner/manager can scan exceptions and drill into the owner route.
- No duplicate HR/payroll/finance/inventory workflow appears in employee.

### Wave 6 - Rollout And Verification

Canary the rebuild in one branch before broad rollout.

Acceptance:

- Browser smoke checks for `/employee`, POS, KDS, admin dashboard, settings, inventory, finance, HR.
- Role/branch matrix covers at least 2 users across 2 branches.
- `pnpm typecheck && pnpm lint && pnpm build` passes for implementation waves.
- Rollback can hide new navigation/discovery links without deleting safe direct routes.

## Anti-Sprawl Checklist

Before every implementation slice:

- What user job is being improved?
- What is the canonical route owner?
- Are we adding a page where a tab/query/sheet/dialog would work?
- Are we duplicating a workflow already owned by another surface?
- Does ACL come from the shared source?
- Does branch/employee scope stay server-side or URL-bound?
- Does the UI use existing shadcn primitives and app surface adapters?
- What regression test proves the workflow stayed in one place?

## Open Decisions

- Whether to add a glossary entry for "Merchant Platform" as an internal strategy term only.
- Whether `/employee/permissions` should remain direct-access support/debug or be moved under admin support tooling later.
- Whether management navigation should be centralized entirely through `nav-config.ts` or keep small domain-local nav configs that all reference the shared ACL source.
- Which branch and role set will be the first canary for the rebuild.

## Next Planning Artifact

The concrete IA/navigation contract for the next step lives in `docs/plan/merchant-platform-ia-contract.md`.
