# Role, Scope, And Route Matrix

This spec is the source of truth for separating the Owner-only Admin Dashboard,
Branch management/operation, and staff day runtime.

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
- Admin Dashboard is the Owner-only tenant command and foundation surface.
- Branch Manager is not an Admin user with fewer tabs. Branch Manager owns a
  branch command surface under `/br/[branchId]/*`.
- Top-level modules (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`, and
  `/branches`) belong to Admin Dashboard even though their URLs remain stable.
  Branch Manager and Staff use Branch-native workflows under `/br/[branchId]`.

## Scope Layers

| Layer         | Meaning                                                                                  | Primary routes                                                                           | Primary owners                         |
| ------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| L0 Tenant     | Chain identity, branch network, roles, finance, inventory oversight, and tenant settings | `/admin/*`, `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`, `/branches/*` | `owner`                                |
| L1 Branch     | Store floor, POS/KDS setup, Branch staff day flow, menu limits, and local operations     | `/br/[branchId]/*`                                                                       | `branch_manager`, with Owner oversight |
| Staff Runtime | Profile, attendance, leave request, payslip, notifications                               | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`, `/notifications/*`                 | Branch-pinned roles                    |

## Canonical Surfaces

| Surface             | Route family                                                                                                                                       | Scope   | Default audience                                   | Contract                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin Dashboard     | `/admin`, `/admin/settings/*`, `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`, `/branches/*`                                        | L0      | `owner`                                            | Launch and operate tenant-wide control modules. `/admin` is the truthful launcher; module URLs stay stable.                                                  |
| Branch Command      | `/br/[branchId]/dashboard`                                                                                                                         | L1      | `branch_manager`, owner oversight                  | Deep branch management surface for one branch: today status, POS/KDS health, staff day flow, pending local tasks, and links to branch setup.                 |
| Branch Setup        | `/br/[branchId]/settings/*`                                                                                                                        | L1      | `branch_manager`, owner oversight                  | Configure tables, POS terminals, KDS stations, printers, POS sessions, and branch-local operating settings.                                                  |
| Branch Operations   | `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]/orders`, `/br/[branchId]/stock`, `/br/[branchId]/menu-limits`, `/br/[branchId]/runner` | L1      | Store operators and Branch Manager, Owner cover-ca | Run service without requiring tenant administration. Branch Hub is the promoted home for every active role and exposes one Owner-only Admin Dashboard entry. |
| Inventory Oversight | `/inventory/*`                                                                                                                                     | L0      | `owner`                                            | Tenant inventory, GRN, stocktake, production, consumption, waste, and reports. Branch daily stock work stays under `/br/[branchId]/stock/*`.                 |
| Orders Oversight    | `/orders/*`                                                                                                                                        | L0      | `owner`                                            | Tenant order oversight and exception handling. Branch order work stays under `/br/[branchId]/orders`.                                                        |
| HR Administration   | `/hr/*`                                                                                                                                            | L0      | `owner`                                            | Employee records, account handoff, global shift/task setup, payroll, and labor-contract fields. Branch Manager uses `/team` and approval routes in Branch.   |
| Finance             | `/finance/*`                                                                                                                                       | L0      | `owner`                                            | HKD operating finance, revenue, expenses, cash summary, inventory value handoff, food-cost signal, tax-support exports, and HĐĐT support.                    |
| Ca của tôi / Hồ sơ  | `/br/[branchId]/shift/*`, `/br/[branchId]/profile/*`                                                                                               | L1/self | branch-pinned roles                                | Personal day-flow and profile surfaces: clock, workday tasks, schedule, leave request, payslip. Not an HR admin substitute.                                  |

## HR Administration Semantics

`/hr` is an Owner-only Admin Dashboard module, not the whole authorization
model and not the daily staff app. Its meaning is narrow:

| Operation                             | Owning surface                                                                                            | Meaning                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/update/deactivate staff access    | `/hr/staff/*`                                                                                             | Owner-only auth/profile/position/branch assignment. Route bucket `staff`; actions gate on `staff:*` permissions.                                   |
| Employee record, salary profile, HĐLĐ | `/hr` employees tab                                                                                       | `employees` + active `employment_contracts`. Owner writes employee/compensation/contract fields; branch manager only reads the branch-safe subset. |
| Assignment / position work            | `/hr` setup tab and `/br/[branchId]/team/*`                                                               | Owner defines global position-to-workday rules. Branch team surfaces show or arrange daily branch people work.                                     |
| Ca làm                                | `/hr` setup tab                                                                                           | Owner manages the global shift catalog and open/close flags. Actual clock-in/out and checklist execution happen under `/br/[branchId]/shift/*`.    |
| Phép nghỉ                             | `/br/[branchId]/shift/schedule/leave`, `/br/[branchId]/shift/leave-approvals`, Owner `/hr` attendance tab | Staff requests leave from Branch runtime; Branch Manager/Owner approve in Branch; HR Admin Dashboard reads the tenant oversight list.              |
| Lương                                 | `/hr/payroll/*`                                                                                           | Owner-only payroll calculation/export. Payroll reads attendance, paid leave, and active contracts; it is not a branch shift UI.                    |

## Role Boundaries

Home target (post-login landing) is device-aware and site-aware per D050/D055
— see the generated "Post-Login Home By Role" table below for the exact
per-device destination derived from `scope.ts`/`branch-hub.ts`. This table
states the durable "can manage / must not become" boundary, which the code
does not fully encode and stays hand-authored.

| Role bucket      | Can manage                                                                                            | Must not become                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `owner`          | Tenant governance, branch network, permission grants, finance/reports, emergency oversight in domains | Daily floor operator by default  |
| `branch_manager` | One branch: POS/KDS/floor settings, branch day flow, branch inventory tasks, branch staff approvals   | Partial Admin user               |
| `cashier`        | POS orders, payments, receipts according to grants                                                    | Branch settings owner            |
| `chef`           | KDS ready/recall and kitchen status according to grants                                               | Inventory production manager     |
| `branch_staff`   | Shift/profile day runtime according to branch assignment                                              | POS/KDS or tenant admin by label |

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
| `admin_dashboard` | `/admin` | Chủ sở hữu | Admin Dashboard nav |
| `menu` | `/menu` | Chủ sở hữu | Admin Dashboard nav |
| `inventory` | `/inventory` | Chủ sở hữu, Quản lý chi nhánh | Admin Dashboard nav; Operator tile (approvals); Operator tile (stock) |
| `inventory_procurement` | `/inventory/suppliers` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (stock) |
| `orders` | `/orders` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân | Admin Dashboard nav; Operator tile (sales_kitchen) |
| `staff` | `/hr/staff` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `hr` | `/hr` | Chủ sở hữu | Admin Dashboard nav |
| `hr_payroll` | `/hr/payroll` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `finance` | `/finance` | Chủ sở hữu | Admin Dashboard nav |
| `branches` | `/branches` | Chủ sở hữu | Admin Dashboard nav |
| `branch_picker` | `/` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | (not advertised in nav — direct URL / redirect target only) |
| `settings` | `/admin/settings` | Chủ sở hữu | Admin Dashboard nav |
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
| `public` | public | `/login` | `/login`, `/access-denied`, `/api/health`, `/api/webhooks`, `/manifest.webmanifest`, `/sw.js` | — | no |
| `admin` | admin_dashboard | `/admin` | `/admin` | `admin_dashboard`, `settings` | no |
| `menu` | admin_dashboard | `/menu` | `/menu` | `menu` | no |
| `orders` | admin_dashboard | `/orders` | `/orders` | `orders` | no |
| `inventory` | admin_dashboard | `/inventory` | `/inventory` | `inventory`, `inventory_procurement` | no |
| `finance` | admin_dashboard | `/finance` | `/finance` | `finance` | no |
| `branches` | admin_dashboard | `/branches` | `/branches` | `branches` | no |
| `hr` | admin_dashboard | `/hr` | `/hr` | `hr`, `hr_payroll`, `staff` | no |
| `notifications` | utility | `/notifications` | `/notifications` | `notifications` | no |
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

| Role | Desktop / Admin Dashboard context | Phone / station context | Notes |
| ---- | ------------------------- | ------------------------ | ----- |
| Chủ sở hữu (`owner`) | / (auto-opens the sole operating branch) | / (auto-opens the sole operating branch) | Only branch-kind sites are operable. Owner enters the Admin Dashboard through one owner-only Branch Hub or picker link. |
| Quản lý chi nhánh (`branch_manager`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Thu ngân (`cashier`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Bếp (`chef`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Nhân sự chi nhánh (`branch_staff`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |

## Permission Boundary (generated)

Route family -> required route bucket (Admin Dashboard surface ACL intersected with the module capability union) -> the action-gate
permission keys in that family's namespace(s), read from
`PERMISSION_KEYS` in `permissions.ts`. This is the full set in-namespace,
not a hand-picked sample — route access and action authorization stay
separate gates (route bucket here, permission key at the mutation site).

| Route family | Route prefix(es) | Required route bucket | Action gate keys (from `permissions.ts`) |
| ------------ | ------------------ | ----------------------- | ------------------------------------------ |
| admin | `/admin` | owner | `settings:branch`, `settings:branch_network`, `settings:integrations`, `settings:tenant` |
| menu | `/menu` | owner | `menu:manage_category`, `menu:publish`, `menu:read`, `menu:write` |
| orders | `/orders` | owner | `orders:read`, `orders:refund`, `orders:refund_approve`, `orders:void`, `orders:write` |
| inventory | `/inventory` | owner | `inventory:adjust_approve`, `inventory:catalog_review_policy_set`, `inventory:count_approve`, `inventory:count_assign`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:item_review_override_set`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
| finance | `/finance` | owner | `finance:ap_pay`, `finance:expense_approve`, `finance:expense_create`, `finance:payroll_approve`, `finance:payroll_calculate`, `finance:view` |
| branches | `/branches` | owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| hr | `/hr` | owner | `hr:approve_checkout`, `hr:approve_leave_request`, `hr:manage_employee`, `hr:request_leave`, `hr:view_employee`, `staff:assign_permission`, `staff:assign_position`, `staff:manage`, `staff:view` |
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

Owner needs an Admin Dashboard flow that answers:

- What is happening today across the chain?
- What must I set up before stores can operate?
- Where do I add branches, staff, permissions, and operating policies?
- Where do I open cross-branch modules and system settings?

Branch manager needs a branch flow that answers:

- What is happening in my branch today?
- Are POS, KDS, printers, tables, menu limits, and staff day flow ready?
- What branch tasks need action now?
- Where do I correct branch setup without entering Admin Dashboard?

Root entry (`/`) resolves active `branch`-kind rows and opens the branch
directly when there is exactly one. Branch-pinned roles still land directly at
`/br/{branchId}`. Owner enters through `/`, not Finance, and sees the same
Branch Hub plus one permission-gated Admin Dashboard link. A central-kind or
otherwise out-of-scope `/br/[branchId]` fails closed instead of substituting a
different branch. Branch Command remains a branch-scoped management surface
from the Operator hub, not a new top-level hub.

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
- This spec's hand-authored product boundaries only when the rule itself changes.

The `## Module ACL`, `## Route Family Contracts`, `## Post-Login Home By
Role`, and `## Permission Boundary` sections below are **GENERATED, not
hand-maintained** — run `corepack pnpm gen:route-matrix` after any auth-source
change and commit the result; do not hand-edit inside the
`GENERATED:role-route-matrix` markers. `corepack pnpm lint:route-matrix`
(wired into the root lint aggregate) fails the build if the doc drifts from
`packages/shared/src/auth/{module-acl,route-map,nav-config,scope,branch-hub,types,permissions}.ts`.
