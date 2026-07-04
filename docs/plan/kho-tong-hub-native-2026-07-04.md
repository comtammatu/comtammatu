# Kế hoạch thi công — Hub Kho Tổng native mobile (2026-07-04)

> Nguồn: D067 (`docs/plan/decisions.md`). Hợp đồng thiết kế:
> `docs/plan/kho-tong-hub-mockup-2026-07-04.html` — build phải khớp mockup.
> Xác minh code + PROD 2026-07-04 (SELECT-only). Mọi định danh giữ nguyên văn.

## 0. Nguyên tắc (khoá)

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
- Áp cho `central_supply` (branch 15). Bếp TT (`central_kitchen`, branch 16) =
  Wave E, perms khác → chốt riêng.

## 1. Bản đồ route → việc native (đều đã tồn tại)

| Route (dưới `(operator)/`) | Ruột hiện tại | Native target | Wave |
|---|---|---|---|
| `stock/grn/*` (`page`,`new`,`new/[supplierId]`,`[id]`) | `GRNListPageContent`+`GrnNewPageContent`+`GrnCreateClient` embed | Nhận hàng: NCC-first, banner "không cần PO", tạo NCC inline, nhập dòng cho ngón tay, chụp ảnh, xác nhận + tổng | **A** |
| `stock/page.tsx` | `StockPageContent` embed | Tồn kho: chip lọc nhóm + tìm + grid card 2 cột, số `font-mono`, tap → on-hand; qty 0 trung tính (D066 §5) | **A** |
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

## 5. Thứ tự wave (Kho trước, GRN đầu tiên)

- **Wave A** — GRN native + inline NCC + Tồn kho card-grid. (owner focus)
- **Wave B** — Home spine + bottom-nav + Danh mục surface + tile Danh mục.
- **Wave C** — Kiểm kê(+bấm số) · Duyệt kiểm kê · Báo/Duyệt hao hụt · Chuyển/Nhận.
- **Wave D** — Trả NCC · Đơn đặt hàng (reorder→PO nháp).
- **Wave E** (sau) — Bếp Trung Tâm cùng khuôn (perms + job-set riêng, chốt riêng).

## 6. Nghiệm thu (mỗi lát)

- Ảnh 3 viewport khớp `kho-tong-hub-mockup-2026-07-04.html` (bố cục/thứ tự/nhãn).
- Full gate fresh xanh trong worktree sạch trước merge.
- Không route mồ côi, không lệch i18n (`lint:i18n`), ACL coverage xanh.
- Smoke thật trên điện thoại cho job sàn (GRN create) khi Wave A land.

## 7. Ngoài phạm vi (bác)

Shell/chrome mới (D019/D045/D058/D063) · đổi schema `goods_received_notes` ·
grant quyền mới · mô hình inventory (D060) · POS/KDS/Runner · Today-spine đầy đủ
+ expiry/tồn-alert cho site trung tâm (D066 §4/D060 §3) · Bếp TT (Wave E).
