# Inventory RBAC Matrix — Auth v2

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

| Khái niệm | Ý nghĩa | Nằm ở |
| --- | --- | --- |
| **Permission key** | Chuỗi hành động canonical (vd `inventory:production_create`). Là đơn vị authz nhỏ nhất. | `permission_keys` catalog + `permissions.ts` |
| **Position** | Chức vụ HR (vd `bep_truong` = Bếp trưởng). **Không** gate authz trực tiếp. | `positions` (per tenant), `profiles.position_id` |
| **Template** | Bundle permission preset gắn với 1 position. Snapshot — edit template không propagate. | `role_templates(position_code, permission_keys[])` |
| **Grant** | Quyền thật của user tại branch cụ thể, dạng (user, branch, key). `branch_id IS NULL` = tenant-wide. | `staff_permissions` |
| **Legacy role** | `user_role` claim còn ở JWT, derived từ `positions.legacy_role_code`. Phục vụ route-level ACL + 17 RPC chưa migrate. | `module-acl.ts`, `auth_role()` helper |

**Authz path cho mỗi Inventory request:**

1. `proxy.ts` check route-level qua `canAccess(user_role, module)` — fast gate.
2. Server action (`apps/web/app/inventory/*-actions.ts`) check permission qua `currentUserHasPermission(key)` — domain gate.
3. RLS policy trên table dùng `has_permission(branch_id, key)` — row gate.
4. RPC body (SECURITY DEFINER) thực thi logic + check role/permission nội bộ.

> **Phase 2-RPC còn legacy:** 17 RPC còn gọi `auth_role()` trong body (xem §6). Fix đang plan, không phải bug về RLS.

---

## 2. Positions liên quan Inventory (Cơm Tấm Má Tư — tenant_id=1)

| Position code | Label VI | `legacy_role_code` | Scope vận hành mặc định |
| ------------- | -------- | ------------------ | ----------------------- |
| `chu_so_huu` | Chủ sở hữu | `owner` | Tenant-wide bypass (owner bypass trong `has_permission()`) |
| `quan_ly_tong` | Quản lý tổng | `super_manager` | Tenant-wide operations + procurement |
| `quan_ly_khu_vuc` | Quản lý khu vực | `area_manager` | Branches thuộc area (qua per-branch grants) |
| `quan_ly_cn` | Quản lý chi nhánh | `branch_manager` | Branch của mình |
| `kho_truong` | Kho trưởng | `warehouse_manager` | Kho Tổng / CW (procurement + outbound transfer) |
| `thu_kho` | Thủ kho | `warehouse_manager` | Staff-level warehouse (nhận hàng + stocktake) |
| `bep_truong` | Bếp trưởng | `production_manager` | Bếp trung tâm (sản xuất + KDS) |

> Các position POS/KDS (`thu_ngan`, `phuc_vu`, `dau_bep`) không có Inventory grant mặc định; chỉ tác động tồn kho gián tiếp qua consumption flow.

---

## 3. Permission keys cho Inventory

### 3.1 Inventory module

| Key | Ý nghĩa |
| --- | --- |
| `inventory:read` | Xem tồn kho, movement, alerts |
| `inventory:write` | Cập nhật catalog nguyên liệu, adjust tồn |
| `inventory:transfer_create` | Tạo phiếu luân chuyển nội bộ (draft) |
| `inventory:transfer_ship` | Confirm xuất kho (ship) của phiếu luân chuyển |
| `inventory:transfer_receive` | Confirm nhận hàng tại điểm đến |
| `inventory:stocktake_create` | Mở phiên kiểm kê |
| `inventory:stocktake_complete` | Đóng phiên kiểm kê + post adjustments |
| `inventory:writeoff` | Ghi hao hụt / waste / hết hạn |
| `inventory:production_create` | Tạo lệnh sản xuất (bếp trung tâm) |
| `inventory:production_confirm` | Confirm hoàn thành lệnh sản xuất |

### 3.2 Procurement module (`inventory_procurement`)

| Key | Ý nghĩa |
| --- | --- |
| `procurement:read` | Xem PO, GRN, NCC, hoá đơn mua |
| `procurement:supplier_manage` | CRUD nhà cung cấp |
| `procurement:po_create` | Tạo Purchase Order |
| `procurement:po_approve` | Duyệt PO (thả ra cho NCC) |
| `procurement:grn_create` | Tạo phiếu nhập kho draft |
| `procurement:grn_confirm` | Xác nhận GRN → cập nhật tồn |
| `procurement:invoice_create` | Nhập hoá đơn NCC |
| `procurement:invoice_match` | 3-way matching PO ↔ GRN ↔ Invoice |

### 3.3 Menu-adjacent (recipes)

| Key | Ý nghĩa |
| --- | --- |
| `menu:read` | Xem công thức + menu items |
| `menu:write` | CRUD `recipes`, `production_recipes`, `menu_items` |
| `menu:manage_category` | Quản lý danh mục |
| `menu:publish` | Publish thay đổi menu |

---

## 4. Template matrix — Permissions per Position

Matrix dưới đây là snapshot template (`role_templates.permission_keys`) mà Auth v2 grant tự động khi assign position. Edit template KHÔNG propagate; dùng `sync_missing_permissions_from_template()` để refresh.

