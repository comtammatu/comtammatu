CREATE OR REPLACE FUNCTION public.adjust_stock_exception(
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location_id bigint;
  v_entry_unit_id bigint;
  v_movement_id bigint;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_required' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL OR p_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'invalid_adjustment_target' USING ERRCODE = '22023';
  END IF;
  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'quantity_change_nonzero' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT il.id
  INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.tenant_id = v_tenant
    AND il.branch_id = p_branch_id
    AND il.is_default_issue = TRUE
    AND il.is_active = TRUE
  ORDER BY il.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_issue_location_required' USING ERRCODE = '23502';
  END IF;

  SELECT iu.unit_id
  INTO v_entry_unit_id
  FROM public.ingredients ing
  JOIN public.ingredient_units iu
    ON iu.tenant_id = ing.tenant_id
   AND iu.ingredient_id = ing.id
  JOIN public.units u
    ON u.tenant_id = iu.tenant_id
   AND u.id = iu.unit_id
  WHERE ing.tenant_id = v_tenant
    AND ing.id = p_ingredient_id
    AND ing.is_active = TRUE
    AND iu.is_base = TRUE
    AND iu.is_active = TRUE
    AND u.is_active = TRUE
  ORDER BY iu.sort_order, iu.id
  LIMIT 1;

  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_not_found:%', p_ingredient_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, ingredient_id, type, quantity_change,
    reason, created_by, location_id, entry_unit_id, entry_quantity
  ) VALUES (
    v_tenant, p_branch_id, p_ingredient_id, 'adjustment', p_quantity_change,
    v_reason, v_uid, v_location_id, v_entry_unit_id, abs(p_quantity_change)
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_exception(bigint, bigint, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(bigint, bigint, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock_exception(bigint, bigint, numeric, text) TO service_role;

DROP POLICY IF EXISTS stock_movements_insert ON public.stock_movements;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_movements FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_tenant        bigint := public.auth_tenant_id();
  v_session       record;
  v_line          record;
  v_fresh_qty     numeric(15,3);
  v_counted_base  numeric(15,3);
  v_adjustment    numeric(15,3);
  v_total_lines   int := 0;
  v_adjusted      int := 0;
  v_total_var_abs numeric(15,3) := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT s.* INTO v_session
  FROM public.stocktake_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_session.branch_id, 'inventory:stocktake_complete') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;

  IF v_session.location_id IS NULL THEN
    RAISE EXCEPTION 'session_location_missing' USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id
      AND sl.tenant_id = v_tenant
      AND sl.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id
      AND sl.tenant_id = v_tenant
      AND sl.needs_recount = TRUE
  ) THEN
    RAISE EXCEPTION 'recount_lines_exist' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id AND sl.tenant_id = v_tenant
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh_qty
    FROM public.stock_levels stl
    WHERE stl.tenant_id     = v_tenant
      AND stl.branch_id     = v_session.branch_id
      AND stl.location_id   = v_session.location_id
      AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh_qty := 0;
    END IF;

    v_counted_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_line.counted_quantity);
    v_adjustment := v_counted_base - v_fresh_qty;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_var_abs := v_total_var_abs + abs(v_adjustment);

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        COALESCE(v_line.variance_reason, 'Stocktake #' || p_session_id::text),
        v_uid,
        v_session.location_id,
        v_line.entry_unit_id,
        v_line.counted_quantity
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total_lines', v_total_lines,
    'adjusted_lines', v_adjusted,
    'total_variance_abs', v_total_var_abs
  );
END;
$$;
