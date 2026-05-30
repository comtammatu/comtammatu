-- =============================================================
-- Branch ingredient allowlist (HQ assigns NL per branch).
-- Ingredients write: super_manager only.
-- Procurement tables write: super_manager only.
-- Owner governance: operational RLS aligned with app ACL (no DB role enum change).
-- =============================================================

-- ─── 1. branch_ingredients ───

CREATE TABLE public.branch_ingredients (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, branch_id, ingredient_id)
);

CREATE INDEX idx_branch_ingredients_tenant ON public.branch_ingredients(tenant_id);
CREATE INDEX idx_branch_ingredients_branch ON public.branch_ingredients(tenant_id, branch_id);
CREATE INDEX idx_branch_ingredients_ingredient ON public.branch_ingredients(tenant_id, ingredient_id);

ALTER TABLE public.branch_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_ingredients_select" ON public.branch_ingredients
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND branch_id = public.auth_branch_id()
      )
    )
  );

CREATE POLICY "branch_ingredients_insert" ON public.branch_ingredients
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

CREATE POLICY "branch_ingredients_delete" ON public.branch_ingredients
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

GRANT SELECT, INSERT, DELETE ON TABLE public.branch_ingredients TO authenticated;

-- Backfill from existing stock so existing operations keep working
INSERT INTO public.branch_ingredients (tenant_id, branch_id, ingredient_id)
SELECT DISTINCT sl.tenant_id, sl.branch_id, sl.ingredient_id
FROM public.stock_levels sl
ON CONFLICT (tenant_id, branch_id, ingredient_id) DO NOTHING;

-- ─── 2. ingredients: writes super_manager only ───

DROP POLICY IF EXISTS "ingredients_manage" ON public.ingredients;

CREATE POLICY "ingredients_insert" ON public.ingredients
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

CREATE POLICY "ingredients_update" ON public.ingredients
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

CREATE POLICY "ingredients_delete" ON public.ingredients
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

-- ─── 3. Enforce allowlist on stock movements ───

CREATE OR REPLACE FUNCTION public.enforce_stock_movement_branch_ingredient()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.branch_ingredients bi
    WHERE bi.tenant_id = NEW.tenant_id
      AND bi.branch_id = NEW.branch_id
      AND bi.ingredient_id = NEW.ingredient_id
  ) THEN
    RAISE EXCEPTION 'ingredient_not_allowed_for_branch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_movements_branch_ingredient_allowlist
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stock_movement_branch_ingredient();

-- ─── 4. Procurement RLS: writes super_manager only ───

DROP POLICY IF EXISTS "suppliers_manage" ON public.suppliers;
CREATE POLICY "suppliers_manage" ON public.suppliers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

DROP POLICY IF EXISTS "purchase_orders_manage" ON public.purchase_orders;
CREATE POLICY "purchase_orders_manage" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

DROP POLICY IF EXISTS "po_items_manage" ON public.purchase_order_items;
CREATE POLICY "po_items_manage" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

DROP POLICY IF EXISTS "grn_manage" ON public.goods_received_notes;
CREATE POLICY "grn_manage" ON public.goods_received_notes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

DROP POLICY IF EXISTS "grn_items_manage" ON public.grn_items;
CREATE POLICY "grn_items_manage" ON public.grn_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

DROP POLICY IF EXISTS "supplier_invoices_manage" ON public.supplier_invoices;
CREATE POLICY "supplier_invoices_manage" ON public.supplier_invoices
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );

DROP POLICY IF EXISTS "recipes_manage" ON public.recipes;
CREATE POLICY "recipes_manage" ON public.recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() = 'super_manager'
  );
