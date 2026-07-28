# Inventory Readiness Gate

Checklist duy nhất trước khi coi một thay đổi Inventory sẵn sàng. Business
contract: `docs/ref/inventory.md`; operator sequence: `docs/ref/inventory-sop.md`;
visual contract: `docs/spec/design-system.md` và
`docs/spec/page-archetypes.md`.

## 1. Scope và environment

- [ ] Ghi commit/checkpoint, environment/ref, branch test và actor.
- [ ] Xác minh target theo Environment Registry trước mọi DB action.
- [ ] Không dùng production cho destructive/load smoke. Production mutation cần
      owner delegation đúng rule hiện hành.
- [ ] Dùng branch active với đúng một location `warehouse`; không tạo fixture
      central/kitchen/retired-role để làm flow mới chạy được.

## 2. Auth và scope

- [ ] Route access khớp generated role-route matrix.
- [ ] Owner và Branch Manager chỉ thấy action đúng permission + branch scope.
- [ ] Cashier, Chef và Branch Staff không vào Inventory workspace qua deep link.
- [ ] Mutation thiếu permission hoặc sai branch fail closed, không chỉ ẩn CTA.
- [ ] UI không hiển thị raw Supabase/Postgres error.

## 3. Workflow bắt buộc

### Nhập hàng

- [ ] Tạo GRN trực tiếp từ NCC, không cần PO.
- [ ] Xác nhận GRN tăng đúng tồn Kho CN và tạo movement đúng một lần.
- [ ] Retry/double submit không tạo stock hoặc document trùng.
- [ ] Supplier invoice/evidence handoff rõ; Inventory không tự ghi payment AP.

### Sản xuất và tiêu hao

- [ ] Workflow sản xuất hiện hành chỉ dùng branch + RPC/action còn sống.
- [ ] Consumption/sale-consumption/write-off có source, actor, unit và branch đúng.
- [ ] Không có daily CTA cho PO, supplier return, production order, lot/expiry
      hoặc same-branch Kho↔Bếp transfer.
- [ ] Atomic RPC fail không để document/payment hiển thị hoàn tất sai.

### Kiểm kê

- [ ] Chỉ một phiên in-progress theo contract; branch/location đúng.
- [ ] Count, recount và complete giữ đúng blind/variance state.
- [ ] Chỉ complete RPC post `count_adjustment`; retry không post trùng.
- [ ] CTA "Hoàn tất kiểm kê" nằm ở view detail (`?view=detail`); phiên
      `in_progress` mở thẳng `/inventory/stocktake/{id}` sẽ redirect sang trang
      đếm, nên smoke complete phải đi qua view detail.

## 3b. Edge-case matrix (smoke bổ sung)

Ưu tiên theo mức rủi ro dữ liệu. Ghi PASS/FAIL + ID chứng cứ bên cạnh mỗi ô.
Cột "Kết quả" ghi lần smoke gần nhất trên Greenfield; ô trống = chưa smoke.

### P0 — Confirm / mutation UX

| Case | Kỳ vọng | Kết quả (Greenfield 2026-07-28) |
| --- | --- | --- |
| PO Duyệt mua → Cancel / Esc / overlay | Dialog đóng; PO vẫn `draft`; không toast success | PASS — PO-2026-0009 giữ `draft`, không toast |
| PO Duyệt mua → Confirm | Dialog mở từ menu/sheet; status → `sent`; pending CTA disable trong lúc RPC | PASS — PO-2026-0009 → `sent`, đúng 1 audit `inventory.po.approved` |
| Supplier item Xóa → Cancel / Confirm | Confirm ngoài `startTransition`; Cancel không xóa; Confirm xóa + refresh | PASS — smoke trước đó |
| Double-click Duyệt / Chốt GRN / Hoàn tất SX | Idempotent hoặc fail closed; không nhân đôi movement | PASS — UI: PO-2026-0009 (1 dialog), GRN-c0abe611 (1 movement), LSX run 5 (2 movement). RPC song song: PO id 4, GRN-4a6add8c, run 4 — đúng 1 lệnh thắng, bên thua trả `22023` |

### P0 — Permission / scope

| Case | Kỳ vọng | Kết quả (Greenfield 2026-07-28) |
| --- | --- | --- |
| Actor thiếu `procurement:po_approve` | CTA ẩn/disabled; deep call fail closed, không raw SQL | PASS — PO-2026-0005 giữ `draft`; RPC trả `42501 forbidden`; tạo PO cũng bị chặn |
| Sai branch / cross-site PO→GRN | Reject; không tạo GRN/stock ở branch khác | PASS — PO-2026-0006 (branch 2) bị chặn với quản lý branch 1; đối chứng PO-2026-0007 → GRN-3d00e6e9 tạo được |
| Cashier/Chef deep-link Inventory | Bị chặn route/ACL | |
| Ghi thẳng bảng `purchase_orders` qua PostgREST | Revoke; chỉ RPC được ghi | PASS — PATCH trả `42501`, PO-2026-0005 vẫn `draft` |

