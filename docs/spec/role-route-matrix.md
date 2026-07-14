# Role, Scope, And Route Matrix

This spec is the source of truth for separating the two authenticated product
planes: Owner-only Admin Dashboard and branch-scoped Branch runtime. Public and
external routes sit outside those planes.

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
- Route admission is ordered: classify the URL with `route-map.ts`, enforce its
  audience with `canAccessRouteSurface`, enforce reusable capability with
  `canAccess`, then enforce branch scope and action permissions. Mutations and
  row access still go through permission keys, RLS, and RPC guards.
- Tenant scope is L0. Branch scope is L1. Scope must come from JWT claims and
  URL params, not localStorage or React Context.
- Admin Dashboard is the Owner-only tenant command, cross-branch visibility,
  and control plane.
- Branch Manager is not an Admin user with fewer tabs. Branch Manager and Staff
  work under `/br/[branchId]/*`; Owner may enter Branch for oversight.
- `/inventory`, `/orders`, `/hr`, `/finance`, `/menu`, `/branches`, and
  `/admin` are modules inside Admin Dashboard, not independent product planes.
  Branch equivalents must use Branch-native routes.

## Scope Layers

| Layer                       | Meaning                                                                                                  | Primary routes                                                                           | Primary audience                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| L0 Tenant / Admin Dashboard | Chain identity, branch network, permissions, Owner metrics, cross-branch modules, tenant settings        | `/admin/*`, `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`, `/branches/*` | `owner` only                       |
| L1 Branch                   | Store floor, Branch Hub, local setup, inventory/orders/team workflows, staff day runtime, POS/KDS/Runner | `/br/[branchId]/*`                                                                       | Branch roles, with Owner oversight |

## Canonical Surfaces

| Surface                    | Route family                                                                                               | Scope                               | Default audience                    | Contract                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin Dashboard            | `/admin/*`, `/inventory/*`, `/orders/*`, `/hr/*`, `/finance/*`, `/menu/*`, `/branches/*`                   | L0 / cross-branch                   | `owner` only                        | Tenant setup, staff access, Finance, cross-branch Inventory/Orders/HR/Menu, reports, and Owner controls. Route surface audience is checked before reusable module capability. |
| Branch Hub                 | `/br/[branchId]`                                                                                           | L1                                  | Branch roles; Owner oversight       | Sole Branch home: live work queues and curated job entries, without Owner-only links or KPI-card dashboard chrome.                                                            |
| Dashboard alias            | `/br/[branchId]/dashboard`                                                                                 | L1                                  | `branch_manager`; Owner oversight   | Compatibility redirect to Branch Hub. It owns no data, navigation entry, or independent presentation.                                                                         |
| Branch setup and workflows | `/br/[branchId]/settings/*`, `/team/*`, `/shift/*`, `/stock/*`, `/orders`, `/menu-limits`, `/pos-sessions` | L1                                  | Capability- and branch-scoped roles | Daily Branch management and staff work. The URL owns Branch scope; actions remain permission-gated.                                                                           |
| Branch station modes       | `/br/[branchId]/pos`, `/kds`, `/runner`                                                                    | L1/public exact display             | Role-specific operators             | Full-screen Branch chrome modes, not separate product planes.                                                                                                                 |
| Root / notifications       | `/`, `/notifications`                                                                                      | pre-context / authenticated utility | authenticated roles                 | Owner uses `/` to choose Admin Dashboard or Branch even with one Branch; Branch roles may resolve directly to their assigned Branch.                                          |

## HR Workspace Semantics

`/hr` is an Owner-only Admin Dashboard module, not the daily staff app. Branch
Manager and Staff people workflows remain in Branch:

| Operation                             | Owning surface                                                                                      | Meaning                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/update/deactivate staff access    | `/hr/staff/*`                                                                                       | Owner-only auth/profile/position/branch assignment. Route bucket `staff`; actions gate on `staff:*` permissions.                                |
| Employee record, salary profile, HĐLĐ | `/hr` employees tab                                                                                 | `employees` + active `employment_contracts`; Owner reads/writes the management record. Branch Manager does not enter `/hr`.                     |
| Assignment / position work            | `/hr` setup tab and `/br/[branchId]/team/*`                                                         | Owner defines global position-to-workday rules. Branch team surfaces show or arrange daily branch people work.                                  |
| Ca làm                                | `/hr` setup tab                                                                                     | Owner manages the global shift catalog and open/close flags. Actual clock-in/out and checklist execution happen under `/br/[branchId]/shift/*`. |
| Phép nghỉ                             | `/br/[branchId]/shift/schedule/leave`, `/br/[branchId]/shift/leave-approvals`, `/hr` attendance tab | Staff requests and Branch Manager/Owner approves in Branch; Owner reviews cross-branch oversight in Admin Dashboard.                            |
| Lương                                 | `/hr/payroll/*`                                                                                     | Owner-only payroll calculation/export. Payroll reads attendance, paid leave, and active contracts; it is not a branch shift UI.                 |

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

Single source: `packages/shared/src/auth/module-acl.ts`. Capability roles
describe reusable module access, not final URL admission. The route
surface audience is applied separately; every `admin_dashboard` family is
Owner-only even when its module capability is reused inside Branch. "Nav/tile
advertisement source" lists every nav array that surfaces the module; a
module with no source is reachable only by direct URL or as a redirect target.

