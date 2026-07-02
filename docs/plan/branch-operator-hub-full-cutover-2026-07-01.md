# Branch Operator Hub full cutover — master spec (2026-07-01)

> Reconciled-through `18d060cbbb4a`
> Status: **Foundation and stock-shell cutover in progress; route/surface guards added**.
> Scope: master spec for a mobile-first Branch Operator Hub at `/br/[branchId]`, with full cutover across Employee hot path, Branch Control, Stock floor tasks, POS, KDS, and Runner. Build is phased, not big-bang.

## Decisions approved

1. **Primary slice:** Branch Operator Hub mobile-first.
2. **Layout thesis:** Daily Work First. The first viewport starts from today's shift/work state, not a generic dashboard.
3. **Pre-clock-in gate:** Role-specific gate. Cashier/chef floor work is blocked or hidden before clock-in; branch_manager/owner still see management tiles required for branch operation.
4. **Cutover scope:** Full cutover target.
5. **Delivery model:** Master spec with phased implementation.
6. **Approach:** Route Foundation First. Harden `/br/[branchId]` first, then migrate hot paths.

## Current state

The repo already has the foundation this design should reuse:

- `/br/[branchId]` operator home exists and renders `resolveOperatorTiles`.
- `/br/[branchId]/(operator)/layout.tsx` owns the mobile operator shell and bottom nav.
- `resolveBranchContext` resolves branch scope from URL + JWT.
- `operator-capabilities.ts` projects tiles from `nav-config.ts` and `MODULE_ACL`.
- `EmployeePage` / `EmployeePanel` / `EmployeeActionSection` are the current shared lightweight mobile surface primitives.
- `today-work-state.ts` is the canonical daily-work state machine for shift/checklist/count status.

This means the implementation should strengthen the existing operator surface instead of creating another portal, shell, or design system.

## Product model

`/br/[branchId]` is the **branch hub**.

It answers: "At this branch, what should I open or handle next?"

`/br/[branchId]/shift` is the **personal shift cockpit**.

It answers: "What is my shift state and what must I do next?"

Keep `/br/[branchId]` and `/br/[branchId]/shift` separate, but do not turn Shift into a mini `/employee/*` portal. The Hub stays a routing and next-action surface. Shift is one mobile-first work screen that combines chấm công, việc trong ca, checklist, and kiểm kê được giao. Schedule is a bottom-nav destination. Leave and payslip history remain secondary routes because they are forms or long-history surfaces, not daily shift steps.

## Information architecture

Mobile bottom nav stays small and stable:

```text
Hôm nay · Ca · Lịch · Tôi
```

Notifications stay in the header action area, not the bottom nav. POS, KDS,
Runner, Stock, Menu-Limits, and Branch Control stay inside the Hub as
role-gated tiles. Do not add a fourth bottom-nav item just to preserve symmetry.

Module work appears as role-gated tiles, not nav tabs:

| Group | Examples | Owner |
| --- | --- | --- |
| Ca của tôi | Chấm công, việc trong ca, checklist, kiểm kê được giao | Employee/shift workspace |
| Lịch | Lịch hôm nay, lịch tuần, ca sắp tới | Schedule workspace |
| Sàn | POS, Runner | POS/order surfaces |
| Bếp | KDS | KDS surface |
| Kho | Count, receive, transfer, waste floor tasks | Branch stock floor slices |
| Điều hành | Branch dashboard, Menu-Limits, approvals, settings | Branch manager/owner |

Tile visibility is derived from `MODULE_ACL` via the shared capability resolver. Do not hardcode role lists in route components.

## First viewport behavior

The Hub opens with a smart card:

- `not_started`: primary action is clock in.
- `working`: show required work remaining and next shift action.
- `checkout_pending`: show pending approval state.
- `done`: show completed shift state and secondary branch links.
- manager/owner: show management state such as approvals, branch-control alerts, and shift state without hiding management tiles.

The card should be compact. Do not add explanatory helper copy unless it changes the next action.