### P1 — GRN / stock

| Case | Kỳ vọng | Kết quả (Greenfield 2026-07-28) |
| --- | --- | --- |
| GRN partial từ PO `sent` | PO → `partially_received`; có thể tạo GRN tiếp | PASS — PO-2026-0003 + GRN-53687754 |
| GRN nhận đủ phần còn lại | PO → received/closed theo contract; stock đúng tổng | PASS — GRN-1e3a94ef đóng PO-2026-0003 |
| Double confirm cùng GRN | Không post movement lần 2 | PASS — GRN-4a6add8c: 1 movement, lệnh thua `22023` |
| Entry unit ≠ base unit | Quy đổi đúng ladder; không cộng nhầm entry/base | Chưa smoke — seed Greenfield chỉ có ladder 1 bậc (kg) |
| Xóa GRN draft / hủy trước chốt | Không đụng `stock_levels` | |

### P1 — Production / consumption

| Case | Kỳ vọng | Kết quả (Greenfield 2026-07-28) |
| --- | --- | --- |
| Start khi thiếu NVL | Fail rõ; không tạo FG ảo | PASS — run 2: `insufficient_stock_for_production`, 0 movement, DETAIL đủ `needed`/`on_hand` cho Sheet cứu hộ |
| Complete hai lần cùng run | Không trừ NVL / cộng FG lần 2 | PASS — run 3 (re-confirm bị chặn) + run 4 (song song: 2 movement) |
| Hủy run đang chạy | Stock/document khớp contract; không orphan movement | |
| Consumption/write-off sai unit hoặc branch | Reject; audit/source đủ | Chưa smoke — happy path WO-260727180418-e5ef trừ kho đúng |

### P1 — Stocktake / transfer

| Case | Kỳ vọng | Kết quả (Greenfield 2026-07-28) |
| --- | --- | --- |
| Hai phiên stocktake in-progress cùng branch | Bị chặn theo contract | PASS — phiên 2 bị chặn ở unique constraint; chỉ 1 `in_progress` |
| Complete stocktake retry | Chỉ một `count_adjustment` | PASS — session 1: 1 movement `-0.3`, retry trả `session_not_in_progress` |
| Complete stocktake trên UI (Hoàn tất kiểm kê → Chốt kết quả) | Esc huỷ sạch, giữ `in_progress`; Confirm post đúng 1 `count_adjustment` | PASS — session 6: Esc giữ gạo 10.5 và không toast, CTA vẫn bấm lại được; Confirm → `completed`, 10.5 → 10.3, đúng 1 movement |
| Transfer inter-site thiếu quyền ship/receive | Fail closed từng bước | PASS — transfer 4: ship + receive đều `42501`; đối chứng transfer 5 nhận được đúng branch |
| Không có daily CTA PO / same-branch Kho↔Bếp / lot-expiry | Khớp SOP rút gọn | PASS — transfer create đã rút khỏi UI (`createEnabled=false`, `/transfers/new` redirect), guard `apps/web/tests/branch-transfer-create-retirement.test.ts`; smoke transfer chạy ở tầng RPC |

### P2 — Catalog / UI device

| Case | Kỳ vọng |
| --- | --- |
| Xóa unit đang gắn `production_recipes` | Block FK/`ingredient_unit_in_use…`; không wipe ladder |
| Mobile: primary action trong first viewport; keyboard Tab/Esc trên confirm | Dialog focus trap; Esc = cancel |
| Empty / loading / blocked / success | Đủ state; không empty-action dash giả |

## 4. UI và thiết bị

- [ ] Primary task xuất hiện trong first viewport trên mobile.
- [ ] Touch target, keyboard path, loading/empty/error/blocked/success state đầy đủ.
- [ ] Dense table có mobile strategy; không dùng horizontal scroll như flow chính
      nếu operator cần thao tác liên tục.
- [ ] Shared primitives/adapters đúng contract; không tạo shell/theme/role matrix
      cục bộ.
- [ ] Test ít nhất một phone viewport và một desktop viewport bằng browser thật.

## 5. Data reconciliation

- [ ] Đối chiếu document IDs với `stock_movements` và `stock_levels`.
- [ ] Quantity + unit mapping đúng; không tự cộng/trừ giữa entry/base unit.
- [ ] Finance/reporting đọc được movement mới theo operational data contract.
- [ ] Không còn mismatch chưa giải thích giữa document state, movement và balance.

## 6. Gate

Chạy:

```bash
REVIEW_TIER=T3 corepack pnpm verify
```

GREEN khi toàn bộ checklist pass và evidence có IDs/trạng thái trước-sau. YELLOW
chỉ dành cho fallback thủ công đã chứng minh không làm sai dữ liệu. RED nếu có
permission bypass, branch leak, duplicate/missing movement, unit mismatch, hoặc
UI báo thành công khi write fail.
