# Kế hoạch: Danh mục nguyên liệu đa đơn vị + danh mục chuẩn (2026-06-29)

Trạng thái: **DRAFT — chờ owner duyệt**. Người soạn: agent. Ngôn ngữ code/identifier/SQL giữ tiếng Anh.

## 1. Mục tiêu

Nâng danh mục nguyên liệu từ mô hình **2 đơn vị cố định** lên:

1. **Đa đơn vị / nguyên liệu**: mỗi nguyên liệu có 1 hoặc nhiều đơn vị, mỗi đơn vị có hệ số quy đổi về **một đơn vị gốc (base)** và cờ vai trò được phép dùng cho **nhập / xuất / chế biến**.
2. **Danh mục chuẩn (master)**: bảng danh mục riêng + dropdown, thay cho text gõ tay.
3. **Đồng bộ**: danh sách đơn vị chuẩn (master) + danh mục chuẩn ⇒ hết lệch chính tả; mọi chứng từ quy đổi về base nhất quán.

## 2. Hiện trạng (đã xác minh trực tiếp trên PROD, không tin docs cũ)

- `ingredients`: `name`, `category` (**text, nullable, KHÔNG có master**), `purchase_unit` (ĐVN), `measure_unit` (ĐVT), `purchase_to_measure_factor` (1 ĐVN = factor ĐVT), `unit` (legacy, ~= measure_unit, **thừa**), `item_kind` (raw_material/finished_good), `unit_cost`.
- **Đơn vị gốc thực tế = `purchase_unit`**. Xác nhận bằng comment schema (`stock_levels.current_quantity`, `recipes.quantity` đều "stored in purchase_unit") và bằng body function thật.
- Quy đổi **chỉ xảy ra ở `confirm_production_order`** (BOM sản xuất viết theo measure_unit → chia factor → post theo purchase_unit). 10 RPC còn lại (`confirm_goods_receipt_note`, `create_grn_from_po`, `consume_stock_for_order`, `consume_stock_for_order_service`, `confirm_stock_issue`, `stock_transfer_confirm_ship`, `finalize_stocktake`, `approve_inventory_count_slip`, `submit_count_round`, `create_waste_entry`) **post thẳng, không quy đổi** — giả định dòng đã ở base. Đơn vị trên dòng chứng từ (`grn_items.unit`, `stock_issue_items.unit`, …) chỉ là **text hiển thị**, không ràng buộc, không dùng để tính.
- Hệ quả: muốn cho người dùng chọn đơn vị bất kỳ trên chứng từ thì **mọi RPC đều phải thêm bước quy đổi → base**. Đây là phần lõi của việc này (không chỉ là thêm bảng).
- **Dữ liệu đã reset** (2026-06-29): `stock_levels`/`stock_movements`/mọi chứng từ = 0; `recipes`/`production_recipes` = 0. Chỉ còn **104 ingredients + ~12 category text**. ⇒ KHÔNG có chứng từ/tồn cũ phải convert; chỉ migrate định nghĩa nguyên liệu + danh mục. Thời điểm lý tưởng.
- Category đang dựng dropdown lọc bằng `distinct` từ rows (client). `CATEGORY_TONE_CLASS` hardcode 7 nhóm trong `_lib/constants.ts`.

## 3. Mô hình dữ liệu mới

Nguyên tắc: **một đơn vị gốc (base) cho mỗi nguyên liệu; mọi đơn vị khác có 1 hệ số phẳng `to_base_factor` quy về base.** Không làm bảng quy đổi cặp (from→to) + bao đóng bắc cầu — thừa. "Nhiều cấp" (thùng→chai→ml) thể hiện bằng nhiều dòng đơn vị, mỗi dòng có `to_base_factor` riêng về base. Đơn giản, đủ.

