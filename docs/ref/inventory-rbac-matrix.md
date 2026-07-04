# Inventory RBAC Matrix — Auth

> Canonical access contract cho Inventory surfaces, viết theo model **Position ⟂ Permission** (Auth).
>
> Source of truth:
>
> - **Route-level ACL:** `packages/shared/src/auth/module-acl.ts` (gate nhanh theo compatibility access bucket)
> - **Row-level authz:** `staff_permissions(user_id, branch_id, permission_key)` + `has_permission()` / `has_permission_any()`
> - **Permission catalog:** `packages/shared/src/auth/permissions.ts`
> - **Position + template seed:** `positions`, `role_templates` tables (per tenant)
>
> Docs này chốt **business actions** của Inventory theo permission key và position template. Không đặt thuật ngữ mới; mọi drift với code sẽ thua source of truth ở trên.

---

## 1. Mô hình Auth (tóm tắt cho Inventory)

| Khái niệm          | Ý nghĩa                                                                                                                                       | Nằm ở                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Permission key** | Chuỗi hành động canonical (vd `inventory:production_create`). Là đơn vị authz nhỏ nhất.                                                       | `permission_keys` catalog + `permissions.ts`       |
| **Position**       | Chức vụ HR (vd `head_chef` = Bếp trưởng). **Không** gate authz trực tiếp.                                                                    | `positions` (per tenant), `profiles.position_id`   |
| **Template**       | Bundle permission preset gắn với 1 position. Snapshot — edit template không propagate.                                                        | `role_templates(position_code, permission_keys[])` |
| **Grant**          | Quyền thật của user tại branch cụ thể, dạng (user, branch, key). `branch_id IS NULL` = tenant-wide.                                           | `staff_permissions`                                |
| **Access bucket**  | Compatibility claim derived từ `positions.code` mapper. Dùng cho route-level ACL và một số scope guard còn chủ ý trong RPC.             | `module-acl.ts`, `auth_role()` helper              |

**Authz path cho mỗi Inventory request:**

1. `proxy.ts` check route-level qua `canAccess(user_role, module)` — fast gate.
2. Server action (`apps/web/app/(protected)/inventory/*-actions.ts`) check permission qua `currentUserHasPermission(key)` — domain gate.
3. RLS policy trên table dùng `has_permission(branch_id, key)` — row gate.
4. RPC body (SECURITY DEFINER) thực thi logic + check role/permission nội bộ.

> Inventory mutating RPC chính đã chuyển sang permission gate; phần `auth_role()` còn lại là route/side/scope guard hoặc compatibility helper (xem §6).

---

## 2. Positions liên quan Inventory (Cơm Tấm Má Tư — tenant_id=1)

| Position code       | Label VI           | Access bucket        | Scope vận hành mặc định                                    |
| ------------------- | ------------------ | -------------------- | ---------------------------------------------------------- |
| `owner`             | Chủ sở hữu         | `owner`              | Tenant-wide bypass (owner bypass trong `has_permission()`) + tenant-wide operations + procurement |
| `branch_manager`    | Quản lý chi nhánh  | `branch_manager`     | Branch của mình                                            |
| `warehouse_manager` | Quản lý Kho Tổng   | `warehouse_manager`  | Kho Tổng (`central_supply`)                            |
| `head_chef`         | Bếp trưởng         | `production_manager` | Bếp Trung Tâm (`central_kitchen`)                      |

> Position code dùng English `lower_snake_case` theo bộ canonical hiện hành. Tên hiển thị tiếng Việt đi qua `label_vi`.
>
> Các position POS/KDS (`cashier`, `chef`, `kitchen_helper`) không có Inventory grant mặc định; chỉ tác động tồn kho gián tiếp qua consumption flow.

---

## 3. Permission keys cho Inventory

### 3.1 Inventory module

