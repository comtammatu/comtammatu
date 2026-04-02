-- Sprint 1: Menu schema
-- menu_categories → menu_items → variants, modifiers, available_sides

-- ─── Categories ───

CREATE TABLE public.menu_categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, tenant_id)
);

CREATE INDEX idx_menu_categories_tenant ON public.menu_categories(tenant_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Items ───

CREATE TABLE public.menu_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id   BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  base_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, tenant_id)
);

CREATE INDEX idx_menu_items_tenant ON public.menu_items(tenant_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Variants (e.g. size: S/M/L) ───

CREATE TABLE public.menu_item_variants (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id      BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  price_adjustment  NUMERIC(15,2) NOT NULL DEFAULT 0,
  sort_order        INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, menu_item_id, tenant_id)
);

CREATE INDEX idx_menu_item_variants_item ON public.menu_item_variants(menu_item_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.menu_item_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Modifiers (e.g. extra egg, extra sauce) ───

CREATE TABLE public.menu_item_modifiers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id  BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  price         NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, menu_item_id, tenant_id)
);

CREATE INDEX idx_menu_item_modifiers_item ON public.menu_item_modifiers(menu_item_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.menu_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Available Sides (links item → side item from menu_items) ───

CREATE TABLE public.menu_item_available_sides (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  menu_item_id  BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  side_item_id  BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (menu_item_id, side_item_id, tenant_id)
);

CREATE INDEX idx_menu_item_sides_item ON public.menu_item_available_sides(menu_item_id);

-- ─── RLS for all menu tables ───

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_available_sides ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation
CREATE POLICY "Tenant isolation" ON public.menu_categories
  FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "Tenant isolation" ON public.menu_items
  FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "Tenant isolation" ON public.menu_item_variants
  FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "Tenant isolation" ON public.menu_item_modifiers
  FOR SELECT USING (tenant_id = auth_tenant_id());
CREATE POLICY "Tenant isolation" ON public.menu_item_available_sides
  FOR SELECT USING (tenant_id = auth_tenant_id());

-- ALL: managers can manage menu
CREATE POLICY "Managers can manage" ON public.menu_categories
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );
CREATE POLICY "Managers can manage" ON public.menu_items
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );
CREATE POLICY "Managers can manage" ON public.menu_item_variants
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );
CREATE POLICY "Managers can manage" ON public.menu_item_modifiers
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );
CREATE POLICY "Managers can manage" ON public.menu_item_available_sides
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_modifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_available_sides TO authenticated;
