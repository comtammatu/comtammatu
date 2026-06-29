-- Phase B5 (Production / Recipes / POS consumption): let BOM/recipe lines carry
-- the entry unit they are authored in and convert that line's quantity to the
-- ingredient base unit via inv_to_base when posting stock movements. Stock is
-- kept in base; stock_movements.quantity_change stays base.
--
-- Back-compat: entry_unit_id NULL keeps the pre-existing behaviour exactly.
--   * production_recipes.quantity is authored in measure_unit today, converted to
--     purchase_unit (base) by ing.purchase_to_measure_factor. So when
--     entry_unit_id IS NULL we MUST keep the legacy `/ purchase_to_measure_factor`
--     path; inv_to_base is only used when entry_unit_id IS NOT NULL.
--   * recipes.quantity (POS) is already stored in purchase_unit (base); inv_to_base
--     with a NULL unit returns the qty unchanged, matching today's behaviour.

ALTER TABLE public.production_recipes
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;
ALTER TABLE public.production_order_items
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;
ALTER TABLE public.recipes
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;

-- ── confirm_production_order: per BOM line, raw need in base is the order-scaled
--    authored qty converted via inv_to_base on the line's entry_unit_id; legacy
--    rows (entry_unit_id NULL) keep the purchase_to_measure_factor path. Finished
--    good output qty is converted to base before the output movement + WAC ──
CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_location_id BIGINT;
  v_shortages JSONB := '[]'::JSONB;
  v_out_base NUMERIC(15,3); v_batch_cost NUMERIC(15,2); v_out_unit_cost NUMERIC(15,2);
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
  IF v_order.branch_kind NOT IN ('branch', 'central_kitchen') THEN
    RAISE EXCEPTION 'branch_must_be_operational' USING ERRCODE = '23514';
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
      SELECT pr.ingredient_id, pr.quantity, pr.yield_factor, pr.entry_unit_id,
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
      -- Order-scaled authored need (authored qty is in measure_unit when
      -- entry_unit_id IS NULL, else in entry_unit_id).
      v_raw_need_measure := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      IF v_recipe.entry_unit_id IS NOT NULL THEN
        -- New path: convert the line's entry unit to base.
        v_raw_need_purchase := ROUND(
          public.inv_to_base(v_recipe.ingredient_id, v_recipe.entry_unit_id, v_raw_need_measure), 3);
      ELSE
        -- Legacy path: measure_unit -> purchase_unit (base) by factor.
        v_conversion_factor := COALESCE(v_recipe.purchase_to_measure_factor, 1);
        IF v_conversion_factor <= 0 THEN
          RAISE EXCEPTION 'production_conversion_factor_invalid:%', v_recipe.ingredient_id USING ERRCODE = '22023';
        END IF;
        v_raw_need_purchase := ROUND((v_raw_need_measure / v_conversion_factor)::NUMERIC, 3);
      END IF;
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
    -- unit_cost_at_production stays per finished-good entry unit (reporting).
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2) ELSE 0 END
    WHERE id = v_item.id;
  END LOOP;

  WITH shortages AS (
    SELECT
      (need.ingredient_id)::BIGINT AS ingredient_id,
      ing.name AS ingredient_name,
      COALESCE(ing.purchase_unit, ing.unit) AS unit,
      ROUND((need.need_qty)::NUMERIC, 3) AS needed,
      ROUND(COALESCE(sl.current_quantity, 0)::NUMERIC, 3) AS on_hand,
      ROUND(((need.need_qty)::NUMERIC - COALESCE(sl.current_quantity, 0))::NUMERIC, 3) AS missing
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    JOIN public.ingredients ing ON ing.id = (need.ingredient_id)::BIGINT
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id     = v_tenant
     AND sl.branch_id     = v_order.branch_id
     AND sl.location_id   = v_location_id
     AND sl.ingredient_id = (need.ingredient_id)::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < (need.need_qty)::NUMERIC
    ORDER BY ((need.need_qty)::NUMERIC - COALESCE(sl.current_quantity, 0)) DESC
    LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::JSONB) INTO v_shortages FROM shortages s;

  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock_for_production'
      USING ERRCODE = 'P0001',
            DETAIL  = v_shortages::TEXT;
  END IF;

  -- need_qty is already base (per ingredient, aggregated across finished goods);
  -- entry_unit_id/entry_quantity left NULL on the movement because the aggregate
  -- can span lines authored in different units.
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
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    -- Output qty authored in poi.entry_unit_id (NULL => already base).
    v_out_base := public.inv_to_base(v_item.finished_good_id, v_item.entry_unit_id, v_item.quantity);
    -- Total batch cost is unit-invariant; per-base output cost = batch / base qty.
    v_batch_cost := ROUND(COALESCE(v_item.unit_cost_at_production, 0) * v_item.quantity, 2);
    v_out_unit_cost := CASE WHEN v_out_base <> 0 THEN ROUND(v_batch_cost / v_out_base, 2)
                            ELSE COALESCE(v_item.unit_cost_at_production, 0) END;

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    )
    VALUES (
      v_tenant, v_order.branch_id, v_item.finished_good_id, 'production_output', v_out_base,
      'Production ' || v_order.production_number, v_uid, p_order_id, v_out_unit_cost, v_location_id,
      v_item.entry_unit_id, v_item.quantity
    );

    v_new_q := COALESCE(v_old_q, 0) + v_out_base;
    IF v_new_q > 0 THEN
      v_new_wac := (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_batch_cost) / v_new_q;
    ELSE
      v_new_wac := v_out_unit_cost;
    END IF;

    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;

    UPDATE public.ingredients SET unit_cost = v_out_unit_cost, updated_at = now()
    WHERE id = v_item.finished_good_id AND tenant_id = v_tenant;

  END LOOP;

  UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed');
