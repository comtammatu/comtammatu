# Role, Scope, And Route Matrix

This spec is the source of truth for the two authenticated product planes:
Owner-only Admin Dashboard and branch-scoped Branch runtime. Public customer
flows are external boundaries, not a third authenticated plane.

## Product Frame

Cơm Tấm Má Tư is a single-tenant, multi-branch operations and sales system for
an HKD F&B business. It has ERP-like coverage across purchasing, receiving,
inventory, production, sales, payments, finance, HR, printing, and reporting,
but product-facing language remains `bộ phần mềm quản lý vận hành và bán hàng`.
Use `ERP` only for architecture comparison, scope comparison, or internal
reference framing.

## Principles

- Route surface decides which product plane a role may enter; permission decides
  the action inside an admitted workflow.
- `positions.code` is the HR source; `user_role` / access bucket is only the
  compatibility route bucket.
- `packages/shared/src/auth/module-acl.ts` owns reusable module capabilities.
  `canAccessRouteSurface()` in `route-map.ts` adds the plane audience policy:
  `admin_dashboard` is Owner-only while `branch` remains capability- and
  branch-scoped. Do not make shared `orders`, `inventory`, procurement, or HR
  capability keys Owner-only merely because their top-level route belongs to
  Admin Dashboard.
- Mutations and row access still go through permission keys, RLS, Server Action
  checks, and RPC guards.
- Tenant scope is L0. Branch scope is L1. Scope must come from JWT claims and
  URL params, not localStorage or React Context.
- Admin Dashboard is the Owner cockpit for cross-branch metrics, master data,
  tenant controls, finance, HR governance, and system settings. Its current
  top-level route families (`/admin`, `/finance`, `/branches`, `/menu`,
  `/orders`, `/inventory`, `/hr`) remain stable URLs inside that one plane.
- Branch Manager and Staff never become partial Admin Dashboard users. Their
  daily jobs live under `/br/[branchId]/*` with Branch-native information
  density and touch presentation.
- `/notifications` is a Branch utility shared by all staff roles. Notification
  links are normalized at read time: Owner retains Admin Dashboard targets;
  branch-scoped roles receive Branch-native targets.

## Scope Layers

| Layer     | Meaning                                                                                  | Primary routes                                                                    | Primary actors                         |
| --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| L0 Tenant | Cross-branch truth, HKD finance, master data, people governance, controls, and settings | `/admin/*`, `/finance/*`, `/branches/*`, `/menu/*`, `/orders/*`, `/inventory/*`, `/hr/*` | `owner` only                           |
| L1 Branch | Live service, branch command, staff day flow, orders, stock, receiving, and approvals   | `/`, `/br/[branchId]/*`, `/notifications`                                         | Branch roles, with owner oversight     |

## Canonical Surfaces

| Plane / boundary | Route families                                                                                                            | Audience                                      | Contract                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin Dashboard  | `/admin/*`, `/finance/*`, `/branches/*`, `/menu/*`, `/orders/*`, `/inventory/*`, `/hr/*`                                 | `owner` only                                  | Owner cockpit for cross-branch metrics, financial truth, master catalogs, tenant HR, system controls, and audit. Dense management presentation may reuse module capabilities also used by Branch routes. |
| Branch           | `/`, `/br/[branchId]/*`, `/notifications`                                                                                | Branch Manager, Staff, and owner oversight    | Sole daily-work plane. Branch Manager controls one branch; floor roles see only their job surfaces. POS/KDS/Runner are station chrome modes inside Branch, not additional product planes.                 |
| Public boundary  | `/login`, `/q/[token]`, public Runner display, health/webhook endpoints                                                   | Unauthenticated customer/system integrations | No staff product navigation. Self-Order and public display contracts stay outside the two authenticated planes.                                                                                         |

## HR Workspace Semantics

`/hr` is an Owner-only Admin Dashboard workspace, not the daily staff app. Its
meaning is narrow:

| Operation                             | Owning surface                                                                                      | Meaning                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/update/deactivate staff access    | `/hr/staff/*`                                                                                       | Owner-only auth/profile/position/branch assignment. Route bucket `staff`; actions gate on `staff:*` permissions.                                   |
| Employee record, salary profile, HĐLĐ | `/hr` employees tab                                                                                 | `employees` + active `employment_contracts`. Owner reads and writes tenant HR truth. Branch Manager uses the Branch team surface instead.          |
| Assignment / position work            | `/hr` setup tab and `/br/[branchId]/team/*`                                                         | Owner defines global position-to-workday rules. Branch team surfaces show or arrange daily branch people work.                                     |
| Ca làm                                | `/hr` setup tab                                                                                     | Owner manages the global shift catalog and open/close flags. Actual clock-in/out and checklist execution happen under `/br/[branchId]/shift/*`.    |
| Phép nghỉ                             | `/br/[branchId]/shift/schedule/leave`, `/br/[branchId]/shift/leave-approvals`, `/hr` attendance tab | Staff requests and Branch Manager approves in Branch; Owner uses either Branch oversight or the Admin Dashboard aggregate.                         |
| Lương                                 | `/hr/payroll/*`                                                                                     | Owner-only payroll calculation/export. Payroll reads attendance, paid leave, and active contracts; it is not a branch shift UI.                    |

## Role Boundaries

Home target (post-login landing) is device-aware and site-aware per D050/D055
— see the generated "Post-Login Home By Role" table below for the exact
per-device destination derived from `scope.ts`/`branch-hub.ts`. This table
states the durable "can manage / must not become" boundary, which the code
does not fully encode and stays hand-authored.

| Role bucket      | Can manage                                                                                            | Must not become                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `owner`          | Admin Dashboard governance plus explicit oversight/cover work in Branch                                 | Daily floor operator by default  |
| `branch_manager` | One Branch: POS/KDS/floor settings, day flow, orders, stock/receiving, and staff approvals              | Partial Admin Dashboard user     |
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

Single source: `packages/shared/src/auth/module-acl.ts`. These are reusable
module capabilities, not the final audience of every route using that key.
Admin Dashboard route families apply the Owner-only surface policy in
`route-map.ts` on top of this table. "Nav/tile
advertisement source" lists every nav array in `nav-config.ts` that
surfaces the module to a role; a module with no source is reachable only
by direct URL or as a redirect target.

