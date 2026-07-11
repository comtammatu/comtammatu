-- =============================================================
-- GL Auto-Posting: Phase 2.4 — Extend confirm_production_order()
-- On production confirmation, auto-post two journal entries:
--   1. Raw consumption: Dr 621 (CP NVL TT) / Cr 152 (NVL)
--   2. Finished output:  Dr 155 (Thành phẩm) / Cr 621 (CP NVL TT)
-- Same signature — only internal logic extended.
-- =============================================================

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
  -- GL auto-post variables
  v_total_consumption NUMERIC(15,2) := 0;
  v_total_output      NUMERIC(15,2) := 0;
  v_journal_id        BIGINT;
  v_lines             JSONB;
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

  -- Phase 1: Calculate raw material needs + costs per finished good
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

  -- Phase 2: Validate stock sufficiency
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

  -- Phase 3: Consume raw materials
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

    -- Accumulate consumption cost for GL
    v_total_consumption := v_total_consumption + (v_need_qty * COALESCE(v_old_wac, 0));
  END LOOP;

  -- Phase 4: Output finished goods
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

    -- Accumulate output value for GL
    v_total_output := v_total_output + (v_item.quantity * v_cost_total);
  END LOOP;

  UPDATE public.production_orders
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id
    AND tenant_id = v_tenant;

  -- ═══ AUTO-POST GL JOURNAL ═══
  v_lines := '[]'::JSONB;

  -- Raw consumption: Dr 621 / Cr 152
  IF v_total_consumption > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_CONSUME',
      'amount', v_total_consumption,
      'line_description', 'NVL sản xuất ' || v_order.production_number
    ));
  END IF;

  -- Finished output: Dr 155 / Cr 621
  IF v_total_output > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'PRODUCTION_OUTPUT',
      'amount', v_total_output,
      'line_description', 'Thành phẩm ' || v_order.production_number
    ));
  END IF;

  IF jsonb_array_length(v_lines) > 0 THEN
    v_journal_id := public.auto_post_journal(
      v_tenant,
      v_order.branch_id,
      'production',
      p_order_id,
      'Sản xuất ' || v_order.production_number,
      v_lines,
      now(),
      v_uid
    );

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.production_orders
      SET journal_entry_id = v_journal_id
      WHERE id = p_order_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'production_order_id', p_order_id,
    'status', 'completed',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_order(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_production_order(BIGINT) TO authenticated;
