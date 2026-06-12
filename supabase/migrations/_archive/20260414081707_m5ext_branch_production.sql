-- =============================================================
-- M5-Ext: Central kitchen production hub
-- Adds branch kinds, finished-good inventory items, production BOMs,
-- production orders, and production stock movement tracing.
-- =============================================================

-- ─── 1. branches: add branch_kind ───

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS branch_kind TEXT NOT NULL DEFAULT 'branch';

UPDATE public.branches
SET branch_kind = CASE
  WHEN is_tenant = true THEN 'tenant'
  ELSE 'branch'
END
WHERE is_tenant = true
   OR branch_kind IS NULL
   OR branch_kind NOT IN ('tenant', 'branch', 'branch');

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_branch_kind_check;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_branch_kind_check
  CHECK (branch_kind IN ('tenant', 'branch', 'branch'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_branch_per_tenant
  ON public.branches(tenant_id)
  WHERE branch_kind = 'branch' AND is_active = true;

CREATE OR REPLACE FUNCTION public.sync_branch_kind_and_hq()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_tenant, false) = true THEN
    NEW.is_tenant := true;
    NEW.branch_kind := 'tenant';
    RETURN NEW;
  END IF;

  IF NEW.branch_kind IS NULL OR NEW.branch_kind = '' THEN
    NEW.branch_kind := 'branch';
  END IF;

  IF NEW.branch_kind = 'tenant' THEN
    NEW.is_tenant := true;
  ELSE
    NEW.is_tenant := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_sync_kind_and_hq ON public.branches;

CREATE TRIGGER trg_branches_sync_kind_and_hq
  BEFORE INSERT OR UPDATE OF is_tenant, branch_kind ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.sync_branch_kind_and_hq();

CREATE OR REPLACE FUNCTION public.set_tenant(p_branch_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_branch RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch.branch_kind = 'branch' THEN
    RAISE EXCEPTION 'branch_cannot_be_tenant' USING ERRCODE = '23514';
  END IF;

  UPDATE public.branches
  SET is_tenant = (id = p_branch_id),
      branch_kind = CASE
        WHEN id = p_branch_id THEN 'tenant'
        WHEN branch_kind = 'tenant' THEN 'branch'
        ELSE branch_kind
      END,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND (is_tenant = true OR branch_kind = 'tenant' OR id = p_branch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_tenant(BIGINT) TO authenticated;

-- ─── 2. ingredients: mark raw vs finished goods ───

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'raw_material';

UPDATE public.ingredients
SET item_kind = 'raw_material'
WHERE item_kind IS NULL
   OR item_kind NOT IN ('raw_material', 'finished_good');

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_item_kind_check;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_item_kind_check
  CHECK (item_kind IN ('raw_material', 'finished_good'));

CREATE INDEX IF NOT EXISTS idx_ingredients_item_kind
  ON public.ingredients(tenant_id, item_kind);

-- ─── 3. production_recipes ───

CREATE TABLE public.production_recipes (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finished_good_id BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  ingredient_id    BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity         NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit             TEXT NOT NULL,
  yield_factor     NUMERIC(5,3) NOT NULL DEFAULT 1.000 CHECK (yield_factor > 0),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (finished_good_id, ingredient_id, tenant_id)
);

CREATE TRIGGER trg_production_recipes_updated_at
  BEFORE UPDATE ON public.production_recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_production_recipes_tenant ON public.production_recipes(tenant_id);
CREATE INDEX idx_production_recipes_finished_good ON public.production_recipes(finished_good_id);

ALTER TABLE public.production_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_recipes_select" ON public.production_recipes
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "production_recipes_manage" ON public.production_recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = public.auth_branch_id()
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'branch'
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = public.auth_branch_id()
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'branch'
        )
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.production_recipes TO authenticated;

-- ─── 4. production_orders + items ───

CREATE TABLE public.production_orders (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  production_number TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'completed', 'cancelled')),
  notes             TEXT,
  completed_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (production_number, tenant_id)
);

CREATE TRIGGER trg_production_orders_updated_at
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_production_orders_tenant ON public.production_orders(tenant_id);
CREATE INDEX idx_production_orders_branch ON public.production_orders(branch_id);
CREATE INDEX idx_production_orders_status ON public.production_orders(tenant_id, status);

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_orders_select" ON public.production_orders
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "production_orders_manage" ON public.production_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND public.auth_branch_id() IS NOT NULL
        AND branch_id = public.auth_branch_id()
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = branch_id
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'branch'
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND public.auth_branch_id() IS NOT NULL
        AND branch_id = public.auth_branch_id()
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = branch_id
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'branch'
        )
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.production_orders TO authenticated;

CREATE TABLE public.production_order_items (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id             BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_order_id   BIGINT NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  finished_good_id      BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity              NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit                  TEXT NOT NULL,
  unit_cost_at_production NUMERIC(15,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (production_order_id, finished_good_id, tenant_id)
);

CREATE INDEX idx_production_order_items_order ON public.production_order_items(production_order_id);
CREATE INDEX idx_production_order_items_tenant ON public.production_order_items(tenant_id);

ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_order_items_select" ON public.production_order_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "production_order_items_manage" ON public.production_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.production_orders po
          JOIN public.branches b ON b.id = po.branch_id
          WHERE po.id = production_order_id
            AND po.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'branch'
            AND po.branch_id = public.auth_branch_id()
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() = 'branch_manager'
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.production_orders po
          JOIN public.branches b ON b.id = po.branch_id
          WHERE po.id = production_order_id
            AND po.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'branch'
            AND po.branch_id = public.auth_branch_id()
        )
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.production_order_items TO authenticated;

