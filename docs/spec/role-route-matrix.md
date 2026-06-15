# Role, Scope, And Route Matrix

This spec is the source of truth for separating tenant-level management,
branch-level management, domain workspaces, and staff self-service.

## Product Frame

Cơm Tấm Má Tư is a single-tenant, multi-branch operations and sales system for
an HKD F&B business. It has ERP-like coverage across purchasing, receiving,
inventory, production, sales, payments, finance, HR, printing, and reporting,
but product-facing language remains `bộ phần mềm quản lý vận hành và bán hàng`.
Use `ERP` only for architecture comparison, scope comparison, or internal
reference framing.

## Principles

- Role decides the starting surface; permission decides the action.
- `positions.code` is the HR source; `user_role` / access bucket is only the
  compatibility route bucket.
- Route-level ACL is a fast gate in `packages/shared/src/auth/module-acl.ts`.
  Mutations and row access still go through permission keys, RLS, and RPC guards.
- Tenant scope is L0. Branch scope is L1. Scope must come from JWT claims and
  URL params, not localStorage or React Context.
- Admin is not a catch-all application menu. Admin is the tenant command and
  foundation surface.
- Branch Manager is not an Admin user with fewer tabs. Branch Manager owns a
  branch command surface under `/br/[branchId]/*`.
