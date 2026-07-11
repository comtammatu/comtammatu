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