| Module key | Default path | Capability roles | Nav/tile advertisement source |
| ---------- | ------------ | ---------------- | ------------------------------ |
| `menu` | `/menu` | Chủ sở hữu | Admin Dashboard module nav |
| `inventory` | `/inventory` | Chủ sở hữu, Quản lý chi nhánh | Admin Dashboard module nav; Operator tile (approvals); Operator tile (stock) |
| `inventory_procurement` | `/inventory/suppliers` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (stock) |
| `orders` | `/orders` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân | Admin Dashboard module nav; Operator tile (sales_kitchen) |
| `staff` | `/hr/staff` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `hr` | `/hr` | Chủ sở hữu, Quản lý chi nhánh | Admin Dashboard module nav |
| `hr_payroll` | `/hr/payroll` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `finance` | `/finance` | Chủ sở hữu | Admin Dashboard module nav |
| `branches` | `/branches` | Chủ sở hữu | Admin Dashboard module nav |
| `branch_picker` | `/` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | (not advertised in nav — direct URL / redirect target only) |
| `settings` | `/admin/settings` | Chủ sở hữu | Admin Dashboard foundation nav |
| `pos` | `/br/*/pos` | Chủ sở hữu, Thu ngân, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `kds` | `/br/*/kds` | Chủ sở hữu, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `runner` | `/br/*/runner` | Chủ sở hữu, Thu ngân, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `operator_home` | `/br/*` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | Operator tile (my_shift) |
| `branch_dashboard` | `/br/*/dashboard` | Chủ sở hữu, Quản lý chi nhánh | (not advertised in nav — direct URL / redirect target only) |
| `branch_settings` | `/br/*/settings` | Chủ sở hữu, Quản lý chi nhánh | Branch management nav |
| `branch_menu_limits` | `/br/*/menu-limits` | Chủ sở hữu, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `branch_pos_sessions` | `/br/*/pos-sessions` | Chủ sở hữu, Quản lý chi nhánh | Branch operation nav |
| `branch_team` | `/br/*/team` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (my_shift) |
| `employee_checkout_approvals` | `/br/*/shift/checkout-approvals` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (approvals) |
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
| `admin` | admin_dashboard | `/admin/settings` | `/admin` | `settings` | no |
| `menu` | admin_dashboard | `/menu` | `/menu` | `menu` | no |
| `orders` | admin_dashboard | `/orders` | `/orders` | `orders` | no |
| `inventory` | admin_dashboard | `/inventory` | `/inventory` | `inventory`, `inventory_procurement` | no |
| `finance` | admin_dashboard | `/finance` | `/finance` | `finance` | no |
| `branches` | admin_dashboard | `/branches` | `/branches` | `branches` | no |
| `hr` | admin_dashboard | `/hr` | `/hr` | `hr`, `hr_payroll`, `staff` | no |
| `notifications` | branch | `/notifications` | `/notifications` | `notifications` | no |
| `branch-picker` | branch | `/` | `/`, `/br` | `branch_picker` | no |
| `operator-home` | branch | `/br/[branchId]` | `/br/[branchId]` | `operator_home` | yes |
| `operator-shift-checkout-approvals` | branch | `/br/[branchId]/shift/checkout-approvals` | `/br/[branchId]/shift/checkout-approvals` | `employee_checkout_approvals` | yes |
| `operator-shift-leave-approvals` | branch | `/br/[branchId]/shift/leave-approvals` | `/br/[branchId]/shift/leave-approvals` | `employee_leave_approvals` | yes |
| `operator-shift-count` | branch | `/br/[branchId]/shift/count` | `/br/[branchId]/shift/count`, `/br/[branchId]/stock/count` | `operator_home` | yes |
| `operator-shift` | branch | `/br/[branchId]/shift` | `/br/[branchId]/shift` | `operator_home` | yes |
| `operator-profile` | branch | `/br/[branchId]/profile` | `/br/[branchId]/profile` | `operator_home` | yes |
| `operator-stock-waste-approvals` | branch | `/br/[branchId]/stock/waste-approvals` | `/br/[branchId]/stock/waste-approvals` | `inventory` | yes |
| `operator-stock-count-assignments` | branch | `/br/[branchId]/stock/count-assignments` | `/br/[branchId]/stock/count-assignments` | `inventory` | yes |
| `operator-stock-count-slips` | branch | `/br/[branchId]/stock/count-slips` | `/br/[branchId]/stock/count-slips` | `inventory` | yes |
| `operator-stock` | branch | `/br/[branchId]/stock` | `/br/[branchId]/stock` | `inventory` | yes |
| `operator-orders` | branch | `/br/[branchId]/orders` | `/br/[branchId]/orders` | `orders` | yes |
| `branch-menu-limits` | branch | `/br/[branchId]/menu-limits` | `/br/[branchId]/menu-limits` | `branch_menu_limits` | yes |
| `branch-pos-sessions` | branch | `/br/[branchId]/pos-sessions` | `/br/[branchId]/pos-sessions` | `branch_pos_sessions` | yes |
| `branch-settings` | branch | `/br/[branchId]/settings` | `/br/[branchId]/settings` | `branch_settings` | yes |
| `branch-dashboard` | branch | `/br/[branchId]/dashboard` | `/br/[branchId]/dashboard` | `branch_dashboard` | yes |
| `branch-team` | branch | `/br/[branchId]/team` | `/br/[branchId]/team` | `branch_team` | yes |
| `pos` | branch | `/br/[branchId]/pos` | `/br/[branchId]/pos` | `pos` | yes |
| `kds` | branch | `/br/[branchId]/kds` | `/br/[branchId]/kds` | `kds` | yes |
| `runner` | branch | `/br/[branchId]/runner` | `/br/[branchId]/runner` | `runner` | yes |

## Post-Login Home By Role (generated)

