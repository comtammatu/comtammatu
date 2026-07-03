# Branch Hub Gap Audit — 2026-07-03

Reconciled-through 0a5ee9e2

Read-only audit. No code changes. Scope: which branch-serving jobs exist in
the codebase but are not wired into the operator Hub (`/br/[branchId]`) as a
reachable tile/route, per role — as of current `main`, i.e. **after** D058
W1 (branch relief wave) merged.

## Tóm tắt điều hành (Tiếng Việt)

W1 đã lấp 4 lỗ hổng branch-parity: phiếu nhập (GRN) list qua wrapper mỏng,
tiêu hao (consumption) qua `IssuesPageContent scope="consumption"`, tile Đơn
đặt hàng (PO) cho site trung tâm, và tile Sản xuất trong nhóm "Văn phòng".
Audit này xác nhận cả 4 đã lên `main` và tìm thêm gì còn thiếu.

**Phát hiện chính:** 24 route/khả năng có trong code nhưng KHÔNG có tile hub
persistent. Rẻ nhất để vá: 2 route mồ côi hoàn toàn (`stock/expiry`,
`stock/reports` — không tile, không link nội bộ, không ai trỏ tới) và 1 lỗ
ACL thật (duyệt hao hụt `waste-approvals` chỉ hiện khi có hàng chờ duyệt, quản
lý không có cách nào chủ động vào xem/khảo sát khi hàng đợi rỗng). Nhóm
REFACTOR-FIRST (đã biết từ audit D058) không đổi: tra cứu+hoàn tiền đơn hàng,
duyệt chấm công/nghỉ phép HR, phân công kiểm kê, trả hàng NCC, tạo phiếu nhập,
màn hình sản xuất — tất cả là monolith chưa tách `*PageContent`, không phải
việc "thêm tile" đơn giản. Không có gap P0 (an toàn/tiền); toàn bộ là hạng
mục tiện lợi/rời rạc thao tác.

## 1. Live Tile Inventory (from `nav-config.ts` + `operator-capabilities.ts`)

Source: `packages/shared/src/auth/nav-config.ts` (`OPERATOR_TILE_ITEMS`,
`OPERATOR_TILE_GROUP_TITLES`, `OPERATOR_TILE_GROUP_ORDER`) +
`packages/shared/src/auth/operator-capabilities.ts` (`resolveOperatorTiles`,
`CENTRAL_STOCK_PURCHASE_ORDERS_TILE`, `BRANCH_ONLY_GROUPS`).

`resolveOperatorTiles(role, branchId, branchKind)` returns `[]` for `office`
(no operator hub at all — office lands on `/employee`, D055 §3). For all
other roles it filters `OPERATOR_TILE_ITEMS` by `canAccess(role, moduleKey)`,
adds `CENTRAL_STOCK_PURCHASE_ORDERS_TILE` only when `branchKind !== "branch"`,
and drops `sales_kitchen` group entirely at central sites (`BRANCH_ONLY_GROUPS`).

