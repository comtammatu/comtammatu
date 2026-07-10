# Role, Scope, And Route Matrix

This spec is the source of truth for separating tenant-level management,
branch-level management, domain workspaces, and staff day runtime.

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

| Layer         | Meaning                                                                                | Primary routes                                                           | Primary owners                                |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| L0 Tenant     | Chain identity, branch network, roles, permissions, executive reports, tenant settings | `/admin/*`, tenant-wide workspace views                                  | `owner`                                       |
| L1 Branch     | Store floor, POS/KDS setup, branch staff day flow, menu limits, local operations       | `/br/[branchId]/*`, branch-scoped workspace views                        | `branch_manager`, with owner oversight        |
| Domain        | Procurement, inventory, orders, HR, finance, menu/catalog workflows                    | `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`            | Role-specific operators                       |
| Staff Runtime | Profile, attendance, leave request, payslip, notifications                             | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`, `/notifications/*` | Branch-pinned and central-site operator roles |

## Canonical Surfaces

| Surface             | Route family                                                                                      | Scope             | Default audience                                             | Contract                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant Setup        | `/admin/settings/general`, `/admin/settings/branches`, `/hr/staff/*`                              | L0                | `owner`                                                      | Configure HKD identity, branch network, positions, permission templates, and staff access. Includes the read-only permission audit log (`/hr/staff/audit`).                                                                                                                                                            |
| Branch Command      | `/br/[branchId]/dashboard`                                                                        | L1                | `branch_manager`, owner oversight                            | Deep branch management surface for one branch: today status, POS/KDS health, staff day flow, pending local tasks, and links to branch setup.                                                                                                                                                                           |
| Branch Setup        | `/br/[branchId]/settings/*`                                                                       | L1                | `branch_manager`, owner oversight                            | Configure tables, POS terminals, KDS stations, printers, POS sessions, and branch-local operating settings.                                                                                                                                                                                                            |
| Branch Operations   | `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]/menu-limits`, `/br/[branchId]/runner` | L1                | Store operators and branch manager, owner cover-ca           | Run service. Never require the operator to understand Admin. Branch Hub is the promoted home for every active role; Owner workspaces remain permission-gated shortcuts.                                                                                                                                                |
| Inventory Workspace | `/inventory/*`                                                                                    | L0/L1/domain site | owner, branch_manager, warehouse_manager, production_manager | Stock, procurement, transfer, stocktake, production, and reports by site/role. Procurement also covers AP đối soát hóa đơn NCC (`/inventory/supplier-invoices`); waste approvals (`/inventory/waste/approvals`) and QC policy (`/inventory/settings/qc`) gate on their own grants.                                     |
| Orders Workspace    | `/orders/*`                                                                                       | L0/L1             | owner, branch_manager, cashier                               | Cross-branch or branch-filtered order management depending on role and scope.                                                                                                                                                                                                                                          |
| HR Workspace        | `/hr/*`                                                                                           | L0/L1             | owner, branch_manager                                        | HR control workspace: owner manages staff records, staff account handoff, employment profile, global shift setup, position-to-workday setup, payroll, and labor-contract fields. Branch manager only gets branch-safe attendance/leave oversight. Branch daily clock/work execution stays in `/br/[branchId]/shift/*`. |
| Finance Workspace   | `/finance/*`                                                                                      | L0                | owner, office                                                | HKD operating finance, revenue, expenses, cash summary, inventory value handoff, food-cost signal, and tax-support exports. Includes the HĐĐT register (`/finance/invoices`) and the B2C daily-summary trigger (`/finance/summary`); actions remain permission-gated.                                                  |
| Ca của tôi / Hồ sơ  | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`                                              | L1/self           | branch-pinned and central-site operator roles                | Personal day-flow and profile surfaces: clock, workday tasks, schedule, leave request, payslip. Not an HR admin substitute.                                                                                                                                                                                            |

## HR Workspace Semantics

`/hr` is a workspace, not the whole authorization model and not the daily staff
app. Its meaning is narrow:

| Operation                             | Owning surface                                                                                      | Meaning                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/update/deactivate staff access    | `/hr/staff/*`                                                                                       | Owner-only auth/profile/position/branch assignment. Route bucket `staff`; actions gate on `staff:*` permissions.                                   |
| Employee record, salary profile, HĐLĐ | `/hr` employees tab                                                                                 | `employees` + active `employment_contracts`. Owner writes employee/compensation/contract fields; branch manager only reads the branch-safe subset. |
| Assignment / position work            | `/hr` setup tab and `/br/[branchId]/team/*`                                                         | Owner defines global position-to-workday rules. Branch team surfaces show or arrange daily branch people work.                                     |
| Ca làm                                | `/hr` setup tab                                                                                     | Owner manages the global shift catalog and open/close flags. Actual clock-in/out and checklist execution happen under `/br/[branchId]/shift/*`.    |
| Phép nghỉ                             | `/br/[branchId]/shift/schedule/leave`, `/br/[branchId]/shift/leave-approvals`, `/hr` attendance tab | Staff requests leave from branch runtime; branch manager/owner approve in branch runtime; HR workspace reads the oversight list.                   |
| Lương                                 | `/hr/payroll/*`                                                                                     | Owner-only payroll calculation/export. Payroll reads attendance, paid leave, and active contracts; it is not a branch shift UI.                    |

## Role Boundaries

Home target (post-login landing) is device-aware and site-aware per D050/D055
— see the generated "Post-Login Home By Role" table below for the exact
per-device destination derived from `scope.ts`/`branch-hub.ts`. This table
states the durable "can manage / must not become" boundary, which the code
does not fully encode and stays hand-authored.

| Role bucket          | Can manage                                                                                            | Must not become                 |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------- |
| `owner`              | Tenant governance, branch network, permission grants, finance/reports, emergency oversight in domains | Daily floor operator by default |
| `branch_manager`     | One branch: POS/KDS/floor settings, branch day flow, branch inventory tasks, branch staff approvals   | Partial Admin user              |
| `warehouse_manager`  | Receiving, stock, transfers, procurement tasks according to grants                                    | Tenant admin                    |
| `production_manager` | Production and related stock movement according to grants; no active site maps to this role           | Tenant admin                    |
| `cashier`            | POS orders, payments, receipts according to grants                                                    | Branch settings owner           |
| `chef`               | KDS ready/recall and kitchen status according to grants                                               | Inventory production manager    |
| `office`             | Back-office tasks explicitly granted, read access to `/finance` (D058 §3)                             | Tenant admin by label alone     |

## Permission Boundary

Route access and action authorization must stay separate. The generated
section below (`## Permission Boundary (generated)`) derives this per route
family straight from `permissions.ts`, `module-acl.ts`, and `route-map.ts`;
this hand-authored intro states the rule, the generated table states the
current fact.

<!-- GENERATED:role-route-matrix:begin -->

<!--
  This section is GENERATED by scripts/gen-role-route-matrix.mjs from:
  packages/shared/src/auth/module-acl.ts, packages/shared/src/auth/route-map.ts, packages/shared/src/auth/nav-config.ts,
  packages/shared/src/auth/scope.ts, packages/shared/src/auth/branch-hub.ts, packages/shared/src/auth/types.ts, packages/shared/src/auth/permissions.ts.
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
| `menu` | `/menu` | Chủ sở hữu, Quản lý chi nhánh | Workspace nav |
| `inventory` | `/inventory` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals); Operator tile (stock); Workspace nav |
| `inventory_procurement` | `/inventory/suppliers` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (stock) |
| `orders` | `/orders` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân | Operator tile (sales_kitchen); Workspace nav |
| `staff` | `/hr/staff` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `hr` | `/hr` | Chủ sở hữu, Quản lý chi nhánh | Workspace nav |
| `hr_payroll` | `/hr/payroll` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `finance` | `/finance` | Chủ sở hữu | Workspace nav |
| `branches` | `/branches` | Chủ sở hữu | Workspace nav |
| `branch_picker` | `/` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | (not advertised in nav — direct URL / redirect target only) |
| `settings` | `/admin/settings` | Chủ sở hữu | Admin sidebar |
| `pos` | `/br/*/pos` | Chủ sở hữu, Thu ngân, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `kds` | `/br/*/kds` | Chủ sở hữu, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `runner` | `/br/*/runner` | Chủ sở hữu, Thu ngân, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `operator_home` | `/br/*` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | Operator tile (my_shift) |
| `branch_dashboard` | `/br/*/dashboard` | Chủ sở hữu, Quản lý chi nhánh | Branch management nav |
| `branch_settings` | `/br/*/settings` | Chủ sở hữu, Quản lý chi nhánh | Branch management nav |
| `branch_menu_limits` | `/br/*/menu-limits` | Chủ sở hữu, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `branch_pos_sessions` | `/br/*/pos-sessions` | Chủ sở hữu, Quản lý chi nhánh | Branch operation nav |
| `branch_team` | `/br/*/team` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (my_shift) |
| `employee_checkout_approvals` | `/br/*/shift/checkout-approvals` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals); Operator tile (stock) |
| `employee_leave_approvals` | `/br/*/shift/leave-approvals` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals) |
| `notifications` | `/notifications` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | (not advertised in nav — direct URL / redirect target only) |

## Route Family Contracts (generated)

Single source: `ROUTE_FAMILY_CONTRACTS` in
`packages/shared/src/auth/route-map.ts`. `resolveRouteFamilyContract`
matches a pathname against `matchPrefixes` in declaration order (first
match wins), which is why some families with narrower prefixes are
declared before their broader siblings.

| Family id | Surface | Entry path | Match prefixes | Module keys | Requires branchId |
| --------- | ------- | ---------- | --------------- | ----------- | ------------------ |
| `public` | public | `/login` | `/login`, `/access-denied`, `/payment/momo`, `/api/health`, `/api/webhooks`, `/manifest.webmanifest`, `/sw.js` | — | no |
| `admin` | admin | `/admin/settings` | `/admin` | `settings` | no |
| `menu` | workspace | `/menu` | `/menu` | `menu` | no |
| `orders` | workspace | `/orders` | `/orders` | `orders` | no |
| `inventory` | workspace | `/inventory` | `/inventory` | `inventory`, `inventory_procurement` | no |
| `finance` | workspace | `/finance` | `/finance` | `finance` | no |
| `branches` | workspace | `/branches` | `/branches` | `branches` | no |
| `hr` | workspace | `/hr` | `/hr` | `hr`, `hr_payroll`, `staff` | no |
| `notifications` | workspace | `/notifications` | `/notifications` | `notifications` | no |
| `branch-picker` | branch_operation | `/` | `/`, `/br` | `branch_picker` | no |
| `operator-home` | branch_operation | `/br/[branchId]` | `/br/[branchId]` | `operator_home` | yes |
| `operator-shift-checkout-approvals` | branch_operation | `/br/[branchId]/shift/checkout-approvals` | `/br/[branchId]/shift/checkout-approvals` | `employee_checkout_approvals` | yes |
| `operator-shift-leave-approvals` | branch_operation | `/br/[branchId]/shift/leave-approvals` | `/br/[branchId]/shift/leave-approvals` | `employee_leave_approvals` | yes |
| `operator-shift` | branch_operation | `/br/[branchId]/shift` | `/br/[branchId]/shift` | `operator_home` | yes |
| `operator-profile` | branch_operation | `/br/[branchId]/profile` | `/br/[branchId]/profile` | `operator_home` | yes |
| `operator-stock` | branch_operation | `/br/[branchId]/stock` | `/br/[branchId]/stock` | `inventory` | yes |
| `operator-orders` | branch_operation | `/br/[branchId]/orders` | `/br/[branchId]/orders` | `orders` | yes |
| `branch-menu-limits` | branch_operation | `/br/[branchId]/menu-limits` | `/br/[branchId]/menu-limits` | `branch_menu_limits` | yes |
| `branch-pos-sessions` | branch_operation | `/br/[branchId]/pos-sessions` | `/br/[branchId]/pos-sessions` | `branch_pos_sessions` | yes |
| `branch-settings` | branch_management | `/br/[branchId]/settings` | `/br/[branchId]/settings` | `branch_settings` | yes |
| `branch-dashboard` | branch_management | `/br/[branchId]/dashboard` | `/br/[branchId]/dashboard` | `branch_dashboard` | yes |
| `branch-team` | branch_management | `/br/[branchId]/team` | `/br/[branchId]/team` | `branch_team` | yes |
| `pos` | branch_operation | `/br/[branchId]/pos` | `/br/[branchId]/pos` | `pos` | yes |
| `kds` | branch_operation | `/br/[branchId]/kds` | `/br/[branchId]/kds` | `kds` | yes |
| `runner` | branch_operation | `/br/[branchId]/runner` | `/br/[branchId]/runner` | `runner` | yes |

## Post-Login Home By Role (generated)

Derived from `resolvePostLoginRedirect` (`scope.ts`) falling through to
`resolveBranchHubDestination` (`branch-hub.ts`) for the no-`returnTo`,
no-standalone-station case — i.e. where a fresh login actually lands.
D077 promotes Branch Hub for every active access bucket and excludes central-kind sites.

| Role | Desktop / office context | Phone / station context | Notes |
| ---- | ------------------------- | ------------------------ | ----- |
| Chủ sở hữu (`owner`) | / (auto-opens the sole operating branch) | / (auto-opens the sole operating branch) | D077: only branch-kind sites are operable; multiple operating branches retain the picker. Owner-only workspaces remain permission-gated shortcuts from Branch Hub. |
| Quản lý chi nhánh (`branch_manager`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Thu ngân (`cashier`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Bếp (`chef`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Nhân sự chi nhánh (`branch_staff`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |

## Permission Boundary (generated)

Route family -> required route bucket (module ACL union) -> the action-gate
permission keys in that family's namespace(s), read from
`PERMISSION_KEYS` in `permissions.ts`. This is the full set in-namespace,
not a hand-picked sample — route access and action authorization stay
separate gates (route bucket here, permission key at the mutation site).

| Route family | Route prefix(es) | Required route bucket | Action gate keys (from `permissions.ts`) |
| ------------ | ------------------ | ----------------------- | ------------------------------------------ |
| admin | `/admin` | owner | `settings:branch`, `settings:branch_network`, `settings:integrations`, `settings:tenant` |
| menu | `/menu` | branch_manager/owner | `menu:manage_category`, `menu:publish`, `menu:read`, `menu:write` |
| orders | `/orders` | branch_manager/cashier/owner | `orders:read`, `orders:refund`, `orders:refund_approve`, `orders:void`, `orders:write` |
| inventory | `/inventory` | branch_manager/owner | `inventory:adjust_approve`, `inventory:catalog_review_policy_set`, `inventory:count_approve`, `inventory:count_assign`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:item_review_override_set`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
| finance | `/finance` | owner | `finance:ap_pay`, `finance:expense_approve`, `finance:expense_create`, `finance:payroll_approve`, `finance:payroll_calculate`, `finance:view` |
| branches | `/branches` | owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| hr | `/hr` | branch_manager/owner | `hr:approve_checkout`, `hr:approve_leave_request`, `hr:manage_employee`, `hr:request_leave`, `hr:view_employee`, `staff:assign_permission`, `staff:assign_position`, `staff:manage`, `staff:view` |
| notifications | `/notifications` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-picker | `/`, `/br` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-home | `/br/[branchId]` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-shift-checkout-approvals | `/br/[branchId]/shift/checkout-approvals` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-shift-leave-approvals | `/br/[branchId]/shift/leave-approvals` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-shift | `/br/[branchId]/shift` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-profile | `/br/[branchId]/profile` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-stock | `/br/[branchId]/stock` | branch_manager/owner | `inventory:adjust_approve`, `inventory:catalog_review_policy_set`, `inventory:count_approve`, `inventory:count_assign`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:item_review_override_set`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
| operator-orders | `/br/[branchId]/orders` | branch_manager/cashier/owner | `orders:read`, `orders:refund`, `orders:refund_approve`, `orders:void`, `orders:write` |
| branch-menu-limits | `/br/[branchId]/menu-limits` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-pos-sessions | `/br/[branchId]/pos-sessions` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-settings | `/br/[branchId]/settings` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-dashboard | `/br/[branchId]/dashboard` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| branch-team | `/br/[branchId]/team` | branch_manager/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| pos | `/br/[branchId]/pos` | branch_manager/cashier/owner | `pos:apply_discount`, `pos:close_shift`, `pos:close_shift_variance_override`, `pos:confirm_payment`, `pos:open_cashbox`, `pos:print`, `pos:reprint_receipt`, `pos:send_kitchen`, `pos:use`, `pos:void_order`, `pos:void_paid_order` |
| kds | `/br/[branchId]/kds` | branch_manager/chef/owner | `kds:mark_ready`, `kds:recall`, `kds:use` |
| runner | `/br/[branchId]/runner` | branch_manager/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |

<!-- GENERATED:role-route-matrix:end -->

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

Root entry (`/`) resolves active `branch`-kind rows and opens the branch
directly when there is exactly one. Branch-pinned roles still land directly at
`/br/{branchId}`. Owner enters through `/`, not Finance, and sees the same
Branch Hub plus permission-gated management shortcuts. A central-kind or
otherwise out-of-scope `/br/[branchId]` fails closed instead of substituting a
different branch. Branch Command remains a branch-scoped management surface
from the Operator hub, not a new top-level hub.

## Runtime Status

Implemented in the first route/auth slice:

- `branch_dashboard` module and route family exist.
- Branch Manager post-login/fallback target is `/br/{branchId}`.
- Branch Manager no longer passes the tenant `settings` module gate.
- App discovery exposes domain workspaces, Branch Command, branch settings, and
  branch menu limits for Branch Manager according to ACL.

Implemented in the second (dashboard) slice:

- `/br/[branchId]/dashboard` surfaces the branch day state: revenue/orders,
  table occupancy, kitchen load, POS-session/printer/checkout-approval
  readiness, plus the command tiles.

Implemented in the IA remediation slice (D031 Track E):

- The retired `/employee` App Router surface was replaced by branch runtime
  routes under `/br/[branchId]/*`; shared Employee components remain as
  implementation helpers, not route ownership.
- The KDS unassigned-stations banner deep-links to the live branch KDS setup
  (`/br/[branchId]/settings/kds`).
- Non-owner fallbacks on `/admin/settings/{general,branches,payments}` redirect
  to `/access-denied` instead of another tenant Admin path.
- Unsupported stocktake/waste routes (`/inventory/stocktake/conflicts`,
  `/inventory/stocktake/[id]/escalate`, `/inventory/waste/auto`) must stay
  outside the active route surface until a scoped decision opens them.

## Change Checklist

Any PR that changes role/surface behavior must update these together:

- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/route-map.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `packages/shared/src/auth/scope.ts`
- `packages/shared/src/auth/branch-hub.ts`
- Auth/navigation tests in `packages/shared/src/auth/__tests__/`
- `docs/modules/auth.md`
- `docs/modules/web-app.md`
- This spec's hand-authored preamble (Product Frame, Principles, Scope
  Layers, Canonical Surfaces, Role Boundaries "can manage" column,
  Navigation Contract, Runtime Status) when the change is a rule/boundary
  decision, not a mechanical fact.

The `## Module ACL`, `## Route Family Contracts`, `## Post-Login Home By
Role`, and `## Permission Boundary` sections below are **GENERATED, not
hand-maintained** — run `corepack pnpm gen:route-matrix` after any auth-source
change and commit the result; do not hand-edit inside the
`GENERATED:role-route-matrix` markers. `corepack pnpm lint:route-matrix`
(wired into the root lint aggregate) fails the build if the doc drifts from
`packages/shared/src/auth/{module-acl,route-map,nav-config,scope,branch-hub,types,permissions}.ts`.
