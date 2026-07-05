# Kế hoạch thi công — Hub Kho Tổng native mobile (2026-07-04)

> Reconciled-through `6557f2c8`
>
> Nguồn: D067 (`docs/plan/decisions.md`). Hợp đồng thiết kế:
> `docs/plan/kho-tong-hub-mockup-2026-07-04.html` — build phải khớp mockup.
> Xác minh code + PROD 2026-07-04 (SELECT-only). Mọi định danh giữ nguyên văn.

## 0. Nguyên tắc (khoá)

- **Mở rộng + reprioritize (owner 2026-07-05):** (a) **cả 3 hub** Branch /
  Kho Tổng / Bếp TT phải mobile-first — không chỉ 2 site trung tâm (chúng
  chung `(operator)/layout.tsx` + route `stock/*` nên 1 component native
  chung phục vụ cả 3); (b) **dùng đúng primitive mobile sẵn có** cho từng
  việc (Sheet · NumberPadSheet · Item · InteractiveCard…), KHÔNG ép 1 kiểu
  cứng gây thao tác bất tiện; (c) **ưu tiên gỡ trùng lặp tính năng** giữa các
  page; (d) **PWA fix vượt lên trước** (install fail + vuốt/chạm stuck +
  "Chrome bọc" mất không gian) — vỏ PWA kẹt thì mọi màn vô nghĩa. Slice PWA:
  manifest hub `scope:"/"` (in-app nav ra route chia sẻ không rớt về browser
  tab) + bỏ `window-controls-overlay` + 1 scroll container tường minh
  (`#main-content`) + safe-area. Verify install/standalone trên Vercel
  preview (local không HTTPS/device được).
- **"Nhìn là thấy, chạm là biết làm gì tiếp" (owner 2026-07-04, sau khi xem
  `/br/16/stock/production`):** mọi màn operator tuyên bố primary job; viewport-1
  = next action + hàng đợi sống. CẤM dashboard thẻ KPI trên surface operator
  (số đếm chỉ làm badge trên section/filter chip); một trạng thái nói đúng MỘT
  chỗ (không badge + banner + nút cùng nói "chưa cấu hình"); không block văn
  xuôi giải thích quy trình. Nghiệm thu mỗi lát: mở màn 3 giây biết bấm gì
  tiếp. Promote rule này vào `docs/agent/rules/ui.md` trong PR đầu của program.
- **Fork lớp hiển thị, giữ chung lớp dữ liệu.** Server action + data loader trong
  `apps/web/app/(protected)/inventory/*-actions.ts` dùng lại nguyên; chỉ viết
  component **mobile-native mới** cho route operator. Office desktop (oversight,
  D061) giữ component dày của nó. KHÔNG hai bản logic — một concern một chỗ.
- **Không shell mới, không route mới** (trừ 1 surface Danh mục). Vẫn plane
  Operator `/br/[branchId]/(operator)/*`; D019/D045/D058/D063 giữ nguyên. Mọi
  route `stock/*` đã tồn tại → sửa ruột, không tạo.
- **0 migration, 0 RLS, 0 tiền, 0 grant.** PROD `warehouse_manager` đã đủ quyền
  (`inventory:write`, `inventory:units_master`, `procurement:supplier_manage`,
  GRN/PO/writeoff/stocktake/transfer/supplier_return). Tier = **T2 front-end**.
- **Mỗi lát = 1 route family, 1 PR, 1 worktree**, full gate fresh
  (`typecheck && lint && build` + test) trước merge; QA 3 viewport
  (phone/tablet/desktop) khớp mockup. Không đụng POS/KDS/Runner.
- Áp cho `central_supply` (branch 15). Bếp TT (`central_kitchen`, branch 16)
  phần lớn = Wave E, **TRỪ màn Sản xuất `stock/production` — owner chỉ đích danh
  2026-07-04 (ảnh chụp) → kéo lên Wave A′ làm ngay**; perms Bếp khác → bộ danh
  mục Bếp vẫn chốt ở đợt E.

## 1. Bản đồ route → việc native (đều đã tồn tại)

