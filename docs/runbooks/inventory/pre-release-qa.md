# Inventory Readiness QA

> Smoke + readiness checklist trước khi coi một lát Inventory là sẵn sàng dùng.

Updated: `2026-07-06`

---

## 0. Companion Docs

Chạy runbook này cùng với:

- [ui-ux-rubric.md](./ui-ux-rubric.md)
- [operator-journeys.md](./operator-journeys.md)
- [route-cta-matrix.md](./route-cta-matrix.md)
- [inventory.md](../../ref/inventory.md)
- [inventory-sop.md](../../ref/inventory-sop.md)

Thiết bị ưu tiên:

- `owner`: desktop-first
- `warehouse_manager / production_manager`: tablet + desktop
- `branch_manager`: tablet + mobile trước, desktop sau

## 1. Required Gates

Chạy bắt buộc:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Fail một lệnh là chưa qua gate.

## 2. Scope sanity

Các route phải mở đúng theo ACL và nav:

- `/inventory`
- `/inventory/stock`
- `/inventory/transfers`
- `/inventory/consumption`
- `/inventory/issues`
- `/inventory/stocktake`
- `/inventory/waste`
- `/inventory/reports`
- procurement: `/inventory/grn`, `/inventory/supplier-invoices`, `/inventory/suppliers`; PO/supplier-return daily routes không xuất hiện trong nav
- production: `/inventory/production` cho `branch_manager` own-branch (D068)

## 3. ACL smoke

| Role                        | Phải đúng                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `warehouse_manager`         | Vào Inventory + procurement + transfer theo scope; không bị dẫn vào production                           |
| `production_manager`        | Vào Inventory + production theo grant; không có site trực riêng đang active                              |
| `branch_manager`            | Vào stock, transfers inbound, consumption, stocktake, reports; own-branch GRN (tạo/xác nhận) + production (tạo/xác nhận) + tạo nhanh NCC theo D068 |
| `owner`                     | Xem oversight tenant-wide; không bị UX dẫn như operator hằng ngày                                        |
| `office`, `cashier`, `chef` | Không vào Inventory route nếu ACL hiện tại chưa cho                                                      |

Đặc biệt kiểm:

- nav không lộ link sai role/site
- branch manager không tạo transfer outbound ra site khác; được tạo transfer cùng chi nhánh `Kho CN -> Bếp CN`
- production tại chi nhánh chỉ hiện cho đúng vai (`branch_manager` own-branch theo D068), không lộ cho role khác
- site label hiển thị đúng `Kho chi nhánh` cho site `branch`

## 4. Flow smoke

### 4.1 Procurement

- Chọn NCC và tạo/mở `GRN` cho đúng site nhận.
- Confirm `GRN`.
- Kiểm tồn stock-bearing location tăng đúng.
- Nếu Finance handoff bật, nhập `supplier_invoice` và recompute matching riêng.

### 4.2 Transfer thật

- Tạo transfer theo hướng hợp lệ:
  - `branch -> branch`
  - cùng chi nhánh `Kho CN -> Bếp CN`
- Với transfer khác site: confirm ship, mark in transit, confirm receive, receive.
- Với `Kho CN -> Bếp CN`: confirm ship phải ghi `transfer_out` ở Kho CN, `transfer_in` ở Bếp CN, và kết thúc `received` trong cùng chi nhánh.
- Kiểm `transfer_out` / `transfer_in` và tồn hai đầu; tổng tồn chi nhánh không giảm sau `Kho CN -> Bếp CN`.

### 4.3 Tiêu hao chi nhánh

- Từ Employee checkout, submit consumption report.
- Branch manager mở checkout approvals và duyệt/apply.
- Kiểm checkout chỉ pass khi report required đã `approved` hoặc `applied`.
- Kiểm movement:
  - `type = consumption`
  - `movement_subtype = sale_consumption`
  - `source_type = hrm_consumption`
  - `location_id` ưu tiên Bếp CN nếu chi nhánh đã cấu hình kitchen, fallback Kho CN/default issue warehouse nếu chưa có Bếp CN.
- Kiểm `/inventory/consumption` và detail đọc được trace.

### 4.4 Production

- `branch_manager` tại chính chi nhánh mình thấy nav/page và tạo được run (D068).
- Tạo `production_run` và đi theo run detail flow (`draft -> in_progress -> confirm`).
- Fail đúng khi thiếu BOM hoặc thiếu nguyên liệu.
- Confirm thành công khi đủ điều kiện.
- Kiểm `production_consumption` + `production_output`.

### 4.5 Stocktake và stock report

- Tạo phiên `stocktake`.
- Nhập số đếm.
- Complete session.
- Kiểm `count_adjustment`.
- Kiểm `/inventory/stock` và report cộng `location_kind = kitchen` của chi nhánh vào tổng tồn vận hành.

## 5. Matu-platform import smoke

Sau import production, kiểm nhanh:

- `/inventory/stock`: tồn có ở stock-bearing warehouse và Bếp CN/kitchen của chi nhánh.
- `/inventory/transfers`: có đủ transfer thật theo hướng central -> branch, branch -> central, branch -> branch, và Kho CN -> Bếp CN.
- `/inventory/consumption`: thấy tiêu hao chi nhánh từ import với `sale_consumption`.
- Finance food cost/gross profit đọc actual consumption, không đọc recipe-only `mv_food_cost`.
- 4 dòng legacy source từ `BEP-DD` / `BEP-TT` không import history; tồn cuối đã nằm trong `balance_adjustment`.

### 4.6 Finance Basic

- Gross profit = doanh thu ròng trước VAT - actual approved consumption cost.
- `mv_food_cost` / `get_food_cost` chỉ dùng làm theoretical recipe/reference và variance.
- Nếu chưa có approved consumption trong kỳ có doanh thu, food cost/gross profit phải thể hiện `needs_review`, không gọi là recipe-only truth.

## 5. Regression hotspots

| Hotspot                     | Vì sao dễ vỡ                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| RLS + GRANT                 | Supabase có thể trả dữ liệu rỗng mà UI hiểu nhầm là không có việc        |
| Transfer direction          | Dễ chặn nhầm `Kho CN -> Bếp CN` dù đây là transfer cùng chi nhánh hợp lệ |
| Consumption source location | Dễ tiếp tục trừ Kho CN dù tồn đã được cấp sang Bếp CN                    |
| Stock totals                | Bếp CN/kitchen dễ bị loại nhầm khỏi tồn vận hành                         |
| Finance food cost           | Recipe theoretical dễ bị nhầm thành actual gross profit                  |
| Production site kind        | Branch production cũ dễ bị giữ làm happy path                            |

## 6. Evidence cần lưu

- Lệnh verify cuối cùng và kết quả
- Role/site/device đã smoke
- Flow đã smoke
- CTA đã smoke
- Deviation giữa docs và code nếu còn
- Ảnh/chứng cứ cho mọi `P0` và `P1`

## 7. Exit criteria

Inventory slice chỉ ready khi:

- verify repo-wide xanh
- ACL smoke đúng
- flow smoke đúng với scope thay đổi
- route live có coverage trong `route-cta-matrix.md`
- mọi `P0` đã xử lý
- mọi `P1` đã xử lý hoặc được chấp nhận rõ trong evidence
- docs không còn mâu thuẫn giữa `inventory.md`, `inventory-sop.md`, `operational-data-contract.md`, và runbooks
