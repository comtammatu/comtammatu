-- Retire Menu-Limits ledger replenishment (+1/+2 portions).
-- Product path is stock_allowance_quantity (ADR 0026); no app callers remain.

DROP FUNCTION IF EXISTS public.add_menu_item_stock_exception(bigint, bigint, integer, text);
DROP FUNCTION IF EXISTS public.add_menu_item_kitchen_stock_exception(bigint, bigint, integer, text);

/*
-- RPC-ROLLBACK-MUST-INCLUDE-BODY
-- Snapshot source: supabase/migrations/20260802162900_baseline.sql
-- Restore with CREATE OR REPLACE + original GRANT/REVOKE below if rollback is required.

CREATE FUNCTION public.add_menu_item_stock_exception(p_branch_id bigint, p_menu_item_id bigint, p_extra_portions integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_branch bigint := public.auth_branch_id();
  v_uid uuid := auth.uid();
  v_location_id bigint;
  v_branch_kind text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_line record;
  v_movement_count integer := 0;
  v_stock_capacity integer;
BEGIN
  IF v_tenant_id IS NULL OR v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'branch_manager'
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL OR p_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_replenishment_target'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_extra_portions IS NULL OR p_extra_portions NOT IN (1, 2) THEN
    RAISE EXCEPTION 'extra_portions_range' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT branch.branch_kind, location.id
  INTO v_branch_kind, v_location_id
  FROM public.branches AS branch
  LEFT JOIN LATERAL (
    SELECT warehouse.id
    FROM public.inventory_locations AS warehouse
    WHERE warehouse.tenant_id = branch.tenant_id
      AND warehouse.branch_id = branch.id
      AND warehouse.location_kind = 'warehouse'
      AND warehouse.is_active IS TRUE
    LIMIT 1
  ) AS location ON TRUE
  WHERE branch.tenant_id = v_tenant_id
    AND branch.id = p_branch_id
    AND branch.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_branch_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'branch_site_required' USING ERRCODE = '22023';
  END IF;
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'branch_warehouse_required'
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.menu_items AS menu_item
    WHERE menu_item.tenant_id = v_tenant_id
      AND menu_item.id = p_menu_item_id
      AND menu_item.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
  ) THEN
    RAISE EXCEPTION 'menu_recipe_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.tenant_id = recipe.tenant_id
     AND ingredient.id = recipe.ingredient_id
     AND ingredient.is_active IS TRUE
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND ingredient.id IS NULL
  ) THEN
    RAISE EXCEPTION 'recipe_ingredient_inactive'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND recipe.entry_unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        WHERE ingredient_unit.tenant_id = v_tenant_id
          AND ingredient_unit.ingredient_id = recipe.ingredient_id
          AND ingredient_unit.unit_id = recipe.entry_unit_id
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'recipe_unit_config_required'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        JOIN public.units AS unit
          ON unit.tenant_id = ingredient_unit.tenant_id
         AND unit.id = ingredient_unit.unit_id
        WHERE ingredient_unit.tenant_id = v_tenant_id
          AND ingredient_unit.ingredient_id = recipe.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
          AND unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  FOR v_line IN
    SELECT
      recipe.ingredient_id,
      base_unit.unit_id AS entry_unit_id,
      round(sum(public.inv_to_base_for_tenant(
        v_tenant_id,
        recipe.ingredient_id,
        recipe.entry_unit_id,
        p_extra_portions::numeric
          * recipe.quantity
          / recipe.yield_factor
      )), 3)::numeric(15,3) AS quantity_change
    FROM public.recipes AS recipe
    JOIN LATERAL (
      SELECT ingredient_unit.unit_id
      FROM public.ingredient_units AS ingredient_unit
      JOIN public.units AS unit
        ON unit.tenant_id = ingredient_unit.tenant_id
       AND unit.id = ingredient_unit.unit_id
      WHERE ingredient_unit.tenant_id = v_tenant_id
        AND ingredient_unit.ingredient_id = recipe.ingredient_id
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
        AND unit.is_active IS TRUE
      ORDER BY ingredient_unit.sort_order, ingredient_unit.id
      LIMIT 1
    ) AS base_unit ON TRUE
    WHERE recipe.tenant_id = v_tenant_id
      AND recipe.menu_item_id = p_menu_item_id
    GROUP BY recipe.ingredient_id, base_unit.unit_id
    HAVING round(sum(public.inv_to_base_for_tenant(
      v_tenant_id,
      recipe.ingredient_id,
      recipe.entry_unit_id,
      p_extra_portions::numeric
        * recipe.quantity
        / recipe.yield_factor
    )), 3) > 0
    ORDER BY recipe.ingredient_id
  LOOP
    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant_id,
      p_branch_id,
      v_line.ingredient_id,
      'adjustment',
      v_line.quantity_change,
      'Menu-Limits stock exception +'
        || p_extra_portions::text
        || ': '
        || v_reason,
      v_uid,
      v_location_id,
      v_line.entry_unit_id,
      v_line.quantity_change
    );

    v_movement_count := v_movement_count + 1;
  END LOOP;

  IF v_movement_count = 0 THEN
    RAISE EXCEPTION 'no_positive_recipe_quantity'
      USING ERRCODE = '22023';
  END IF;

  v_stock_capacity := public.compute_menu_item_stock_capacity(
    v_tenant_id,
    p_branch_id,
    p_menu_item_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'branch_id', p_branch_id,
    'menu_item_id', p_menu_item_id,
    'portions_added', p_extra_portions,
    'movements_created', v_movement_count,
    'stock_capacity', v_stock_capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_menu_item_stock_exception(p_branch_id bigint, p_menu_item_id bigint, p_extra_portions integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_menu_item_stock_exception(p_branch_id bigint, p_menu_item_id bigint, p_extra_portions integer, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.add_menu_item_stock_exception(p_branch_id bigint, p_menu_item_id bigint, p_extra_portions integer, p_reason text) TO service_role;
*/