## Routing and scope contract

Scope remains path-based:

```text
URL branch segment + JWT claims -> proxy/module ACL/RLS -> page data
```

Rules:

- `branchId` lives in URL for every branch operation route.
- Employee/cashier/chef are locked to `claims.branch_id`.
- Owner can choose a branch through `/br`.
- No branch scope in `localStorage`, cookies, React Context, or browser storage.
- `resolveBranchContext` is a read helper, not an auth gate.
- Proxy, `MODULE_ACL`, Server Action auth, RPC/RLS stay authoritative.

## Current implementation locks

The current cutover foundation already locks these ownership rules in code and
tests:

- `/br/[branchId]/(operator)/layout.tsx` owns the Branch Operator chrome for
  Hub, Shift, Branch Dashboard, Branch Settings, Branch Menu-Limits, and Branch
  Stock floor routes.
- `/br/[branchId]/stock/{count,count-slips,receive,transfer,waste}` resolves as
  the `operator-stock` route family and uses `operator-bottom-nav`, not
  management/admin chrome.
- Branch stock wrappers may reuse Inventory components/actions, but their
  visible route, base path, fallback path, and branch scope stay under
  `/br/[branchId]/stock/*`.
- Branch Settings hub is restricted to branch setup. It must not advertise HR,
  payroll, finance, procurement, global inventory admin, or tenant settings.
- POS, KDS, and Runner keep their specialized station shells. They are branch
  operation surfaces, but they are not nested inside the operator layout.
- Static route guards lock the no-redirect rule for branch stock and the no
  `/inventory/*` shortcut rule for operator tiles.

## Landing goal and WIP split

Goal: cut over `/br/[branchId]` into a branch-native Operator Hub without
letting branch setup, branch stock tasks, or shift work fall back into
office/admin chrome.

Definition of done:

- `/br/[branchId]`, `/dashboard`, `/settings/*`, `/shift/*`, and `/stock/*`
  render through the Branch Operator shell, except POS/KDS/Runner station apps.
- Branch wrappers may reuse existing module actions/components only when
  `branchId`, `basePath`, detail links, cancel links, and success fallbacks stay
  under `/br/[branchId]/*`.
- Normal branch actions do not redirect to `/inventory/*`, `/employee/*`,
  `/finance/*`, `/hr/*`, or `/admin/*`.
- Every slice ships with static route/shell guards plus a mobile route smoke.

Do not land the current dirty checkout as one PR. Split it by ownership:

| Lane | Land together | Keep out |
| --- | --- | --- |
| Branch Operator Hub | `br/[branchId]/(operator)/*`, migrated `dashboard`/`settings` routes, `branch-settings/_shared/*` changes required by branch setup wrappers, auth route-map/nav-config changes, branch static guards, branch-shell e2e | POS/KDS print migrations, Finance/SePay, broad office UI cleanup |
| Branch stock floor | `/br/[branchId]/stock/{count,count-slips,receive,transfer,waste}`, only the inventory component props needed for branch `basePath`/fallback ownership, operator stock guards | Procurement, supplier, recipe, dashboard, and report redesigns under `/inventory/*` |
| POS/KDS print routing | POS/KDS station files, kitchen/receipt print migrations, POS/KDS SQL and route smoke | Branch Hub shell changes unless they only provide a station return link |
| Finance/SePay | Finance cash/bank transaction model, SePay bank transaction UI/tests/worklog | Branch Operator Hub and stock-floor wrappers |
| Shared UI/rules | Design-system/rule/component changes that are prerequisites for a lane | Cosmetic cleanup not required by the active lane |

First landable Branch Hub PR: shell ownership, bottom nav contract, Hub/Shift
first viewport, and branch stock fallback guards. Settings and remaining stock
detail surfaces follow as separate slices unless their shared component props are
needed to keep actions branch-native.

## Module / surface / action ownership matrix

### Shell owners