### 3.1. `units` — từ điển đơn vị chuẩn (tenant-scoped)
```
units(
  id            BIGINT IDENTITY PK,
  tenant_id     BIGINT NOT NULL REFERENCES tenants,
  code          TEXT   NOT NULL,        -- 'kg','g','ml','chai','thung','hop'...
  name          TEXT   NOT NULL,        -- nhãn hiển thị
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at/updated_at TIMESTAMPTZ,
  UNIQUE(code, tenant_id)
)
```
Mục đích: chuẩn hoá tên đơn vị toàn hệ thống (đồng bộ). `ingredient_units` tham chiếu vào đây.

### 3.2. `ingredient_units` — đơn vị + quy đổi + vai trò theo từng nguyên liệu
```
ingredient_units(
  id              BIGINT IDENTITY PK,
  tenant_id       BIGINT NOT NULL,
  ingredient_id   BIGINT NOT NULL REFERENCES ingredients ON DELETE CASCADE,
  unit_id         BIGINT NOT NULL REFERENCES units,
  to_base_factor  NUMERIC(18,6) NOT NULL CHECK (to_base_factor > 0),  -- 1 đơn vị này = ? base
  is_base         BOOLEAN NOT NULL DEFAULT false,   -- đúng 1 dòng/ingredient, to_base_factor=1
  allow_purchase  BOOLEAN NOT NULL DEFAULT false,   -- nhập
  allow_issue     BOOLEAN NOT NULL DEFAULT false,   -- xuất
  allow_production BOOLEAN NOT NULL DEFAULT false,   -- chế biến
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(ingredient_id, unit_id, tenant_id)
)
```
Ràng buộc: đúng 1 `is_base=true` / ingredient (enforce bằng partial unique index `WHERE is_base`). Base luôn `to_base_factor=1` và mặc định `allow_*` đủ.

### 3.3. `ingredient_categories` — danh mục chuẩn
```
ingredient_categories(
  id          BIGINT IDENTITY PK,
  tenant_id   BIGINT NOT NULL,
  name        TEXT NOT NULL,
  tone_class  TEXT,              -- thay CATEGORY_TONE_CLASS hardcode
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(name, tenant_id)
)
```
`ingredients.category_id BIGINT REFERENCES ingredient_categories` (nullable trong giai đoạn chuyển, rồi siết).

### 3.4. Sửa `ingredients`
- Thêm `category_id` FK.
- `purchase_unit` / `measure_unit` / `purchase_to_measure_factor` / `unit`: **giữ tạm** (giai đoạn chuyển) → drop ở phase cuối. Base = dòng `is_base` trong `ingredient_units`.

### 3.5. Dòng chứng từ + ledger
- Mỗi bảng dòng (`grn_items`, `purchase_order_items`, `stock_issue_items`, `stock_transfer_items`, `production_order_items`, `production_recipes`, `recipes`): thêm `entry_unit_id BIGINT REFERENCES units` + `entry_quantity NUMERIC`. Cột `quantity` cũ = **quantity ở base** (sau quy đổi). Giữ `unit` text cho tương thích/hiển thị tạm.
- `stock_movements`: thêm `entry_unit_id`, `entry_quantity`, `to_base_factor` (audit/đảo ngược). `quantity_change` vẫn là **base**.
- `stock_levels.current_quantity` vẫn ở **base** — không đổi schema, chỉ cập nhật comment.

## 4. Quy ước base & costing/WAC

- **Base = `purchase_unit` hiện tại** cho 104 nguyên liệu (migrate). Lý do: stock/recipe/RPC đã coi purchase_unit là base; chọn vậy = 0 thay đổi ngữ nghĩa tồn. Owner có thể đổi base/nguyên liệu sau qua UI.
- **WAC theo base**: `stock_levels.avg_unit_cost` = giá vốn / **base unit**. GRN nhập giá theo đơn vị nhập đã chọn → quy đổi về giá/base trước khi trộn WAC: `cost_per_base = entry_unit_cost / to_base_factor`.
- Hàm quy đổi dùng chung (SQL): `inv_to_base(ingredient_id, entry_unit_id, entry_qty) RETURNS base_qty` (tra `ingredient_units.to_base_factor`, fail-closed nếu unit không thuộc nguyên liệu / không đúng vai trò). Mọi RPC gọi hàm này.