| Route (dưới `(operator)/`) | Ruột hiện tại | Native target | Wave |
|---|---|---|---|
| `stock/grn/*` (`page`,`new`,`new/[supplierId]`,`[id]`) | `GRNListPageContent`+`GrnNewPageContent`+`GrnCreateClient` embed | Nhận hàng: NCC-first, banner "không cần PO", tạo NCC inline, nhập dòng cho ngón tay, chụp ảnh, xác nhận + tổng | **A** |
| `stock/page.tsx` | `StockPageContent` embed | Tồn kho: chip lọc nhóm + tìm + grid card 2 cột, số `font-mono`, tap → on-hand; qty 0 trung tính (D066 §5) | **A** |
| `stock/production` (Bếp TT) | `ProductionPageContent` embed — dashboard-of-zeros (ảnh owner 2026-07-04) | Sản xuất job-first: CTA "Tạo lệnh" + danh sách lệnh sống theo trạng thái; bỏ 5 thẻ KPI; trạng thái "chưa có công thức" nói 1 chỗ | **A′** |
| `page.tsx` (home) | tile grid + queue + KPI | Home "Hôm nay" Kho: CTA "Nhận hàng" + feed duyệt + lưới tile (chỉ nhánh `central_supply`) | **B** |
| `operator-bottom-nav.tsx` | Home/Shift/Management | Curated Kho: Hôm nay · Nhận · Tồn · Kiểm · Thêm | **B** |
| `stock/catalog/*` (**mới**) | — | Danh mục: Nhóm NL · Nguyên liệu · Đơn vị · Ngưỡng · NCC + thêm/sửa/xoá | **B** |
| `stock/stocktake/*` (`page`,`new`,`[id]`,`[id]/count`) | `StocktakePageContent` embed | Kiểm kê + NumberPadSheet bấm số | **C** |
| `stock/count-slips` | embed | Duyệt kiểm kê native | **C** |
| `stock/waste`, `stock/waste-approvals` | embed | Báo hao hụt + Duyệt hao hụt native | **C** |
| `stock/transfer/*`, `stock/receive/*` | `TransfersPageContent` embed | Chuyển hàng đi / Nhận chuyển native | **C** |
| `stock/supplier-returns/*` | embed | Trả hàng NCC native | **D** |
| `stock/purchase-orders/*` | embed | Đơn đặt hàng: reorder-suggestion → 1-chạm tạo PO nháp (D060) | **D** |

`nav-config.ts` `OPERATOR_TILE_ITEMS`: thêm tile "Danh mục" (`kinds:["central_supply"]`, group `stock`) — bộ tile `central_supply` 8 → 9 (D067 §5).

## 2. GRN (trọng tâm — Wave A)

- **PO không bắt buộc**: đã đúng ở DB/RPC (`goods_received_notes.po_id` NULLABLE,
  `confirm_goods_receipt_note` xử lý po_id NULL). UI đổi khung: NCC-first, list PO
  mở chỉ là lối tắt phụ (không dẫn dắt), banner "Không cần đơn đặt hàng (PO)".
- **Tạo NCC nhanh inline**: trong picker NCC, khi gõ tên chưa có → hàng "+ Tạo
  NCC «tên»" → gọi `createSupplier({name, phone?})` (`supplier-actions.ts:47`,
  name unique/tenant, bắt lỗi trùng) → dùng ngay `id` cho `createGrnDraft`. KHÔNG
  đụng schema; supplier_id vẫn NOT NULL, NCC là thật (có lịch sử). Đóng F-018.
- Nhập mặt hàng từng dòng (tìm nguyên liệu, qty, đơn vị, đơn giá) tối ưu chạm;
  `photo-upload-input.tsx` cho chụp ảnh phiếu; nút xác nhận kèm tổng tiền.

## 3. Danh mục trong hub (Wave B)

