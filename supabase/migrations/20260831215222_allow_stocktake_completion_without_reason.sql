-- Migration: allow_stocktake_completion_without_reason

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_session public.stocktake_sessions%ROWTYPE;
  v_line record;
  v_fresh_quantity numeric(15,3);
  v_counted_base numeric(15,3);
  v_adjustment numeric(15,3);
  v_total_lines integer := 0;
  v_adjusted integer := 0;
  v_total_variance_abs numeric(15,3) := 0;
  v_reason text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  JOIN public.inventory_locations AS location
    ON location.id = session.location_id
   AND location.tenant_id = session.tenant_id
   AND location.branch_id = session.branch_id
   AND location.location_kind = 'warehouse'
   AND location.is_active IS TRUE
  WHERE session.id = p_session_id
    AND session.tenant_id = v_tenant
  FOR UPDATE OF session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_session.branch_id,
    'inventory:stocktake_complete'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress'
      USING ERRCODE = '22023';
  END IF;

  PERFORM line.id
  FROM public.stocktake_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.session_id = p_session_id
    AND line.round_no = 1
  ORDER BY line.ingredient_id
  FOR UPDATE OF line;

  IF EXISTS (
    SELECT 1
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
      AND line.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
      AND line.needs_recount IS TRUE
  ) THEN
    RAISE EXCEPTION 'recount_lines_exist'
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN
    SELECT line.*
    FROM public.stocktake_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.session_id = p_session_id
      AND line.round_no = 1
    ORDER BY line.ingredient_id
  LOOP
    v_total_lines := v_total_lines + 1;

    SELECT coalesce(stock.current_quantity, 0)
    INTO v_fresh_quantity
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_session.branch_id
      AND stock.location_id = v_session.location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_fresh_quantity := 0;
    END IF;

    v_counted_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.counted_quantity
    );
    v_adjustment := v_counted_base - v_fresh_quantity;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_variance_abs :=
        v_total_variance_abs + abs(v_adjustment);

      v_reason := COALESCE(
        NULLIF(btrim(v_line.reason_code), '')
          || COALESCE(': ' || NULLIF(btrim(v_line.variance_reason), ''), ''),
        NULLIF(btrim(v_line.variance_reason), ''),
        'Stocktake'
      ) || ' (#' || p_session_id::text || ')';

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
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        v_reason,
        v_uid,
        v_session.location_id,
        v_line.entry_unit_id,
        v_line.counted_quantity
      );
    END IF;
  END LOOP;

  UPDATE public.stocktake_sessions
  SET status = 'completed',
      completed_at = now()
  WHERE id = p_session_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.stocktake.completed',
    'stocktake_session',
    p_session_id,
    jsonb_build_object('status', 'in_progress'),
    jsonb_build_object(
      'status', 'completed',
      'total_lines', v_total_lines,
      'adjusted_lines', v_adjusted,
      'total_variance_abs', v_total_variance_abs
    )
  );

  RETURN jsonb_build_object(
    'success',
    TRUE,
    'session_id',
    p_session_id,
    'total_lines',
    v_total_lines,
    'adjusted_lines',
    v_adjusted,
    'total_variance_abs',
    v_total_variance_abs
  );
END;
$function$;

COMMENT ON FUNCTION public.complete_stocktake(p_session_id bigint) IS
  'Completes a tenant-bound warehouse stocktake from counted quantities, writes count adjustments, and writes inventory.stocktake.completed audit; variance reasons are optional metadata.';

REVOKE ALL ON FUNCTION public.complete_stocktake(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_stocktake(bigint)
  TO authenticated, service_role;
