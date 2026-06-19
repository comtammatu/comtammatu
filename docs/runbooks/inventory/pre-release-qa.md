# Inventory Readiness QA

> Smoke + readiness checklist trước khi coi một lát Inventory là “sẵn sàng dùng”.
>
> Dùng cho:
>
> - thay đổi docs ảnh hưởng Inventory scope
> - thay đổi route / server action / RPC / RLS / migrations liên quan Inventory
> - chốt một flow Inventory mới hoặc thay đổi stocktake, transfer, production, expiry, AP readouts
> - chạy audit UI/UX theo vai trò và thiết bị thật

---

## 0. Companion Docs

Chạy runbook này cùng với:

- [ui-ux-rubric.md](./ui-ux-rubric.md)
- [operator-journeys.md](./operator-journeys.md)
- [route-cta-matrix.md](./route-cta-matrix.md)
- Ghi evidence trực tiếp vào ticket/PR hoặc worklog hiện hành nếu chưa promote được vào canonical docs.

Thiết bị ưu tiên:

- `owner`: desktop-first
- `warehouse_manager / production_manager`: tablet + desktop
- `branch_manager`: tablet + mobile trước, desktop sau

## 0b. Wave 0 — Kickoff bắt buộc

Trước khi bắt đầu round QA:

1. Chốt scope theo 4 lens bắt buộc của repo:
   - `PM`: acceptance criteria + phạm vi sign-off
   - `BA`: business rules + edge cases
   - `Senior Dev`: blast radius + affected routes/CTA
   - `QA/QC`: gate + evidence cần lưu
2. Chọn journey và device tương ứng từ [operator-journeys.md](./operator-journeys.md)
3. Ghi kickoff evidence vào ticket/PR hoặc worklog hiện hành
4. Dùng [route-cta-matrix.md](./route-cta-matrix.md) làm checklist route/button phải audit; không dùng nó để override ACL, Inventory reference, hoặc design-system contract
5. Chấm finding theo [ui-ux-rubric.md](./ui-ux-rubric.md), không theo cảm tính

## 1. Required Gates

### Gate A — Repo-wide verify

Chạy bắt buộc:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Fail một lệnh là chưa qua gate.

### Gate B — Inventory scope sanity

Kiểm tra ít nhất các surface sau còn mở được:

- `/inventory`
- `/inventory/stock`
- `/inventory/transfers`
- `/inventory/issues`
- `/inventory/stocktake`
- `/inventory/expiry`
- `/inventory/waste`
- `/inventory/supplier-returns`
- `/inventory/reports`
- master-data surfaces: `/inventory/ingredients`, `/inventory/suppliers`, `/inventory/recipes`
- procurement surfaces đang active: `/inventory/receiving`, `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/supplier-invoices`, `/inventory/drafts`
- `/inventory/production` nếu flow production bị ảnh hưởng
- `/admin/inventory*` URLs đi qua `inventory_admin` module ACL với `allowedRoles: []`; verify chúng bị deny (không render như surface live), không phải 200

### Gate C — UI/UX scope sanity

- nav phản ánh đúng role, không chỉ chặn ở page-level
- quick actions và task queue trên dashboard phải phản ánh đúng site kind
- action chính trên thiết bị mục tiêu không phụ thuộc hover
- placeholder CTA/card `sắp mở` phải được phân loại rõ `accepted placeholder` hoặc `bug`
- không có route live nào thiếu row tương ứng trong `route-cta-matrix.md`

---

## 2. ACL Smoke

Kiểm theo đúng [inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md):

| Role                                            | Phải đúng                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `warehouse_manager`                             | Vào được Inventory + procurement surfaces (NCC, PO, GRN, HĐ NCC, công thức), không vào production                                          |
| `production_manager`                            | Vào được Inventory + procurement + production                                                                                                |
| `branch_manager`                                | Vào được branch ops surfaces (`stock`, `transfers`, `issues`, `stocktake`, `expiry`, `reports`), không vào procurement, không vào production |
| `owner`                                         | Vào được Inventory + procurement + production qua ACL nhưng không được UX dẫn như operator hằng ngày                                         |
| `office`, `cashier`, `waiter`, `chef`           | Không vào Inventory route nếu ACL hiện tại chưa cho                                                                                          |

Đặc biệt kiểm:

