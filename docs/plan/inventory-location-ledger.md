# Inventory Location Ledger

> Date: `2026-04-14`  
> Status: `Phase 1 migration drafted - not applied`  
> Depends: `docs/plan/inventory-branch-kitchen-model.md`

## 1. Why This Exists

Pilot contract hiện tại đã chốt:

- `HQ -> Kho chi nhánh` dùng `stock_transfer`
- `Bếp trung tâm -> Kho chi nhánh` dùng `stock_transfer`
- `Kho chi nhánh -> Bếp chi nhánh` dùng `stock_issue(issue_type = kitchen_use)`

Contract này đủ tốt để pilot chạy, nhưng ledger hiện vẫn hạch toán theo `branch_id`. Điều đó có nghĩa:

- không thể giữ tồn riêng cho `Kho chi nhánh` và `Bếp chi nhánh` trong cùng site
- không thể stocktake riêng kho và bếp trong cùng chi nhánh
- không thể đo variance riêng giữa kho và bếp nội bộ

Doc này mô tả mô hình đích để nâng Inventory từ `site-level ledger` lên `location-level ledger`.

Phase 1 migration draft hiện có tại:

- `supabase/migrations/20260417040000_inventory_locations_phase1.sql`

Phase 2 execution contract:

- `docs/plan/inventory-location-ledger-phase2.md`

## 2. Goals

1. Tách tồn độc lập giữa `Kho chi nhánh` và `Bếp chi nhánh`
2. Hỗ trợ stocktake theo location nội bộ
3. Hỗ trợ transfer nội bộ trong cùng branch
4. Giữ được dashboard tổng theo branch
5. Không phá tenant isolation, branch scoping, hay ACL hiện có

## 3. Non-Goals

- không thêm bin / shelf / aisle hierarchy
- không thêm barcode workflow
- không thêm reserved stock engine
- không thêm batch-ledger / FEFO engine
- không mở location tree enterprise nhiều tầng

## 4. Current Pain Points

Các write-path hiện tại đang bám chặt vào `branch_id`:

- `stock_levels`
- `stock_movements`
- `stock_transfers`
- `stock_issues`
- `stocktake_sessions`
- `consume_stock_for_order()`
- `confirm_stock_issue()`
- `complete_stocktake()`

Đây là thay đổi data model có blast radius rộng, không phải patch nhỏ.

## 5. Target Model

### 5.1 Site vs Location

- `branches` tiếp tục là site vận hành
- `inventory_locations` là điểm giữ / xuất / nhận tồn kho bên trong site

Ví dụ:

- `HQ`: `Kho tổng`, `Khu nhận hàng`
- `Bếp trung tâm`: `Kho nguyên liệu`, `Kho thành phẩm`
- `Chi nhánh A`: `Kho chi nhánh`, `Bếp chi nhánh`

### 5.2 New Table: `inventory_locations`

| Cột | Kiểu | Ghi chú |
| --- | ---- | ------- |
| `id` | `BIGINT PK` | identity |
| `tenant_id` | `BIGINT` | FK `tenants(id)` |
| `branch_id` | `BIGINT` | FK `branches(id)` |
| `code` | `TEXT` | unique trong branch + tenant |
| `name` | `TEXT` | tên location hiển thị |
| `location_kind` | `TEXT` | `warehouse`, `kitchen`, `receiving`, `production_storage` |
| `is_active` | `BOOLEAN` | default true |
| `is_default_receive` | `BOOLEAN` | location mặc định khi hàng vào site |
| `is_default_issue` | `BOOLEAN` | location mặc định khi xuất nội bộ |
| `is_default_consumption` | `BOOLEAN` | location mặc định cho POS / recipe consumption |
| `sort_order` | `INT` | UI order |
| `created_at` | `TIMESTAMPTZ` | default now |
| `updated_at` | `TIMESTAMPTZ` | default now |

Ràng buộc chính:

- `UNIQUE(code, branch_id, tenant_id)`
- mỗi branch chỉ có tối đa 1 `default_receive`
- mỗi branch chỉ có tối đa 1 `default_issue`
- mỗi branch chỉ có tối đa 1 `default_consumption`

## 6. Ledger Table Changes

### 6.1 `stock_levels`

Hiện tại:

- key theo `(tenant_id, branch_id, ingredient_id)`

Mô hình đích:

- key theo `(tenant_id, location_id, ingredient_id)`

Đề xuất:

- thêm `location_id`
- chuyển uniqueness sang `UNIQUE(location_id, ingredient_id, tenant_id)`
- giữ `branch_id` trong giai đoạn tương thích rồi loại bỏ sau

### 6.2 `stock_movements`

Mỗi movement nên có `location_id`.

Gợi ý semantics:

- `transfer_out`: trừ tại `from_location_id`
- `transfer_in`: cộng tại `to_location_id`
- `kitchen_use`: trừ tại warehouse source location
- `consumption`: trừ tại location tiêu hao mặc định của branch

### 6.3 `stock_transfers`

Thêm:

