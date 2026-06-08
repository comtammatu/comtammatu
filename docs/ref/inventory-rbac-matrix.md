# Inventory RBAC Matrix — Auth v2

> ## ⚠️ LEAN HKD REFRAME (2026-06) — đọc trước
>
> Ma trận bên dưới dùng các role cũ (`super_manager`, `area_manager`, `branch_manager`, `warehouse_manager`, `production_manager`) cho mô hình multi-warehouse **đã CUT**. Lean Hộ Kinh Doanh chỉ còn **4 role**: `owner`, `manager`, `staff`, `chef`. Quyền inventory-lean: `owner`/`manager` vào toàn bộ kho-lean (ingredients, suppliers, GRN, stock, stocktake, alert, reports, công nợ NCC); `staff`/`chef` không có route inventory theo ACL. Cơ chế Position ⟂ Permission (staff_permissions + `has_permission()`) không đổi — chỉ tập role thu hẹp. Bỏ qua các dòng procurement/production/transfer đã CUT.

> Canonical access contract cho Inventory surfaces, viết theo model **Position ⟂ Permission** (Auth v2).
>
> Source of truth:
>
> - **Route-level ACL:** `packages/shared/src/auth/module-acl.ts` (gate nhanh theo `user_role` legacy claim)
> - **Row-level authz:** `staff_permissions(user_id, branch_id, permission_key)` + `has_permission()` / `has_permission_any()`
> - **Permission catalog:** `packages/shared/src/auth/permissions.ts`
> - **Position + template seed:** `positions`, `role_templates` tables (per tenant)
>
> Docs này chốt **business actions** của Inventory theo permission key và position template. Không đặt thuật ngữ mới; mọi drift với code sẽ thua source of truth ở trên.

---

## 1. Mô hình Auth v2 (tóm tắt cho Inventory)

| Khái niệm          | Ý nghĩa                                                                                                                                       | Nằm ở                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Permission key** | Chuỗi hành động canonical (vd `inventory:production_create`). Là đơn vị authz nhỏ nhất.                                                       | `permission_keys` catalog + `permissions.ts`       |
| **Position**       | Chức vụ HR (vd `bep_truong` = Bếp trưởng). **Không** gate authz trực tiếp.                                                                    | `positions` (per tenant), `profiles.position_id`   |
| **Template**       | Bundle permission preset gắn với 1 position. Snapshot — edit template không propagate.                                                        | `role_templates(position_code, permission_keys[])` |
| **Grant**          | Quyền thật của user tại branch cụ thể, dạng (user, branch, key). `branch_id IS NULL` = tenant-wide.                                           | `staff_permissions`                                |
| **Legacy role**    | `user_role` claim còn ở JWT, derived từ `positions.legacy_role_code`. Phục vụ route-level ACL và một số role-scope guard còn chủ ý trong RPC. | `module-acl.ts`, `auth_role()` helper              |

**Authz path cho mỗi Inventory request:**

1. `proxy.ts` check route-level qua `canAccess(user_role, module)` — fast gate.
2. Server action (`apps/web/app/(protected)/inventory/*-actions.ts`) check permission qua `currentUserHasPermission(key)` — domain gate.
3. RLS policy trên table dùng `has_permission(branch_id, key)` — row gate.
4. RPC body (SECURITY DEFINER) thực thi logic + check role/permission nội bộ.

> **Phase 2-RPC status:** Inventory mutating RPC chính đã chuyển sang permission gate; phần `auth_role()` còn lại là route/side/scope guard hoặc legacy helper (xem §6).

---

## 2. Positions liên quan Inventory (Cơm Tấm Má Tư — tenant_id=1)

| Position code   | Label VI           | `legacy_role_code`   | Scope vận hành mặc định                                    |
| --------------- | ------------------ | -------------------- | ---------------------------------------------------------- |
| `owner`         | Chủ sở hữu         | `owner`              | Tenant-wide bypass (owner bypass trong `has_permission()`) |
| `super_manager` | Giám đốc điều hành | `super_manager`      | Tenant-wide operations + procurement                       |
| `quan_ly_vung`  | Quản lý khu vực    | `area_manager`       | Branches thuộc area (qua per-branch grants)                |
| `quan_ly_CN`    | Quản lý chi nhánh  | `branch_manager`     | Branch của mình                                            |
| `kho_truong`    | Kho trưởng         | `warehouse_manager`  | Kho Tổng / CW (procurement + outbound transfer)            |
| `thu_kho`       | Thủ kho            | `warehouse_manager`  | Staff-level warehouse (nhận hàng + stocktake)              |
| `bep_truong`    | Bếp trưởng         | `production_manager` | Bếp trung tâm (sản xuất + KDS)                             |

