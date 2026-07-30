# Role, Scope, And Route Matrix

This spec is the source of truth for the control_surface plane, Branch runtime,
role inheritance, and route authorization.

## Product Frame

Cơm Tấm Má Tư is a single-tenant, multi-branch operations and sales system for
a joint-stock F&B company. It has ERP-like coverage across purchasing, receiving,
inventory, production, sales, payments, finance, HR, printing, and reporting,
but product-facing language remains `bộ phần mềm quản lý vận hành và bán hàng`.
Use `ERP` only for architecture comparison, scope comparison, or internal
reference framing.

## Principles

- Role decides the starting surface; permission decides the action.
- `positions.code` is the HR identity source; `user_role` is the derived
  application role carried in the JWT.
- Route-level ACL is a fast gate in `packages/shared/src/auth/module-acl.ts`.
  Mutations and row access still go through permission keys, RLS, and RPC guards.
- Tenant scope is L0. Branch scope is L1. Scope must come from JWT claims and
  URL params, not localStorage or React Context.
- control_surface is the L0 tenant surface. Its direct entry is `/`.
- Branch Manager is a branch role, not a reduced Owner role. Branch Manager
  enters `/br/[branchId]` and never inherits an L0 route merely because the
  underlying capability is shared.
- Top-level modules (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`, and
  `/branches`) belong to control_surface even though their URLs remain stable.
  Branch Manager and Staff use Branch-native workflows under `/br/[branchId]`.
- The only valid authenticated entries are `/` for Owner and
  `/br/[branchId]` for branch-pinned roles. There is no route alias, picker
  root, or compatibility redirect.

## Scope Layers

| Layer         | Meaning                                                                                  | Primary routes                                                                                   | Primary owners                         |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| L0 Tenant     | Chain identity, branch network, roles, finance, inventory oversight, and tenant settings | `/`, `/settings/*`, `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`, `/branches/*` | `owner`                                |
| L1 Branch     | Store floor, POS/KDS setup, Branch staff day flow, menu limits, and local operations     | `/br/[branchId]/*`                                                                               | `branch_manager`, with Owner oversight |
| Staff Runtime | Profile, attendance, leave request, payslip, notifications                               | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`, `/notifications/*`                         | Branch-pinned roles                    |

## Canonical Surfaces

| Surface             | Route family                                                                                                                                       | Scope   | Default audience                                                       | Contract                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| control_surface     | `/`, `/settings/*`, `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`, `/branches/*`                                                   | L0      | `owner`                                                                | Launch and operate tenant-wide modules. `/` is the only Owner entry.                                                                                                                                               |
| Branch Command      | `/br/[branchId]/dashboard`                                                                                                                         | L1      | `branch_manager`, owner oversight                                      | Deep branch management surface for one branch: today status, POS/KDS health, staff day flow, pending local tasks, and links to branch setup.                                                                       |
| Branch Setup        | `/br/[branchId]/settings/*`                                                                                                                        | L1      | `branch_manager`, owner oversight                                      | Configure tables, POS terminals, KDS stations, printers, POS sessions, and branch-local operating settings.                                                                                                        |
| Branch Operations   | `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]/orders`, `/br/[branchId]/stock`, `/br/[branchId]/menu-limits`, `/br/[branchId]/runner` | L1      | Store operators and Branch Manager; explicit Owner oversight           | Run service within one URL-scoped branch. Owner may enter a branch explicitly; branch roles cannot cross branch scope.                                                                                             |
| Inventory Oversight | `/inventory/*`                                                                                                                                     | L0      | `owner`; `accountant` only for PO/GRN; central roles by explicit grant | Tenant inventory, central PO→GRN (D098), stock requests inbox, stocktake, production (central kitchen), consumption, waste, and reports. Branch daily work: `/br/[branchId]/stock/*` (yêu cầu hàng, không GRN/SX). |
| Orders Oversight    | `/orders/*`                                                                                                                                        | L0      | `owner`                                                                | Tenant order oversight and exception handling. Branch order work stays under `/br/[branchId]/orders`.                                                                                                              |
| HR Administration   | `/hr/*`                                                                                                                                            | L0      | `owner`                                                                | Tenant-wide staff CRUD, attendance, leave, payroll, labor contracts, compensation, insurance, accounts, and permissions.                                                                                           |
| Finance             | `/finance/*`                                                                                                                                       | L0      | `owner`, `accountant`                                                  | Operating finance, revenue, expenses, supplier AP, cash summary, inventory value handoff, food-cost signal, tax-support exports, and HĐĐT support.                                                               |
| Ca của tôi / Hồ sơ  | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`                                                                                               | L1/self | branch-pinned roles                                                    | Personal day-flow and profile surfaces: clock, workday tasks, schedule, leave request, payslip. Not an HR admin substitute.                                                                                        |

## HR Administration Semantics

`/hr` is Owner-only. Branch HR visibility and daily approvals are separate L1
workflows under the current branch URL; they do not inherit Owner HR actions.

| Operation                             | Owning surface                                                                                            | Meaning                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/update/deactivate staff access    | `/hr/staff/*`                                                                                             | Owner-only auth/profile/position/branch assignment. Route bucket `staff`; actions gate on `staff:*` permissions.                                          |
| Employee record, salary profile, HĐLĐ | `/hr` employees tab                                                                                       | `employees` + active `employment_contracts`. Owner writes employee/compensation/contract fields; branch manager only reads the branch-safe subset.        |
| Assignment / position work            | `/hr` setup tab                                                                                           | Owner defines positions, employee assignment, and workday rules. Inventory count assignment remains in the Branch stock module.                           |
| Ca làm                                | `/hr` setup tab                                                                                           | Owner manages the global shift catalog and open/close flags. Actual clock-in/out and checklist execution happen under `/br/[branchId]/shift/*`.           |
| Phép nghỉ                             | `/br/[branchId]/shift/schedule/leave`, `/br/[branchId]/shift/leave-approvals`, Owner `/hr` attendance tab | Staff requests leave in Branch runtime. Owner or the assigned Branch Manager may approve/reject; self, peer-manager, and cross-branch review fail closed. |
| Lương                                 | `/hr/payroll/*`                                                                                           | Owner-only payroll calculation/export. Payroll reads attendance, paid leave, and active contracts; it is not a branch shift UI.                           |

## Role Boundaries

The generated post-login table below is derived from `scope.ts` and
`login-destination.ts`. The following table defines the durable business
boundary enforced by route ACL, Server Actions, permission keys, RPC, and RLS.

| Role bucket      | Can manage                                                                                                                                                             | Must not become                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `owner`          | Tenant governance, branches, staff CRUD, attendance/leave oversight and approval, payroll, HĐLĐ, BHXH, finance, settings, and all L0 modules                           | Branch-pinned operator by default                                   |
| `branch_manager` | One branch: POS/KDS/floor settings, daily ops, stock request + on-hand/consumption/stocktake/waste (D093 — no branch GRN/production), staff/attendance, checkout/leave | Staff editor, payroll viewer, contract/insurance reader, or L0 user |
| `cashier`        | POS orders, payments, receipts according to grants                                                                                                                     | Branch settings owner                                               |
| `chef`           | KDS ready/recall and kitchen status according to grants                                                                                                                | Inventory production manager                                        |
| `branch_staff`   | Shift/profile day runtime according to branch assignment                                                                                                               | POS/KDS or tenant admin by label                                    |

## Role And Module Ownership

| Module    | Owner at L0                                                                                                                            | Branch Manager at `/br/[branchId]`                                                                                                           | Other branch roles                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Overview  | Cross-branch operating overview and Owner actions                                                                                      | Current-branch day status                                                                                                                    | Personal work queue only                                  |
| HR        | View all employees, create/update/deactivate staff, attendance, leave approval, payroll, HĐLĐ, BHXH, account and permission management | Read current-branch personal information and attendance; approve checkout/leave for branch staff only; no staff CRUD, payroll, HĐLĐ, or BHXH | Self profile, attendance, leave request, and payslip only |
| Finance   | Tenant revenue, expenses, cash, payroll accounting, tax and reporting                                                                  | No L0 access                                                                                                                                 | No access                                                 |
| Inventory | Tenant oversight, PO pricing/approval and cross-site controls                                                                          | Branch warehouse, physical receiving QC, count, waste and production according to explicit permissions; no purchase price                    | Assigned branch stock tasks only                          |
| Orders    | Tenant oversight and exception handling                                                                                                | Current-branch order work according to explicit permissions                                                                                  | POS/KDS tasks according to role                           |
| Menu      | Tenant catalog and publication                                                                                                         | Daily branch limits only                                                                                                                     | Read/use published menu in assigned workflow              |
| Branches  | Create and configure branch network                                                                                                    | Current-branch floor/device setup only                                                                                                       | No branch configuration                                   |
| Settings  | Tenant identity, payments, integrations, print templates                                                                               | Current-branch tables, POS, KDS, and printers                                                                                                | No configuration                                          |

Inheritance is deny-by-default. A Branch route may reuse a capability key such
as `inventory` or `orders`, but this never grants its L0 route family. A write
requires both the role boundary and its permission key; possessing a stale or
manually granted permission cannot bypass an Owner-only key.

## Permission Boundary

Route access and action authorization must stay separate. The generated
section below (`## Permission Boundary (generated)`) derives this per route
family straight from `permissions.ts`, `module-acl.ts`, and `route-map.ts`;
this hand-authored intro states the rule, the generated table states the
current fact.

<!-- GENERATED:role-route-matrix:begin -->

<!--
  This section is GENERATED by scripts/gen-role-route-matrix.mjs from:
  packages/shared/src/auth/module-acl.ts, packages/shared/src/auth/route-map.ts, packages/shared/src/auth/route-resolution.ts,
  packages/shared/src/auth/nav-config.ts,
  packages/shared/src/auth/scope.ts, packages/shared/src/auth/login-destination.ts, packages/shared/src/auth/types.ts, packages/shared/src/auth/permissions.ts.
  Do NOT hand-edit below this line — run `corepack pnpm gen:route-matrix`
  after any auth-source change, and `corepack pnpm lint:route-matrix` (or
  `--check`) verifies this block is not stale. Hand-authored prose
  (product frame, principles, navigation contract, change checklist) lives
  in the preamble above/below this block, which the generator preserves
  verbatim.
-->

## Module ACL (generated)

Single source: `packages/shared/src/auth/module-acl.ts`. "Nav/tile
advertisement source" lists every nav array in `nav-config.ts` that
surfaces the module to a role; a module with no source is reachable only
by direct URL or as a redirect target.

| Module key | Route path | Allowed roles | Nav/tile advertisement source |
| ---------- | ---------- | ------------- | ------------------------------ |
| `owner` | `/` | Chủ sở hữu | Control surface nav |
| `menu` | `/menu` | Chủ sở hữu | Control surface nav |
| `inventory` | `/inventory` | Chủ sở hữu, Kế toán, Quản lý kho Tổng, Bếp trưởng Bếp TT | Control surface nav |
| `inventory_operations` | `/inventory/stock` | Chủ sở hữu, Quản lý kho Tổng, Bếp trưởng Bếp TT | (not advertised in nav — direct URL / redirect target only) |
| `orders` | `/orders` | Chủ sở hữu | Control surface nav |
| `feedback` | `/feedback` | Chủ sở hữu | Control surface nav |
| `staff` | `/hr/staff` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `hr` | `/hr` | Chủ sở hữu | Control surface nav |
| `hr_payroll` | `/hr/payroll` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `finance` | `/finance` | Chủ sở hữu, Kế toán | Control surface nav |
| `branches` | `/branches` | Chủ sở hữu | Control surface nav |
| `settings` | `/settings` | Chủ sở hữu | Control surface nav |
| `pos` | `/br/*/pos` | Chủ sở hữu, Thu ngân, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `kds` | `/br/*/kds` | Chủ sở hữu, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `runner` | `/br/*/runner` | Chủ sở hữu, Thu ngân, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `branch_home` | `/br/*` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | Operator tile (my_shift) |
| `branch_dashboard` | `/br/*/dashboard` | Chủ sở hữu, Quản lý chi nhánh | Branch management nav |
| `branch_settings` | `/br/*/settings` | Chủ sở hữu, Quản lý chi nhánh | Branch management nav |
| `branch_menu_limits` | `/br/*/menu-limits` | Chủ sở hữu, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `branch_pos_sessions` | `/br/*/pos-sessions` | Chủ sở hữu, Quản lý chi nhánh | Branch operation nav |
| `branch_team` | `/br/*/team` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (my_shift) |
| `branch_stock` | `/br/*/stock` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals); Operator tile (stock) |
| `branch_orders` | `/br/*/orders` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân | Operator tile (sales_kitchen) |
| `branch_feedback` | `/br/*/feedback` | Chủ sở hữu, Quản lý chi nhánh | Branch management nav |
| `employee_checkout_approvals` | `/br/*/shift/checkout-approvals` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals) |
| `employee_leave_approvals` | `/br/*/shift/leave-approvals` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals) |
| `notifications` | `/notifications` | Chủ sở hữu, Kế toán, Quản lý kho Tổng, Bếp trưởng Bếp TT, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | (not advertised in nav — direct URL / redirect target only) |

## Route Family Contracts (generated)

Single source: `ROUTE_FAMILY_CONTRACTS` in
`packages/shared/src/auth/route-map.ts`. `resolveRouteFamilyContract`
matches a pathname against `matchPrefixes` in declaration order (first
match wins), which is why some families with narrower prefixes are
declared before their broader siblings.

| Family id | Surface | Entry path | Match prefixes | Module keys | Requires branchId |
| --------- | ------- | ---------- | --------------- | ----------- | ------------------ |
| `public` | public | `/login` | `/login`, `/access-denied`, `/api/health`, `/api/webhooks`, `/manifest.webmanifest`, `/sw.js`, `/r`, `/api/feedback` | — | no |
| `owner` | owner | `/` | `/` | `owner` | no |
| `settings` | owner | `/settings` | `/settings` | `settings` | no |
| `menu` | owner | `/menu` | `/menu` | `menu` | no |
| `orders` | owner | `/orders` | `/orders` | `orders` | no |
| `feedback` | owner | `/feedback` | `/feedback` | `feedback` | no |
| `inventory` | owner | `/inventory` | `/inventory` | `inventory`, `inventory_operations` | no |
| `finance` | owner | `/finance` | `/finance` | `finance` | no |
| `branches` | owner | `/branches` | `/branches` | `branches` | no |
| `hr` | owner | `/hr` | `/hr` | `hr`, `hr_payroll`, `staff` | no |
| `notifications` | utility | `/notifications` | `/notifications` | `notifications` | no |
| `branch-home` | branch_operation | `/br/[branchId]` | `/br/[branchId]` | `branch_home` | yes |
| `branch-shift-checkout-approvals` | branch_operation | `/br/[branchId]/shift/checkout-approvals` | `/br/[branchId]/shift/checkout-approvals` | `employee_checkout_approvals` | yes |
| `branch-shift-leave-approvals` | branch_operation | `/br/[branchId]/shift/leave-approvals` | `/br/[branchId]/shift/leave-approvals` | `employee_leave_approvals` | yes |
| `branch-shift` | branch_operation | `/br/[branchId]/shift` | `/br/[branchId]/shift` | `branch_home` | yes |
| `branch-profile` | branch_operation | `/br/[branchId]/profile` | `/br/[branchId]/profile` | `branch_home` | yes |
| `branch-stock` | branch_operation | `/br/[branchId]/stock` | `/br/[branchId]/stock` | `branch_stock` | yes |
| `branch-orders` | branch_operation | `/br/[branchId]/orders` | `/br/[branchId]/orders` | `branch_orders` | yes |
| `branch-menu-limits` | branch_operation | `/br/[branchId]/menu-limits` | `/br/[branchId]/menu-limits` | `branch_menu_limits` | yes |
| `branch-pos-sessions` | branch_operation | `/br/[branchId]/pos-sessions` | `/br/[branchId]/pos-sessions` | `branch_pos_sessions` | yes |
| `branch-settings` | branch_management | `/br/[branchId]/settings` | `/br/[branchId]/settings` | `branch_settings` | yes |
| `branch-dashboard` | branch_management | `/br/[branchId]/dashboard` | `/br/[branchId]/dashboard` | `branch_dashboard` | yes |
| `branch-team` | branch_management | `/br/[branchId]/team` | `/br/[branchId]/team` | `branch_team` | yes |
| `branch-feedback` | branch_management | `/br/[branchId]/feedback` | `/br/[branchId]/feedback` | `branch_feedback` | yes |
| `pos` | branch_operation | `/br/[branchId]/pos` | `/br/[branchId]/pos` | `pos` | yes |
| `kds` | branch_operation | `/br/[branchId]/kds` | `/br/[branchId]/kds` | `kds` | yes |
| `runner` | branch_operation | `/br/[branchId]/runner` | `/br/[branchId]/runner` | `runner` | yes |

## Post-Login Home By Role (generated)

Derived from `getDefaultRedirect` (`login-destination.ts`) for the
no-`returnTo` case — i.e. where a fresh login actually lands.

| Role | Desktop context | Phone / station context | Notes |
| ---- | ------------------------- | ------------------------ | ----- |
| Chủ sở hữu (`owner`) | / (Owner overview) | / (Owner overview) | Owner enters the L0 surface directly and opens a branch explicitly when needed. |
| Kế toán (`accountant`) | /finance | /finance | D076 adapter until ADR 0015; D091 grants only the Inventory GRN/PO slice. |
| Quản lý kho Tổng (`central_supply_ops`) | /inventory | /inventory | D076 adapter until ADR 0015; D091 scopes Inventory work to the pinned central site. |
| Bếp trưởng Bếp TT (`central_kitchen_lead`) | /inventory | /inventory | D076 adapter until ADR 0015; D091 scopes Inventory work to the pinned central site. |
| Quản lý chi nhánh (`branch_manager`) | /br/{branchId} (Branch home for the claimed branch) | /br/{branchId} (Branch home for the claimed branch) | Branch-pinned roles land in the Branch home for their JWT branch_id; missing branch scope fails closed. |
| Thu ngân (`cashier`) | /br/{branchId} (Branch home for the claimed branch) | /br/{branchId} (Branch home for the claimed branch) | Branch-pinned roles land in the Branch home for their JWT branch_id; missing branch scope fails closed. |
| Bếp (`chef`) | /br/{branchId} (Branch home for the claimed branch) | /br/{branchId} (Branch home for the claimed branch) | Branch-pinned roles land in the Branch home for their JWT branch_id; missing branch scope fails closed. |
| Nhân sự chi nhánh (`branch_staff`) | /br/{branchId} (Branch home for the claimed branch) | /br/{branchId} (Branch home for the claimed branch) | Branch-pinned roles land in the Branch home for their JWT branch_id; missing branch scope fails closed. |

## Permission Boundary (generated)

Route family -> required route bucket (control_surface ACL intersected with the module capability union) -> the action-gate
permission keys in that family's namespace(s), read from
`PERMISSION_KEYS` in `permissions.ts`. This is the full set in-namespace,
not a hand-picked sample — route access and action authorization stay
separate gates (route bucket here, permission key at the mutation site).

| Route family | Route prefix(es) | Required route bucket | Action gate keys (from `permissions.ts`) |
| ------------ | ------------------ | ----------------------- | ------------------------------------------ |
| owner | `/` | owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| settings | `/settings` | owner | `settings:branch`, `settings:branch_network`, `settings:integrations`, `settings:tenant` |
| menu | `/menu` | owner | `menu:manage_category`, `menu:publish`, `menu:read`, `menu:write` |
| orders | `/orders` | owner | `orders:read`, `orders:refund`, `orders:refund_approve`, `orders:void`, `orders:write` |
| feedback | `/feedback` | owner | `feedback:manage_qr`, `feedback:view` |
| inventory-home | `/inventory` (exact) | central_kitchen_lead/central_supply_ops/owner | `inventory:adjust_approve`, `inventory:count_approve`, `inventory:count_assign`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:request_cancel`, `inventory:request_create`, `inventory:request_fulfill`, `inventory:request_submit`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:valuation_read`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
| inventory-procurement | `/inventory/purchase-requests`, `/inventory/purchase-orders`, `/inventory/grn` | accountant/central_kitchen_lead/central_supply_ops/owner | `procurement:grn_amend`, `procurement:grn_confirm`, `procurement:grn_create`, `procurement:invoice_create`, `procurement:invoice_match`, `procurement:po_approve`, `procurement:po_create`, `procurement:price_list_read`, `procurement:price_list_write`, `procurement:read`, `procurement:request_manage`, `procurement:supplier_manage` |
| inventory-operations | `/inventory/consumption`, `/inventory/count-assignments`, `/inventory/count-slips`, `/inventory/ingredients`, `/inventory/issues`, `/inventory/menu-recipes`, `/inventory/production`, `/inventory/recipes`, `/inventory/reports`, `/inventory/settings`, `/inventory/stock`, `/inventory/stocktake`, `/inventory/stock-requests`, `/inventory/supplier-invoices`, `/inventory/suppliers`, `/inventory/transfers`, `/inventory/waste` | central_kitchen_lead/central_supply_ops/owner | `inventory:adjust_approve`, `inventory:count_approve`, `inventory:count_assign`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:request_cancel`, `inventory:request_create`, `inventory:request_fulfill`, `inventory:request_submit`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:valuation_read`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff`, `procurement:grn_amend`, `procurement:grn_confirm`, `procurement:grn_create`, `procurement:invoice_create`, `procurement:invoice_match`, `procurement:po_approve`, `procurement:po_create`, `procurement:price_list_read`, `procurement:price_list_write`, `procurement:read`, `procurement:request_manage`, `procurement:supplier_manage` |
| finance | `/finance` | accountant/owner | `finance:ap_pay`, `finance:expense_approve`, `finance:expense_create`, `finance:payroll_approve`, `finance:payroll_calculate`, `finance:view` |
| branches | `/branches` | owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| hr | `/hr` | owner | `hr:approve_checkout`, `hr:approve_leave_request`, `hr:manage_employee`, `hr:request_leave`, `hr:view_employee`, `staff:assign_permission`, `staff:assign_position`, `staff:manage`, `staff:view` |
| notifications | `/notifications` | accountant/branch_manager/branch_staff/cashier/central_kitchen_lead/central_supply_ops/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-home | `/br/[branchId]` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-shift-checkout-approvals | `/br/[branchId]/shift/checkout-approvals` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-shift-leave-approvals | `/br/[branchId]/shift/leave-approvals` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-shift | `/br/[branchId]/shift` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-profile | `/br/[branchId]/profile` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-stock | `/br/[branchId]/stock` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-orders | `/br/[branchId]/orders` | branch_manager/cashier/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-menu-limits | `/br/[branchId]/menu-limits` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-pos-sessions | `/br/[branchId]/pos-sessions` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-settings | `/br/[branchId]/settings` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-dashboard | `/br/[branchId]/dashboard` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-team | `/br/[branchId]/team` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-feedback | `/br/[branchId]/feedback` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| pos | `/br/[branchId]/pos` | branch_manager/cashier/owner | `pos:apply_discount`, `pos:close_shift`, `pos:close_shift_variance_override`, `pos:confirm_payment`, `pos:open_cashbox`, `pos:print`, `pos:reprint_receipt`, `pos:send_kitchen`, `pos:use`, `pos:void_order`, `pos:void_paid_order` |
| kds | `/br/[branchId]/kds` | branch_manager/chef/owner | `kds:mark_ready`, `kds:recall`, `kds:use` |
| runner | `/br/[branchId]/runner` | branch_manager/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |

<!-- GENERATED:role-route-matrix:end -->

## Navigation Contract

Owner needs a control flow that answers:

- What is happening today across the chain?
- What must I set up before stores can operate?
- Where do I add branches, staff, permissions, and operating policies?
- Where do I open cross-branch modules and system settings?

Branch manager needs a branch flow that answers:

- What is happening in my branch today?
- Are POS, KDS, printers, tables, menu limits, and staff day flow ready?
- What branch tasks need action now?
- Where do I correct branch setup without entering L0 control?

Owner enters `/` directly. Branch-pinned roles enter `/br/{branchId}` derived
from the JWT branch claim. A missing branch claim, mismatched branch ID, or
unknown route fails closed; the application does not select another branch or
translate a compatibility route. Owner opens a specific Branch runtime only by
choosing that branch explicitly.

## Change Checklist

Any PR that changes role/surface behavior must update these together:

- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/route-map.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `packages/shared/src/auth/scope.ts`
- `packages/shared/src/auth/login-destination.ts`
- Auth/navigation tests in `packages/shared/src/auth/__tests__/`
- This spec's hand-authored product boundaries only when the rule itself changes.

The `## Module ACL`, `## Route Family Contracts`, `## Post-Login Home By
Role`, and `## Permission Boundary` sections below are **GENERATED, not
hand-maintained** — run `corepack pnpm gen:route-matrix` after any auth-source
change and commit the result; do not hand-edit inside the
`GENERATED:role-route-matrix` markers. `corepack pnpm lint:route-matrix`
(wired into the root lint aggregate) fails the build if the doc drifts from
`packages/shared/src/auth/{module-acl,route-map,nav-config,scope,login-destination,types,permissions}.ts`.