## 5. Thay đổi theo surface

| Surface | Thay đổi chính |
|---|---|
| **Catalog** (`ingredient-dialog.tsx`, `ingredient-actions.ts`, `ingredients-client.tsx`, `_lib/types.ts`, `_lib/constants.ts`) | Form: lưới đơn vị động (chọn unit từ `units`, `to_base_factor`, 3 cờ vai trò, đánh dấu base) thay 3 ô cũ; category → dropdown từ master. Zod đổi sang `units[]` + `base_unit_id` + `category_id`. Import/Export: thêm sheet "Đơn vị" (ingredient, unit, factor, roles) + cột category map theo tên. Bỏ dần `CATEGORY_TONE_CLASS`. |
| **Mua/Nhập** (`purchase-order-actions.ts`, `new-po-client.tsx`, `grn-actions.ts`, `add-grn-line-dialog.tsx`, `grn-line-row.tsx`) | Dòng PO/GRN: dropdown đơn vị lọc `allow_purchase`; lưu `entry_unit_id`+`entry_quantity`. `confirm_goods_receipt_note`/`create_grn_from_po`: quy đổi `entry_qty → base` trước khi post `stock_movements`; WAC theo `cost_per_base`. |
| **Xuất/Chuyển/Hao/Kiểm kê/Count** (`issue-actions.ts`, `transfer-actions.ts`, `waste-actions.ts`, `stocktake-actions.ts`, `count-slips`, `count-assignments`, `employee/count`) | Dòng: dropdown đơn vị lọc `allow_issue`; lưu entry + base. RPC `confirm_stock_issue`, `stock_transfer_confirm_ship`, `create_waste_entry`, `approve_inventory_count_slip`, `submit_count_round`, `finalize_stocktake`: quy đổi về base trước khi tính delta/post. **Waste tier** tính theo cost base (đang sai nếu lệch đơn vị). Thêm cột `entry_unit_id` cho `stocktake_lines`, `inventory_count_slip_lines`. Count mù: vẫn ẩn system_qty nhưng hiện đơn vị cần đếm. |
| **Sản xuất/Công thức** (`production-recipe-*.tsx/ts`, `production-order-*.tsx/ts`, `production-quick-create-dialogs.tsx`) | BOM: dropdown đơn vị lọc `allow_production`; lưu `entry_unit_id`. `confirm_production_order`: thay phép chia factor cố định bằng `inv_to_base` cho cả NL tiêu thụ lẫn thành phẩm output. Quick-create: tạo nguyên liệu kèm base + seed `ingredient_units`. |
| **POS consume** (`consume_stock_for_order(_service)`) | `recipes.quantity` hiện ở purchase_unit (=base) → vẫn đúng nếu base giữ = purchase_unit; thêm quy đổi qua `inv_to_base` để an toàn khi base đổi. |
| **Màn quản trị mới** | `/inventory/settings/units` + `/inventory/settings/categories` (page + client + actions). |

## 6. Migration dữ liệu (nhỏ — chỉ catalog)

1. Tạo `units`, `ingredient_units`, `ingredient_categories` + grants + RLS + index.
2. Seed `units` từ tập distinct `purchase_unit ∪ measure_unit` của 104 nguyên liệu (chuẩn hoá: trim/lower, gộp biến thể như `lit`↔`l`).
3. Mỗi ingredient: tạo 2 dòng `ingredient_units`:
   - base = `purchase_unit`, `to_base_factor=1`, `allow_purchase=allow_issue=true`.
   - `measure_unit` (nếu khác purchase_unit): `to_base_factor = 1/purchase_to_measure_factor`, `allow_production=true`.
   - Nếu purchase_unit==measure_unit (factor 1): chỉ 1 dòng base, cả 3 vai trò true.