- route bị cấm phải redirect/forbid đúng
- nav không lộ link sai role
- dashboard phải giữ mental model `task queue first`
- `Production` phải ẩn khỏi `warehouse_manager`/`branch_manager` ngay từ nav; `production_manager` là operator, `owner` là oversight/deep-link access
- `Ingredients / Suppliers / Recipes` không xuất hiện duplicate giữa menu chính và `Settings`
- không có page nào “vào được nhưng dữ liệu null im lặng” do thiếu `GRANT` hoặc RLS sai
- `owner` không được UX dẫn như inventory operator hằng ngày
- `Receiving` không được xuất hiện như nhãn generic cho branch receiving
- `Cấp bếp` không được bị cảm nhận như flow phụ hoặc flow lỗi

---

## 3. Flow Smoke Checklist

### 3.0 Journey-first execution

Chạy flow smoke theo persona + device, không chỉ theo route rời rạc:

- `warehouse_manager` (procurement + outbound transfer): desktop, tablet đối chiếu
- `production_manager` (production + branch → branch cycle): tablet trước, desktop đối chiếu
- `branch_manager` (inbound receive + Cấp bếp nội bộ): tablet trước, mobile ergonomics riêng
- Oversight (`owner`): desktop

Mỗi flow phải log:

- CTA nào đã bấm
- UI phản hồi ra sao
- step kế tiếp user có hiểu được không
- tác động dữ liệu/downstream có quan sát được không

### 3.1 Procurement (warehouse_manager)

- Tạo / mở `PO`
- `draft` có thể `Gửi PO` / `Hủy PO`
- Từ `PO` đã gửi hoặc nhận dở, tạo `GRN` thật
- Confirm `GRN`
- Kiểm tra tồn kho chi nhánh nhận hàng tăng đúng
- Nếu Finance handoff được bật, nhập `supplier_invoice` và recompute matching như một handoff riêng
- Không coi ghi nhận thanh toán / AP aging là gate đóng ngày của Inventory
- Kiểm dashboard và `Receiving` có dẫn đúng từng bước PO -> GRN, không bắt user tự đoán bước tồn kho kế tiếp

### 3.2 Inter-branch transfer (chi nhánh → chi nhánh, 5 bước)

- Hướng hợp lệ DUY NHẤT giữa hai site là `chi nhánh → chi nhánh` (cả hai `branch_kind = 'branch'`); trigger `enforce_stock_transfer_direction` raise `invalid direction` (23514) cho mọi hướng khác
- Tạo transfer (`warehouse_manager` / `production_manager` create + ship)
- Confirm ship
- Mark in transit
- Confirm receive
- Receive (`branch_manager` chi nhánh nhận chỉ được nhận inbound về đúng branch của mình)
- Kiểm tra `transfer_out` / `transfer_in` và tồn hai đầu
- Kiểm stepper/status/primary action có làm user hiểu đúng bước kế tiếp

### 3.3 Production

- `production_manager` thấy nav và vào được page; `owner` có thể deep-link để kiểm tra/khẩn cấp; `warehouse_manager`/`branch_manager` bị chặn kể cả khi có manual grant
- Direct DB smoke sau khi apply migration: `warehouse_manager`/`branch_manager` có manual production/menu grant vẫn phải bị `42501` khi gọi `create_production_order`, `confirm_production_order`, `cancel_production_order`, `upsert_production_recipe_lines`, hoặc mutate `production_recipes` / `production_orders` / `production_order_items` qua PostgREST
- Tạo `production_order`
- Fail đúng khi thiếu BOM hoặc thiếu nguyên liệu
- Confirm thành công khi đủ điều kiện
- Kiểm tra `production_consumption` + `production_output`
- Kiểm readiness/empty states có chỉ user đúng dependency đang thiếu

### 3.4 Inbound receive tại chi nhánh nhận (đầu cuối của chi nhánh → chi nhánh)

- Từ một transfer `chi nhánh → chi nhánh` đã ship, đứng ở chi nhánh nhận
- Confirm receipt ở chi nhánh nhận (`branch_manager` chỉ nhận inbound về đúng branch của mình)
- Kiểm tra short-receipt / discrepancy flow nếu scope có hỗ trợ
- Kiểm branch dashboard sau khi nhận hàng có dẫn đủ rõ sang `Cấp bếp` (Kho CN → Bếp CN)

### 3.5 Cấp bếp nội bộ (Kho CN → Bếp CN, một bước)