- Domain workspaces (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`) are
  not Admin sub-pages. They are workflow surfaces filtered by role, branch, and
  permission.

## Scope Layers

| Layer        | Meaning                                                                                | Primary routes                                                | Primary owners                                       |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| L0 Tenant    | Chain identity, branch network, roles, permissions, executive reports, tenant settings | `/admin/*`, tenant-wide workspace views                       | `owner`                                              |
| L1 Branch    | Store floor, POS/KDS setup, branch staff day flow, menu limits, local operations       | `/br/[branchId]/*`, branch-scoped workspace views             | `branch_manager`, with owner oversight               |
| Domain       | Procurement, inventory, orders, HR, finance, menu/catalog workflows                    | `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*` | Role-specific operators                              |
| Self-service | Profile, attendance, leave, payslip, notifications                                     | `/employee/*`, `/notifications/*`                             | Non-admin staff                                      |

## Canonical Surfaces

| Surface               | Route family                                                                                      | Scope             | Default audience                                                           | Contract                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant Command        | `/admin/dashboard`, `/admin/reports/*`                                                            | L0                | `owner`                                                                    | Shows operating truth across branches and links to the correct domain workspace, not placeholder cards.                                      |
| Tenant Setup          | `/admin/settings/general`, `/admin/settings/branches`, `/admin/staff/*`                           | L0                | `owner`                                                                    | Configure HKD identity, branch network, positions, permission templates, and staff access. Includes the read-only permission audit log (`/admin/staff/audit`).                                                   |
| Direct Tenant Support | `/admin/accounting/*`                                                                             | L0                | `owner`                                                                    | Direct-only support routes such as period close/reopen. Not default navigation.                                                              |
| Branch Command        | `/br/[branchId]/dashboard`                                                                        | L1                | `branch_manager`, owner oversight                                          | Deep branch management surface for one branch: today status, POS/KDS health, staff day flow, pending local tasks, and links to branch setup. |
| Branch Setup          | `/br/[branchId]/settings/*`                                                                       | L1                | `branch_manager`, owner oversight                                          | Configure tables, POS terminals, KDS stations, printers, POS sessions, and branch-local operating settings.                                  |
| Branch Operations     | `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]/menu-limits`, `/br/[branchId]/runner` | L1                | Store operators and branch manager                                         | Run service. Never require the operator to understand Admin.                                                                                 |
| Inventory Workspace   | `/inventory/*`                                                                                    | L0/L1/domain site | owner, branch_manager, warehouse_manager, production_manager               | Stock, procurement, transfer, stocktake, production, and reports by site/role. Procurement also covers AP đối soát hóa đơn NCC (`/inventory/supplier-invoices`); waste approvals (`/inventory/waste/approvals`) and QC policy (`/inventory/settings/qc`) gate on their own grants.                                                               |
| Orders Workspace      | `/orders/*`                                                                                       | L0/L1             | owner, branch_manager, cashier                                            | Cross-branch or branch-filtered order management depending on role and scope.                                                                |
| HR Workspace          | `/hr/*`                                                                                           | L0/L1             | owner, branch_manager                                                      | Staff, day work, leave, attendance, and approvals. Payroll remains direct-support for owner.                                                |
| Finance Workspace     | `/finance/*`                                                                                      | L0                | owner                                                                      | HKD operating finance, revenue, expenses, reconciliation, reports, and tax-support exports. Includes the HĐĐT register (`/finance/invoices`) and the B2C daily-summary trigger (`/finance/summary`).                                                  |
| Trang nhân viên       | `/employee/*`                                                                                     | self              | non-admin staff                                                            | Personal workday surface. Not an admin substitute.                                                                                           |

## Role Boundaries

| Role bucket          | Home target                                   | Can manage                                                                                            | Must not become                                   |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `owner`              | `/admin/dashboard`                            | Tenant governance, branch network, permission grants, finance/reports, emergency oversight in domains | Daily floor operator by default                   |
| `branch_manager`     | `/employee` plus Branch Command direct link   | One branch: POS/KDS/floor settings, branch day flow, branch inventory tasks, branch staff approvals   | Partial Admin user                                |
| `warehouse_manager`  | `/employee` plus Inventory direct link        | Branch warehouse (Kho CN) receiving, stock, transfers, procurement tasks according to grants          | Tenant admin                                      |
| `production_manager` | `/employee` plus Inventory direct link        | Branch production (Bếp CN) and related stock movement according to grants                             | Tenant admin                                      |
| `cashier`            | `/employee` plus POS direct link              | POS orders, payments, receipts according to grants                                                    | Branch settings owner                             |
| `waiter`             | `/employee` plus POS direct link              | Service/POS actions according to grants                                                               | Separate business workflow from cashier long-term |
| `chef`               | `/employee` plus KDS direct link              | KDS ready/recall and kitchen status according to grants                                               | Inventory production manager                      |
| `office`             | `/employee` or assigned workspace direct link | Back-office tasks explicitly granted                                                                  | Tenant admin by label alone                       |

## Permission Boundary

Route access and action authorization must stay separate:

| Capability                 | Route family                    | Required route bucket              | Action gate examples                                                           |
| -------------------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Tenant settings            | `/admin/settings/general`       | owner                              | `settings:tenant`, `settings:integrations`                                     |
| Branch network             | `/admin/settings/branches`      | owner                              | `settings:branch_network`                                                      |
| Staff access grants        | `/admin/staff/*`                | owner                              | `staff:manage`, `staff:assign_position`, `staff:assign_permission`             |
| Permission audit log       | `/admin/staff/audit`            | owner                              | `staff:assign_permission`, `settings:tenant` (RLS-gated read)                  |
| Branch floor setup         | `/br/[branchId]/settings/*`     | owner/branch_manager               | `settings:branch`, `printer:manage`, POS/KDS config-specific grants when added |
| POS service                | `/br/[branchId]/pos`            | branch_manager/cashier/waiter      | `pos:use`, `pos:confirm_payment`, `pos:print`, `pos:void_order`                |
| KDS service                | `/br/[branchId]/kds`            | branch_manager/chef                | `kds:use`, `kds:mark_ready`, `kds:recall`                                      |
| Branch staff day approvals | `/hr/*` or branch command links | owner/branch_manager               | `hr:view_employee`, `hr:approve_checkout`, `hr:approve_leave_request`          |
| Tenant finance             | `/finance/*`                    | owner                              | `finance:view`, `finance:expense_approve`, `finance:ap_pay`                    |
| HĐĐT register              | `/finance/invoices`             | owner                              | `finance:view`                                                                 |
| HĐĐT B2C daily summary     | `/finance/summary`              | owner                              | `settings:tenant`                                                              |
| Supplier invoice đối soát  | `/inventory/supplier-invoices`  | owner/warehouse_manager/production_manager | `procurement:read`, `procurement:invoice_match`                        |
| Waste approvals            | `/inventory/waste/approvals`    | all staff with grant                | `inventory:waste_approve`                                                       |
| QC receiving policy        | `/inventory/settings/qc`        | owner/branch_manager/warehouse_manager/production_manager | `settings:tenant`                                       |

## Navigation Contract

Owner needs a management flow that answers:

- What is happening today across the chain?
- What must I set up before stores can operate?
- Where do I add branches, staff, permissions, and operating policies?
- Where do I jump into Inventory, Orders, HR, Finance, or Reports?

Branch manager needs a branch flow that answers:

- What is happening in my branch today?
- Are POS, KDS, printers, tables, menu limits, and staff day flow ready?
- What branch tasks need action now?
- Where do I correct branch setup without entering tenant Admin?

Root entry (`/`) delegates to the shared role default. Owner
lands in Tenant Command; Branch Manager and other non-admin staff land in
`/employee`. Employee is the default staff/manager task entry. Branch Command
stays available as a branch-scoped management surface from Employee manager
tools or direct links, not as a new hub.

## Runtime Status

Implemented in the first route/auth slice:

- `branch_dashboard` module and route family exist.
- Branch Manager post-login/fallback target is `/employee`.
- Branch Manager no longer passes the tenant `settings` module gate.
- App discovery exposes domain workspaces, Branch Command, branch settings, and
  branch menu limits for Branch Manager according to ACL.

Implemented in the second (dashboard) slice:

- `/admin/dashboard` is the L0 tenant command surface: today KPI grid, live
  per-branch operating status (paid orders, revenue, POS session, print-agent
  health) with deep links into Branch Command, a tenant setup section, and
  domain-workspace handoff cards.
- `/br/[branchId]/dashboard` surfaces the branch day state: revenue/orders,
  table occupancy, kitchen load, POS-session/printer/checkout-approval
  readiness, plus the command tiles.

## Change Checklist

Any PR that changes role/surface behavior must update these together:

- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/route-map.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `packages/shared/src/auth/scope.ts`
- Auth/navigation tests in `packages/shared/src/auth/__tests__/`
- `docs/modules/auth.md`
- `docs/modules/web-app.md`
- This spec