| Key                            | Ý nghĩa                                       |
| ------------------------------ | --------------------------------------------- |
| `inventory:read`               | Xem tồn kho, movement, alerts                 |
| `inventory:write`              | Cập nhật catalog nguyên liệu, adjust tồn      |
| `inventory:transfer_create`    | Tạo phiếu luân chuyển nội bộ (draft)          |
| `inventory:transfer_ship`      | Confirm xuất kho (ship) của phiếu luân chuyển |
| `inventory:transfer_receive`   | Confirm nhận hàng tại điểm đến                |
| `inventory:stocktake_create`   | Mở phiên kiểm kê                              |
| `inventory:stocktake_complete` | Đóng phiên kiểm kê + post adjustments         |
| `inventory:writeoff`           | Ghi hao hụt / waste / hết hạn                 |
| `inventory:production_create`  | Tạo lệnh sản xuất (chi nhánh)             |
| `inventory:production_confirm` | Confirm hoàn thành lệnh sản xuất              |
| `inventory:waste_approve`      | Duyệt phiếu waste tier-2                       |
| `inventory:waste_bypass_photo` | Bỏ yêu cầu ảnh khi tạo waste                  |
| `inventory:stocktake_recount`  | Mở vòng đếm lại trong kiểm kê                 |
| `inventory:stocktake_unblind`  | Mở khoá blind mode để xem SL hệ thống         |
| `inventory:adjust_approve`     | Duyệt điều chỉnh tồn thủ công                 |
| `inventory:grn_express_configure` | Cấu hình GRN express                        |
| `inventory:grn_express_extend` | Gia hạn cửa sổ GRN express                    |
| `inventory:grn_hardblock_override` | Override hard-block khi nhận GRN           |
| `inventory:catalog_review_policy_set` | Đặt policy review danh mục              |
| `inventory:item_review_override_set` | Override review cho từng item            |

### 3.2 Procurement module (`inventory_procurement`)

| Key                           | Ý nghĩa                           |
| ----------------------------- | --------------------------------- |
| `procurement:read`            | Xem PO, GRN, NCC, hoá đơn mua     |
| `procurement:supplier_manage` | CRUD nhà cung cấp                 |
| `procurement:po_create`       | Tạo Purchase Order                |
| `procurement:po_approve`      | Duyệt PO (thả ra cho NCC)         |
| `procurement:grn_create`      | Tạo phiếu nhập kho draft          |
| `procurement:grn_confirm`     | Xác nhận GRN → cập nhật tồn       |
| `procurement:invoice_create`  | Nhập hoá đơn NCC                  |
| `procurement:invoice_match`   | 3-way matching PO ↔ GRN ↔ Invoice |
| `procurement:grn_amend`       | Sửa GRN đã tạo (draft)            |
| `procurement:price_list_read` | Xem bảng giá NCC                  |
| `procurement:price_list_write`| Cập nhật bảng giá NCC             |
| `procurement:override_code_rotate` | Xoay mã override nhập hàng   |

### 3.3 Supplier return + accounting

| Key                        | Ý nghĩa                                  |
| -------------------------- | ---------------------------------------- |
| `supplier_return:read`     | Xem phiếu trả hàng NCC                    |
| `supplier_return:create`   | Tạo phiếu trả hàng NCC (gồm QC nhận hàng)|
| `supplier_return:confirm`  | Xác nhận trả hàng NCC                     |
| `accounting:period_reopen` | Mở lại kỳ kế toán đã đóng                 |

### 3.4 Menu-adjacent (recipes)

| Key                    | Ý nghĩa                                            |
| ---------------------- | -------------------------------------------------- |
| `menu:read`            | Xem công thức + menu items                         |
| `menu:write`           | CRUD `recipes`, `production_recipes`, `menu_items` |
| `menu:manage_category` | Quản lý danh mục                                   |
| `menu:publish`         | Publish thay đổi menu                              |

---

## 4. Template matrix — Permissions per Position

Matrix dưới đây là snapshot template (`role_templates.permission_keys`) mà Auth grant tự động khi assign position:

- `20260423080000_auth_v2_bep_truong_template_fix.sql`
- `20260505094000_inventory_rbac_template_contract_v2.sql`
- `20260705180000_central_kitchen_operator_grants.sql`

Edit template không tự propagate toàn cục. Khi sửa template, quyền của nhân viên cũ chỉ đổi qua thao tác apply/backfill rõ ràng; manual override được giữ lại.

Ghi chú D066 §7a (2026-07-04): position `production_manager` và
`central_kitchen_manager` có template riêng mirror đúng bộ key của
`head_chef`; grant cho role trung tâm (claims tenant-level, `branch_id`
NULL) được ghi thành row tenant-wide trong `staff_permissions` — cả
`apply_template_to_user` lẫn `sync_missing_permissions_from_template` đã xử
lý trường hợp này.

| Permission key                 | owner bypass | branch_manager | warehouse_manager | thu_kho¹ | head_chef |
| ------------------------------ | :----------: | :------------: | :---------------: | :------: | :-------: |
| `inventory:read`               |      ✅      |       ✅       |     ✅     |   ✅    |     ✅     |
| `inventory:write`              |      ✅      |       ✅       |     ✅     |   ✅    |     ❌     |
| `inventory:transfer_create`    |      ✅      |      ✅\*      |     ✅     |   ❌    |     ✅     |
| `inventory:transfer_ship`      |      ✅      |       ❌       |     ✅     |   ❌    |     ✅     |
| `inventory:transfer_receive`   |      ✅      |      ✅\*      |     ✅     |   ✅    |     ✅     |
| `inventory:stocktake_create`   |      ✅      |       ✅       |     ✅     |   ✅    |     ✅     |
| `inventory:stocktake_complete` |      ✅      |       ✅       |     ✅     |   ✅    |     ✅     |
| `inventory:writeoff`           |      ✅      |       ✅       |     ✅     |   ❌    |     ✅     |
| `inventory:production_create`  |      ✅      |       ❌       |     ❌     |   ❌    |     ✅     |
| `inventory:production_confirm` |      ✅      |       ❌       |     ❌     |   ❌    |     ✅     |
| `procurement:read`             |      ✅      |       ❌       |     ✅     |   ❌    |     ✅     |
| `procurement:supplier_manage`  |      ✅      |       ❌       |     ✅     |   ❌    |     ❌     |
| `procurement:po_create`        |      ✅      |       ❌       |     ✅     |   ❌    |     ❌     |
| `procurement:po_approve`       |      ✅      |       ❌       |  ⚠️ held   |   ❌    |     ❌     |
| `procurement:grn_create`       |      ✅      |       ❌       |     ✅     |   ❌    |     ✅     |
| `procurement:grn_confirm`      |      ✅      |       ❌       |     ✅     |   ❌    |     ✅     |
| `procurement:invoice_create`   |      ✅      |       ❌       |  ⚠️ held   |   ❌    |     ❌     |
| `procurement:invoice_match`    |      ✅      |       ❌       |  ⚠️ held   |   ❌    |     ❌     |
| `menu:read`                    |      ✅      |       ✅       |     ❌     |   ❌    |     ✅     |
| `menu:write`                   |      ✅      |       ❌       |     ❌     |   ❌    |     ✅     |

**Legenda:**

- ✅ = có trong template mặc định (hoặc owner bypass)
- ✅\* = key có trong template nhưng runtime/app/RPC giới hạn hướng hoặc branch scope
- ❌ = không trong template
- ⚠️ **held** = cố ý không cấp; việc thuộc owner / accounting
- ¹ template `thu_kho` đã XÓA (migration `20260610230000`, 0 nhân sự); cột giữ lại để đọc grant lịch sử còn trong `staff_permissions` — tuyển thủ kho mới thì tạo position+template mới thuộc bucket `warehouse_manager`

**Contract notes:**