END;
$function$;

-- ── consume_stock_for_order: convert each recipe line need to base via
--    inv_to_base on recipes.entry_unit_id before the stock check and the
--    consumption movement (entry_unit_id NULL => qty unchanged = today's base) ──
CREATE OR REPLACE FUNCTION public.consume_stock_for_order(p_order_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_order       RECORD;
  v_need        RECORD;
  v_sl          NUMERIC(15,3);
  v_total       NUMERIC(15,3);
  v_location_id BIGINT;
  v_location_is_default BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_tenant
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed');
  END IF;

  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using kitchen location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  -- need_qty converted to base per ingredient via the recipe line entry unit.
  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(public.inv_to_base(r.ingredient_id, r.entry_unit_id,
            oi.quantity::NUMERIC * r.quantity / r.yield_factor)) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(public.inv_to_base(r.ingredient_id, r.entry_unit_id,
            oi.quantity::NUMERIC * r.quantity / r.yield_factor)) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_tenant
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_tenant,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::TEXT,
      v_uid,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$function$;

-- ── consume_stock_for_order_service: service_role variant; same base conversion
--    via recipes.entry_unit_id before the stock check and consumption movement ──
CREATE OR REPLACE FUNCTION public.consume_stock_for_order_service(p_order_id bigint, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor      UUID := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000'::UUID);
  v_order      RECORD;
  v_need       RECORD;
  v_sl         NUMERIC(15,3);
  v_total      NUMERIC(15,3);
  v_location_id BIGINT;
  v_location_is_default BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND sm.tenant_id = v_order.tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id, 'skipped', true, 'reason', 'already_consumed'
    );
  END IF;

  SELECT il.id, il.is_default_consumption
  INTO v_location_id, v_location_is_default
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_order.tenant_id
    AND il.location_kind = 'kitchen'
    AND il.is_active = TRUE
  ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF v_location_is_default IS DISTINCT FROM TRUE THEN
    RAISE WARNING 'default_consumption_location_missing:branch %; using kitchen location %',
      v_order.branch_id,
      v_location_id;
  END IF;

  -- need_qty converted to base per ingredient via the recipe line entry unit.
  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(public.inv_to_base(r.ingredient_id, r.entry_unit_id,
            oi.quantity::NUMERIC * r.quantity / r.yield_factor)) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;

    v_total := COALESCE(v_sl, 0);
    IF v_total < v_need.need_qty THEN
      RAISE EXCEPTION 'insufficient_stock_ingredient:%', v_need.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR v_need IN
    SELECT
      r.ingredient_id,
      SUM(public.inv_to_base(r.ingredient_id, r.entry_unit_id,
            oi.quantity::NUMERIC * r.quantity / r.yield_factor)) AS need_qty
    FROM public.order_items oi
    JOIN public.recipes r
      ON r.menu_item_id = oi.menu_item_id
     AND r.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.tenant_id = v_order.tenant_id
      AND oi.status <> 'cancelled'
    GROUP BY r.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, order_id, unit_cost, location_id
    )
    SELECT
      v_order.tenant_id,
      v_order.branch_id,
      v_need.ingredient_id,
      'consumption',
      -v_need.need_qty,
      'Order ' || p_order_id::TEXT,
      v_actor,
      p_order_id,
      COALESCE(sl.avg_unit_cost, 0),
      v_location_id
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_order.tenant_id
      AND sl.branch_id = v_order.branch_id
      AND sl.location_id = v_location_id
      AND sl.ingredient_id = v_need.ingredient_id;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true);
END;
$function$;