| Permission key | owner bypass | super_manager | area_manager | branch_manager | kho_truong | thu_kho | bep_truong |
| -------------- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `inventory:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `inventory:write` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ gap |
| `inventory:transfer_create` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ gap |
| `inventory:transfer_ship` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `inventory:transfer_receive` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `inventory:stocktake_create` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `inventory:stocktake_complete` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `inventory:writeoff` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `inventory:production_create` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `inventory:production_confirm` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `procurement:read` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ⚠️ gap |
| `procurement:supplier_manage` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `procurement:po_create` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `procurement:po_approve` | ✅ | ✅ | ❌ | ❌ | ⚠️ held | ❌ | ❌ |
| `procurement:grn_create` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `procurement:grn_confirm` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `procurement:invoice_create` | ✅ | ✅ | ❌ | ❌ | ⚠️ held | ❌ | ❌ |
| `procurement:invoice_match` | ✅ | ✅ | ❌ | ❌ | ⚠️ held | ❌ | ❌ |
| `menu:read` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `menu:write` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ gap |

**Legenda:**

- ✅ = có trong template mặc định (hoặc owner bypass)
- ❌ = không trong template
- ⚠️ **gap** = cần thêm nhưng template hiện tại thiếu, fix scheduled (xem §7)
- ⚠️ **held** = cố ý không cấp; việc thuộc super_manager / accounting

**Known gaps — template `bep_truong` cần bổ sung (scheduled fix):**

- `menu:write` — Bếp trưởng cần CRUD `production_recipes`. RLS require `has_permission_any('menu:write')`.
- `inventory:transfer_create` — Bếp trưởng cần tạo phiếu ship thành phẩm CK → chi nhánh.
- `procurement:read` — Bếp trưởng cần xem PO/GRN để biết nguyên liệu sắp về.

---

## 5. Data visibility

| Dữ liệu | Quy tắc |
| ------- | ------- |
| On-hand quantity (`stock_levels`) | `inventory:read` cần. Scope theo branch grant. Owner + super_manager thấy tenant-wide. |
| WAC / Average unit cost | Cùng scope với stock_levels; UI có thể ẩn cho branch-level role nếu use case không cần. |
| Supplier invoice detail | Cần `procurement:read` + scope branch. |
| Production BOM (`production_recipes`) | Cần `menu:read` (xem) hoặc `menu:write` (CRUD). |
| Stocktake variance | Cùng scope với stocktake_* grants. |
| AP aging | Render trong finance/reports, không thuộc Inventory route. |

---

## 6. Hidden legacy surface — 17 RPC còn `auth_role()`

Các SECURITY DEFINER RPC dưới đây bỏ qua RLS nhưng **vẫn check role legacy trong body**. User có permission grant đúng nhưng role không thuộc whitelist sẽ bị RPC reject:

```
admin_update_profile, bump_kds_ticket, can_access_branch,
cancel_production_order, close_fiscal_period, confirm_production_order,
create_production_order, create_stock_transfer_draft, create_stocktake_session,
create_supplier_payment, gl_reconciliation, post_payroll_journal,
recall_kds_ticket, set_branch_kind, stock_transfer_list_branches,
toggle_profile_active, upsert_recipe_lines
```

**Tác động Inventory:**

- `create_production_order`, `confirm_production_order`, `cancel_production_order`, `upsert_recipe_lines`: bếp trưởng bị reject dù có `inventory:production_create`.
- `create_stock_transfer_draft`, `stock_transfer_list_branches`: kho trưởng / bếp trưởng có thể không list được branches đích để tạo phiếu.
- `create_stocktake_session`: ảnh hưởng kho trưởng / thủ kho nếu role không match legacy whitelist.

Phase 2-RPC cutover là P0 tiếp theo. Khi đó whitelist body sẽ thay bằng `IF has_permission(p_branch, '<key>') ...`.

---

## 7. Open Questions / Known Drift

1. **Template `bep_truong` thiếu 3 key** (§4) — đã confirm cần fix. Migration kèm `sync_missing_permissions_from_template` re-grant.
2. **Server action `production-actions.ts:10`** — `PRODUCTION_ROLES = ["super_manager"]` hardcoded. Migrate sang `currentUserHasPermission("inventory:production_create")`.
3. **H3 area scoping** — docs cũ ghi DEFERRED; Auth v2 đã giải qua per-branch grants (backfilled từ `area_branches`). Treat là SHIPPED-VIA-AUTH-V2.
4. **Held permissions của kho_truong** (`po_approve`, `invoice_*`) — cố ý để super_manager / kế toán. Document không ghi là gap.

---

## 8. Tài liệu liên quan

- [inventory.md](inventory.md) — business rules nghiệp vụ
- [inventory-sop.md](inventory-sop.md) — Standard Operating Procedure
- [inventory-branch-kitchen-model.md](../plan/inventory-branch-kitchen-model.md) — pilot contract cho Kho ↔ Bếp model
- [auth.md](../modules/auth.md) — Auth v2 architecture
- [permissions.ts](../../packages/shared/src/auth/permissions.ts) — permission catalog source
- [module-acl.ts](../../packages/shared/src/auth/module-acl.ts) — route-level ACL source
