# Inventory Location Ledger Phase 2

> Date: `2026-04-14`  
> Status: `Migration A drafted; backfill / cutover not implemented`  
> Depends on:
> - `supabase/migrations/20260417040000_inventory_locations_phase1.sql` applied
> - `docs/plan/inventory-location-ledger.md`
> - Migration A draft: `supabase/migrations/20260417050000_inventory_location_compat_columns.sql`

Companion app patch map:

- `docs/plan/inventory-location-ledger-phase2-app-patch.md`

## 1. Purpose

Phase 2 là bước `compatibility columns + dual-write`, chưa phải full cutover.

Mục tiêu:

- thêm `location_id` vào các bảng ledger chính
- backfill toàn bộ dữ liệu cũ từ default location của branch
- cho phép app bắt đầu ghi cả `branch_id` và `location_id`
- chưa xóa assumption cũ theo `branch_id`

## 2. Preconditions

Trước khi làm Phase 2, bắt buộc:

1. Owner đã apply `20260417040000_inventory_locations_phase1.sql`
2. Repo đã chạy `pnpm db:types` sau khi migration Phase 1 được apply
3. Mỗi branch có đúng 1 default location seeded
4. Đã xác nhận không có branch nào thiếu row trong `inventory_locations`

## 3. Schema Changes

### 3.1 `stock_levels`

Thêm:

- `location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE`

Backfill:

- map theo `branch_id -> inventory_locations.is_default_receive = true`

Indexes / constraints:

- `INDEX(location_id)`
- chuẩn bị unique mới:
  - trước mắt: chưa drop unique cũ
  - sau backfill: thêm `UNIQUE(location_id, ingredient_id, tenant_id)` nếu dữ liệu sạch

### 3.2 `stock_movements`

Thêm:

- `location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE`

Backfill:

- map theo `branch_id -> default location phù hợp`

Quy tắc backfill ban đầu:

- dùng location mặc định duy nhất của branch ở Phase 1

### 3.3 `stock_transfers`

Thêm:

- `from_location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT`
- `to_location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT`

Backfill:

- `from_branch_id -> default_issue location`
- `to_branch_id -> default_receive location`

### 3.4 `stock_issues`

Thêm:

- `source_location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT`
- `target_location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT`

Backfill:

- `source_location_id = default_issue location` của `branch_id`
- `target_location_id = NULL` cho issue thường
- `stock_issue(issue_type = 'kitchen_use')` đã retired; cấp bếp không dùng `stock_issues`

### 3.5 `stocktake_sessions`

Thêm:

- `location_id BIGINT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT`

Backfill:

- map theo `branch_id -> default_receive location`

### 3.6 Optional Phase 2.5

Chưa bắt buộc ngay ở Phase 2, nhưng nên chuẩn bị:

- `production_orders.location_id`
- `goods_received_notes.receive_location_id`

Hai bảng này có thể để Phase 3 nếu muốn giữ cutover nhỏ hơn.

## 4. Backfill Rules

Backfill không được suy diễn “thông minh”; chỉ dùng default locations đã seed ở Phase 1.

### 4.1 Mapping rules

| Branch kind | default_receive | default_issue | default_consumption |
| ----------- | --------------- | ------------- | ------------------- |
| `headquarters` | `Kho tong` | `Kho tong` | `Kho tong` |
| `central_kitchen` | `Kho bep trung tam` | `Kho bep trung tam` | `Kho bep trung tam` |
| `branch` | `Kho chi nhanh` | `Kho chi nhanh` | `Kho chi nhanh` |

Ghi chú:

- ở cuối Phase 2, branch thường vẫn chỉ có 1 location mặc định
- split `Kho chi nhánh` / `Bếp chi nhánh` thành 2 locations thật sẽ diễn ra ở Phase 3

### 4.2 Backfill invariant

Sau backfill:

- mọi row hiện hữu ở các bảng trên phải có `location_id` hoặc `from/to/source/target_location_id`
- không có row nào map sang location thuộc branch khác

## 5. Dual-Write Contract

Trong Phase 2, app/RPC phải dual-write:

- tiếp tục ghi `branch_id` để giữ tương thích
- đồng thời ghi `location_id` tương ứng

### 5.1 `trg_update_stock_on_movement`

Hiện tại trigger chỉ upsert `stock_levels` theo `branch_id`.