| Plane | Route family | Shell owner | Module keys | Owns | Must not own |
| --- | --- | --- | --- | --- | --- |
| Tenant admin | `/admin/*` | `OfficeModuleShell module="admin"` | `dashboard`, `settings`, `reports` | Tenant status, tenant identity, payment settings, printer jobs/templates, legacy admin redirects | Branch floor work, branch mobile setup, POS/KDS live work |
| Office workspaces | `/finance`, `/inventory`, `/hr`, `/menu`, `/orders`, `/branches`, `/notifications` | Module shell (`FinanceShell`, `InventoryShell`, or `OfficeModuleShell`) | `finance`, `inventory`, `hr`, `menu`, `orders`, `branches`, `notifications` | Cross-branch management, back-office review, global catalog/config, reports, approvals | Daily branch floor actions as the primary advertised path |
| Branch Operator Hub | `/br/[branchId]/*` except station apps | `/br/[branchId]/(operator)/layout.tsx` | `operator_home`, `branch_dashboard`, `branch_settings`, `branch_menu_limits`, `inventory`, `employee_checkout_approvals` | Mobile branch work, branch setup, stock floor tasks, manager branch control | Office sidebar, tenant admin shell, cross-branch procurement/catalog |
| Station apps | `/br/[branchId]/pos`, `/kds`, `/runner` | Specialized POS/KDS/Runner layouts | `pos`, `kds`, `runner` | Live selling, kitchen bump, runner display, payment/print/order mutation | Generic operator page chrome, office sidebar |
| Employee compatibility | `/employee/*` | Employee mobile shell | `employee` | Self-service and compatibility paths while cutover proceeds | Primary branch manager IA, stock/branch settings discovery |

Route path owns the shell. A Server Action file living under `/inventory` or
`/employee` does not make the caller an inventory or employee shell surface.
When the route wrapper passes `branchId`, `basePath`, and fallback paths under
`/br/[branchId]/*`, the surface owner is the branch route.

### Branch route matrix