- `branch_manager` không tạo transfer outbound hoặc same-branch transfer; họ nhận inbound về đúng branch và duyệt/apply tiêu hao.
- `branch_manager` giữ `inventory:transfer_receive` chỉ để nhận inbound về đúng branch của mình.
- Multi-branch oversight phải đi qua explicit branch grants hoặc tenant-level permission rõ ràng; không có scope trung gian.
- `head_chef` / `production_manager` sở hữu vòng sản xuất Bếp Trung Tâm: nhận hàng, sản xuất, rồi create/ship transfer thật về Kho CN, và quản trị production recipes.
- Production hard-deny `branch_manager` ở Server Actions, RPC và RLS dù có manual grant production/menu; operator production là `production_manager`, còn `owner` là oversight/emergency access.

---

## 5. Data visibility

| Dữ liệu                               | Quy tắc                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| On-hand quantity (`stock_levels`)     | `inventory:read` cần. Scope theo branch grant. Owner thấy tenant-wide.                   |
| WAC / Average unit cost               | Cùng scope với stock_levels; UI có thể ẩn cho branch-level role nếu use case không cần. |
| Supplier invoice detail               | Cần `procurement:read` + scope branch.                                                  |
| Production BOM (`production_recipes`) | Cần role production operator + `menu:read` (xem) hoặc `menu:write` (CRUD).              |
| Stocktake variance                    | Cùng scope với stocktake\_\* grants.                                                    |
| AP aging                              | Render trong finance/reports, không thuộc Inventory route.                              |

---

## 6. RPC gate status

Inventory RPC chính hiện đã permission-gated:

- `upsert_recipe_lines` → `menu:write`
- `create_production_order` → `inventory:production_create`
- `cancel_production_order` / `confirm_production_order` → `inventory:production_confirm`
- `upsert_production_recipe_lines` → role production operator + `menu:write`
- `create_stock_transfer_draft` → `inventory:transfer_create`
- `stock_transfer_mark_in_transit` → `inventory:transfer_ship`
- `stock_transfer_confirm_receive` / `stock_transfer_receive` → `inventory:transfer_receive`

Production DB contract dùng helper `is_inventory_production_operator()` cho RPC và RLS của `production_recipes`, `production_orders`, `production_order_items`. Vì vậy manual permission grant không cho `branch_manager` bypass qua direct RPC hoặc PostgREST.

Một số RPC vẫn dùng `auth_role()` như guard phụ:

- Transfer RPC vẫn kiểm tra role để khóa hướng vận hành: `branch_manager` chỉ nhận inbound, `warehouse_manager` và `production_manager` chỉ thao tác trên site của mình khi là role branch-scoped.
- `stock_transfer_list_branches()` còn là helper role-whitelist, nhưng whitelist đã gồm `warehouse_manager` và `production_manager`; route vẫn đi qua module ACL.
- Non-Inventory RPC legacy không còn là blocker của Inventory contract và không được xem là source of truth cho Inventory action authz.

---

## 7. Open Questions / Known Drift

1. **Template drift** — closed by `20260505094000_inventory_rbac_template_contract_v2.sql`: add missing chi nhánh transfer grants for `head_chef`, remove procurement keys from `branch_manager`, and keep manual overrides reviewable.
2. **Intermediate scope** — Multi-branch access is explicit branch grants or tenant-level permission only.
3. **Held permissions của warehouse_manager** (`po_approve`, `invoice_*`) — cố ý để owner / accounting. Document không ghi là thiếu quyền.
4. **Manual permission overrides** — migration contract chỉ expire grant có `source_template` trỏ tới template hệ thống hiện tại. Grant thủ công phải review bằng admin/audit flow nếu muốn thu hồi.

---

## 8. Tài liệu liên quan

- [inventory.md](inventory.md) — business rules nghiệp vụ
- [inventory-sop.md](inventory-sop.md) — Standard Operating Procedure
- [auth.md](../modules/auth.md) — Auth architecture
- [permissions.ts](../../packages/shared/src/auth/permissions.ts) — permission catalog source
- [module-acl.ts](../../packages/shared/src/auth/module-acl.ts) — route-level ACL source