> Các position POS/KDS (`cashier`, `waiter`, `chef`, `phu_bep`) không có Inventory grant mặc định; chỉ tác động tồn kho gián tiếp qua consumption flow.

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
| `inventory:production_create`  | Tạo lệnh sản xuất (bếp trung tâm)             |
| `inventory:production_confirm` | Confirm hoàn thành lệnh sản xuất              |

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

### 3.3 Menu-adjacent (recipes)

| Key                    | Ý nghĩa                                            |
| ---------------------- | -------------------------------------------------- |
| `menu:read`            | Xem công thức + menu items                         |
| `menu:write`           | CRUD `recipes`, `production_recipes`, `menu_items` |
| `menu:manage_category` | Quản lý danh mục                                   |
| `menu:publish`         | Publish thay đổi menu                              |

---

## 4. Template matrix — Permissions per Position

Matrix dưới đây là snapshot template (`role_templates.permission_keys`) mà Auth v2 grant tự động khi assign position, sau các migration contract Inventory v2:

- `20260423080000_auth_v2_bep_truong_template_fix.sql`
- `20260505094000_inventory_rbac_template_contract_v2.sql`

Edit template không tự propagate toàn cục. Migration contract v2 backfill grant còn thiếu cho `bep_truong` và expire grant template-derived đã bị remove khỏi `quan_ly_CN` / `quan_ly_vung`; manual override được giữ lại.

| Permission key                 | owner bypass | super_manager | area_manager | branch_manager | kho_truong | thu_kho | bep_truong |
| ------------------------------ | :----------: | :-----------: | :----------: | :------------: | :--------: | :-----: | :--------: |
| `inventory:read`               |      ✅      |      ✅       |      ✅      |       ✅       |     ✅     |   ✅    |     ✅     |
| `inventory:write`              |      ✅      |      ✅       |      ✅      |       ✅       |     ✅     |   ✅    |     ❌     |
| `inventory:transfer_create`    |      ✅      |      ✅       |      ❌      |      ✅\*      |     ✅     |   ❌    |     ✅     |
| `inventory:transfer_ship`      |      ✅      |      ✅       |      ❌      |       ❌       |     ✅     |   ❌    |     ✅     |
| `inventory:transfer_receive`   |      ✅      |      ✅       |      ❌      |      ✅\*      |     ✅     |   ✅    |     ✅     |
| `inventory:stocktake_create`   |      ✅      |      ✅       |      ✅      |       ✅       |     ✅     |   ✅    |     ❌     |
| `inventory:stocktake_complete` |      ✅      |      ✅       |      ✅      |       ✅       |     ✅     |   ✅    |     ❌     |
| `inventory:writeoff`           |      ✅      |      ✅       |      ✅      |       ✅       |     ✅     |   ❌    |     ❌     |
| `inventory:production_create`  |      ✅      |      ✅       |      ❌      |       ❌       |     ❌     |   ❌    |     ✅     |
| `inventory:production_confirm` |      ✅      |      ✅       |      ❌      |       ❌       |     ❌     |   ❌    |     ✅     |
| `procurement:read`             |      ✅      |      ✅       |      ❌      |       ❌       |     ✅     |   ❌    |     ✅     |
| `procurement:supplier_manage`  |      ✅      |      ✅       |      ❌      |       ❌       |     ✅     |   ❌    |     ❌     |
| `procurement:po_create`        |      ✅      |      ✅       |      ❌      |       ❌       |     ✅     |   ❌    |     ❌     |
| `procurement:po_approve`       |      ✅      |      ✅       |      ❌      |       ❌       |  ⚠️ held   |   ❌    |     ❌     |
| `procurement:grn_create`       |      ✅      |      ✅       |      ❌      |       ❌       |     ✅     |   ❌    |     ❌     |
| `procurement:grn_confirm`      |      ✅      |      ✅       |      ❌      |       ❌       |     ✅     |   ❌    |     ❌     |
| `procurement:invoice_create`   |      ✅      |      ✅       |      ❌      |       ❌       |  ⚠️ held   |   ❌    |     ❌     |
| `procurement:invoice_match`    |      ✅      |      ✅       |      ❌      |       ❌       |  ⚠️ held   |   ❌    |     ❌     |
| `menu:read`                    |      ✅      |      ✅       |      ✅      |       ✅       |     ❌     |   ❌    |     ✅     |
| `menu:write`                   |      ✅      |      ✅       |      ❌      |       ❌       |     ❌     |   ❌    |     ✅     |