| Group (order) | Tile label | Module key | hrefTemplate | Roles that see it (via `canAccess`) | Branch-kind note |
| --- | --- | --- | --- | --- | --- |
| my_shift | Chấm công | `employee` | `/br/{branchId}/shift/clock` | bm, wm, pm, cashier, chef | all |
| my_shift | Việc trong ca | `employee` | `/br/{branchId}/shift` | bm, wm, pm, cashier, chef | all |
| approvals | Duyệt kết ca | `employee_checkout_approvals` | `/br/{branchId}/shift/checkout-approvals` | owner, bm | all |
| approvals | Duyệt kiểm kê | `inventory` | `/br/{branchId}/stock/count-slips` | owner, bm, wm, pm | all |
| sales_kitchen | (POS) | `pos` | `/br/{branchId}/pos` | owner, cashier, bm | branch only (dropped at central sites) |
| sales_kitchen | Runner | `runner` | `/br/{branchId}/runner` | owner, cashier, chef, bm | branch only |
| sales_kitchen | KDS | `kds` | `/br/{branchId}/kds` | owner, chef, bm | branch only |
| sales_kitchen | Giới hạn bán | `branch_menu_limits` | `/br/{branchId}/settings/menu-limits` | owner, bm | branch only |
| stock | Tồn kho | `inventory` | `/br/{branchId}/stock` | owner, bm, wm, pm | all |
| stock | Nhận hàng | `inventory` | `/br/{branchId}/stock/receive` | owner, bm, wm, pm | all |
| stock | Yêu cầu hàng | `inventory` | `/br/{branchId}/stock/transfer` | owner, bm, wm, pm | all |
| stock | Kiểm kê | `inventory` | `/br/{branchId}/stock/stocktake` | owner, bm, wm, pm | all |
| stock | Báo hao hụt | `inventory` | `/br/{branchId}/stock/waste` | owner, bm, wm, pm | all |
| stock | Phiếu nhập (GRN) | `inventory` | `/br/{branchId}/stock/grn` | owner, bm, wm, pm | all — **W1** |
| stock | Tiêu hao | `inventory` | `/br/{branchId}/stock/consumption` | owner, bm, wm, pm | all — **W1** |
| stock | Đơn đặt hàng (PO) | `inventory_procurement` | `/br/{branchId}/stock/purchase-orders` | owner, wm, pm | **central site only** — **W1** |
| office_bridge | Thực đơn | `menu` | `/menu` | owner, bm | all (office-plane link) |
| office_bridge | HR workspace | `hr` | `/hr` | owner, bm | all |
| office_bridge | Đơn hàng | `orders` | `/orders` | owner, bm, cashier | all |
| office_bridge | Kho văn phòng | `inventory` | `/inventory` | owner, bm, wm, pm | all |
| office_bridge | Sản xuất | `inventory` | `/inventory/production` | owner, bm, wm, pm | all — **W1** |

Note on `orders` office_bridge tile: `MODULE_ACL.orders.allowedRoles = [owner,
branch_manager, cashier]` (`module-acl.ts:85-89`), so cashier also sees this
tile alongside owner/bm.

office_bridge group size = 5 tiles, inside the D058 §6 cap (`≤6`).

**W1 confirmed shipped** (per task instructions, verified directly against
`nav-config.ts` on current `main`): GRN list tile (`stock/grn`), consumption
tile (`stock/consumption`), PO tile for central sites
(`CENTRAL_STOCK_PURCHASE_ORDERS_TILE`), production tile in `office_bridge`
(`/inventory/production`). This report only covers what's still missing
*after* those four.

## 2. Gap Matrix — Role × Missing Job → Classification → Target File → Size

Legend: **(a)** TILE-MISSING (route exists, wire a tile — cheapest),
**(b)** WRAPPER-MISSING-S (office `*PageContent` is wrap-ready — thin wrapper
+ tile), **(c)** REFACTOR-FIRST-M/L (needs `*PageContent` extraction or
monolith decomposition first), **(d)** BRIDGE-ONLY (tenant-scoped/rare —
belongs in Văn phòng bridge, not a native tile), **(e)** INTENTIONALLY-ABSENT.

Ranked by operational frequency within each role (daily/weekly ops first).

### owner / branch_manager (branch command roles — highest blast radius)