4. `ingredient_categories` từ distinct `ingredients.category` (gộp `"Rau, củ"`→`"Rau củ"`, xử lý NULL); set `ingredients.category_id`.
5. Owner rà lại vai trò + thêm đơn vị thứ 3+ qua UI sau.
6. Phase cuối: drop `purchase_unit`/`measure_unit`/`purchase_to_measure_factor`/`unit` + cột `category` text.

## 7. ACL / i18n / tests (bắt buộc)

- **Permissions**: thêm `inventory:units_master`, `inventory:category_master` vào `permission_keys` (DB) + mirror `packages/shared/src/auth/permissions.ts` + bump `PERMISSION_KEY_COUNT`. Quản lý: `INVENTORY_CATALOG_ROLES` (owner, warehouse_manager, production_manager). Tenant-wide, không branch scope.
- **Route**: thêm prefix `/inventory/settings/units`, `/inventory/settings/categories` vào `route-resolution.ts` để `protected-route-module-coverage.test.ts` pass.
- **i18n**: màn mới KHÔNG được inline tiếng Việt — copy từ `apps/web/lib/messages/*` (thêm `UNITS_VI`, `CATEGORIES_VI`) / `@comtammatu/shared/messages`. Sau khi xong chạy `pnpm lint:i18n:baseline`.
- **UI-contract**: dùng `DataTable` + `AppToolbar`, `SelectField`/`FormDialog` từ `@/components/form`, không import raw Table/Card.
- Gate hoàn thành: `pnpm typecheck && pnpm lint && pnpm build` + `pnpm test`. Sau migration chạy `pnpm db:types`.

## 8. Rollout (phân pha, có deploy-coupling)

- **Phase A — Master + Catalog (additive, an toàn)**: tạo 3 bảng + cột `category_id`/`entry_*` (additive), migrate catalog, form đa đơn vị, 2 màn admin, ACL/i18n. Áp prod được TRƯỚC khi code mới deploy (additive). Giao được "đồng bộ danh mục + định nghĩa đa đơn vị".
- **Phase B — Quy đổi ở mọi RPC**: cập nhật ledger + RPC dùng `inv_to_base`. Test kỹ GRN/issue/transfer/production/stocktake. Đây là phần rủi ro cao nhất.
- **Phase C — Dọn (destructive)**: drop cột legacy + siết NOT NULL. Destructive ⇒ **deploy code bỏ đọc cột cũ TRƯỚC**, rồi mới apply (theo `database.md` deploy-coupling).
- Mỗi phase: file migration → PR → owner apply (hoặc uỷ quyền apply trong session).

## 9. Quyết định cần owner chốt

1. **Base/nguyên liệu**: giữ base = `purchase_unit` (khuyến nghị, 0 churn) hay chọn đơn vị nhỏ nhất? → đề xuất giữ purchase_unit, đổi lẻ qua UI sau.
2. **Units master**: dùng từ điển đơn vị global (khuyến nghị, đồng bộ thật) hay cho gõ tự do mỗi nguyên liệu? → đề xuất global.
3. **Vai trò mặc định khi migrate** (purchase_unit = nhập+xuất; measure_unit = chế biến) có ổn không?
4. **Có thực sự cần ≥3 đơn vị/nguyên liệu ngay** không, hay phần lớn 1–2 là đủ? (mô hình hỗ trợ N sẵn; chỉ ảnh hưởng công sức nhập liệu.)
5. **Phạm vi đợt này**: làm cả A+B+C, hay chỉ Phase A trước (đồng bộ danh mục + định nghĩa đa đơn vị) rồi đánh giá?

## 10. Rủi ro

- Phase B đụng ~11 RPC tài chính/tồn — sai quy đổi = lệch tồn/giá vốn. Giảm rủi ro: hàm `inv_to_base` fail-closed, test per-RPC, stock đang trống nên không hỏng dữ liệu cũ.
- Drop cột legacy phá deploy Vercel dormant nếu code cũ còn đọc → tuân deploy-coupling (Phase C cuối).
- Import/Export đổi cấu trúc cột → cần giữ tương thích file cũ hoặc thông báo rõ.