**Legenda:**

- ✅ = có trong template mặc định (hoặc owner bypass)
- ✅\* = key có trong template nhưng runtime/app/RPC giới hạn hướng hoặc branch scope
- ❌ = không trong template
- ⚠️ **held** = cố ý không cấp; việc thuộc super_manager / accounting

**Contract notes:**

- `branch_manager` giữ `inventory:transfer_create` chỉ để commit one-step intra-branch `Cấp bếp`; không được tạo/ship inter-site outbound.
- `branch_manager` giữ `inventory:transfer_receive` chỉ để nhận inbound về đúng branch của mình.
- `area_manager` là oversight/review, không phải daily transfer/procurement operator.
- `bep_truong` / `production_manager` sở hữu vòng CK: receive CW → CK, create/ship CK → branch, và quản trị production recipes.
- Production hard-deny `area_manager` và `branch_manager` ở Server Actions, RPC và RLS dù có manual grant production/menu; operator production là `super_manager` / `production_manager`, còn `owner` là oversight/emergency access.

---

## 5. Data visibility

| Dữ liệu                               | Quy tắc                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| On-hand quantity (`stock_levels`)     | `inventory:read` cần. Scope theo branch grant. Owner + super_manager thấy tenant-wide.  |
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

Production DB contract dùng helper `is_inventory_production_operator()` cho RPC và RLS của `production_recipes`, `production_orders`, `production_order_items`. Vì vậy manual permission grant không cho `area_manager` / `branch_manager` bypass qua direct RPC hoặc PostgREST.

Một số RPC vẫn dùng `auth_role()` như guard phụ:

- Transfer RPC vẫn kiểm tra role để khóa hướng vận hành: `branch_manager` chỉ nhận inbound / commit `Cấp bếp`, `warehouse_manager` và `production_manager` chỉ thao tác trên branch của mình khi là role branch-scoped.
- `stock_transfer_list_branches()` còn là helper role-whitelist, nhưng whitelist đã gồm `warehouse_manager` và `production_manager`; route vẫn đi qua module ACL.
- Non-Inventory RPC legacy không còn là blocker của Inventory contract v2 và không được xem là source of truth cho Inventory action authz.

---

## 7. Open Questions / Known Drift

1. **Template drift Inventory v1/v2** — closed by `20260505094000_inventory_rbac_template_contract_v2.sql`: add missing CK transfer grants for `bep_truong`, remove procurement keys from `quan_ly_CN`, remove transfer/procurement operator keys from `quan_ly_vung`.
2. **H3 area scoping** — docs cũ ghi DEFERRED; Auth v2 đã giải qua per-branch grants (backfilled từ `area_branches`). Treat là SHIPPED-VIA-AUTH-V2.
3. **Held permissions của kho_truong** (`po_approve`, `invoice_*`) — cố ý để super_manager / accounting. Document không ghi là thiếu quyền.
4. **Manual permission overrides** — migration contract v2 chỉ expire grant có `source_template` trỏ tới template hệ thống hiện tại. Grant thủ công phải review bằng admin/audit flow nếu muốn thu hồi.

---

## 8. Tài liệu liên quan

- [inventory.md](inventory.md) — business rules nghiệp vụ
- [inventory-sop.md](inventory-sop.md) — Standard Operating Procedure
- [auth.md](../modules/auth.md) — Auth v2 architecture
- [permissions.ts](../../packages/shared/src/auth/permissions.ts) — permission catalog source
- [module-acl.ts](../../packages/shared/src/auth/module-acl.ts) — route-level ACL source