| # | Missing job | Class | Target file | Size | Evidence |
| - | --- | --- | --- | --- | --- |
| 1 | Duyệt hao hụt (waste approvals) has no persistent entry — only a conditional "pending approvals" card that renders when `pendingWaste > 0` | **(a)** | `packages/shared/src/auth/nav-config.ts` (add tile to `approvals` group) | XS | `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx:125,145-163` passes `wasteApprovals` route into `EmployeeHomePageContent`; `apps/web/app/(protected)/employee/page.tsx:536-577` only renders the button when `pendingWaste > 0`. No `waste-approvals` module ACL key exists — gated generically under `inventory` module + `inventory:waste_approve` permission at the mutation site (`module-acl.ts` has no `waste` key; `role-route-matrix.md:193` permission list). Zero-pending state = zero way to browse the queue. |
| 2 | Inventory hạn dùng (expiry) — orphan route, zero inbound links anywhere in the app | **(a)** | `nav-config.ts` (`stock` group) | XS | `apps/web/app/(protected)/br/[branchId]/(operator)/stock/expiry/page.tsx` wraps `ExpiryPageContent`; confirmed via repo-wide grep — no tile, no in-page link, no dashboard reference. |
| 3 | Stock reports (branch-scoped stock report) — orphan route, zero inbound links | **(a)** | `nav-config.ts` (`stock` group, or fold into `stock/on-hand`) | XS | `apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/page.tsx` wraps `ReportsPageContent`; same zero-inbound-link finding. Overlaps D058 §4 "stock-movement 3→1" consolidation — do not wire a 2nd door before that lands. |
| 4 | Stock discrepancy/issues log (`stock/issues`, base scope) — sibling of the tiled `stock/consumption`, same component different `scope` prop, only consumption got a tile | **(a)** | `nav-config.ts` (`stock` group) | XS | `apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/page.tsx:2,21` imports `IssuesPageContent` (same component `consumption/page.tsx` wraps with `scope="consumption"`); base scope has no tile at all. |
| 5 | Đơn hàng: lookup + refund (branch_manager, cashier) | **(c)** REFACTOR-FIRST-M | `apps/web/app/(protected)/orders/orders-client.tsx` (379 lines) | M | `orders/page.tsx` renders `<OrdersClient>`/`<RefundsClient>` directly — no `*PageContent` export, props are `initialOrders/initialSummary/branches/showBranchFilter` (no `routeBranchId`/`basePath`/`embedded`). Matches D058 known list; bridge tile to `/orders` exists today as office-plane oversight door, per D058 §5 rule ("office door canonical for cashier, dissolves once chrome unifies" — T3 debate §Conflicts-2). |
| 6 | HR: chấm công + duyệt nghỉ phép (attendance/leave approvals) | **(c)** REFACTOR-FIRST-L | `apps/web/app/(protected)/hr/hr-client.tsx` (300 lines) | L | `hr/page.tsx:72` lines renders `<HrClient>` directly; no `HrPageContent` export; props (`employees/branches/isBranchManager/canManageEmployees/...`) have no wrap-ready shape. Confirmed monolith per D058 addendum. |
| 7 | Phân công kiểm kê (count-assignments — who counts what) | **(c)** REFACTOR-FIRST-M | `apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx` (588 lines) | M | `count-assignments/page.tsx` renders `<CountAssignmentsClient>` directly; no `*PageContent` export; largest of the M-class monoliths (588 lines). |
| 8 | Trả hàng NCC (supplier-returns) | **(c)** REFACTOR-FIRST-M | `apps/web/app/(protected)/inventory/supplier-returns/supplier-returns-client.tsx` (114 lines) | M | `supplier-returns/page.tsx` renders `<SupplierReturnsClient initialReturns>` directly; smallest client file of the M-class but still needs list+detail+new extraction (3 routes: list, `[id]`, `new`) before a branch wrapper is safe. |
| 9 | Tạo phiếu nhập (GRN **create** flow) — list/detail already wrap-ready (W1), create is not | **(c)** REFACTOR-FIRST-M | `apps/web/app/(protected)/inventory/grn/new/page.tsx` + `new/[supplierId]/grn-create-client.tsx` | M | No `*PageContent` export for the create flow; confirmed the W1 wrap only covered `GRNListPageContent`/`GRNDetailPageContent` (`br/[branchId]/(operator)/stock/grn/page.tsx` + `[id]/page.tsx` import those two only). Branch staff can view GRNs but cannot start one from the branch hub. |
| 10 | Màn hình sản xuất chi tiết (production surface — office_bridge tile W1 only links to the office `/inventory/production` page, not a branch-native wrapped view) | **(c)** REFACTOR-FIRST-L | `apps/web/app/(protected)/inventory/production-client.tsx` (143 lines, `ProductionHubClient`) | L | `inventory/production/page.tsx` calls `loadProductionSurfaceData()` + renders `<ProductionHubClient>` with 10 raw props, no `routeBranchId`/`basePath`/`embedded`. W1's production tile is BRIDGE-ONLY by necessity (office page not wrap-ready yet) — matches D058 known list. |
| 11 | Chi tiết cài đặt phiên POS (`settings/pos-sessions`) | **(e)** justified | n/a | — | Reachable only via redirect gate inside the route itself if `canManageBranchFloorSettings` fails; not listed on the `settings` hub page (`hub-tiles.ts` wires tables/pos/printers/kds but not pos-sessions) — likely deliberate (session mgmt is a narrower/rarer action than the 4 hubbed settings). Flagging as a possible **(a)** candidate but not ranked as a gap since no user-facing entry currently exists for ANY role including owner — needs an owner call, not an agent default. |