- Surface mobile mới `stock/catalog` liệt kê 5 mục, mỗi mục → danh sách con
  thêm/sửa/xoá, **tái dùng action sẵn có** (không action/perm mới):
  - Nhóm NL → `categories-actions.ts` (create/update/**delete** đủ).
  - Đơn vị → `units-actions.ts` (create/update/**delete** đủ; xoá có điều kiện).
  - NCC → `supplier-actions.ts` (create/update/**delete** đủ).
  - Nguyên liệu → `ingredient-actions.ts` (create/update/quickCreate/**toggleActive**);
    "xoá" = **soft-archive** (`toggleIngredientActive`), không hard-delete.
  - Ngưỡng tồn → `thresholds/actions.ts` (`bulkUpdate…`, sửa hàng loạt).
- ACL: route dưới `(operator)/stock/*` tự vào family `operator-stock` →
  moduleKey `inventory` → test `protected-route-module-coverage` pass sẵn.
  Quyền thao tác do action tự gate (đã có).

## 4. Home "Hôm nay" + bottom-nav (Wave B)

- `(operator)/page.tsx` nhánh `central_supply`: CTA "Nhận hàng" to nhất; feed
  "Cần xử lý" = **Phiếu nhập dở · Đơn chờ nhận (PO) · Duyệt kiểm kê · Duyệt hao
  hụt** (D067 §3 — **KHÔNG** Tồn thấp / Sắp hết hạn); lưới tile curated. Giữ
  không-KPI, không-Today-spine-đầy-đủ cho site trung tâm (D066 §4).
- Bottom-nav curated cho `central_supply` (D067 §6).

## 5. Án audit toàn diện 2026-07-05 (9 family, cả 2 site) + thứ tự wave mới

Full-audit theo rubric §0 (block census · taps · desktop-ism · nhãn lệch).
Verdict từng màn — REBUILD = layout sai job, TRIM = giết filler giữ khung,
KEEP = đạt:

| Màn | Án | Lỗi chính |
|---|---|---|
| Home `/br/[id]` (2 kind) | **REBUILD** | Kind trung tâm KHÔNG có queue domain (bếp không thấy lệnh, kho không thấy PO/chờ nhận); banner chấm công văn xuôi; PWA banner chen viewport-1 |
| `stock/production` (Bếp) | **REBUILD** | 5 KPI-card, config-state nói 4 chỗ, banner quy trình, list lệnh chôn (chẩn đoán 2026-07-04) |
| `stock/grn/[id]` (draft review) | **REBUILD** | 4 KPI QC stat-card, "Yêu cầu xem xét" nói 2 chỗ, tabs desktop, confirm bị chôn |
| `stock/receive/[id]` | **REBUILD** | Nhận 10 dòng = 33+ chạm (input inline từng dòng) → NumberPadSheet ≈20; KPI grid + stepper filler |
| `stocktake/[id]/count` (màn đếm) | **REBUILD** | Màn cần tap-optimized NHẤT lại là DataTable + search không sticky; cần stack card + auto-advance |
| `stocktake/[id]` (kết quả) | **REBUILD** | Bảng kết quả desktop không có mobile card; "—" không phân biệt chưa-đếm vs đếm-0 |
| `stock/purchase-orders/[id]` | **REBUILD** | `variance` hardcode 0 (noise mọi dòng); supplier info toàn "—"; timeline+summary+tabs bloat |
| GRN list / picker / stock list+detail / PO list+new / transfer+receive list / stocktake new / count-slips / waste+approvals / returns list+detail | **TRIM** (13 màn) | Filler blocks, bảng nhiều cột, tab thừa (transfer hiện cả 3 tab ở route chuyên dụng), meter×3 ở waste, sidebar desktop |
| GRN create `[supplierId]` · transfer/new · stocktake list · count-assignments · employee/count · adjust/quick-issue dialogs · GRN confirmed detail | **KEEP** (9) | Đã đạt job-first |

Phát hiện nghiêm trọng kèm theo:
- **Operator không mở lại được nháp GRN của mình** (`showDrafts=false` ở
  wrapper operator, drafts tab chỉ có ở office) — sửa trong lát GRN.
- Banner "Không cần đơn đặt hàng (PO)" (slice 1 vừa thêm) chính là
  process-prose vi phạm §0 → GỠ trong lát TRIM GRN; PO-optional truyền đạt
  bằng cấu trúc (NCC-first, PO là hàng quick-pick phụ).
- `supplier-returns/new` là placeholder "đang phát triển" (scaffold đã xóa
  theo D031 E4) — không đếm vào chương trình này.
- Copy hệ thống: "phiếu" quá tải 6 loại chứng từ; "4 TP / 58 NL" đọc không
  hiểu; eyebrow+title lặp; CTA verb loạn (Lưu/Cập nhật/Gửi/Duyệt/Xác nhận).

**Wave mới (job-critical trước):**
- **Wave 1 — REBUILD các flow nhiều thao tác:** Home spine 2 kind +
  bottom-nav curated → Sản xuất → GRN draft-review (+ mở lại drafts operator)
  → Receive per-line bấm số → màn Đếm + kết quả kiểm kê → PO detail.
  Mỗi màn: mockup trước → owner duyệt → build khớp.
- **Wave 2 — TRIM 13 màn** theo family (giết filler, mobile card, đơn-tab
  transfer/receive, gộp meter waste, trim stock list/detail).
- **Wave 3 — Copy pass một PR:** bảng nhãn canonical (phiếu/lệnh/kiểm kê/
  TP-NL/CTA verb) trong `messages` + regen i18n baseline.
- **Wave 4 — Danh mục surface** (`stock/catalog`, giữ nguyên kế §3) + tile.
- Đã ship: GRN inline NCC (slice 1). KEEP screens không đụng.

## 6. Nghiệm thu (mỗi lát)

- Ảnh 3 viewport khớp `kho-tong-hub-mockup-2026-07-04.html` (bố cục/thứ tự/nhãn).
- Full gate fresh xanh trong worktree sạch trước merge.
- Không route mồ côi, không lệch i18n (`lint:i18n`), ACL coverage xanh.
- Smoke thật trên điện thoại cho job sàn (GRN create) khi Wave A land.

## 7. Ngoài phạm vi (bác)

Shell/chrome mới (D019/D045/D058/D063) · đổi schema `goods_received_notes` ·
grant quyền mới · mô hình inventory (D060) · POS/KDS/Runner · Today-spine đầy đủ
+ expiry/tồn-alert cho site trung tâm (D066 §4/D060 §3) · Bếp TT (Wave E).