- Kiểm tra flow `Cấp bếp` bằng intra-branch transfer tại `/inventory/transfers` (cùng `branch`, `from_branch_id = to_branch_id`)
- Đây là transfer MỘT BƯỚC (`from` location_kind `warehouse` → `to` location_kind `kitchen`), KHÔNG đi qua state machine 5 bước của chi nhánh → chi nhánh
- `branch_manager` được tạo/commit `Cấp bếp` nội bộ; không được tạo/ship inter-site outbound
- Xác nhận branch dashboard dẫn đúng sang inbound receive và intra-branch `Cấp bếp`, không dẫn sang `receiving`
- Xác nhận luồng này không bị bỏ quên trong SOP / UI / báo cáo
- Ghi rõ evidence theo `from_location_id` / `to_location_id` (cùng một `branch`)
- Sau khi `Cấp bếp`, user phải hiểu tồn Kho CN đã giảm và tồn Bếp CN / default consumption đã tăng

### 3.6 Stocktake

- Tạo phiên `stocktake`
- Nhập số đếm
- Complete session
- Kiểm tra `count_adjustment` và tồn mới
- Kiểm blur-save feedback, progress visibility, result comprehension

### 3.7 Alerts and reports

- Reorder alert hiển thị đúng khi dưới `reorder_point`
- Expiry alert hiển thị đúng theo window tài liệu quy định
- Nếu surface có `AP aging` hoặc inventory value, số liệu không lỗi obvious và được đánh dấu là oversight/Finance handoff nếu chưa live
- Các CTA chưa mở phải được ghi rõ `sắp mở` hoặc chuyển thành điều hướng thật; không để disabled button gây hiểu nhầm là đã có workflow
- Report cards `sắp mở` không được trông giống feature live
- AP aging link phải dẫn đúng sang công nợ NCC nếu Finance handoff đang bật; nếu không, ẩn khỏi frontline daily UI

### 3.8 POS/KDS bridge

- Với branch flow có scope tiêu hao, đối chiếu `POS/KDS completed -> recipe consumption`
- Kiểm user có hiểu vì sao tồn kho giảm sau khi order hoàn tất
- Nếu bridge chưa chứng minh được bằng UI/evidence downstream, không mark branch journey là pass

---

## 4. Regression Hotspots

| Hotspot                              | Vì sao dễ vỡ                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| RLS + GRANT                          | Supabase có thể trả `{ data: null, error: null }`                               |
| `module-acl.ts` vs page-level guards | Rất dễ drift giữa nav, proxy, và page guard                                     |
| WAC assumptions                      | Docs rất dễ vô tình lẫn với FIFO/lot semantics                                  |
| Transfer direction trigger           | Chỉ `chi nhánh → chi nhánh` (inter-site) và `Kho CN → Bếp CN` (intra-branch) hợp lệ; hướng khác raise `invalid direction` 23514 |
| Production permissions               | Operator là `production_manager`; `warehouse_manager` và `branch_manager` hard-deny ở Server Action + RPC + RLS |
| False-promise CTA                    | UI rất dễ để lại nút giả sau refactor workflow, khiến docs và hành vi lệch nhau |
| Hover-only actions                   | Desktop có thể pass nhưng mobile/tablet fail nặng                               |
| Step-to-step mental model            | Sau mỗi thao tác, user có thể không biết phải làm gì tiếp dù backend đúng       |

---

## 5. Evidence cần lưu

- Lệnh verify cuối cùng và kết quả
- Role nào đã smoke
- Device nào đã smoke
- Flow nào đã smoke
- CTA nào đã smoke
- Bất kỳ deviation nào giữa docs và code
- Ảnh/chứng cứ cho mọi `P0` và `P1`

Nếu có chỗ chưa thuộc scope hiện tại:

- ghi rõ lý do không nghiệm thu trong scope này
- link lại doc scope liên quan
- không mark là shipped nếu chưa qua gate bắt buộc

---

## 6. Exit Criteria

Chỉ coi lát Inventory là ready khi:

- verify repo-wide xanh
- ACL smoke đúng với doc
- flow smoke đúng với scope thay đổi
- route live có coverage tương ứng trong `route-cta-matrix.md`
- persona chính có ít nhất 1 journey hoàn chỉnh theo đúng thiết bị mục tiêu
- mọi `P0` đã xử lý
- mọi `P1` đã xử lý hoặc được chấp nhận rõ ràng trong evidence log
- không còn mâu thuẫn giữa [inventory.md](../../ref/inventory.md), [inventory-sop.md](../../ref/inventory-sop.md), và [inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md)
