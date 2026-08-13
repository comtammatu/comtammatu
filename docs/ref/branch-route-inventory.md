# Inventory routing Branch — `/br/[branchId]`

Bảng khóa presentation plane cho mọi `page.tsx` dưới
`apps/web/app/(protected)/br/[branchId]/`. Contract:
`docs/spec/page-archetypes.md`, `docs/ref/screen-context-map.md` §2.4A,
`docs/modules/ui.md`.

- **Đếm:** 66 `page.tsx` (63 operator + 3 station). Khóa: 2026-08-08.
- Wave 1 Đội: fork attendance + roster (xong). Wave 2 Kho: transfer /
  transfer/new / purchase-requests (xong). Wave 3: waste + ngưỡng tồn (xong).

## Rubric class

| Class | Ý nghĩa | Next mặc định |
| --- | --- | --- |
| **A** | Branch-native — `BranchOperator*` + Item/Sheet/NumberPad | keep |
| **A-** | Chrome-only / false native — Branch client nhưng Owner form/DataTable density | fork (sau B) |
| **B** | Owner wrapper — nhúng client Control Surface làm body | fork |
| **C** | Redirect/shim — trong Branch hoặc sang `/inventory` | keep-shim |
| **D** | staff-runtime (`plane="branch"`), không Owner LIST | keep |
| **E** | Station POS/KDS/Gọi số — shell riêng | station-out-of-scope |

**Archetype** từ `scripts/page-archetypes.mjs` (có thể `EMBED-WRAPPER` /
`REDIRECT-SHIM` trong khi class plane A/C/D — ghi cả hai khi fork).

## Counts

| Class | n |
| --- | ---: |
| A | 45 |
| A- | 1 |
| B | 2 |
| C | 7 |
| D | 8 |
| E | 3 |
| **Tổng** | **66** |

## B — Owner wrapper (fork ưu tiên)

| URL | Body Owner | Wave |
| --- | --- | --- |
| `/br/[branchId]/feedback` | `FeedbackInbox` | 4 |
| `/br/[branchId]/feedback/qr` | `QrManagement` | 4 |

## A- — False native / lệch docs

| URL | Evidence | Wave |
| --- | --- | --- |
| `/br/[branchId]/stock/stocktake/[id]/count` | `StocktakeCountWizard` shared Owner path | sau Wave 2–3 |

## C — Shim (7)

| URL | Target |
| --- | --- |
| `/stock/requests` | → `/br/[id]/stock` |
| `/stock/receive` | → `/br/[id]/stock?work=receive` |
| `/stock/grn/new` (+ `/[supplierId]`) | → requests/new hoặc purchase-requests |
| `/stock/production` (+ `/new`, `/[id]`) | → `/inventory/production…?branchId=` |

## Backlog fork

1. ~~Wave 1 Đội~~ / ~~Wave 2 Kho hub~~ (xong).
2. ~~**Wave 3:** waste sheet-per-line + thresholds Branch LIST~~ (xong).
3. **Wave 4:** feedback inbox + QR Branch touch LIST.

Ngoài scope: redesign POS/KDS/Gọi số; gỡ production shim; URL-bind ADR 0018
drawers; gộp menu-limits page↔sheet.

## Gold mẫu (giữ)

leave-approvals · checkout-approvals · attendance · roster · transfer hub ·
transfer/new · purchase-requests · on-hand (+ detail) · receive/[id] ·
waste-approvals · `/stock/waste` sheet-per-line · `catalog/thresholds` · team hub.

---

## Bản đồ 66 route (rút gọn theo section)

URL bỏ prefix `/br/[branchId]`. Class mặc định **A / keep** trừ khi ghi chú.

| Section | n | Routes (class ≠ A ghi rõ) |
| --- | ---: | --- |
| **home** | 1 | `/` LANDING |
| **team** | 1 | `/team` LIST hub |
| **shift** | 8 | `/shift`, `/clock`, `/schedule`, `/schedule/leave`, `/checkout-approvals` → **D**; `/attendance`, `/roster`, `/leave-approvals` → **A** (gold) |
| **stock hub / phiếu** | 12 | `/stock`, on-hand(+id), requests/new(+id), receive/[id], transfer(+new/+id), grn(+id), purchase-requests — **A**; store `/transfer` có thể shim→`/stock` (**C/A**) |
| **stock shim** | 6 | requests, receive, grn/new(+supplier), production(+new/+id) → **C** (bảng C) |
| **stocktake / count / waste** | 9 | stocktake list/new/[id] **A**; `[id]/count` **A- fork**; `/count` **D**; count-assignments/slips, waste-approvals, consumption(+id), issues(+id), `/waste` **A** (`DOC-WORKFLOW`, `branch-touch-document`, GRN line sheet exemplar) |
| **stock catalog / reports** | 7 | reports, catalog(+ingredients/categories/units/suppliers/thresholds) **A** |
| **settings** | 5 | `/settings` + tables/pos/kds/printers — shared `br/_shared` **A** |
| **dashboard / feedback / ops** | 8 | `/dashboard`, orders, menu-limits, pos-sessions, close-day **A**; feedback(+qr) **B fork**; profile(+payslip) **D** |
| **station** | 3 | `/pos`, `/kds`, `/pickup` → **E** |

Filesystem: operator dưới `(operator)/`; station `pos/`, `kds/`, `pickup/`.
Mọi `entryPath` Branch trong `route-map.ts` có `page.tsx`; leaf phủ bởi
`matchPrefixes` — không yêu cầu 1:1 entryPath.

## Cách cập nhật

Khi fork xong: đổi Class B/A- → A, cập nhật Evidence/Body, đánh dấu Wave done.
Không xóa hàng khỏi bảng B/A-/C hoặc counts. Git = lịch sử; bảng phản ánh
trạng thái hiện tại. Chi tiết body/archetype từng leaf: xem `page.tsx` +
`scripts/page-archetypes.mjs`.