-- ─── 5. stock_movements: add production traceability ───

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS production_order_id BIGINT;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_type_check CHECK (
    type IN (
      'adjustment',
      'count_adjustment',
      'consumption',
      'grn_receipt',
      'transfer_out',
      'transfer_in',
      'production_consumption',
      'production_output'
    )
  );

CREATE INDEX IF NOT EXISTS idx_stock_movements_production_order
  ON public.stock_movements(production_order_id)
  WHERE production_order_id IS NOT NULL;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_production_order_id_fkey
    FOREIGN KEY (production_order_id) REFERENCES public.production_orders(id) ON DELETE SET NULL;

-- ─── 6. RPC: create_production_order ───

CREATE OR REPLACE FUNCTION public.create_production_order(
  p_branch_id BIGINT,
  p_production_number TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_branch       RECORD;
  v_order_id     BIGINT;
  v_item         RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_production_number IS NULL OR btrim(p_production_number) = '' THEN
    RAISE EXCEPTION 'production_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  IF v_role = 'branch_manager'
     AND (v_branch_claim IS NULL OR v_branch_claim <> p_branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.production_orders (
    tenant_id, branch_id, production_number, status, notes, created_by
  ) VALUES (
    v_tenant, p_branch_id, p_production_number, 'draft', p_notes, v_uid
  )
  RETURNING id INTO v_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.production_order_items (
      tenant_id,
      production_order_id,
      finished_good_id,
      quantity,
      unit
    )
    SELECT
      v_tenant,
      v_order_id,
      (line->>'finishedGoodId')::BIGINT,
      (line->>'quantity')::NUMERIC(15,3),
      NULLIF(btrim(line->>'unit'), '')
    FROM jsonb_array_elements(p_items) AS line
    WHERE line ? 'finishedGoodId'
      AND line ? 'quantity'
      AND line ? 'unit'
    ON CONFLICT (production_order_id, finished_good_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit;
  END IF;

  RETURN jsonb_build_object('id', v_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_production_order(BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_order(BIGINT, TEXT, TEXT, JSONB) TO authenticated;

-- ─── 7. RPC: confirm_production_order ───

CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_order         RECORD;
  v_item          RECORD;
  v_recipe        RECORD;
  v_raw_cost      NUMERIC(15,2);
  v_raw_need      NUMERIC(15,3);
  v_output_cost   NUMERIC(15,2);
  v_old_q         NUMERIC(15,3);
  v_old_wac       NUMERIC(15,2);
  v_new_q         NUMERIC(15,3);
  v_new_wac       NUMERIC(15,2);
  v_need_map      JSONB := '{}'::JSONB;
  v_cost_map      JSONB := '{}'::JSONB;
  v_key           TEXT;
  v_need_qty      NUMERIC(15,3);
  v_cost_total    NUMERIC(15,2);
  v_has_recipe    BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind
  INTO v_order
  FROM public.production_orders po
  JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_order.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  IF public.auth_role() = 'branch_manager'
     AND (public.auth_branch_id() IS NULL OR public.auth_branch_id() <> v_order.branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.production_order_items poi
    WHERE poi.production_order_id = p_order_id
      AND poi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id
      AND poi.tenant_id = v_tenant
  LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;

    v_output_cost := 0;
    v_has_recipe := false;

    FOR v_recipe IN
      SELECT
        pr.ingredient_id,
        pr.quantity,
        pr.yield_factor,
        COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id = v_tenant
       AND sl.branch_id = v_order.branch_id
       AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant
        AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := true;
      v_raw_need := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(
        v_need_map,
        ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need),
        true
      );
      v_cost_map := jsonb_set(
        v_cost_map,
        ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0))),
        true
      );
      v_output_cost := v_output_cost + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;

    IF NOT v_has_recipe THEN
      RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
    END IF;

    IF v_output_cost < 0 THEN
      RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023';
    END IF;

    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE
      WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2)
      ELSE 0
    END
    WHERE id = v_item.id;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_order.branch_id
     AND sl.ingredient_id = need.ingredient_id::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < need.need_qty::NUMERIC
  ) THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key, v_need_qty IN
    SELECT key, value::NUMERIC(15,3)
    FROM jsonb_each_text(v_need_map)
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_key::BIGINT;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost
    ) VALUES (
      v_tenant,
      v_order.branch_id,
      v_key::BIGINT,
      'production_consumption',
      -v_need_qty,
      'Production ' || v_order.production_number,
      v_uid,
      p_order_id,
      COALESCE(v_old_wac, 0)
    );
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id
      AND poi.tenant_id = v_tenant
  LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_item.finished_good_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost
    ) VALUES (
      v_tenant,
      v_order.branch_id,
      v_item.finished_good_id,
      'production_output',
      v_item.quantity,
      'Production ' || v_order.production_number,
      v_uid,
      p_order_id,
      v_cost_total
    );

    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost_total;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_item.finished_good_id;

    UPDATE public.ingredients
    SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id
      AND tenant_id = v_tenant;
  END LOOP;

  UPDATE public.production_orders
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_production_order(BIGINT) TO authenticated;

-- ─── 8. RPC: cancel_production_order ───

CREATE OR REPLACE FUNCTION public.cancel_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_order  RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_order
  FROM public.production_orders
  WHERE id = p_order_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.auth_role() = 'branch_manager'
     AND (public.auth_branch_id() IS NULL OR public.auth_branch_id() <> v_order.branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;

  UPDATE public.production_orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_order_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_production_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_production_order(BIGINT) TO authenticated;
