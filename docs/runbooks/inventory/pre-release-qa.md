# Inventory Readiness QA

> Smoke + readiness checklist trước khi coi một lát Inventory là sẵn sàng dùng.

Updated: `2026-06-19`

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
- `/inventory/expiry`
- `/inventory/waste`
- `/inventory/reports`
- procurement: `/inventory/purchase-orders`, `/inventory/grn`, `/inventory/supplier-invoices`, `/inventory/suppliers`
- production: `/inventory/production` khi site là `central_kitchen`

## 3. ACL smoke

| Role | Phải đúng |
| --- | --- |
| `warehouse_manager` | Vào Inventory + procurement + transfer theo scope; không bị dẫn vào production nếu không ở Bếp Trung Tâm |
| `production_manager` | Vào Inventory + production tại Bếp Trung Tâm |
| `branch_manager` | Vào stock, transfers inbound, consumption, stocktake, expiry, reports; không vào procurement/production |
| `owner` | Xem oversight tenant-wide; không bị UX dẫn như operator hằng ngày |
| `office`, `cashier`, `chef` | Không vào Inventory route nếu ACL hiện tại chưa cho |

Đặc biệt kiểm:

- nav không lộ link sai role/site
- branch manager không tạo transfer outbound hay intra-branch transfer
- production không hiện như daily action của chi nhánh thường
- site label phân biệt `Kho chi nhánh`, `Kho Tổng`, `Bếp Trung Tâm`

## 4. Flow smoke

### 4.1 Procurement

- Tạo/mở `PO` cho `branch`, `central_supply`, hoặc `central_kitchen`.
- Tạo `GRN` từ PO.
- Confirm `GRN`.
- Kiểm tồn stock-bearing location tăng đúng.
- Nếu Finance handoff bật, nhập `supplier_invoice` và recompute matching riêng.

### 4.2 Transfer thật

- Tạo transfer theo hướng hợp lệ:
  - `central_supply -> branch`
  - `central_kitchen -> branch`
  - `branch -> central_supply`
  - `branch -> central_kitchen`
  - `central_supply -> central_kitchen`
  - `central_kitchen -> central_supply`
  - `branch -> branch`
- Confirm ship.
- Mark in transit.
- Confirm receive.
- Receive.
- Kiểm `transfer_out` / `transfer_in` và tồn hai đầu.
- Thử `from_branch_id = to_branch_id`: phải bị reject.

### 4.3 Tiêu hao chi nhánh

- Từ Employee checkout, submit consumption report.
- Branch manager mở checkout approvals và duyệt/apply.
- Kiểm checkout chỉ pass khi report required đã `approved` hoặc `applied`.
- Kiểm movement:
  - `type = consumption`
  - `movement_subtype = sale_consumption`
  - `source_type = hrm_consumption`
  - `location_id` là Kho CN/default issue warehouse, không phải kitchen.
- Kiểm `/inventory/consumption` và detail đọc được trace.

### 4.4 Production tại Bếp Trung Tâm

- `production_manager` ở `central_kitchen` thấy nav/page.
- Tạo `production_order`.
- Fail đúng khi thiếu BOM hoặc thiếu nguyên liệu.
- Confirm thành công khi đủ điều kiện.
- Kiểm `production_consumption` + `production_output`.

### 4.5 Stocktake và stock report

- Tạo phiên `stocktake`.
- Nhập số đếm.
- Complete session.
- Kiểm `count_adjustment`.
- Kiểm `/inventory/stock` và report không cộng `location_kind = kitchen` vào tổng tồn vận hành.

## 5. Matu-platform import smoke

Sau import production, kiểm nhanh:

- `/inventory/stock`: tồn chỉ ở stock-bearing warehouse; không có dòng kitchen trong tổng tồn.
- `/inventory/transfers`: có đủ transfer thật theo hướng central -> branch, branch -> central, Kho Tổng <-> Bếp Trung Tâm, branch -> branch.
- `/inventory/consumption`: thấy tiêu hao chi nhánh từ import với `sale_consumption`.
- Finance food cost/gross profit đọc actual consumption, không đọc recipe-only `mv_food_cost`.
- 4 dòng legacy source từ `BEP-DD` / `BEP-TT` không import history; tồn cuối đã nằm trong `balance_adjustment`.

### 4.6 Finance Basic

- Gross profit = doanh thu ròng trước VAT - actual approved consumption cost.
- `mv_food_cost` / `get_food_cost` chỉ dùng làm theoretical recipe/reference và variance.
- Nếu chưa có approved consumption trong kỳ có doanh thu, food cost/gross profit phải thể hiện `needs_review`, không gọi là recipe-only truth.

## 5. Regression hotspots

| Hotspot | Vì sao dễ vỡ |
| --- | --- |
| RLS + GRANT | Supabase có thể trả dữ liệu rỗng mà UI hiểu nhầm là không có việc |
| Transfer direction | Dễ tái tạo `Kho CN -> Bếp CN` như transfer nếu chỉ copy flow cũ |
| Consumption source location | Dễ chọn `is_default_consumption`/`kitchen` thay vì Kho CN |
| Stock totals | Legacy kitchen stock dễ bị cộng vào tồn vận hành |
| Finance food cost | Recipe theoretical dễ bị nhầm thành actual gross profit |
| Production site kind | Branch production cũ dễ bị giữ làm happy path |

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
