> ARCHIVED 2026-05-07 — Folded into 01-BRAND-SOFTWARE-PROGRAM.md

# Merchant Platform IA Contract

> Status: planning contract  
> Date: 2026-05-06  
> Parent: `docs/plan/super-app-merchant-platform-rebuild.md`  
> Scope: route ownership, navigation grouping, landing behavior, and first rebuild slices for the Super App - Merchant Platform direction.

## Decision

Merchant Platform is not a new app route. It is the unified management and operating experience across the route families that already exist.

```text
Merchant Platform = Admin foundation + Domain workspaces + Frontline handoff
```

Do not create `/merchant/*` for the MVP. Do not create a new shell just because the navigation is being reframed. The platform feel should come from:

- one route ownership matrix
- one ACL/nav/discovery source
- one design-system contract
- one vocabulary source
- consistent handoff between workspaces
- exception-first management views

## User Mental Model

The product should answer different questions for different users.

| User type | First question | Primary surface |
| --- | --- | --- |
| Staff | What do I need to do today? | `/employee` |
| Cashier / waiter | Where do I sell and collect payment? | `/br/[branchId]/pos` |
| Chef | What should I cook now? | `/br/[branchId]/kds` |
| Branch manager | What is happening at my branch and what needs fixing? | `/employee` handoff + branch/domain workspaces |
| Area manager | Which branch needs attention? | Merchant navigation over admin/reports/inventory/orders |
| Owner / super manager | Is the business under control? | `/admin/dashboard`, `/finance`, `/inventory`, `/hr` |
| Warehouse / production manager | What stock/procurement/production work is due? | `/inventory` |

## Landing Rules

Do not force every user through the same dashboard.

| Role | Default landing | Why |
| --- | --- | --- |
| `owner` | `/admin/dashboard` | tenant-wide control and reporting |
| `super_manager` | `/admin/dashboard` | tenant-wide operations and escalation |
| `area_manager` | `/employee` | self-service first, then branch/domain handoff |
| `branch_manager` | `/employee` | self-service first, then branch operations |
| `warehouse_manager` | `/employee` | self-service first, then Inventory handoff |
| `production_manager` | `/employee` | self-service first, then Inventory/production handoff |
| `cashier` | `/employee` | clock/schedule first, then POS handoff |
| `waiter` | `/employee` | clock/schedule first, then POS handoff |
| `chef` | `/employee` | clock/schedule first, then KDS handoff |
| `office` | `/employee` | self-service and office-specific handoff |

Current default redirect already follows this shape: owner/super_manager to `/admin/dashboard`, other roles to `/employee`.

## Canonical Navigation Groups

These are IA groups, not necessarily literal sidebar headings for every role.

### 1. Hôm Nay

Owner route:

- `/employee`

Purpose:

- daily self-service
- next action
- role-gated handoff
- personal notifications

Do not put management dashboards here.

### 2. Bán Hàng

Owner routes:

- `/br/[branchId]/pos`
- `/orders`
- `/br/[branchId]/menu-limits`

Purpose:

- sell
- collect payment
- inspect orders
- manage daily item limits

Do not move POS payment flow into Finance or Admin.

### 3. Bếp

Owner routes:

- `/br/[branchId]/kds`
- KDS station settings through branch/admin settings

Purpose:

- live kitchen queue
- bump/recall tickets
- station configuration

Do not expose KDS as a dashboard card mosaic.

### 4. Kho Hàng

Owner routes:

- `/inventory/*`

Purpose:

- procurement
- GRN
- supplier invoices
- stock levels
- transfers
- production
- stocktake
- waste/expiry/reports

Do not revive `/admin/inventory/*`.

### 5. Tài Chính

Owner routes:

- `/finance/*`
- `/admin/settings/payments` for provider configuration

Purpose:

- revenue
- reconciliation
- chart of accounts
- journal
- HĐĐT
- statements
- provider setup

Do not create a separate merchant reconciliation route.

### 6. Nhân Sự

Owner routes:

- `/hr/*`
- `/admin/staff/*`
- `/employee/*` for self-service only

Purpose:

- staff records
- shifts
- attendance management
- payroll management
- permissions
- employee self-service release surfaces

Do not put staff CRUD or payroll approval in `/employee`.

### 7. Cấu Hình

