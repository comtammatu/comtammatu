-- =============================================================
-- Inventory production DB role contract.
--
-- App actions already hard-deny area_manager / branch_manager on the
-- production surface. This migration applies the same contract at the
-- database boundary so manual grants cannot bypass the app through direct
-- RPC or PostgREST table access.
--
-- Operators:
--   owner             oversight / emergency
--   super_manager     tenant-wide production operator
--   production_manager central-kitchen production operator
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_inventory_production_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.auth_role() IN ('owner', 'super_manager', 'production_manager');
$$;

REVOKE ALL ON FUNCTION public.is_inventory_production_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_inventory_production_operator() TO authenticated;

COMMENT ON FUNCTION public.is_inventory_production_operator()
IS 'Shared DB role contract for Inventory production and production BOM access.';

-- =============================================================
-- RLS: production BOM access.
-- =============================================================

DROP POLICY IF EXISTS "production_recipes_write" ON public.production_recipes;
DROP POLICY IF EXISTS "production_recipes_manage" ON public.production_recipes;
DROP POLICY IF EXISTS "production_recipes_select" ON public.production_recipes;

CREATE POLICY "production_recipes_select" ON public.production_recipes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND (
      public.has_permission_any('menu:read')
      OR public.has_permission_any('menu:write')
    )
  );

CREATE POLICY "production_recipes_write" ON public.production_recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND public.has_permission_any('menu:write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND public.has_permission_any('menu:write')
  );

-- =============================================================
-- RLS: production orders and order lines.
-- =============================================================

DROP POLICY IF EXISTS "production_orders_write" ON public.production_orders;
DROP POLICY IF EXISTS "production_orders_manage" ON public.production_orders;

CREATE POLICY "production_orders_write" ON public.production_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND (
      public.has_permission(branch_id, 'inventory:production_create')
      OR public.has_permission(branch_id, 'inventory:production_confirm')
    )
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = production_orders.branch_id
        AND b.tenant_id = production_orders.tenant_id
        AND b.branch_kind = 'branch'
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND (
      public.has_permission(branch_id, 'inventory:production_create')
      OR public.has_permission(branch_id, 'inventory:production_confirm')
    )
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = production_orders.branch_id
        AND b.tenant_id = production_orders.tenant_id
        AND b.branch_kind = 'branch'
    )
  );

DROP POLICY IF EXISTS "production_order_items_write" ON public.production_order_items;
DROP POLICY IF EXISTS "production_order_items_manage" ON public.production_order_items;

CREATE POLICY "production_order_items_write" ON public.production_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND EXISTS (
      SELECT 1
      FROM public.production_orders po
      JOIN public.branches b ON b.id = po.branch_id
      WHERE po.id = production_order_items.production_order_id
        AND po.tenant_id = production_order_items.tenant_id
        AND po.tenant_id = public.auth_tenant_id()
        AND b.tenant_id = po.tenant_id
        AND b.branch_kind = 'branch'
        AND (
          public.has_permission(po.branch_id, 'inventory:production_create')
          OR public.has_permission(po.branch_id, 'inventory:production_confirm')
        )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND EXISTS (
      SELECT 1
      FROM public.production_orders po
      JOIN public.branches b ON b.id = po.branch_id
      WHERE po.id = production_order_items.production_order_id
        AND po.tenant_id = production_order_items.tenant_id
        AND po.tenant_id = public.auth_tenant_id()
        AND b.tenant_id = po.tenant_id
        AND b.branch_kind = 'branch'
        AND (
          public.has_permission(po.branch_id, 'inventory:production_create')
          OR public.has_permission(po.branch_id, 'inventory:production_confirm')
        )
    )
  );

