# Gói cấu hình pilot stock-control Phước Hải

> Reconciled-through `26fb168c`
> Trạng thái: PILOT DISABLED 2026-07-03 (toàn menu "còn 0" → tắt `pos_stock_outcome_posting`; kho đã wipe theo `docs/worklog/inventory-reset-2026-07-03.md`). Rule fail-closed cho item thiếu config trong doc này bị SUPERSEDE bởi D064 §2 (fail-open: capacity NULL = bán vô hạn, fail-loud trên trang quản lý). Re-enable theo runbook D064.
> Phạm vi: pilot một chi nhánh cho `Phước Hải` (`branch_id=3`) sau khi bật `pos_stock_outcome_posting`.

## Mục tiêu

Chuẩn bị dữ liệu để bật stock-control cho một chi nhánh pilot mà không khóa nhầm POS:

- `Tồn`: số phần bán được tính từ `stock_levels` warehouse + `recipes`.
- `Sẵn bán`: số lượng quản lý nhập trong ca, bắt buộc và `<= Tồn`; mặc định đề xuất là `Tồn`.
- `Còn`: số phần POS còn được nhận sau pending/hold/sold demand.

Pilot này bắt đầu bằng cấu hình dữ liệu, sau đó đã bật feature flag theo log bên dưới khi danh sách món pilot đủ sạch.

## Kết quả audit hiện tại

Nguồn: production ref `iexwsuaqqenyjiskawoj`, seed transaction + smoke query qua Supabase CLI.

| Hạng mục | Kết quả |
| --- | ---: |
| Chi nhánh | `Phước Hải` / `branch_id=3` / code `PH` |
| Ngày audit/seed | `2026-06-30` |
| `pos_stock_outcome_posting` | `true` |
| Active menu items | `20` |
| Configured active items | `20` |
| Missing `stock_capacity` | `0` |
| Missing `Sẵn bán` | `0` |
| Blocked now | `0` |
| `Còn < Sẵn bán` | `2` do pending demand đang mở |
| Pilot recipe drivers | `20` |
| Pilot seed movements | `17` gồm seed `Trà Tắc` trước đó |
| Phước Hải warehouse locations | `1` (`Kho chi nhánh`, `location_id=7`) |
| New pilot ingredients | `5` |
| New/updated unit mappings | `piece`, `ly`, bán lẻ theo `lon`/`chai`/`trai` |

Kết luận: dữ liệu production đã đủ để test stock-control cho 20 món active tại Phước Hải và feature flag đã bật theo `Activation smoke log`.

## Production apply log

Đã seed dữ liệu test cho toàn bộ menu active của Phước Hải. Nguyên tắc seed:

- Mỗi món có một recipe driver chính để tính số phần bán.
- `Sẵn bán` hôm nay mặc định `10` và luôn `<= Tồn`.
- Tồn được ghi qua `stock_movements` để trigger cập nhật `stock_levels`; không insert trực tiếp tồn.
- Feature flag thật đã bật ở bước activation smoke.

Tóm tắt apply:

| Hạng mục | Kết quả |
| --- | --- |
| Active menu items covered | `20/20` |
| New pilot ingredients | `5`: `7UP - Thành Phẩm`, `Nước suối - Thành Phẩm`, `Cà Phê - Thành Phẩm`, `Cam ép - Thành Phẩm`, `Cơm trắng - Thành Phẩm` |
| Unit mới đã có từ seed trước | `ly` (`unit_id=18`) |
| Quy đổi đồ uống theo ly | `1 ly = 0.2 lit = 200ml` |
| Unit phần cho topping/thành phẩm | `piece` map về base unit của từng nguyên liệu |
| Recipe drivers | `20` dòng, `quantity=1` theo đơn vị bán tương ứng |
| Tồn nhập test | đủ để tính `Tồn >= 10` cho từng món, trừ shared drivers có tồn dùng chung cao hơn |
| Sẵn bán hôm nay | `20` dòng, mỗi món `limit_quantity=10`, `is_disabled=false` |
| Ledger | `17` pilot `stock_movements` gồm seed `Trà Tắc` trước đó |
| Feature flag thật | `pos_stock_outcome_posting=true` |

Driver đã cấu hình:

| Menu item | Driver | ĐVT bán/trừ kho | Tồn test sau seed | Sẵn bán |
| --- | --- | --- | ---: | ---: |
| `Sườn Cốt Lết` | `Thịt cốt lết-thành phẩm` | `piece = 0.2kg` | `10` | `10` |
| `Sườn Cây` | `Sườn cọng-thành phẩm` | `piece = 0.25kg` | `10` | `10` |
| `Sườn Một Gang` | `Sườn 1 gang-thành phẩm` | `piece = 0.4kg` | `10` | `10` |
| `Cơm Tấm Bì` | `Bì-thành phẩm` | `piece = 0.1kg` | `20` shared | `10` |
| `Cơm Tấm Chả` | `Chả-thành phẩm` | `piece = 0.1 khay` | `20` shared | `10` |
| `Cơm Tấm Trứng` | `Trứng` | `trai` | `20` shared | `10` |
| `Bì` | `Bì-thành phẩm` | `piece = 0.1kg` | `20` shared | `10` |
| `Chả` | `Chả-thành phẩm` | `piece = 0.1 khay` | `20` shared | `10` |
| `Trứng` | `Trứng` | `trai` | `20` shared | `10` |
| `Cơm Thêm` | `Cơm trắng - Thành Phẩm` | `piece = 0.2kg` | `10` | `10` |
| `Coca Cola` | `Coca Cola` | `chai` | `10` | `10` |
| `Fanta` | `Fanta cam` | `lon` | `10` | `10` |
| `7UP` | `7UP - Thành Phẩm` | `lon` | `10` | `10` |
| `Nước suối` | `Nước suối - Thành Phẩm` | `chai` | `10` | `10` |
| `Rau Má` | `Nước Rau Má - Thành Phẩm` | `ly = 200ml` | `10` | `10` |
| `Trà Đá` | `Trà-Thành Phẩm` | `ly = 200ml` | `20` shared | `10` |
| `Trà Tắc` | `Trà-Thành Phẩm` | `ly = 200ml` | `20` shared | `10` |
| `Cà Phê` | `Cà Phê - Thành Phẩm` | `ly = 200ml` | `10` | `10` |
| `Cam ép` | `Cam ép - Thành Phẩm` | `ly = 200ml` | `10` | `10` |
| `Khăn lạnh` | `Khăn lạnh` | `piece = 0.1 túi` | `10` | `10` |

Smoke DB sau full seed:

- `configured_items=20/20`.
- `missing_stock_capacity=0`.
- `missing_manual_limit=0`.
- `blocked_now=0`.
- `available_lt_manual=2` do đơn đang mở:
  - `Sườn Cốt Lết`: `Tồn=10`, `Sẵn bán=10`, pending `1`, `Còn=9`.
  - `Sườn Một Gang`: `Tồn=10`, `Sẵn bán=10`, pending `4`, `Còn=6`.
- `Trà Tắc` đã giữ đúng quy đổi owner chốt: tồn tổng driver `Trà-Thành Phẩm` hiện đủ `20 ly`, `Sẵn bán=10`.

## Activation smoke log

Flag đã bật cho Phước Hải:

| Hạng mục | Kết quả |
| --- | --- |
| `branch_feature_flags` | `branch_id=3`, `flag_key=pos_stock_outcome_posting`, `enabled=true` |
| `enabled_at` | `2026-06-30 14:11:23.343025+00` |
| Notes | `Pilot stock-control smoke enabled by owner delegation 2026-06-30` |

Smoke sau bật flag:

- Service-role context resolve `public.is_feature_enabled(3, 'pos_stock_outcome_posting') = true`.
- Availability theo flag thật: `active_items=20`, `configured_items=20`, `missing_stock_capacity=0`, `missing_manual_limit=0`, `blocked_now=0`.
- `available_lt_manual=2` do đơn đang mở:
  - `Sườn Cốt Lết`: `Tồn=10`, `Sẵn bán=10`, pending `1`, `Còn=9`.
  - `Sườn Một Gang`: `Tồn=10`, `Sẵn bán=10`, pending `4`, `Còn=6`.
- Rollback smoke POS/KDS stock outcome:
  - `ready + paid` qua `complete_payment_and_consume_stock` sinh đúng `sale_consumption` `-0.2kg` cho `Thịt cốt lết-thành phẩm`.
  - `ready + cancel` qua `post_pos_cancelled_ready_waste` sinh đúng `cancelled_after_kds_ready` `-0.2kg`.
  - Transaction đã `ROLLBACK`; kiểm lại còn `0` order `SMOKE-STOCK-*` và `0` movement reason `smoke rollback`.

## Quy tắc pilot