### warehouse_manager / production_manager (central-site roles)

| # | Missing job | Class | Target file | Size | Evidence |
| - | --- | --- | --- | --- | --- |
| 12 | Same items #1–4, #7–10 above apply identically (both roles pass `canAccess` for `inventory`/`inventory_procurement`) | (same) | (same) | (same) | `resolveOperatorTiles` filters by `canAccess(role, moduleKey)` only, not role-specific beyond that — wm/pm see every `stock`-group tile owner/bm see. |
| 13 | Supplier invoices (AP đối soát hóa đơn NCC) — no operator-plane presence at all | **(d)** BRIDGE-ONLY | n/a (office `/inventory/supplier-invoices`) | — | Per role-route-matrix.md:34 ("Procurement also covers AP đối soát hóa đơn NCC (`/inventory/supplier-invoices`)"); tenant-level AP reconciliation, rare per-branch job — correctly excluded from tile grid per D058 addendum ("Bridge-only: ... supplier invoices"). |

### cashier / chef (floor roles)

| # | Missing job | Class | Target file | Size | Evidence |
| - | --- | --- | --- | --- | --- |
| 14 | Per D058 addendum: "chef = full parity already" — no gaps found for chef beyond the shared #1 (waste-approvals visibility, though chef has no `employee_checkout_approvals`/`inventory` grants for most of stock group — `MODULE_ACL.inventory.allowedRoles` excludes cashier/chef, so #1–4 above do not apply to them) | — | — | — | `module-acl.ts:55-64` `inventory.allowedRoles = [owner, branch_manager, warehouse_manager, production_manager]` — cashier/chef never see the `stock` tile group at all, so items #1–4 are moot for them. |
| 15 | Cashier order lookup/refund — same item as #5 above (office door canonical per D058 §5, not a branch-native gap) | **(d)** BRIDGE-ONLY (by decision) | n/a | — | T3 debate explicit resolution: "keep the office door canonical (rare job, per BA); it dissolves visually once chrome primitives unify. No operator duplicate." Not re-litigated here. |

### office (no operator hub at all)

| # | Missing job | Class | Target file | Size | Evidence |
| - | --- | --- | --- | --- | --- |
| 16 | N/A — `resolveOperatorTiles` returns `[]` for `office` (`operator-capabilities.ts:42`); D055 §3 keeps `/employee` as home; D058 §3 already granted `/finance` read. Out of scope for this hub audit (office has no hub to gap-check). | **(e)** justified | — | — | By explicit D058/D055 decision, not an oversight. |

## 3. Prioritized "Wire Next" — Top 8 (quick wins first)

1. **(a)** Stock issues log (`stock/issues`, base scope) → add `stock`-group tile — sibling of already-tiled `consumption`, same component, zero new code beyond a `nav-config.ts` entry. `packages/shared/src/auth/nav-config.ts`.
2. **(a)** Duyệt hao hụt persistent tile in `approvals` group (not just the conditional pending-card) — closes the "can't audit when queue is empty" hole. `packages/shared/src/auth/nav-config.ts`.
3. **(a)** Inventory hạn dùng (`stock/expiry`) → `stock`-group tile — fully orphaned route today. `packages/shared/src/auth/nav-config.ts`.
4. **(a)** Stock reports (`stock/reports`) → tile, OR defer explicitly to D058 §4's stock-movement 3→1 consolidation (owner call: wire now vs. wait for the canonical-URL wave so we don't wire a door that gets pruned next). `packages/shared/src/auth/nav-config.ts`.
5. **(c)** GRN create flow extraction — highest-leverage REFACTOR-FIRST since list/detail already proved the wrap pattern in W1; smallest remaining lift in the M-class set. `apps/web/app/(protected)/inventory/grn/new/**`.
6. **(c)** Supplier-returns extraction — smallest client file (114 lines) among the M-class monoliths, 3 routes (list/detail/new) to wrap. `apps/web/app/(protected)/inventory/supplier-returns/**`.
7. **(c)** Count-assignments extraction — second-most operationally frequent (kiểm kê phân công recurs every count cycle), 588-line monolith. `apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx`.
8. **(c)** Orders lookup+refund extraction — feeds both branch_manager and cashier at once; unblocks a future decision to demote the office `/orders` bridge door once branch-native exists. `apps/web/app/(protected)/orders/orders-client.tsx`.