Owner routes:

- `/admin/settings/*`
- `/br/[branchId]/settings/*`

Purpose:

- tenant settings
- branch setup
- POS/KDS/table/printer configuration
- payment provider settings

Do not hide frequent operational work inside settings.

### 8. Báo Cáo Và Kiểm Soát

Owner routes:

- `/admin/dashboard`
- `/admin/reports/*`
- `/finance/*`
- `/inventory/reports`

Purpose:

- owner review
- branch comparison
- finance and stock control
- exception drilldown

Do not turn every module landing into a second owner dashboard.

## Handoff Contract

A handoff is a link from one workspace to the canonical route owner. It is not a duplicate workflow.

| From | To | Allowed payload |
| --- | --- | --- |
| `/employee` | POS/KDS/domain workspace | link, branch context, blocked reason |
| `/admin/dashboard` | reports/finance/inventory/orders | filter params, date/branch context |
| `/finance` | POS/order detail | order/payment identifiers for read-through |
| `/inventory` | Finance/AP | supplier invoice/payment reference |
| `/hr` | Employee self-service | release status only, not draft payroll data |

Rules:

- Handoff links must respect `module-acl.ts` and app discovery.
- Handoff should preserve scope through path/query params.
- Handoff must not expose data the destination route would otherwise block.
- Handoff copy should name the destination job, not the implementation module.

## Page Versus Tab Versus Sheet

Use this decision table before adding route files.

| Need | Use |
| --- | --- |
| durable workflow, shareable, route-level ACL | page |
| same workflow, different status/mode/date/branch filter | query param or tabs |
| short contextual create/edit action | sheet or dialog |
| destructive/irreversible confirmation | alert dialog |
| entity history/audit inside a detail view | tab |
| long line-heavy form | page |
| support/debug-only inspection | direct route, not primary nav |

## First Rebuild Slices

### Slice 1 - IA Audit And Nav Inventory

Goal:

- produce a current route-to-job inventory and mark duplicate or retired entries.

Read:

- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `apps/web/app/employee/page.tsx`
- `apps/web/app/admin/components/admin-shell.tsx`

Output:

- list of primary nav entries
- list of secondary handoff entries
- list of direct/support routes
- list of retired routes

No runtime UI changes in this slice.

### Slice 2 - Cổng Nhân Viên Navigation Cleanup

Goal:

- make `/employee` the role-based daily entry without becoming an app launcher.

Scope:

- keep self-service nav primary
- keep POS/KDS/domain handoff secondary
- hide or demote `/employee/permissions`
- blocked handoff links show reason, not admin language

Acceptance:

- first viewport answers clock state, next shift, next action
- manager sees self-service first
- staff without branch context do not see fake POS/KDS availability

### Slice 3 - Merchant Workspace Entry Points

Goal:

- make admin/domain workspaces feel like one platform without creating `/merchant/*`.

Scope:

- normalize workspace labels and descriptions
- ensure `DOMAIN_WORKSPACE_ITEMS` and `BRANCH_OPERATION_ITEMS` are the source of cross-surface discovery
- remove duplicate app-launcher cards where they create a second navigation system

Acceptance:

- owner/super_manager can reach Admin, Finance, HR, Inventory from one coherent path
- branch roles see only branch-relevant operations
- route owner does not change

### Slice 4 - Reports And Exceptions

Goal:

- move Merchant Platform value from decorative dashboards to exception/control views.

Scope:

- dashboard summaries link to canonical owner routes
- report cards answer owner questions
- exception states route to the workspace that can resolve them

Acceptance:

- no dashboard card becomes a hidden workflow
- every CTA has a canonical route owner

## Acceptance Gates For IA Work

Before runtime edits:

- route owner identified
- ACL module key identified
- branch/tenant/employee scope identified
- UI primitive/pattern identified
- duplicate workflow check completed
- glossary/copy source checked

Before marking an implementation slice complete:

- relevant role matrix smoke tested
- mobile and desktop layout checked when UI changed
- `pnpm typecheck && pnpm lint && pnpm build` passes

## Explicit Non-Decisions

- No new `/merchant/*` route for MVP.
- No new design-system layer.
- No new role-specific shell.
- No consumer super-app scope.
- No route split for short actions that fit sheet/dialog.