1. `recipes` đang là dữ liệu dùng để tính khóa bán và post POS stock outcome. Vì vậy pilot chỉ nên đưa **nguyên liệu/thành phẩm chính điều khiển khả năng bán** vào recipe.
2. Không đưa toàn bộ food-cost BOM vào pilot nếu chưa muốn cơm, nước mắm, đồ chua, rau, đá... khóa bán mọi món. Full COGS làm sau khi pilot chạy ổn.
3. Mỗi dòng recipe phải có `entry_unit_id`. Nếu chọn `1 món bán = 1 Phần`, nguyên liệu đó cần `ingredient_units` có unit `Phần` và `to_base_factor` đúng.
4. Không insert trực tiếp `stock_levels`. Tồn pilot phải đi qua receive/count/stocktake để ledger không bị lệch.
5. Chỉ bật `pos_stock_outcome_posting` sau khi audit lại đạt `ready_items=20` hoặc owner chấp nhận danh sách món tạm loại khỏi stock-control.

## Worksheet cấu hình món

Worksheet này là bản chốt trước khi seed full test data. Trạng thái production hiện tại lấy theo `Production apply log`; phần này giữ lại để audit vì sao từng driver/unit được chọn.

| Menu item | ID | Recipe driver đề xuất | Ingredient ID | Hiện trạng đơn vị | Việc cần làm |
| --- | ---: | --- | ---: | --- | --- |
| Sườn Cốt Lết | 1 | `Thịt cốt lết-thành phẩm` | 93 | `kg` | Thêm/chốt `Phần` hoặc nhập gram/kg mỗi phần; tạo recipe; nhập tồn PH. |
| Sườn Cây | 7 | `Sườn cọng-thành phẩm` | 82 | `kg` | Thêm/chốt `Phần`; tạo recipe; nhập tồn PH. |
| Sườn Một Gang | 8 | `Sườn 1 gang-thành phẩm` | 74 | `kg` | Thêm/chốt `Phần`; tạo recipe; nhập tồn PH. |
| Cơm Tấm Bì | 14 | `Bì-thành phẩm` | 33 | `kg` | Pilot dùng topping chính; chốt phần/kg; tạo recipe; nhập tồn PH. |
| Cơm Tấm Chả | 15 | `Chả-thành phẩm` | 22 | `khay` | Chốt `1 khay = ? phần` hoặc thêm `Phần`; tạo recipe; nhập tồn PH. |
| Cơm Tấm Trứng | 16 | `Trứng` | 83 | `trai` | Có thể dùng `1 phần = 1 trái`; tạo recipe; nhập tồn PH. |
| Bì | 4 | `Bì-thành phẩm` | 33 | `kg` | Chốt phần/kg; tạo recipe; nhập tồn PH. |
| Chả | 5 | `Chả-thành phẩm` | 22 | `khay` | Chốt phần/khay; tạo recipe; nhập tồn PH. |
| Trứng | 6 | `Trứng` | 83 | `trai` | Dùng `1 phần = 1 trái`; tạo recipe; nhập tồn PH. |
| Cơm Thêm | 12 | owner confirm: gạo hay cơm thành phẩm | 14? | `kg` (`Gạo Tấm Tài Nguyên`) | Nên tạo ingredient `Cơm trắng - thành phẩm` nếu muốn khóa theo cơm chín. |
| Coca Cola | 2 | owner confirm: `Coca Cola` | 39 | `ml` | Nếu bán lon/chai, cần đúng ingredient/unit bán lẻ; dữ liệu hiện là `ml`. |
| Fanta | 19 | `Fanta cam` | 17 | `lon` | Tạo recipe `1 lon`; nhập tồn PH. |
| 7UP | 18 | owner confirm: chưa thấy ingredient exact | - | - | Tạo/map ingredient đúng, ví dụ không dùng nhầm `Sprite` nếu khác hàng. |
| Nước suối | 21 | owner confirm: chưa thấy ingredient exact | - | - | Tạo/map ingredient đúng và unit bán lẻ. |
| Rau Má | 10 | `Nước Rau Má - Thành Phẩm` | 51 | `lit`, có `ml` conversion | Chốt ml/phần hoặc thêm `ly`; tạo recipe; nhập tồn PH. |
| Trà Đá | 20 | `Trà-Thành Phẩm` | 60 | `lit`, có `ml` conversion | Chốt ml/ly; tạo recipe; nhập tồn PH nếu muốn khóa bán trà. |
| Trà Tắc | 17 | `Trà-Thành Phẩm` | 60 | base `lit`, có `ml` conversion | Chốt pilot: `1 ly = 200ml`; tồn nhập `2000ml`; `Tồn = 10 ly`. |
| Cà Phê | 9 | owner confirm: chưa thấy ingredient exact | - | - | Tạo/map ingredient thành phẩm trước khi stock-control. |
| Cam ép | 11 | `Trái Cam` hoặc nước cam thành phẩm | 73? | `kg` | Chốt bán theo trái/kg/ml; nếu cần, tạo finished good. |
| Khăn lạnh | 23 | `Khăn lạnh` | 99 | `tui` | Chốt `1 tui = ? cái` hoặc thêm unit `cái`; tạo recipe. |