| Route | Surface | Primary job | Module key / nav | Actions and data | Shell rule |
| --- | --- | --- | --- | --- | --- |
| `/br` | Branch picker | Owner selects operating branch | `branch_picker` | Branch list/read only | No admin shell once branch is chosen |
| `/br/[branchId]` | Branch Hub | Open the next branch task | `operator_home` / `operator-bottom-nav` | `resolveOperatorTiles`, today work state, branch context | Operator shell only |
| `/br/[branchId]/dashboard` | Branch control | See current branch operating state | `branch_dashboard` / `operator-bottom-nav` | Branch operating status, alerts, approvals, end-day links | Operator shell, not `/admin/dashboard` |
| `/br/[branchId]/settings` | Branch setup hub | Configure this branch's floor setup | `branch_settings` / `operator-bottom-nav` | Links to tables, POS terminals, printers, KDS stations, POS sessions | No HR/payroll/finance/procurement links |
| `/br/[branchId]/settings/tables` | Branch setup | Zones and tables | `branch_settings` | `createZone`, `updateZone`, `deleteZone`, `createTable`, `updateTable`, `deleteTable` | Shared branch-settings actions, operator shell |
| `/br/[branchId]/settings/pos` | Branch setup | POS terminals and branch stock block | `branch_settings` | `createTerminal`, `updateTerminal`, `setBranchIngredientStockBlock` | Shared branch-settings actions, operator shell |
| `/br/[branchId]/settings/printers` | Branch setup | Branch printers | `branch_settings` | `upsertPrinter`, `deletePrinter` | Shared branch-settings actions, operator shell |
| `/br/[branchId]/settings/kds` | Branch setup | KDS stations and category routing | `branch_settings` | `createStation`, `updateStation`, `saveStationCategories`, `upsertStationWithCategories` | Shared branch-settings actions, operator shell |
| `/br/[branchId]/settings/menu-limits` | Branch sellability | Set `Tồn`, `Sẵn bán`, `Còn` for branch items | `branch_menu_limits` / `operator-bottom-nav` | `fetchBranchMenuDailyLimits`, `setBranchMenuDailyLimit`, `clearBranchMenuDailyLimit` | Branch management surface, not global menu editor |
| `/br/[branchId]/settings/pos-sessions` | Branch end-day review | Review POS sessions for this branch | `branch_settings` | `getPosSessionReport` | Branch setup/control, not finance dashboard |
| `/br/[branchId]/shift` | Personal shift cockpit | Clock, tasks, checklist, assigned count work | `employee` under branch scope | `clockInWithPhoto`, `toggleChecklistItem`, `requestCheckoutApproval`, `cancelCheckoutRequest`, `clockOutManagerShift`, `approveCheckoutRequest`, consumption/count task reads | Operator shell; old `/employee/*` becomes compatibility |
| `/br/[branchId]/shift/schedule` | Schedule | See own schedule for branch work | `employee` under branch scope | `fetchMySchedule` | Operator shell |
| `/br/[branchId]/shift/leave` | Leave request | Submit or cancel leave | `employee` under branch scope | `submitLeaveRequest`, `cancelLeaveRequest` | Secondary route, not bottom-nav primary |
| `/br/[branchId]/stock` | Stock floor hub | Choose branch stock task | `inventory` / `operator-stock` | Branch-scoped stock task links and summaries | Operator shell, never redirect to `/inventory` |
| `/br/[branchId]/stock/count` | Count entry | Submit count slip from branch floor | `inventory` / `operator-stock` | `submitCountSlip` | Operator shell; employee count action may be reused |
| `/br/[branchId]/stock/count-slips` | Count approval | Approve or request recount for slips | `inventory` / `operator-stock` | `approveCountSlip`, `requestCountRecount` | Operator shell; manager/owner gated |
| `/br/[branchId]/stock/receive` | Transfer receive | Receive inbound stock for this branch | `inventory` / `operator-stock` | `fetchStockTransfers`, `fetchStockTransferDetail`, `transferConfirmReceive`, `transferReceive` | Operator shell with receive tab/default |
| `/br/[branchId]/stock/transfer` | Transfer dispatch/list | Create, ship, transit, receive transfer | `inventory` / `operator-stock` | `fetchStockTransfers`, `fetchBranchesForTransfer`, `createStockTransfer`, `transferConfirmShip`, `transferMarkInTransit`, `transferConfirmReceive`, `transferReceive` | Operator shell with branch `basePath` |
| `/br/[branchId]/stock/transfer/new` | Transfer create | Create branch-scoped transfer | `inventory` / `operator-stock` | `fetchBranchesForTransfer`, `createStockTransfer` | Operator shell, no `/inventory/transfers/new` fallback |
| `/br/[branchId]/stock/transfer/[id]` | Transfer detail | Confirm shipment/receive state | `inventory` / `operator-stock` | `fetchStockTransferDetail`, transfer status actions | Operator shell, no admin sidebar |
| `/br/[branchId]/stock/waste` | Waste entry | Record waste/expiry loss at branch | `inventory` / `operator-stock` | `createWasteEntry`, `createExpiryWriteoff`, `getWasteCapStatus`, `getIngredientRollingWaste` | Operator shell; reports stay office inventory |
| `/br/[branchId]/stock/waste-approvals` | Waste approval | Approve or reject pending waste for this branch | `inventory` / `operator-stock` | `approveWaste` | Operator shell, branch-locked; office `/inventory/waste/approvals` stays for cross-branch oversight |
| `/br/[branchId]/pos` | POS station | Sell, mutate order, pay, print | `pos` / station chrome | POS menu/session/order/payment/print actions | Specialized POS layout |
| `/br/[branchId]/kds` | Kitchen station | See tickets and bump kitchen items | `kds` / station chrome | KDS item status and out-of-stock actions | Specialized KDS layout |
| `/br/[branchId]/runner` | Runner display | Serve-ready board | `runner` / station chrome | Runner board reads | Specialized Runner layout |

### Office module matrix