Deferred by design, not ranked: HR attendance/leave approvals (L, `hr-client.tsx` 300 lines — largest single-owner refactor, do after the M-class items establish the extraction pattern) and production surface (L, 143-line `ProductionHubClient` but touches recipe/order data model — do alongside HR as the second L-wave).

## 4. REFACTOR-FIRST Items — Blockers (cross-reference D058 parity audit, not restated)

Per `docs/worklog/t3-ia-direction-debate-2026-07-02.md` § Addendum (capability
parity matrix) and `docs/plan/decisions.md` D058 §8 — full findings live
there, this is only the current blocker per item:

| Item | Blocker |
| --- | --- |
| Orders lookup + refund | No `*PageContent` export; `OrdersClient`/`RefundsClient` take raw server-fetched props, not `routeBranchId`/`basePath`/`embedded`. Office door stays canonical for cashier per D058 §5 even after extraction — extraction unblocks an owner decision, doesn't auto-add an operator tile. |
| HR attendance/leave approvals | `hr-client.tsx` (300 lines) is a single monolith mixing roster, attendance, leave-approval, and position-task data with no internal seam; D058 addendum flags it explicitly as the largest (L) lift. |
| Count-assignments | `count-assignments-client.tsx` (588 lines) — largest client file in this whole audit; no `*PageContent`, props are fully materialized server data (`employees`, `ingredients`, `assignmentsByEmployee`) with no scope/embedding parameterization. |
| Supplier-returns | 3-route flow (list/detail/new) with no shared `*PageContent`; smallest client (114 lines) but still needs all 3 routes extracted together to avoid a half-wrapped flow. |
| GRN create | List/detail already extracted in W1 (`GRNListPageContent`/`GRNDetailPageContent`); create flow (`grn/new/page.tsx` + `new/[supplierId]/grn-create-client.tsx`) has no counterpart — the one item where the sibling pattern already exists as a template. |
| Production surface | `production-client.tsx`'s `ProductionHubClient` takes 10 raw props (permissions, branches, orders, recipes) with no `routeBranchId`/`basePath`/`embedded`; W1's `office_bridge` production tile intentionally links to the *office* page as a stopgap bridge, not a wrapped branch view — this is BRIDGE-ONLY today, REFACTOR-FIRST for a future native branch surface. |

None of these are re-solved here; this table exists only so the wire-next
list above doesn't imply they're cheap.

## Total Gap Count By Classification

| Classification | Count | Items |
| --- | --- | --- |
| (a) TILE-MISSING | 4 | waste-approvals persistent tile, stock/expiry, stock/reports, stock/issues (base scope) |
| (b) WRAPPER-MISSING-S | 0 | All identified W1 quick-wins (GRN list, consumption, PO tile, production tile) already shipped — none remaining in this class. |
| (c) REFACTOR-FIRST-M/L | 6 | orders lookup+refund (M), HR attendance/leave approvals (L), count-assignments (M), supplier-returns (M), GRN create (M), production surface (L) |
| (d) BRIDGE-ONLY | 2 | cashier order lookup/refund (by D058 §5 decision), supplier invoices (AP) |
| (e) INTENTIONALLY-ABSENT | 2 | office role (no operator hub, D055 §3/D058 §3), pos-sessions branch settings sub-page (no entry point for any role — flagged for owner decision, not defaulted) |
| **Total** | **14** | |

(Item #12 in the gap matrix — wm/pm inheriting #1–4 — is not double-counted;
it is the same 4 routes, just noting they apply to two more roles.)

## Doc-Staleness Gate Check

Ran `corepack pnpm lint:doc-staleness` after writing this report — see command
output below. Worklogs require a `Reconciled-through <sha>` banner in the
first 15 lines (this file has one, line 3) or the advisory guard flags it;
`docs/plan/decisions.md` itself is exempt (`DURABLE` list in
`scripts/check-doc-staleness.mjs`).
