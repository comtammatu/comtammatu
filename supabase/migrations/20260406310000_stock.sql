-- =============================================================
-- M5 Stock MVP: ingredients, stock_levels, stock_movements
-- Per-branch inventory. Trigger auto-updates stock_levels.
-- =============================================================

-- ─── ingredients ───

CREATE TABLE public.ingredients (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  sku              TEXT,
  unit             TEXT NOT NULL,              -- 'g', 'ml', 'cái', 'kg', 'lít'
  unit_cost        NUMERIC(15,2),
  category         TEXT,                       -- 'meat', 'vegetable', 'seasoning', 'beverage'
  min_stock_level  NUMERIC(15,3) NOT NULL DEFAULT 0,
  max_stock_level  NUMERIC(15,3),
  reorder_point    NUMERIC(15,3),
  storage_type     TEXT NOT NULL DEFAULT 'ambient' CHECK (storage_type IN ('ambient', 'refrigerated', 'frozen')),
  shelf_life_days  INT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(sku, tenant_id),
  UNIQUE(name, tenant_id)
);

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_ingredients_tenant ON public.ingredients(tenant_id);
CREATE INDEX idx_ingredients_category ON public.ingredients(tenant_id, category);

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_select" ON public.ingredients
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "ingredients_manage" ON public.ingredients
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingredients TO authenticated;


-- ─── stock_levels ───

CREATE TABLE public.stock_levels (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_id     BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  current_quantity  NUMERIC(15,3) NOT NULL DEFAULT 0,
  last_counted_at   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(ingredient_id, branch_id, tenant_id)
);

CREATE TRIGGER trg_stock_levels_updated_at
  BEFORE UPDATE ON public.stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_stock_levels_tenant ON public.stock_levels(tenant_id);
CREATE INDEX idx_stock_levels_branch ON public.stock_levels(branch_id);
CREATE INDEX idx_stock_levels_ingredient ON public.stock_levels(ingredient_id);

ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_levels_select" ON public.stock_levels
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "stock_levels_manage" ON public.stock_levels
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.stock_levels TO authenticated;


-- ─── stock_movements ───

CREATE TABLE public.stock_movements (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id        BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_id    BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('adjustment', 'count_adjustment', 'consumption')),
  quantity_change  NUMERIC(15,3) NOT NULL,     -- positive = nhập, negative = xuất
  reason           TEXT,
  created_by       UUID NOT NULL REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only: no UPDATE or DELETE
CREATE INDEX idx_stock_movements_tenant ON public.stock_movements(tenant_id);
CREATE INDEX idx_stock_movements_branch ON public.stock_movements(branch_id);
CREATE INDEX idx_stock_movements_ingredient ON public.stock_movements(ingredient_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(branch_id, created_at);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

-- No UPDATE or DELETE — append-only audit trail
GRANT SELECT, INSERT ON TABLE public.stock_movements TO authenticated;


-- ─── Trigger: auto-update stock_levels on movement insert ───

CREATE OR REPLACE FUNCTION public.trg_update_stock_on_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Upsert stock_levels: create if not exists, update if exists
  INSERT INTO public.stock_levels (tenant_id, branch_id, ingredient_id, current_quantity)
  VALUES (NEW.tenant_id, NEW.branch_id, NEW.ingredient_id, NEW.quantity_change)
  ON CONFLICT (ingredient_id, branch_id, tenant_id)
  DO UPDATE SET
    current_quantity = public.stock_levels.current_quantity + NEW.quantity_change,
    updated_at = now();

  -- If count_adjustment, also update last_counted_at
  IF NEW.type = 'count_adjustment' THEN
    UPDATE public.stock_levels
    SET last_counted_at = now()
    WHERE ingredient_id = NEW.ingredient_id
      AND branch_id = NEW.branch_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_movement_update_levels
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_stock_on_movement();