| Module | Office route | Surface owner | Primary actions | Branch cutover rule |
| --- | --- | --- | --- | --- |
| Admin/settings | `/admin/*`, `/admin/settings/*` | Tenant admin shell | `fetchBranchOperatingStatus`, `updateTenantIdentity`, `updatePaymentSettings`, `retryJobFromMonitor`, `savePrintTemplate`, `restorePrintTemplateDefault`, `previewPrintTemplate`, `testPrintTemplate` | Tenant/admin only. Do not use as branch setup shell. |
| Branches | `/branches/*` | Office shell | `createBranch`, `updateBranch`, `toggleBranchActive`, `listTrustedIps`, `trustCurrentIp`, `revokeTrustedIp` | Owns branch master data and trusted network config, not daily floor setup. |
| Menu | `/menu/*` | Office shell | `createCategory`, `updateCategory`, `toggleCategoryActive`, `createItem`, `updateItem`, `toggleItemActive`, `saveVariants`, `saveModifiers`, `saveSides`, `exportMenu`, `importMenu`, `downloadMenuTemplate` | Global catalog/editor stays office. Branch sellability lives at `/br/[branchId]/settings/menu-limits`. |
| Orders | `/orders/*` | Office shell | `fetchOrders`, `fetchOrderAuditLog`, `fetchOrderItems`, `approveRefund`, `fetchRefunds` | Historical review/refunds stay office. Live order mutation stays POS. |
| Inventory oversight | `/inventory/*` | `InventoryShell` | Dashboard, ingredient catalog, categories, units, suppliers, purchase orders, goods receipt, production, recipes, issues, reports, thresholds, QC, cross-branch stocktake, transfer/waste approvals | Branch floor execution is exposed at `/br/[branchId]/stock/*`; office inventory remains canonical for procurement/catalog/reporting/approval. |
| Finance | `/finance/*` | `FinanceShell` | `setCashOpening`, `runDailySummaryForBranch`, tax invoice create/cancel/replace/resync/reissue, revenue KPIs, rollups, expenses, food cost, archives, payment correction, refunds | Owner finance only. Branch setup/control links must not send users here for floor tasks. |
| HR | `/hr/*` | Office shell | Employee account/staff permissions, shifts, attendance, photos, position tasks, payroll, leave approval | HR master/payroll remains office. Daily shift execution moves under `/br/[branchId]/shift`. |
| Notifications | `/notifications/*` | Office/authenticated shell | `listNotifications`, `getUnreadCount`, `markNotificationRead`, `markAllNotificationsRead` | Header action surface; not a bottom-nav branch module. |

### Station action boundary

| Station | Route | Owns | Action groups | Boundary |
| --- | --- | --- | --- | --- |
| POS | `/br/[branchId]/pos` | Session, table, cart, order mutation, payment, receipt/kitchen print | `fetchMenuForPos`, `fetchDailyLimitsForPos`, `fetchTablesForBranch`, `fetchPosTerminals`, `fetchActiveSession`, `fetchPosPermissionFlags`, `openPosSession`, `closePosSession`, `sendToKitchen`, `printReceipt`, `printProvisionalBill`, `retryPrintJob`, payment actions, discount/split/merge/service-charge/void actions | POS consumes sellability and stock state. It does not own stock caps or menu-limit setup. |
| KDS | `/br/[branchId]/kds` | Kitchen queue and item readiness | KDS item status actions, `markKdsItemOutOfStock`, `fetchKdsCompletionHistory` | KDS can mark out of stock where permitted, but branch manager owns quota/stock-limit setup. |
| Runner | `/br/[branchId]/runner` | Customer/runner ready board | Runner display reads | Display-only operational board. It should link back to Hub only where station chrome allows. |

### Action ownership rules

- A route may reuse an existing Server Action only if that action already
  authenticates the caller, validates input with Zod where applicable, and
  enforces branch access through claims/RLS/RPC.
- Reused actions must receive route-owned branch context from the URL or server
  auth context. They must not infer branch scope from browser storage or hidden
  client state.
