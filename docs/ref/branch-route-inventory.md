# Inventory routing Branch — `/br/[branchId]`

Bảng khóa presentation plane cho mọi `page.tsx` dưới
`apps/web/app/(protected)/br/[branchId]/`. Dùng trước khi fork presenter
Branch-native. Contract: `docs/modules/ui.md` (Branch Operator Landing) và
`docs/ref/screen-context-map.md` §2.4A.

- **Đếm:** 66 `page.tsx` (63 operator + 3 station).
- **Khóa inventory:** 2026-08-08.
- **Wave 1 Đội:** đã fork `/shift/attendance` + `/shift/roster` (share
  loader/action; Owner giữ IA DataTable).
- **Wave 2 Kho:** đã fork `/stock/transfer`, `/stock/transfer/new`,
  `/stock/purchase-requests`.

## Rubric class

| Class | Ý nghĩa | Next mặc định |
| --- | --- | --- |
| **A** | Branch-native — `BranchOperator*` + Item/Sheet/NumberPad | keep |
| **A-** | Chrome-only / false native — có Branch client nhưng vẫn Owner form/DataTable density hoặc lệch docs | fork (sau B) |
| **B** | Owner wrapper — nhúng client Control Surface làm body chính | fork |
| **C** | Redirect/shim — trong Branch hoặc sang `/inventory` | keep-shim |
| **D** | staff-runtime plane adapter (`plane="branch"`), không phải Owner LIST | keep |
| **E** | Station POS/KDS/Runner — shell riêng, ngoài operator chrome | station-out-of-scope |

Cột **Archetype** lấy từ `scripts/page-archetypes.mjs` (có thể là
`EMBED-WRAPPER` / `REDIRECT-SHIM` trong khi class plane là A/C/D — ghi cả hai).

## Counts

| Class | n |
| --- | ---: |
| A | 43 |
| A- | 2 |
| B | 3 |
| C | 7 |
| D | 8 |
| E | 3 |
| **Tổng** | **66** |

## B — Owner wrapper (fork ưu tiên)

| URL | Body Owner | Wave |
| --- | --- | --- |
| `/br/[branchId]/stock/catalog/thresholds` | `ThresholdsClient` | 3 |
| `/br/[branchId]/feedback` | `FeedbackInbox` | 4 |
| `/br/[branchId]/feedback/qr` | `QrManagement` | 4 |

## A- — False native / lệch docs

| URL | Evidence | Wave |
| --- | --- | --- |
| `/br/[branchId]/stock/waste` | `WasteOperationalForm` — docs §2.5 yêu cầu sheet-per-line DOC | 3 |
| `/br/[branchId]/stock/stocktake/[id]/count` | `StocktakeCountWizard` (NumberPadSheet); ownership path Owner | sau Wave 2–3 |

## C — Shim (7)

| URL | Target |
| --- | --- |
| `/stock/requests` | → `/stock/transfer` |
| `/stock/receive` | → `/stock/transfer?work=receive` |
| `/stock/grn/new` | → requests/new hoặc purchase-requests theo kind |
| `/stock/grn/new/[supplierId]` | cùng shim `/grn/new` |
| `/stock/production` | → `/inventory/production?branchId=` |
| `/stock/production/new` | → `/inventory/production/new?branchId=` |
| `/stock/production/[id]` | → `/inventory/production/[id]` |

## Backlog fork (sau khi owner khóa bảng)

1. ~~**Wave 1 Đội:** attendance → roster~~ (xong).
2. ~~**Wave 2 Kho hub:** transfer → transfer/new → purchase-requests~~ (xong —
   `BranchStockFulfillmentHubClient` / `BranchTransferCreateClient` /
   `BranchPurchaseRequestsClient`).
3. **Wave 3:** waste sheet-per-line DOC → thresholds Branch LIST.
4. **Wave 4:** feedback inbox + QR Branch touch LIST.

Ngoài scope: redesign POS/KDS/Runner; gỡ production shim (quyết định product);
URL-bind ADR 0018 drawers; gộp menu-limits page↔sheet.

## Gold mẫu (giữ)

leave-approvals · checkout-approvals · attendance · roster · transfer hub ·
transfer/new · purchase-requests · on-hand (+ detail) · receive/[id] ·
waste-approvals · team hub.

---

## Bảng đầy đủ (66)

URL rút gọn: bỏ prefix `/br/[branchId]`. Page path rút gọn dưới
`apps/web/app/(protected)/br/[branchId]/`.

### home

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | home | LANDING | home composition (`BranchTodayStatus`, `BranchQueueSection`, tiles) | A | BranchOperator landing | keep |

