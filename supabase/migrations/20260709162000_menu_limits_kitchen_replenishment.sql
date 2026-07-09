SET search_path = '';

CREATE OR REPLACE FUNCTION public.add_menu_item_kitchen_stock_exception(
  p_branch_id bigint,
  p_menu_item_id bigint,
  p_extra_portions integer,
  p_reason text
) RETURNS jsonb
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
  v_reason text := btrim(COALESCE(p_reason, ''));
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
    RAISE EXCEPTION 'invalid_replenishment_target' USING ERRCODE = '22023';
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

  SELECT b.branch_kind, il.id
  INTO v_branch_kind, v_location_id
  FROM public.branches b
  LEFT JOIN LATERAL (
    SELECT loc.id
    FROM public.inventory_locations loc
    WHERE loc.tenant_id = b.tenant_id
      AND loc.branch_id = b.id
      AND loc.location_kind = 'kitchen'
      AND loc.is_active = TRUE
    ORDER BY loc.is_default_consumption DESC, loc.sort_order NULLS LAST, loc.id
    LIMIT 1
  ) il ON TRUE
  WHERE b.tenant_id = v_tenant_id
    AND b.id = p_branch_id
    AND b.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'branch_kitchen_required' USING ERRCODE = '22023';
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_kitchen_location_required' USING ERRCODE = '23502';
  END IF;

  PERFORM 1
  FROM public.menu_items mi
  WHERE mi.tenant_id = v_tenant_id
    AND mi.id = p_menu_item_id
    AND mi.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.recipes r
  WHERE r.tenant_id = v_tenant_id
    AND r.menu_item_id = p_menu_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu_recipe_required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recipes r
    LEFT JOIN public.ingredients ing
      ON ing.tenant_id = r.tenant_id
     AND ing.id = r.ingredient_id
     AND ing.is_active = TRUE
    WHERE r.tenant_id = v_tenant_id
      AND r.menu_item_id = p_menu_item_id
      AND ing.id IS NULL
  ) THEN
    RAISE EXCEPTION 'recipe_ingredient_inactive' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.tenant_id = v_tenant_id
      AND r.menu_item_id = p_menu_item_id
      AND r.entry_unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        WHERE iu.tenant_id = v_tenant_id
          AND iu.ingredient_id = r.ingredient_id
          AND iu.unit_id = r.entry_unit_id
          AND iu.is_active = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'recipe_unit_config_required' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recipes r
    WHERE r.tenant_id = v_tenant_id
      AND r.menu_item_id = p_menu_item_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units iu
        JOIN public.units u
          ON u.tenant_id = iu.tenant_id
         AND u.id = iu.unit_id
        WHERE iu.tenant_id = v_tenant_id
          AND iu.ingredient_id = r.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
          AND u.is_active = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_found' USING ERRCODE = '23503';
  END IF;

  FOR v_line IN
    SELECT
      r.ingredient_id,
      base_unit.unit_id AS entry_unit_id,
      ROUND(SUM(public.inv_to_base_for_tenant(
        v_tenant_id,
        r.ingredient_id,
        r.entry_unit_id,
        p_extra_portions::numeric * r.quantity / r.yield_factor
      )), 3)::numeric(15,3) AS quantity_change
    FROM public.recipes r
    JOIN LATERAL (
      SELECT iu.unit_id
      FROM public.ingredient_units iu
      JOIN public.units u
        ON u.tenant_id = iu.tenant_id
       AND u.id = iu.unit_id
      WHERE iu.tenant_id = v_tenant_id
        AND iu.ingredient_id = r.ingredient_id
        AND iu.is_base = TRUE
        AND iu.is_active = TRUE
        AND u.is_active = TRUE
      ORDER BY iu.sort_order, iu.id
      LIMIT 1
    ) base_unit ON TRUE
    WHERE r.tenant_id = v_tenant_id
      AND r.menu_item_id = p_menu_item_id
    GROUP BY r.ingredient_id, base_unit.unit_id
    HAVING ROUND(SUM(public.inv_to_base_for_tenant(
      v_tenant_id,
      r.ingredient_id,
      r.entry_unit_id,
      p_extra_portions::numeric * r.quantity / r.yield_factor
    )), 3) > 0
    ORDER BY r.ingredient_id
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
    ) VALUES (
      v_tenant_id,
      p_branch_id,
      v_line.ingredient_id,
      'adjustment',
      v_line.quantity_change,
      'Menu-Limits kitchen replenishment +' || p_extra_portions::text || ': ' || v_reason,
      v_uid,
      v_location_id,
      v_line.entry_unit_id,
      v_line.quantity_change
    );

    v_movement_count := v_movement_count + 1;
  END LOOP;

  IF v_movement_count = 0 THEN
    RAISE EXCEPTION 'no_positive_recipe_quantity' USING ERRCODE = '22023';
  END IF;

  v_stock_capacity := public.compute_menu_item_stock_capacity(
    v_tenant_id,
    p_branch_id,
    p_menu_item_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'branch_id', p_branch_id,
    'menu_item_id', p_menu_item_id,
    'portions_added', p_extra_portions,
    'movements_created', v_movement_count,
    'stock_capacity', v_stock_capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_menu_item_kitchen_stock_exception(bigint, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_menu_item_kitchen_stock_exception(bigint, bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_menu_item_kitchen_stock_exception(bigint, bigint, integer, text) TO service_role;

COMMENT ON FUNCTION public.add_menu_item_kitchen_stock_exception(bigint, bigint, integer, text)
IS 'Menu-Limits controlled +1/+2 kitchen replenishment by menu item recipe. Writes adjustment stock_movements only.';