- Branch wrappers must pass branch-owned paths (`basePath`, `fallbackPath`,
  return links, detail links) so a successful action cannot push the user into
  `/inventory`, `/employee`, `/admin`, or another office shell by accident.
- Office approval/report actions may be linked from branch surfaces only when
  the route remains branch scoped and the user job is branch daily control. If
  the job is cross-branch review, procurement, payroll, finance, or tenant
  configuration, it belongs to the office route.

### Do-not-cross-shell checklist

- `/br/[branchId]/settings/*` must never import or render `OfficeModuleShell`,
  `InventoryShell`, `FinanceShell`, or admin sidebar chrome.
- `/br/[branchId]/stock/*` must never redirect to `/inventory/*` as its normal
  fallback or post-action destination.
- Branch Hub tiles must never advertise `/inventory/stocktake`,
  `/inventory/transfers`, `/inventory/waste`, `/hr/*`, `/finance/*`, or
  `/admin/*` as the primary route for branch floor work.
- `/br/[branchId]/settings` must stay setup-only: tables, POS terminals, branch
  stock block, printers, KDS stations, menu limits, POS sessions.
- POS/KDS/Runner must keep station layouts and must not become generic
  `operator-bottom-nav` pages.
- Owner/branch_manager may see both branch-management and station links, but
  route ownership still decides chrome. Permission does not imply admin shell.

## Full cutover phases

### Phase 1 — Hub hardening

Strengthen `/br/[branchId]` without migrating old routes yet.

Deliver:

- Smart card driven by `today-work-state`.
- Role-specific pre-clock-in gate.
- Branch picker path for owner.
- Tile grouping and priority tuned for phone.
- Empty/error/no-access states through existing Employee/App surface primitives.

Acceptance:

- Phone first viewport exposes the next safe action.
- `resolveOperatorTiles` remains the tile source.
- No POS/KDS/Stock internals are rewritten.

### Phase 2 — Shift cockpit cutover

Move the Employee hot path into one `/br/[branchId]/shift` cockpit.

Deliver:

- `/br/[branchId]/shift` is the canonical personal shift route and combines clock, tasks, checklist, and assigned counts in one screen.
- `/br/[branchId]/shift/schedule` is the canonical schedule route and is advertised in the bottom nav as `Lịch`.
- Primary card owns the state transition: clock in, continue required tasks, request/perform checkout, checkout pending, or done.
- Task groups render inline by phase: `Đầu ca` and `Cuối ca`; `Tiêu hao` and `Kiểm kê` appear as special task rows.
- `Ca` may show a compact next-shift hint, but schedule details belong to `Lịch`.
- Existing `/employee` hot paths redirect to the correct branch shift route where branch context is resolvable.
- Compatibility routes such as `/br/[branchId]/shift/clock` and `/tasks` should not become advertised IA. They either redirect back to `/shift` or are removed once the cockpit owns the workflow.
- Employee self-service pages stay compact and terse.
- Secondary routes remain only for long-form or history work:
  - `/br/[branchId]/shift/leave`
  - `/br/[branchId]/shift/payslip`
  - `/br/[branchId]/shift/profile`

Acceptance:

- Chấm công, việc trong ca, and checklist/count state work from the single `/shift` screen.
- Today's schedule and upcoming shifts work from `/br/[branchId]/shift/schedule`.
- Leave and payslip still work as secondary routes; profile remains available from `Tôi`.
- Old `/employee/*` is not advertised as the main IA.
- The user does not need to move between separate `clock` and `tasks` pages to complete a normal shift.

### Phase 3 — Branch control mobile surface

Bring branch-manager daily control into the operator shell.

Deliver:

- Branch dashboard/control pages render in operator shell on mobile.
- Menu-Limits keeps manager-owned `Tồn · Sẵn bán · Còn`.
- Approvals and settings are reachable from the Hub.

Acceptance:

- POS/KDS still only consume sell-state and do not manage quota/stock caps.
- `branch_manager` and `owner` can operate the branch without jumping to an admin-style shell on phone.