-- =============================================================
-- RPC: production BOM batch upsert.
-- =============================================================

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(
  p_finished_good_id BIGINT,
  p_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid           UUID   := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_kept          BIGINT[] := ARRAY[]::BIGINT[];
  v_line          JSONB;
  v_ingredient_id BIGINT;
  v_quantity      NUMERIC;
  v_yield_factor  NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('menu:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredients i
    WHERE i.id = p_finished_good_id
      AND i.tenant_id = v_tenant
      AND i.item_kind = 'finished_good'
      AND i.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'finished_good_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines_must_be_array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_must_not_be_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'ingredient_id') IS NULL
       OR (v_line->>'quantity') IS NULL
       OR (v_line->>'unit') IS NULL
       OR btrim(v_line->>'unit') = '' THEN
      RAISE EXCEPTION 'invalid_line_shape' USING ERRCODE = '22023';
    END IF;

    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_quantity := (v_line->>'quantity')::NUMERIC;
    v_yield_factor := COALESCE(
      NULLIF(v_line->>'yield_factor', '')::NUMERIC,
      1.000
    );

    IF v_quantity <= 0 OR v_yield_factor <= 0 THEN
      RAISE EXCEPTION 'invalid_line_quantity' USING ERRCODE = '22023';
    END IF;

    IF v_ingredient_id = ANY(v_kept) THEN
      RAISE EXCEPTION 'duplicate_ingredient' USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.ingredients i
      WHERE i.id = v_ingredient_id
        AND i.tenant_id = v_tenant
        AND i.item_kind = 'raw_material'
        AND i.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.production_recipes (
      tenant_id,
      finished_good_id,
      ingredient_id,
      quantity,
      unit,
      note,
      yield_factor
    )
    VALUES (
      v_tenant,
      p_finished_good_id,
      v_ingredient_id,
      v_quantity,
      btrim(v_line->>'unit'),
      NULLIF(v_line->>'note', ''),
      v_yield_factor
    )
    ON CONFLICT (finished_good_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      note = EXCLUDED.note,
      yield_factor = EXCLUDED.yield_factor;

    v_kept := v_kept || v_ingredient_id;
  END LOOP;

  DELETE FROM public.production_recipes pr
  WHERE pr.tenant_id = v_tenant
    AND pr.finished_good_id = p_finished_good_id
    AND NOT (pr.ingredient_id = ANY(v_kept));

  RETURN jsonb_build_object(
    'finished_good_id', p_finished_good_id,
    'kept_count', COALESCE(array_length(v_kept, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_production_recipe_lines(BIGINT, JSONB)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_production_recipe_lines(BIGINT, JSONB)
TO authenticated;

-- =============================================================
-- RPC: create production order.
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_production_order(
  p_branch_id BIGINT,
  p_production_number TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid    UUID   := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_branch RECORD;
  v_order_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_production_number IS NULL OR btrim(p_production_number) = '' THEN
    RAISE EXCEPTION 'production_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_branch.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.production_orders (
    tenant_id,
    branch_id,
    production_number,
    status,
    notes,
    created_by
  )
  VALUES (
    v_tenant,
    p_branch_id,
    p_production_number,
    'draft',
    p_notes,
    v_uid
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

REVOKE ALL ON FUNCTION public.create_production_order(BIGINT, TEXT, TEXT, JSONB)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_order(BIGINT, TEXT, TEXT, JSONB)
TO authenticated;

-- =============================================================
-- RPC: cancel production order.
-- =============================================================

CREATE OR REPLACE FUNCTION public.cancel_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_order  RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
  FROM public.production_orders
  WHERE id = p_order_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'inventory:production_confirm') THEN
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

-- =============================================================
-- RPC: confirm production order.
-- Latest prior body: 20260426235538_inventory_unit_contract_purchase_unit.sql
-- Change: role contract gate added before permission checks.
-- =============================================================

CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_order RECORD; v_item RECORD; v_recipe RECORD;
  v_raw_need_measure NUMERIC(15,3); v_raw_need_purchase NUMERIC(15,3);
  v_conversion_factor NUMERIC(18,6); v_output_cost NUMERIC(15,2);
  v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2);
  v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
  v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
  v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
  v_total_consumption NUMERIC(15,2) := 0; v_total_output NUMERIC(15,2) := 0;
  v_journal_id BIGINT; v_lines JSONB;
  v_location_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind INTO v_order
  FROM public.production_orders po JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id AND po.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_order.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_branch' USING ERRCODE = '23514';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'production_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_order_items poi
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;
    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
      SELECT pr.ingredient_id, pr.quantity, pr.yield_factor,
             ing.purchase_to_measure_factor,
             COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id     = v_tenant
       AND sl.branch_id     = v_order.branch_id
       AND sl.location_id   = v_location_id
       AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := TRUE;
      v_conversion_factor := COALESCE(v_recipe.purchase_to_measure_factor, 1);
      IF v_conversion_factor <= 0 THEN
        RAISE EXCEPTION 'production_conversion_factor_invalid:%', v_recipe.ingredient_id USING ERRCODE = '22023';
      END IF;

      v_raw_need_measure := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_raw_need_purchase := ROUND((v_raw_need_measure / v_conversion_factor)::NUMERIC, 3);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(v_need_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase), TRUE);
      v_cost_map := jsonb_set(v_cost_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0))), TRUE);
      v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;
    IF NOT v_has_recipe THEN
      RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
    END IF;
    IF v_output_cost < 0 THEN
      RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023';
    END IF;
    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2) ELSE 0 END
    WHERE id = v_item.id;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id     = v_tenant
     AND sl.branch_id     = v_order.branch_id
     AND sl.location_id   = v_location_id
     AND sl.ingredient_id = need.ingredient_id::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < need.need_qty::NUMERIC
  ) THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_key::BIGINT;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id
    )
    VALUES (
      v_tenant, v_order.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
      'Production ' || v_order.production_number, v_uid, p_order_id,
      COALESCE(v_old_wac, 0), v_location_id
    );
    v_total_consumption := v_total_consumption + (v_need_qty * COALESCE(v_old_wac, 0));
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id
    )
    VALUES (
      v_tenant, v_order.branch_id, v_item.finished_good_id, 'production_output', v_item.quantity,
      'Production ' || v_order.production_number, v_uid, p_order_id, v_cost_total, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total) / v_new_q;
    ELSE
      v_new_wac := v_cost_total;
    END IF;

    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;

    UPDATE public.ingredients SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id AND tenant_id = v_tenant;

    v_total_output := v_total_output + (v_item.quantity * v_cost_total);
  END LOOP;

  UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  v_lines := '[]'::JSONB;
  IF v_total_consumption > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_CONSUME', 'amount', v_total_consumption,
      'line_description', 'NVL san xuat ' || v_order.production_number));
  END IF;
  IF v_total_output > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_OUTPUT', 'amount', v_total_output,
      'line_description', 'Thanh pham ' || v_order.production_number));
  END IF;
  IF jsonb_array_length(v_lines) > 0 THEN
    v_journal_id := public.auto_post_journal(v_tenant, v_order.branch_id, 'production', p_order_id,
      'San xuat ' || v_order.production_number, v_lines, now(), v_uid);
    IF v_journal_id IS NOT NULL THEN
      UPDATE public.production_orders SET journal_entry_id = v_journal_id WHERE id = p_order_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed', 'journal_entry_id', v_journal_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_production_order(BIGINT) TO authenticated;