Phase 2 contract:

- nếu `NEW.location_id IS NOT NULL`, update thêm branch/location-compatible `stock_levels`
- chưa bỏ behavior cũ theo `branch_id`

Khuyến nghị:

- tách trigger hiện tại thành function mới dễ đọc hơn
- tránh viết trigger chồng logic mơ hồ

### 5.2 `confirm_stock_issue`

Phase 2:

- validate `source_location_id` nếu đã có
- update `stock_levels` theo `location_id`
- vẫn giữ `branch_id` checks để backward compatible

Riêng flow `Cấp bếp`:

- chạy qua intra-branch `stock_transfer`
- `from_location_id = default_issue` hoặc warehouse location
- `to_location_id = default_consumption` hoặc kitchen location
- commit atomic một bước, không dùng state machine liên-site 5 bước

### 5.3 `complete_stocktake`

Phase 2:

- nếu session có `location_id`, read/write theo location
- nếu chưa có, fallback theo `branch_id`

### 5.4 `create_stocktake_session`

Phase 2:

- tạo session với cả `branch_id` và `location_id`
- default là `default_receive` của branch

### 5.5 Transfer flows

`create_stock_transfer_draft` và confirm/receive flows:

- khi tạo draft, resolve `from_location_id` và `to_location_id`
- movement `transfer_out` / `transfer_in` phải ghi cả branch và location

### 5.6 `consume_stock_for_order`

Phase 2:

- resolve `default_consumption location` của `orders.branch_id`
- ghi movement với `location_id`
- chưa thay đổi branch-level dashboard query

## 6. Read Path Strategy

Read path trong Phase 2 phải vẫn an toàn cho UI cũ.

Nguyên tắc:

- list / dashboard cũ vẫn đọc theo `branch_id`
- report mới có thể bắt đầu join `inventory_locations`
- không ép toàn bộ UI chọn location ở Phase 2

## 7. RLS Contract

Phase 2 không đổi scope nghiệp vụ, chỉ đổi join path.

RLS cần đảm bảo:

- `location_id` row phải cùng tenant với row gốc
- `location.branch_id = row.branch_id` trong giai đoạn compatibility
- `branch_manager` chỉ thao tác locations của branch mình

Khuyến nghị:

- dùng `CHECK` logic trong RPC cho cross-table consistency
- RLS chỉ làm scope gate, không ôm hết business invariants phức tạp

## 8. Acceptance Criteria

Phase 2 chỉ được coi là xong khi tất cả điều kiện sau đều đúng:

1. Tất cả bảng compatibility columns đã backfill đủ
2. Không còn row `NULL` ở các cột location mới cho dữ liệu active
3. `confirm_stock_issue` vẫn chạy đúng cho `consumption`, `writeoff`, `other`; `kitchen_use` bị CHECK constraint reject
4. `create_stocktake_session` và `complete_stocktake` vẫn hoạt động
5. transfer flow vẫn pass cho:
   - `HQ -> Kho chi nhánh`
   - `Bếp trung tâm -> Kho chi nhánh`
6. `consume_stock_for_order` vẫn tạo movement hợp lệ
7. Dashboard cũ không regress
8. `pnpm typecheck && pnpm lint && pnpm build` pass sau regenerate types

## 9. Suggested Migration Split

Để giảm rủi ro, nên tách Phase 2 thành 3 migrations:

### Migration A

- thêm columns location vào bảng
- thêm indexes
- chưa thêm NOT NULL / unique mới
- draft file: `supabase/migrations/20260417050000_inventory_location_compat_columns.sql`

### Migration B

- backfill dữ liệu cũ
- thêm helper views / validation queries nếu cần

### Migration C

- siết constraints mới sau khi data sạch
- chỉ làm khi app dual-write đã sẵn sàng

## 10. Recommended Implementation Order

1. Migration A
2. Owner apply + `pnpm db:types`
3. App dual-write changes
4. Migration B backfill
5. Verify flows
6. Migration C siết constraint

## 11. Out of Scope for Phase 2

Những việc này để Phase 3 trở đi:

- seed riêng `Kho chi nhánh` và `Bếp chi nhánh` cho branch thường
- chuyển cấp bếp thành internal transfer đầy đủ
- stocktake riêng cho bếp chi nhánh thật
- UI bắt chọn location ở mọi action