### Phase 4 — Stock floor slices

Move branch-floor stock actions under `/br/[branchId]/stock/*`.

Deliver:

- Count, receive, transfer, waste, and floor stock tasks become branch-scoped mobile entries.
- Office `/inventory/*` remains canonical for procurement, catalog, suppliers, recipes, reports, and cross-branch oversight.

Acceptance:

- Daily stock work is branch/mobile-first.
- Procurement/catalog/report workflows are not duplicated.

### Phase 5 — Station apps re-root

Align POS/KDS/Runner with the shared branch context.

Deliver:

- POS/KDS/Runner keep their specialized station UIs.
- Station chrome gets a clear path back to Hub where appropriate.
- Shared branch context replaces duplicate branch fetching where safe.

Acceptance:

- POS order flow, KDS ready/bump flow, Runner display, print/payment/HĐĐT smoke paths are not regressed.
- No POS/KDS IA rewrite in this phase.

### Phase 6 — Cleanup

Remove duplicate discovery once the new paths are canonical.

Deliver:

- Route-map, route-resolution, nav-config, docs, and tests reflect the new canonical IA.
- Compatibility redirects remain only where they prevent broken links.

Acceptance:

- No two live nav surfaces advertise the same primary job.
- Route tests prove old paths resolve intentionally.

## Review synthesis

PM:
Build the full cutover as the product target, but do not ship it as one release. The MVP is a stronger `/br/[branchId]` Hub that points to existing workflows while making Daily Work First the default.

BA:
Branch operation is per chi nhánh. Employee shift work and manager branch control have different jobs and must stay separate routes under the same branch scope. Menu-Limits and stock caps are manager-owned; POS/KDS only consume sellability.

Senior Dev:
Reuse `resolveBranchContext`, `resolveOperatorTiles`, `MODULE_ACL`, route-map, and Employee surface primitives. Avoid a new shell or scope provider. Implement phase by phase with route tests before moving station app internals.

QA/QC:
Every phase needs route/ACL checks, mobile viewport smoke, and targeted regression tests for the touched family. POS/KDS phase must include real route smoke because station workflows are high-risk.

## Verification gates

Every implementation phase:

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build
```

Targeted gates by phase:

- Hub/route phases: operator route/static tests, module ACL tests, route-map tests.
- Shift phase: employee daily work tests and mobile UI tests.
- Branch control phase: menu-limits stock-capacity tests.
- Stock phase: inventory count/stock floor route tests.
- POS/KDS phase: POS/KDS route smoke plus existing stock outcome/menu limit tests.

## Non-goals

- No new design system.
- No native rewrite.
- No new branch scope storage.
- No POS/KDS core rewrite during Hub/Shift/Branch Control phases.
- No duplicate dashboard-first branch portal.

## Open implementation notes

Resolved by owner 2026-07-02:

- `/employee` for owner (`branch_id=null`, multi-branch) redirects to `/br` (branch picker) — same picker as the post-login Hub flow; no per-owner "last branch" storage (Non-goals: no new branch scope storage). Implemented in `resolveEmployeeBranchRuntimePath`.
- Pre-clock-in POS/KDS tiles for cashier/chef are SHOWN but DISABLED with a "Chấm công để mở" hint — the disabled tile is itself the clock-in prompt. (UI change lands with Phase 1 smart-card work.)
- Phase 1 branch-manager smart card shows ONE counter: pending approvals (checkout + waste). Revenue/alert KPIs stay in Phase 3 Overview.
- Installed-station PWA entry needs no user-agent detection: each station manifest `start_url` points at `/br/{branchId}/{pos|kds|runner}`, so entry flows through `returnTo` in `resolvePostLoginRedirect`. `BranchHubContext.standaloneStation` intentionally stays `null` from headers.
- Waste approvals get a branch-scoped operator surface at `/br/[branchId]/stock/waste-approvals` (hub smart cards link there); office `/inventory/waste/approvals` remains for cross-branch oversight.
