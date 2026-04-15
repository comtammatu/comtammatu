# Sprint 1: Khung quản trị + Menu + Tables + Staff ✅ SHIPPED

> **Module mapping:** M0 (Khung quản trị) + M1 (Menu) — see `roadmap.md`
> Depends on: v0.1.0 Foundation (done)
> Sessions: 6 | Hoàn thành: 2026-04-03

---

## Goal

Xây dựng admin interface hoàn chỉnh: sidebar navigation, quản lý chi nhánh, nhân viên, thực đơn, bàn. Sau sprint này, owner/manager có thể setup toàn bộ data cần thiết cho chi nhánh trước khi bật POS.

---

## Schema

### menu_categories

```sql
CREATE TABLE public.menu_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug, tenant_id)
);
```

### menu_items

```sql
CREATE TABLE public.menu_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(15,2) NOT NULL CHECK (base_price > 0),
  image_url TEXT,
  prep_time_min INT CHECK (prep_time_min IS NULL OR prep_time_min >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);
```

### menu_item_variants

```sql
CREATE TABLE public.menu_item_variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Sườn nướng lớn", "Sườn nướng nhỏ"
  price_adjustment NUMERIC(15,2) NOT NULL DEFAULT 0,  -- +10000, -5000, 0
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, name)
);
```

### menu_item_modifiers

```sql
CREATE TABLE public.menu_item_modifiers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Thêm trứng ốp la", "Thêm chả"
  price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, name)
);
```

### system_settings

```sql
CREATE TABLE public.system_settings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                      -- 'vat_rate', 'service_charge', 'store_phone'
  value TEXT NOT NULL,                    -- '8', '5', '0901234567'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(key, tenant_id)
);
```

### menu_item_available_sides

```sql
-- Core domain: cơm tấm = chọn sides (sườn nướng, bì, chả, trứng ốp la, đồ chua)
-- Sides khác modifiers: sides là phần chính của món, modifiers là thêm
CREATE TABLE public.menu_item_available_sides (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  side_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,  -- Side mặc định (đã included trong giá)
  price_override NUMERIC(15,2),               -- NULL = dùng side_item.base_price
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(menu_item_id, side_item_id)
);
```

### branch_zones

```sql
CREATE TABLE public.branch_zones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Tầng 1", "Sân vườn", "VIP"
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name)
);
```

### tables

```sql
CREATE TABLE public.tables (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  zone_id BIGINT REFERENCES public.branch_zones(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number INT NOT NULL,                   -- Số bàn: 1, 2, 3...
  capacity INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, number)
);
```

### RLS (tất cả tables trên)

```sql
-- Pattern cho mỗi table:
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant-scoped
CREATE POLICY "tenant_select" ON public.<table>
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- INSERT/UPDATE/DELETE: owner + super_manager + area_manager + branch_manager
CREATE POLICY "manager_write" ON public.<table>
  FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner','super_manager','area_manager','branch_manager'))
  WITH CHECK (tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner','super_manager','area_manager','branch_manager'));

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<table> TO authenticated;
```

---

## Sessions

### S1: Admin Layout + Sidebar

**Files:**

- `apps/web/app/(admin)/layout.tsx` — rewrite with proper sidebar
- `apps/web/app/(admin)/components/sidebar.tsx` — role-filtered nav
- `apps/web/app/(admin)/components/header.tsx` — user info + logout
- `packages/shared/src/auth/nav-config.ts` — sidebar items from MODULE_ACL

**Acceptance Criteria:**

- [ ] Sidebar hiển thị modules theo role (owner thấy tất cả, branch_manager thấy subset)
- [ ] Active route highlighted
- [ ] User name + role hiển thị ở header
- [ ] Logout button hoạt động
- [ ] Responsive: sidebar collapse trên mobile
- [ ] `pnpm typecheck && pnpm build` pass

### S2: Branch CRUD + System Settings

**Migration:** `20260402000002_system_settings.sql`

**Files:**

- `apps/web/app/(admin)/settings/branches/page.tsx` — list
- `apps/web/app/(admin)/settings/branches/[branchId]/page.tsx` — edit
- `apps/web/app/(admin)/settings/branches/actions.ts` — Server Actions
- `apps/web/app/(admin)/settings/general/page.tsx` — system settings
- `apps/web/app/(admin)/settings/general/actions.ts`

**Schema:** Dùng existing `branches` + new `system_settings` table

**Acceptance Criteria:**

- [ ] Liệt kê branches của tenant
- [ ] Tạo branch mới (name, address, phone)
- [ ] Edit branch details
- [ ] Toggle is_active
- [ ] Set headquarters flag
- [ ] System settings CRUD (VAT rate, service charge %, store name, phone)
- [ ] Settings constants defined in `@comtammatu/shared` (không hardcode key strings)
- [ ] Zod validation cho tất cả inputs
- [ ] Safe error responses (không leak DB errors)

### S3: Staff Management

**Files:**

- `apps/web/app/(admin)/staff/page.tsx` — list + filter by branch/role
- `apps/web/app/(admin)/staff/[staffId]/page.tsx` — edit
- `apps/web/app/(admin)/staff/actions.ts` — CRUD actions

**Schema:** Dùng existing `profiles` table từ v0.1.0

**Acceptance Criteria:**

- [ ] Liệt kê staff, filter by branch + role
- [ ] Invite staff (tạo Supabase auth user + profile)
- [ ] Assign staff vào branch
- [ ] Change role
- [ ] Deactivate/reactivate staff
- [ ] Owner thấy tất cả staff; branch_manager chỉ thấy branch mình

### S4: Menu CRUD

**Migration:** `20260402000000_menu_tables.sql` — tạo 5 tables (categories, items, variants, modifiers, available_sides)

**Files:**

- `apps/web/app/(admin)/menu/page.tsx` — categories + items
- `apps/web/app/(admin)/menu/[itemId]/page.tsx` — edit item + variants + modifiers + sides
- `apps/web/app/(admin)/menu/actions.ts` — CRUD actions

**Acceptance Criteria:**

- [ ] CRUD menu_categories (tên, sort order, toggle active)
- [ ] CRUD menu_items (tên, giá, mô tả, ảnh, prep time, toggle available)
- [ ] CRUD variants per item (tên, price adjustment)
- [ ] CRUD modifiers per item (tên, giá)
- [ ] **Sides management**: assign sides cho combo items (cơm tấm đặc biệt → sườn, bì, chả, ốp la)
- [ ] Sides: mark default (included in price) vs add-on (extra cost)
- [ ] Drag-and-drop sort order (hoặc manual sort_order)
- [ ] Filter items by category
- [ ] Search items by name

### S5: Tables & Zones

**Migration:** `20260402000001_tables_zones.sql` — tạo 2 tables

**Files:**

- `apps/web/app/(admin)/settings/tables/page.tsx` — zones + tables per branch
- `apps/web/app/(admin)/settings/tables/actions.ts`

**Acceptance Criteria:**

- [ ] CRUD zones per branch
- [ ] CRUD tables per zone (number, capacity)
- [ ] Table status display (available/occupied/reserved/maintenance)
- [ ] Filter by branch (cho manager quản lý nhiều branches)

---

## Definition of Done

- [ ] Tất cả 5 CRUD modules hoạt động
- [ ] RLS policies đúng cho mọi role
- [ ] `pnpm typecheck && pnpm build` pass
- [ ] `/review` pass — không vi phạm regression rules
- [ ] Owner login → thấy full sidebar → CRUD tất cả → data persist
- [ ] Branch_manager login → thấy subset sidebar → chỉ thấy data branch mình
