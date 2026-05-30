-- Ensure classic stocktake completion is permission-gated inside the
-- SECURITY DEFINER RPC. Server Actions are not a substitute for this check.

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_session       RECORD;
  v_line          RECORD;
  v_fresh_qty     NUMERIC(15,3);
  v_adjustment    NUMERIC(15,3);
  v_total_lines   INT := 0;
  v_adjusted      INT := 0;
  v_total_var_abs NUMERIC(15,3) := 0;
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

    v_adjustment := v_line.counted_quantity - v_fresh_qty;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_var_abs := v_total_var_abs + abs(v_adjustment);

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id
      ) VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        COALESCE(v_line.variance_reason, 'Stocktake #' || p_session_id::text),
        v_uid,
        v_session.location_id
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

REVOKE ALL ON FUNCTION public.complete_stocktake(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_stocktake(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.complete_stocktake(BIGINT) IS
  'Completes classic stocktake and writes count_adjustment stock movements. SECURITY DEFINER with tenant and inventory:stocktake_complete gate.';