### team

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/team` | team | LIST | `TeamWorkspaceTabs` → `TeamBoardClient` / `TeamMembersContent` | A | hub 2 tab; legacy `?tab=` → `/shift/*` | keep |

### shift

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/shift` | shift | EMBED-WRAPPER | `StaffWorkdayPageContent` | D | staff-runtime; owner → `/team` | keep |
| `/shift/clock` | shift | EMBED-WRAPPER | `StaffClockPageContent` | D | staff-runtime clock | keep |
| `/shift/schedule` | shift | EMBED-WRAPPER | `StaffSchedulePageContent` | D | staff-runtime schedule | keep |
| `/shift/schedule/leave` | shift | EMBED-WRAPPER | `EmployeeLeavePageContent` | D | staff-runtime leave request | keep |
| `/shift/attendance` | shift | LIST | `AttendanceTab` → `BranchAttendanceClient` | A | ItemGroup + Sheet; không `AttendanceTable` | keep |
| `/shift/roster` | shift | EMBED-WRAPPER | `RosterTab` → `BranchRosterWeekClient` | A | week cards + touch Select; không Owner DataTable | keep |
| `/shift/leave-approvals` | shift | EMBED-WRAPPER | `LeavesTab` → `BranchLeaveApprovalsClient` | A | ItemGroup + Sheet sticky (gold) | keep |
| `/shift/checkout-approvals` | shift | EMBED-WRAPPER | `StaffCheckoutApprovalsPageContent` | D | staff-runtime `plane="branch"`; swipe + Drawer | keep |

### stock

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/stock` | stock | LIST | `BranchStockFulfillmentHubClient` + 4 cửa | A | store: phiếu + cửa; central: tile hub | keep |
| `/stock/on-hand` | stock | LIST | `BranchStockOnHandClient` | A | touch LIST; không DataTable (gold) | keep |
| `/stock/on-hand/[ingredientId]` | stock | DETAIL | `BranchStockIngredientDetail` | A | ControlBar + sticky footer | keep |
| `/stock/requests` | stock | REDIRECT-SHIM | redirect | C | → `/stock/transfer` | keep-shim |
| `/stock/requests/new` | stock | DOC-WORKFLOW | `StockRequestEditor` | A | Branch editor + ControlBar | keep |
| `/stock/requests/[id]` | stock | DETAIL | `StockRequestDetailView` `mode="branch"` | A | BranchOperatorPage + ControlBar | keep |
| `/stock/receive` | stock | REDIRECT-SHIM | redirect | C | → `/stock/transfer?work=receive` | keep-shim |
| `/stock/receive/[id]` | stock | DETAIL | `TransferReceiveClient` | A | NumberPadSheet + sticky confirm (gold) | keep |
| `/stock/transfer` | stock | REDIRECT-SHIM / LIST | store → `/stock`; central hub client | C/A | store shim; central giữ list | keep-shim |
| `/stock/transfer/new` | stock | DOC-WORKFLOW | `BranchTransferCreateClient` | A | NumberPadSheet + sticky; central-only | keep |
| `/stock/transfer/[id]` | stock | DETAIL | `BranchTransferDetailClient` | A | Branch detail client | keep |
| `/stock/grn` | stock | LIST | `BranchGrnListClient` | A | central list; store → transfer | keep |
| `/stock/grn/[id]` | stock | DETAIL | `GrnReviewOperatorClient` / `BranchGrnReceiptClient` | A | draft review vs receipt | keep |
| `/stock/grn/new` | stock | LIST | redirect | C | → requests/new hoặc purchase-requests | keep-shim |
| `/stock/grn/new/[supplierId]` | stock | DOC-WORKFLOW | redirect | C | cùng shim `/grn/new` | keep-shim |
| `/stock/purchase-requests` | stock | LIST | `BranchPurchaseRequestsClient` | A | Sheet + NumberPad; central-only | keep |
| `/stock/production` | stock | LANDING | redirect | C | → `/inventory/production?branchId=` | keep-shim |
| `/stock/production/new` | stock | DOC-WORKFLOW | redirect | C | → `/inventory/production/new?branchId=` | keep-shim |
| `/stock/production/[id]` | stock | DETAIL | redirect | C | → `/inventory/production/[id]` | keep-shim |
| `/stock/stocktake` | stock | LIST | `BranchStocktakeListClient` | A | Branch session list | keep |
| `/stock/stocktake/new` | stock | DOC-WORKFLOW | `BranchStocktakeNewClient` | A | create; flag-off → list | keep |
| `/stock/stocktake/[id]` | stock | DETAIL | `BranchStocktakeDetailClient` | A | detail; có thể bounce `/count` | keep |
| `/stock/stocktake/[id]/count` | stock | DOC-WORKFLOW | `BranchStocktakeCountClient` → `StocktakeCountWizard` | A- | NumberPadSheet; wizard shared Owner path | fork |
| `/stock/count` | stock | EMBED-WRAPPER | `StaffCountPageContent` | D | staff-runtime count tasks | keep |
| `/stock/count-assignments` | stock | LIST | `BranchCountAssignmentsClient` | A | Sheet assignment | keep |
| `/stock/count-slips` | stock | LIST | `BranchCountSlipsClient` | A | Sheet approve slips | keep |
| `/stock/waste` | stock | DOC-WORKFLOW | `BranchWasteCreateClient` → `WasteOperationalForm` | A- | form Owner; docs muốn sheet-per-line | fork |
| `/stock/waste-approvals` | stock | LIST | `BranchWasteApprovalsClient` | A | queue + Sheet (gold) | keep |
| `/stock/consumption` | stock | LIST | `BranchConsumptionListClient` | A | segmented LIST + sticky create | keep |
| `/stock/consumption/[id]` | stock | DETAIL | `BranchStockIssueDetailClient` | A | reuse issues detail | keep |
| `/stock/issues` | stock | LIST | `BranchStockIssuesListClient` | A | issues LIST | keep |
| `/stock/issues/[id]` | stock | DETAIL | `BranchStockIssueDetailClient` | A | issue DETAIL | keep |
| `/stock/reports` | stock | REPORT | `BranchStockReportsClient` | A | Branch reports | keep |
| `/stock/catalog` | stock | LANDING | `CatalogIndexClient` | A | catalog index | keep |
| `/stock/catalog/ingredients` | stock | LIST | `CatalogIngredientsClient` | A | Branch list; dialog Owner optional | keep |
| `/stock/catalog/categories` | stock | LIST | `CatalogCategoriesClient` | A | Branch list; actions Owner | keep |
| `/stock/catalog/units` | stock | LIST | `CatalogUnitsClient` | A | Branch list | keep |
| `/stock/catalog/suppliers` | stock | LIST | `CatalogSuppliersClient` | A | Branch list; supplier dialog Owner | keep |
| `/stock/catalog/thresholds` | stock | SETTINGS-PANEL | **`ThresholdsClient`** | B | Owner settings DataTable | fork |

### settings

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/settings` | settings | LANDING | settings link hub | A | floor settings index | keep |
| `/settings/tables` | settings | SETTINGS-PANEL | `TablesClient` (`br/_shared`) | A | shared branch settings source | keep |
| `/settings/pos` | settings | SETTINGS-PANEL | `TerminalsClient` | A | shared branch POS settings | keep |
| `/settings/kds` | settings | SETTINGS-PANEL | `StationsClient` | A | shared branch KDS stations | keep |
| `/settings/printers` | settings | SETTINGS-PANEL | `PrintersClient` | A | shared branch printers | keep |

### dashboard / feedback / ops

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/dashboard` | dashboard | DASHBOARD | `CockpitLanes` / command tiles | A | Branch cockpit local `_components` | keep |
| `/feedback` | feedback | LIST | **`FeedbackInbox`** | B | Owner feedback inbox, branch-scoped | fork |
| `/feedback/qr` | feedback | LIST | **`QrManagement`** | B | Owner QR management, branch-scoped | fork |
| `/orders` | ops | LIST | `OperatorOrdersClient` | A | Branch orders; fetch shared Owner actions | keep |
| `/menu-limits` | ops | SETTINGS-PANEL | `MenuLimitsClient` | A | daily limits; overflow entry | keep |
| `/pos-sessions` | ops | REPORT | `PosSessionsClient` | A | session report | keep |
| `/close-day` | ops | DOC-WORKFLOW | `CloseDayClient` | A | close-day checklist | keep |
| `/profile` | ops | EMBED-WRAPPER | `StaffProfilePageContent` | D | staff-runtime profile | keep |
| `/profile/payslip` | ops | EMBED-WRAPPER | `StaffPayslipPageContent` | D | staff-runtime payslip | keep |

### station

| URL | Group | Archetype | Body | Class | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- |
| `/pos` | station | BOARD | `PosDesktopShell` / `SessionGate` | E | ngoài `(operator)` layout | station-out-of-scope |
| `/kds` | station | BOARD | `KdsBoard` | E | kitchen board | station-out-of-scope |
| `/runner` | station | BOARD | `RunnerOrderBoardClient` | E | runner board | station-out-of-scope |

---

## Page path map (đối chiếu filesystem)

Mỗi URL ở trên tương ứng một `page.tsx` dưới
`apps/web/app/(protected)/br/[branchId]/` — operator routes trong `(operator)/`,
station trong `pos/`, `kds/`, `runner/`.

## route-map.ts

Mọi `entryPath` Branch trong `packages/shared/src/auth/route-map.ts` có
`page.tsx`. Leaf routes phủ bởi family `matchPrefixes` (`branch-stock`,
`branch-shift`, `branch-settings`, …) — không yêu cầu 1:1 entryPath.

## Cách cập nhật

Khi fork xong một route: đổi Class B/A- → A, cập nhật Evidence/Body, đánh dấu
Wave done. Không xóa hàng. Git là lịch sử; dòng bảng phản ánh trạng thái hiện tại.
