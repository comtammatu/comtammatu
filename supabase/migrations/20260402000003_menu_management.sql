-- =============================================================
-- Sprint 1 S4: Menu Management
-- Tables: menu_categories, menu_items, menu_item_variants,
--         menu_item_modifiers, menu_item_available_sides
-- =============================================================

-- ========================
-- 1. menu_categories
-- ========================
CREATE TABLE public.menu_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'main_dish'
    CHECK (type IN ('main_dish', 'side_dish', 'drink', 'dessert')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);

CREATE INDEX idx_menu_categories_tenant ON public.menu_categories(tenant_id);

CREATE TRIGGER trg_menu_categories_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.menu_categories
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_update" ON public.menu_categories
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.menu_categories
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_categories TO authenticated;

-- ========================
-- 2. menu_items
-- ========================
CREATE TABLE public.menu_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(15,2) NOT NULL,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, tenant_id)
);

CREATE INDEX idx_menu_items_tenant ON public.menu_items(tenant_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.menu_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_update" ON public.menu_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.menu_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;

-- ========================
-- 3. menu_item_variants
-- ========================
CREATE TABLE public.menu_item_variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_adjustment NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, item_id, tenant_id)
);

CREATE INDEX idx_menu_item_variants_item ON public.menu_item_variants(item_id);

CREATE TRIGGER trg_menu_item_variants_updated_at
  BEFORE UPDATE ON public.menu_item_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.menu_item_variants
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.menu_item_variants
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_update" ON public.menu_item_variants
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.menu_item_variants
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_item_variants TO authenticated;

-- ========================
-- 4. menu_item_modifiers
-- ========================
CREATE TABLE public.menu_item_modifiers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, item_id, tenant_id)
);

CREATE INDEX idx_menu_item_modifiers_item ON public.menu_item_modifiers(item_id);

CREATE TRIGGER trg_menu_item_modifiers_updated_at
  BEFORE UPDATE ON public.menu_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.menu_item_modifiers
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.menu_item_modifiers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_update" ON public.menu_item_modifiers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.menu_item_modifiers
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_item_modifiers TO authenticated;

-- ========================
-- 5. menu_item_available_sides
-- ========================
CREATE TABLE public.menu_item_available_sides (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  main_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  side_item_id BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(main_item_id, side_item_id, tenant_id)
);

CREATE INDEX idx_menu_item_available_sides_main ON public.menu_item_available_sides(main_item_id);
CREATE INDEX idx_menu_item_available_sides_side ON public.menu_item_available_sides(side_item_id);

ALTER TABLE public.menu_item_available_sides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.menu_item_available_sides
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "manager_insert" ON public.menu_item_available_sides
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "manager_delete" ON public.menu_item_available_sides
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_item_available_sides TO authenticated;