| Module key | Default path | Capability roles | Nav/tile advertisement source |
| ---------- | ------------ | ---------------- | ------------------------------ |
| `menu` | `/menu` | Chủ sở hữu | Admin Dashboard nav |
| `inventory` | `/inventory` | Chủ sở hữu, Quản lý chi nhánh | Admin Dashboard nav; Operator tile (approvals); Operator tile (stock) |
| `inventory_procurement` | `/inventory/suppliers` | Chủ sở hữu, Quản lý chi nhánh | Operator tile (stock) |
| `orders` | `/orders` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân | Admin Dashboard nav; Operator tile (sales_kitchen) |
| `staff` | `/hr/staff` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `hr` | `/hr` | Chủ sở hữu, Quản lý chi nhánh | Admin Dashboard nav |
| `hr_payroll` | `/hr/payroll` | Chủ sở hữu | (not advertised in nav — direct URL / redirect target only) |
| `finance` | `/finance` | Chủ sở hữu | Admin Dashboard nav |
| `branches` | `/branches` | Chủ sở hữu | Admin Dashboard nav |
| `branch_picker` | `/` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | (not advertised in nav — direct URL / redirect target only) |
| `settings` | `/admin/settings` | Chủ sở hữu | Admin Dashboard nav |
| `pos` | `/br/*/pos` | Chủ sở hữu, Thu ngân, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `kds` | `/br/*/kds` | Chủ sở hữu, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `runner` | `/br/*/runner` | Chủ sở hữu, Thu ngân, Bếp, Quản lý chi nhánh | Branch operation nav; Operator tile (sales_kitchen) |
| `operator_home` | `/br/*` | Chủ sở hữu, Quản lý chi nhánh, Thu ngân, Bếp, Nhân sự chi nhánh | Operator tile (my_shift) |
| `branch_dashboard` | `/br/*/dashboard` | Chủ sở hữu, Quản lý chi nhánh | (not advertised in nav — direct URL / redirect target only) |
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
| `operator-shift` | branch | `/br/[branchId]/shift` | `/br/[branchId]/shift` | `operator_home` | yes |
| `operator-profile` | branch | `/br/[branchId]/profile` | `/br/[branchId]/profile` | `operator_home` | yes |
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
Owner retains the plane picker; Branch-pinned roles land in Branch Hub. Central-kind sites are excluded.

| Role | Desktop / standard context | Phone / station context | Notes |
| ---- | -------------------------- | ----------------------- | ----- |
| Chủ sở hữu (`owner`) | / (Admin Dashboard / Branch picker) | / (Admin Dashboard / Branch picker) | Owner always chooses the product plane, even with one operating Branch. Admin Dashboard links are not embedded in Branch Hub. |
| Quản lý chi nhánh (`branch_manager`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Thu ngân (`cashier`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Bếp (`chef`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |
| Nhân sự chi nhánh (`branch_staff`) | /br/{branchId} (Operator hub for the claimed branch) | /br/{branchId} (Operator hub for the claimed branch) | Branch-pinned roles land in the Branch Hub for their JWT branch_id. |

## Permission Boundary (generated)

Route family -> route-surface audience overlaid on the module capability
union -> the action-gate permission keys in that family's namespace(s),
read from
`PERMISSION_KEYS` in `permissions.ts`. This is the full set in-namespace,
not a hand-picked sample — route access and action authorization stay
separate gates (effective route audience here, permission key at the mutation site).

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

Root entry (`/`) resolves active `branch`-kind rows. Owner always remains on the
picker and chooses Admin Dashboard or a Branch, even when only one Branch is
active. Branch-pinned roles may land directly at `/br/{branchId}`. Branch Hub
contains no Admin Dashboard shortcuts; Owner changes plane through the picker.
A central-kind or otherwise out-of-scope Branch URL fails closed instead of
substituting another branch. `/br/{branchId}/dashboard` only redirects to Hub.

## Change Checklist

Any PR that changes role/surface behavior must update these together:

- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/route-resolution.ts`
- `packages/shared/src/auth/route-map.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/app-discovery.ts`
- `packages/shared/src/auth/scope.ts`
- `packages/shared/src/auth/branch-hub.ts`
- `apps/web/proxy.ts`
- `apps/web/app/_components/work-location-picker-page.tsx`
- Auth/navigation tests in `packages/shared/src/auth/__tests__/`
- Static and browser tests proving non-Owner Admin Dashboard denial while
  Branch-native capability routes remain reachable.
- This spec's hand-authored product boundaries only when the rule itself changes.

The `## Module ACL`, `## Route Family Contracts`, `## Post-Login Home By
Role`, and `## Permission Boundary` sections below are **GENERATED, not
hand-maintained** — run `corepack pnpm gen:route-matrix` after any auth-source
change and commit the result; do not hand-edit inside the
`GENERATED:role-route-matrix` markers. `corepack pnpm lint:route-matrix`
(wired into the root lint aggregate) fails the build if the doc drifts from
`packages/shared/src/auth/{module-acl,route-map,nav-config,scope,branch-hub,types,permissions}.ts`.