- `from_location_id`
- `to_location_id`

Giữ `from_branch_id`, `to_branch_id` trong giai đoạn chuyển đổi để tránh đập report và UI cùng lúc.

### 6.4 `stock_issues`

Nên bổ sung:

- `source_location_id`
- `target_location_id` nullable

Quy ước:

- `writeoff`, `consumption`, `other`: có thể chỉ cần `source_location_id`
- `kitchen_use`: nên có cả `source_location_id` và `target_location_id`

### 6.5 `stocktake_sessions`

Stocktake nên chạy theo `location_id`, không theo toàn `branch`.

## 7. Operational Defaults

Để app không bắt người dùng chọn location ở mọi màn hình ngay lập tức, mỗi branch nên có default mapping:

- `default_receive`
- `default_issue`
- `default_consumption`

Ví dụ cho chi nhánh thường:

- `Kho chi nhánh` = default receive
- `Kho chi nhánh` = default issue
- `Bếp chi nhánh` = default consumption

## 8. RPC / Action Impact

### 8.1 `consume_stock_for_order(p_order_id)`

Hiện tại:

- trừ tồn theo `orders.branch_id`

Khi nâng cấp:

- resolve `default_consumption_location`
- trừ tồn ở location đó

### 8.2 `confirm_stock_issue(p_issue_id)`

Hiện tại:

- trừ `stock_levels` theo `issue.branch_id`

Khi nâng cấp:

- trừ ở `source_location_id`
- nếu có `target_location_id`, movement engine có thể ghi cặp `transfer_out` / `transfer_in` nội bộ

### 8.3 `complete_stocktake(p_session_id)`

Hiện tại:

- so sánh và điều chỉnh theo `session.branch_id`

Khi nâng cấp:

- re-snapshot theo `location_id`
- insert `count_adjustment` tại location đang kiểm

### 8.4 Transfer RPCs

Transfer RPC cần validate:

- `from_location.branch_id` khớp `from_branch_id`
- `to_location.branch_id` khớp `to_branch_id`
- `location_kind` hợp lệ theo workflow

## 9. Reporting Strategy

Nguyên tắc:

- branch-level report = `SUM(stock_levels by location.branch_id)`
- movement report tổng theo site = group by `location.branch_id`
- variance report mới có thể group by `location_id`

Điều này cho phép dashboard cũ tiếp tục tồn tại trong khi report mới mở dần theo location.

## 10. RLS Strategy

RLS vẫn giữ branch-scoped model hiện tại:

- `inventory_locations` row chỉ thấy khi `branch_id` thuộc scope hợp lệ
- các bảng ledger join qua `inventory_locations.branch_id`
- `branch_manager` chỉ thấy locations thuộc branch của họ
- `super_manager`, `owner`, `area_manager` vẫn thấy toàn tenant theo scope hiện tại

Không nên encode `location scope` vào JWT ở giai đoạn đầu.

## 11. Rollout Plan

### Phase 1: Introduce locations with zero behavior change

- tạo `inventory_locations`
- seed mỗi branch ít nhất 1 default location
- chưa đổi ledger

### Phase 2: Add compatibility columns

- thêm `location_id` vào `stock_levels`, `stock_movements`, `stocktake_sessions`, `stock_issues`, `stock_transfers`
- backfill từ default location của branch
- dual-read / dual-write ở các RPC quan trọng

### Phase 3: Enable branch warehouse + branch kitchen

- seed 2 locations cho branch thường:
  - `warehouse`
  - `kitchen`
- đổi `kitchen_use` để ghi nhận đủ source/target locations
- đổi `consume_stock_for_order` sang `default_consumption`

### Phase 4: Switch reports and UI

- transfer form chọn location khi cần
- stocktake theo location
- dashboard tổng theo branch bằng aggregation

### Phase 5: Remove branch-only ledger assumptions

- drop uniqueness/key cũ dựa trên `branch_id`
- chuyển hẳn report / movement / RPC sang `location_id`
- chỉ giữ `branch_id` nếu còn cần làm denormalized reporting column

## 12. Migration Risks

1. `stock_levels` uniqueness conflict khi backfill sai default location
2. RPC dual-write không đồng nhất làm lệch tồn
3. report cũ vẫn group trực tiếp theo `branch_id`
4. RLS query chậm hơn nếu join location ở mọi bảng mà không thêm index đúng
5. UI overload nếu bắt chọn location ở mọi thao tác quá sớm

## 13. Recommendation

Thứ tự an toàn nhất là:

1. Giữ pilot contract hiện tại với `stock_issue(kitchen_use)`
2. Chỉ mở project `inventory_locations` khi có nhu cầu kiểm kê / variance thật theo kho-vs-bếp
3. Khi mở project, triển khai theo `Phase 1 -> Phase 5`, không nhảy thẳng vào full cutover

Nói ngắn gọn:

- hiện tại: `branch-level ledger`
- đích đến: `location-level ledger`
- đường đi đúng: `seed -> compatibility -> dual-write -> cutover`