## Trình tự nhập dữ liệu

Trình tự dưới đây là checklist lặp lại khi cần seed lại hoặc mở rộng sang chi nhánh khác:

1. Chuẩn hóa unit còn thiếu:
   - `Phần` cho các thành phẩm thịt nếu muốn quản lý bằng số phần.
   - `ly` cho nước nếu muốn quản lý bằng ly. Với Trà Tắc, thêm/chốt `ly` cho `Trà-Thành Phẩm` (`ingredient_id=60`) với `to_base_factor=0.2` nếu base là `lit`.
   - `cái` cho khăn lạnh nếu tồn đang theo túi/lốc.
2. Tạo recipe pilot:
   - Một dòng driver chính cho mỗi menu item.
   - `quantity=1` khi `entry_unit_id` là unit bán ra (`Phần`, `lon`, `trai`, `ly`, `cái`). Trà Tắc dùng `quantity=1`, `entry_unit_id=ly`; nếu chưa thêm `ly`, dùng tạm `quantity=200`, `entry_unit_id=ml`.
   - Nếu dùng base hiện có (`kg`, `lit`, `ml`, `khay`, `tui`), nhập `quantity` đúng theo định mức mỗi phần.
3. Nhập tồn chi nhánh Phước Hải bằng flow kho hiện có:
   - receive/count/stocktake, không insert thẳng `stock_levels`.
   - warehouse location hiện tại: `Kho chi nhánh`, `location_id=7`.
4. Refresh/kiểm lại `Tồn`:
   - `stock_capacity_live` phải khác `NULL`.
   - item thiếu config phải không được bán theo stock-control.
5. Tạo `Sẵn bán`:
   - default đề xuất: `Sẵn bán = Tồn`.
   - manager có thể hạ xuống thấp hơn.
   - không cho `Sẵn bán > Tồn`.
6. Bật pilot flag cho `branch_id=3` chỉ sau khi owner duyệt.

## Payload lịch sử đã chốt cho Trà Tắc

Block này là payload ban đầu dùng để chốt quy đổi `Trà Tắc`. Production hiện đã được apply bằng transaction seed mới hơn trong log ở trên; không chạy lại block này.

```sql
begin;

do $$
declare
  v_tenant_id bigint := 1;
  v_branch_id bigint := 3;
  v_menu_item_id bigint := 17; -- Trà Tắc
  v_ingredient_id bigint := 60; -- Trà-Thành Phẩm
  v_ly_unit_id bigint;
begin
  if not exists (
    select 1 from public.branches
    where id = v_branch_id and tenant_id = v_tenant_id and name = 'Phước Hải'
  ) then
    raise exception 'pilot_branch_mismatch';
  end if;

  if not exists (
    select 1 from public.menu_items
    where id = v_menu_item_id and tenant_id = v_tenant_id and name = 'Trà Tắc' and is_active
  ) then
    raise exception 'pilot_menu_item_mismatch';
  end if;

  if not exists (
    select 1 from public.ingredients
    where id = v_ingredient_id and tenant_id = v_tenant_id and name = 'Trà-Thành Phẩm' and is_active
  ) then
    raise exception 'pilot_ingredient_mismatch';
  end if;

  if not exists (
    select 1
    from public.ingredient_units iu
    join public.units u on u.id = iu.unit_id
    where iu.tenant_id = v_tenant_id
      and iu.ingredient_id = v_ingredient_id
      and u.code = 'lit'
      and iu.is_base = true
      and iu.to_base_factor = 1
      and iu.is_active
  ) then
    raise exception 'pilot_base_unit_missing';
  end if;

  insert into public.units (tenant_id, code, name, is_active)
  values (v_tenant_id, 'ly', 'ly', true)
  on conflict (code, tenant_id)
  do update set name = excluded.name, is_active = true, updated_at = now()
  returning id into v_ly_unit_id;

  insert into public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    allow_purchase,
    allow_issue,
    allow_production,
    sort_order,
    is_active
  )
  values (
    v_tenant_id,
    v_ingredient_id,
    v_ly_unit_id,
    0.2,
    false,
    false,
    true,
    true,
    2,
    true
  )
  on conflict (ingredient_id, unit_id, tenant_id)
  do update set
    to_base_factor = excluded.to_base_factor,
    is_base = false,
    allow_issue = true,
    allow_production = true,
    sort_order = 2,
    is_active = true,
    updated_at = now();

  insert into public.recipes (
    tenant_id,
    menu_item_id,
    ingredient_id,
    quantity,
    unit,
    entry_unit_id,
    note,
    yield_factor
  )
  values (
    v_tenant_id,
    v_menu_item_id,
    v_ingredient_id,
    1,
    'ly',
    v_ly_unit_id,
    'Pilot stock-control driver: 1 ly = 200ml',
    1
  )
  on conflict (menu_item_id, ingredient_id, tenant_id)
  do update set
    quantity = excluded.quantity,
    unit = excluded.unit,
    entry_unit_id = excluded.entry_unit_id,
    note = excluded.note,
    yield_factor = excluded.yield_factor;
end $$;

select
  public.compute_menu_item_stock_capacity(1, 3, 17) as tra_tac_ton_before_stock_entry;

rollback;
```