Derived from `resolvePostLoginRedirect` (`scope.ts`) falling through to
`resolveBranchHubDestination` (`branch-hub.ts`) for the no-`returnTo`,
no-standalone-station case — i.e. where a fresh login actually lands.
D077 promotes Branch Hub for every active access bucket and excludes central-kind sites.

| Role | Desktop context | Phone / station context | Notes |
| ---- | --------------- | ----------------------- | ----- |
| Chủ sở hữu (`owner`) | / (Branch / Admin Dashboard plane picker) | / (Branch / Admin Dashboard plane picker) | Owner keeps the picker even with one operating branch so both authenticated planes remain discoverable. |
| Quản lý chi nhánh (`branch_manager`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Thu ngân (`cashier`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Bếp (`chef`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Nhân sự chi nhánh (`branch_staff`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |

## Permission Boundary (generated)

Route family -> effective route audience (module ACL union plus the
Owner-only Admin Dashboard surface policy) -> the action-gate
permission keys in that family's namespace(s), read from
`PERMISSION_KEYS` in `permissions.ts`. This is the full set in-namespace,
not a hand-picked sample — route access and action authorization stay
separate gates (route audience here, permission key at the mutation site).

| Route family | Route prefix(es) | Effective route audience | Action gate keys (from `permissions.ts`) |
| ------------ | ------------------ | ------------------------ | ------------------------------------------ |
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
| operator-shift-count | `/br/[branchId]/shift/count`, `/br/[branchId]/stock/count` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-shift | `/br/[branchId]/shift` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-profile | `/br/[branchId]/profile` | branch_manager/branch_staff/cashier/chef/owner | (module-level ACL gate only — no dedicated action-permission namespace) |
| operator-stock-waste-approvals | `/br/[branchId]/stock/waste-approvals` | branch_manager/owner | `inventory:adjust_approve`, `inventory:catalog_review_policy_set`, `inventory:count_approve`, `inventory:count_assign`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:item_review_override_set`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
| operator-stock-count-assignments | `/br/[branchId]/stock/count-assignments` | branch_manager/owner | `inventory:adjust_approve`, `inventory:catalog_review_policy_set`, `inventory:count_approve`, `inventory:count_assign`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:item_review_override_set`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
| operator-stock-count-slips | `/br/[branchId]/stock/count-slips` | branch_manager/owner | `inventory:adjust_approve`, `inventory:catalog_review_policy_set`, `inventory:count_approve`, `inventory:count_assign`, `inventory:grn_express_configure`, `inventory:grn_express_extend`, `inventory:grn_hardblock_override`, `inventory:item_review_override_set`, `inventory:production_confirm`, `inventory:production_create`, `inventory:read`, `inventory:stocktake_complete`, `inventory:stocktake_create`, `inventory:stocktake_recount`, `inventory:stocktake_unblind`, `inventory:transfer_create`, `inventory:transfer_receive`, `inventory:transfer_ship`, `inventory:units_master`, `inventory:waste_approve`, `inventory:waste_bypass_photo`, `inventory:write`, `inventory:writeoff` |
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
- Where do I correct branch setup without entering Admin Dashboard?

Root entry (`/`) resolves active `branch`-kind rows. Branch-pinned non-Owner
roles open their sole assigned branch directly; Owner always retains the
Branch/Admin Dashboard plane picker, including when there is only one operating
branch. Admin Dashboard enters through `/finance`; Branch enters through
`/br/{branchId}`. A central-kind or otherwise out-of-scope Branch URL fails
closed instead of substituting another branch. `/br/[branchId]/dashboard` is a
redirect shim to the canonical task-first Branch Hub, not a separate dashboard
or management plane.

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
Role`, and `## Permission Boundary` sections above are **GENERATED, not
hand-maintained** — run `corepack pnpm gen:route-matrix` after any auth-source
change and commit the result; do not hand-edit inside the
`GENERATED:role-route-matrix` markers. `corepack pnpm lint:route-matrix`
(wired into the root lint aggregate) fails the build if the doc drifts from
`packages/shared/src/auth/{module-acl,route-map,nav-config,scope,branch-hub,types,permissions}.ts`.
