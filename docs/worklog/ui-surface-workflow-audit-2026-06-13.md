# UI Surface And Workflow Audit — 2026-06-13

Purpose: establish the concrete problem map before changing UI code. This is a
read-only audit of route families, shells, page adapters, shared components, and
module workflow surfaces.

## Authority Loaded

- `AGENTS.md`
- `docs/agent/rules/engineering.md`
- `docs/agent/rules/skills.md`
- `docs/agent/rules/ui.md`
- `docs/agent/rules/workflow.md`
- `docs/agent/rules/references.md`
- `docs/spec/design-system.md`
- `docs/spec/role-route-matrix.md`
- `docs/modules/ui.md`
- `docs/modules/web-app.md`
- `tasks/todo.md`

The current design-system authority is `docs/spec/design-system.md`. The key
runtime adapters are:

- `apps/web/app/components/app-shell.tsx`
- `apps/web/app/components/surface.tsx`
- `apps/web/app/components/data-table/data-table.tsx`
- `apps/web/app/components/status-badge.tsx`
- `apps/web/app/components/kpi/kpi-card.tsx`
- `apps/web/app/components/error-panel.tsx`
- `apps/web/app/components/not-found-panel.tsx`
- `apps/web/app/components/page-skeleton.tsx`

## Current Route Shape

Route scan found 106 page routes and 14 layouts across these families:

| Family | Route files | Pages | Layouts | AppPage pages | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Admin | 28 | 22 | 2 | 7 | `AdminShell`, plus nested settings shell |
| Branch settings | 8 | 6 | 0 | 1 | Several page-local containers |
| Branch POS | 3 | 1 | 1 | 0 | Purpose-built operational shell |
| Branch KDS | 4 | 1 | 1 | 0 | Purpose-built operational board |
| Branch Runner | 4 | 1 | 1 | 0 | Purpose-built customer display |
| Employee | 13 | 10 | 1 | 1 | Task portal shell, `EmployeePage` wrappers |
| Finance | 16 | 13 | 1 | 12 | `FinanceShell`, several local report widgets |
| HR | 6 | 3 | 1 | 3 | `HrShell`, tabbed HR console |
| Inventory | 46 | 40 | 2 | 7 | `InventoryShell`, many client surfaces |
| Menu / Orders / Notifications | 11 | 3 | 2 | 3 | Thin workspace shells |
| Public / root | 9 | 4 | 2 | 0 | Login/access/payment/root frames |

The route count itself is not the problem. The problem is that some families
have legitimate custom shells, while others have page-local composition that
acts like an unregistered shell.

## Legitimate Surface Archetypes

1. Back-office workspace: `AppShell` plus `AppPage`, `AppPageHeader`,
   `AppSection`, `DataTable`, `StatusBadge`, `KpiCard`.
2. Branch operations: POS, KDS, Runner. These can be fullscreen and
   workflow-specific, but state vocabulary and error/blocked-state scale should
   still be deliberate.
3. Employee task portal: mobile-first, narrow, task-led, not a second Admin
   shell. It may keep `EmployeePage` wrappers only when they delegate to app
   surface adapters.
4. Public/auth/return pages: bespoke enough to avoid app chrome, but still
   should not invent a second typography/color language.
5. Branch command/setup: branch-scoped management under `/br/[branchId]/*`.
   This needs a clearer shell contract because it currently mixes `AppPage`,
   manual page containers, and reused Admin clients.

## Main Findings

### P0 — Surface Contract Drift

Branch settings detail pages manually compose containers such as
`mx-auto max-w-5xl space-y-6 p-4 md:p-6` while the hub uses `AppPage`. Example:
`apps/web/app/(protected)/br/[branchId]/settings/pos/page.tsx`. This makes
Branch Setup feel different from Branch Command even though the role-route
matrix defines them as one L1 branch management flow.

`AppShell` also applies `main` padding while many child pages apply `AppPage`
padding. This is survivable but leaves padding authority ambiguous: new pages
cannot tell whether spacing belongs to shell or page adapter.

### P0 — Status Vocabulary Fragmentation

The canonical status registry currently covers order, order payment, payment,
refund, table, print job, tax invoice, and fiscal period. Local status maps or
badge variants remain in Inventory, HR, Employee, Finance, POS/KDS, and Runner.

Concrete examples:

- `apps/web/app/(protected)/inventory/_lib/ui.ts`
- `apps/web/app/(protected)/employee/schedule/schedule-client.tsx`
- `apps/web/app/(protected)/hr/attendance-table.tsx`
- `apps/web/app/(protected)/finance/summary/summary-client.tsx`
- `apps/web/app/(protected)/br/[branchId]/kds/lib/status-config.ts`

The design-system already allows temporary exceptions for POS/KDS and
Inventory, but the remaining maps should be registered or explicitly documented
as hot-path exceptions.

### P0 — Responsive List Contract Not Fully Adopted

`DataTable` is the locked list surface, but several modules still hand-maintain
desktop tables, mobile cards, or raw table wrappers. The highest-risk surfaces
are:

- Inventory supplier invoices
- Finance revenue/reconciliation/statements/summary
- HR attendance/leave/payroll tables
- Admin/branch settings tables
- Menu tables

This is exactly the kind of drift that makes the same data model feel like
different products on different screens.

### P1 — KPI And Empty-State Clones

The canonical metric role is `KpiCard`, but local metric cards remain in
Finance landing, Inventory dashboard, and HR payroll detail. Empty-state
treatments also still appear as raw `Empty`, local cards, or short paragraphs
instead of `AppEmptyState` / `TableEmptyStateRow`.

This is less urgent than shell/status/list drift, but it explains why report
and dashboard pages visually diverge even when they use the same tokens.

### P1 — Inventory Is Correct At IA Level, Uneven At Page Level

Inventory shell navigation now matches the three flow contract:

1. `Kiểm soát tồn`
2. `Nhập/Nhận/Đối soát`
3. `Điều phối/Sản xuất`

The bigger problem is not the sidebar. The drift is inside client pages:
dashboard KPI cards, reports chart mosaics, supplier invoices responsive
surface, local status badge, local mobile primitives, and duplicate touch
wrappers.

### P1 — HR And Employee Need A Shared State Language

Employee is correctly task-led. HR is a management workspace and may remain
denser, but the two surfaces still define attendance/leave/payroll status
labels locally. That creates a mental split between "my workday" and "manager
workday review" even when they describe the same operational facts.

### P2 — Settings Acts Like A Micro-App

Admin settings has a local tab nav and `SettingsPageShell`; branch settings has
no shared layout for detail pages. This is acceptable as an intermediate state,
but it should be collapsed into a documented settings surface pattern before
adding more setup screens.

## Remediation Plan

### Batch 0 — Lock The Surface Map

Write the accepted archetypes into the UI/module docs before code changes:

- which route families may bypass `AppShell`
- which route families must use `AppPage`
- how branch setup pages compose back links, page headers, and shared clients
- where padding belongs between `AppShell` and `AppPage`

Exit criteria: future UI work can classify a page before editing it.

### Batch 1 — Status Registry Pass

Extend `StatusBadge` and shared labels for HR/Employee/Finance statuses first.
Then handle Inventory as a focused domain wave, preserving documented hot-path
exceptions for POS/KDS where needed.

Exit criteria: no new page-local `STATUS_*` maps outside documented exceptions.

### Batch 2 — Branch Setup Shell Normalization

Normalize `/br/[branchId]/settings/*` detail pages to one branch setup pattern:
`AppPage`, `AppPageHeader`, one back action, and shared table/list primitives.

Exit criteria: the branch manager experiences Branch Command and Branch Setup
as one L1 workflow, not a detour into Admin-shaped pages.

### Batch 3 — List Surface And Empty-State Cleanup

Move high-risk hand-maintained lists toward `DataTable` and replace local empty
panels with `AppEmptyState` / `TableEmptyStateRow`.

Start with supplier invoices, HR attendance/leave/payroll, and Finance
revenue/reconciliation because these are user-visible repeated-work surfaces.

### Batch 4 — KPI / Report Rhythm Cleanup

Replace local metric cards with `KpiCard` or add small variants to `KpiCard`.
Normalize Inventory reports and Finance landing without changing their business
meaning.

### Batch 5 — Workflow-Specific Review

After primitives converge, do a browser/runtime pass by actor:

- owner/super manager: Admin, Finance, Reports
- branch manager: Branch Command, Branch Setup, Employee links
- cashier/waiter: Employee to POS
- chef: Employee to KDS
- warehouse/production: Employee to Inventory

Exit criteria: the first screen and next action make sense per actor/device,
not merely per component.

## Verification Gates

For code batches:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- targeted static tests where a ratchet exists
- browser smoke for affected authenticated routes when a valid session/storage
  state is available

For this audit only, no implementation files were changed.