Sau khi payload này được apply thật:

1. Nhập tồn kho cho `Trà-Thành Phẩm` tại Phước Hải qua flow kho hiện có: `2000ml` hoặc `2 lit`.
2. Kiểm lại `public.compute_menu_item_stock_capacity(1, 3, 17)` phải trả `10`.
3. Quản lý set `Sẵn bán = 10` bằng màn `Giới hạn bán`; RPC `set_branch_menu_daily_limit(3, 17, null, false)` sẽ default `Sẵn bán = Tồn` nếu gọi qua app với quyền `owner`/`branch_manager`.

## Query audit sau khi nhập dữ liệu

Tiêu chí đạt trước khi bật stock outcome:

| Kiểm tra | Yêu cầu |
| --- | --- |
| `active_menu_items` | `20`, hoặc danh sách pilot nhỏ hơn đã được owner duyệt |
| `needs_recipe` | `0` cho danh sách pilot |
| `needs_pos_unit` | `0` |
| `needs_unit_conversion` | `0` |
| `cannot_compute_stock` | `0` |
| `needs_san_ban` | `0` |
| `san_ban_gt_ton` | `0` |
| warehouse stock rows | `> 0` cho toàn bộ driver ingredients |
| `pos_stock_outcome_posting` | `false` trước smoke cuối; `true` sau `Activation smoke log` |

Query production read-only hữu ích:

```sql
select public.is_feature_enabled(3, 'pos_stock_outcome_posting') as stock_outcome_enabled;

select *
from public.branch_menu_limit_availability(
  1,
  3,
  (current_timestamp at time zone 'Asia/Ho_Chi_Minh')::date,
  true
)
order by category_name, item_name;
```

## Ma trận smoke sau khi bật pilot

Chỉ chạy trên Phước Hải.

| Case | Kết quả tồn kho kỳ vọng |
| --- | --- |
| Order created, not paid, not cancelled | Pending demand reduces `Còn`; no stock movement. |
| Cancel before any KDS `ready` | Pending demand released; no stock movement. |
| KDS `ready`, then cancel | `stock_movements.movement_subtype='cancelled_after_kds_ready'`. |
| KDS `ready`, then paid/completed | `stock_movements.movement_subtype='sale_consumption'`. |
| Paid before KDS `ready` | No movement until `first_ready_at` exists; then sale consumption posts idempotently. |
| Retry payment/cancel action | No duplicate stock movement because outcome idempotency index holds. |
| `Còn=0` | POS blocks new demand for that item; KDS has no management UI. |

## Để sau

- Full food-cost BOM per item.
- Side-dish stock outcome applied to production:
  - `20260630142401_pos_stock_outcome_side_dish_consumption.sql`
  - `20260630144333_pos_stock_outcome_side_dish_backfill.sql`
  - Backfill scope is only pilot-window movements after `pos_stock_outcome_posting` was enabled; older historical side orders are not subtracted from the current pilot stock baseline.
- FIFO/FEFO costing.
- Auto-create stock-control recipe from production recipe.
- Bulk import UI for the 20 pilot rows.
