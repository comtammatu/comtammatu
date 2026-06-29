-- Phase B4 (Stocktake / Count): let stocktake + count-slip lines carry an entry
-- unit and convert the COUNTED quantity to the ingredient base unit when posting
-- the count_adjustment movement. system_quantity comes from stock_levels and is
-- already base => never converted. entry_unit_id NULL => counted qty already in
-- base (back-compat with rows/callers predating this change). Stock is kept in
-- base; stock_movements.quantity_change stays base.

ALTER TABLE public.stocktake_lines
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_count_slip_lines
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;

-- ── finalize_stocktake: gates round-1 completeness and flips session status; no
--    counted/system/delta or movement logic, so nothing to convert ──
CREATE OR REPLACE FUNCTION public.finalize_stocktake(p_session_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD; v_pending INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_complete') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_ss.status <> 'in_progress' THEN RAISE EXCEPTION 'session not in_progress' USING ERRCODE = '22023'; END IF;
  SELECT COUNT(*) INTO v_pending FROM public.stocktake_lines WHERE session_id = p_session_id AND round_no = 1 AND is_final = false;
  IF v_pending > 0 THEN RAISE EXCEPTION 'cannot finalize: % round-1 line(s) still not final', v_pending USING ERRCODE = '22023'; END IF;
  UPDATE public.stocktake_sessions SET status = 'completed', completed_at = now() WHERE id = p_session_id;
  RETURN jsonb_build_object('session_id', p_session_id, 'status', 'completed', 'completed_at', now());
END; $function$;

-- ── submit_count_round: persist per-line entry_unit_id from the payload so the
--    downstream adjustment poster can convert. Counted qty is stored as entered;
--    system_quantity is copied from the round-1 line (already base). No stock
--    comparison or movement happens here, so no conversion math is added ──
CREATE OR REPLACE FUNCTION public.submit_count_round(p_session_id bigint, p_round_no smallint, p_counts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_ss RECORD; v_count JSONB; v_applied INT := 0; v_conflict_count INT := 0;
  v_existing RECORD; v_offline_at TIMESTAMPTZ; v_ingredient BIGINT; v_counted NUMERIC; v_op_id UUID;
  v_entry_unit BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ss.status <> 'in_progress' THEN RAISE EXCEPTION 'session not in_progress (status=%)', v_ss.status USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_round_no <> v_ss.current_round THEN RAISE EXCEPTION 'round % does not match current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023'; END IF;
  FOR v_count IN SELECT value FROM jsonb_array_elements(p_counts) LOOP
    v_ingredient := (v_count->>'ingredient_id')::BIGINT;
    v_counted    := (v_count->>'counted_quantity')::NUMERIC;
    v_op_id      := NULLIF(v_count->>'client_op_id','')::UUID;
    v_offline_at := NULLIF(v_count->>'offline_created_at','')::TIMESTAMPTZ;
    v_entry_unit := NULLIF(v_count->>'entry_unit_id','')::BIGINT;
    IF v_ss.offline_enabled AND v_offline_at IS NOT NULL THEN
      IF v_offline_at > now() + INTERVAL '5 minutes' OR v_offline_at < v_ss.started_at THEN
        INSERT INTO public.stocktake_conflicts (tenant_id, session_id, ingredient_id, round_no, conflict_type, client_payload, submitted_by)
        VALUES (v_ss.tenant_id, p_session_id, v_ingredient, p_round_no, 'clock_tamper',
          jsonb_build_object('client_op_id', v_op_id, 'offline_created_at', v_offline_at, 'counted_quantity', v_counted), v_uid);
        v_conflict_count := v_conflict_count + 1;
        CONTINUE;
      END IF;
    END IF;
    SELECT id, counted_quantity, is_final INTO v_existing FROM public.stocktake_lines
      WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = p_round_no;
    IF FOUND AND v_existing.is_final AND v_existing.counted_quantity IS DISTINCT FROM v_counted THEN
      INSERT INTO public.stocktake_conflicts (tenant_id, session_id, ingredient_id, round_no, conflict_type, client_payload, server_payload, submitted_by)
      VALUES (v_ss.tenant_id, p_session_id, v_ingredient, p_round_no, 'is_final_overwrite',
        jsonb_build_object('client_op_id', v_op_id, 'counted_quantity', v_counted, 'offline_created_at', v_offline_at),
        jsonb_build_object('existing_counted_quantity', v_existing.counted_quantity, 'is_final', true), v_uid);
      v_conflict_count := v_conflict_count + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity,
      counted_quantity, entry_unit_id, counted_by, counted_at, round_no, abc_class, client_op_id, offline_created_at)
    SELECT v_ss.tenant_id, p_session_id, v_ingredient,
      (SELECT system_quantity FROM public.stocktake_lines WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = 1),
      v_counted, v_entry_unit, v_uid, now(), p_round_no,
      (SELECT abc_class FROM public.stocktake_lines WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = 1),
      v_op_id, v_offline_at
    ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE SET
      counted_quantity = EXCLUDED.counted_quantity, entry_unit_id = EXCLUDED.entry_unit_id,
      counted_by = EXCLUDED.counted_by, counted_at = EXCLUDED.counted_at,
      client_op_id = COALESCE(EXCLUDED.client_op_id, public.stocktake_lines.client_op_id),
      offline_created_at = COALESCE(EXCLUDED.offline_created_at, public.stocktake_lines.offline_created_at);
    v_applied := v_applied + 1;
  END LOOP;
  RETURN jsonb_build_object('applied_count', v_applied, 'conflict_count', v_conflict_count, 'round_no', p_round_no);
END; $function$;

-- ── submit_inventory_count_slip: persist per-line entry_unit_id from the payload
--    so approve can convert. system_quantity is read from stock_levels (base);
--    counted_quantity + negative check stay on the entered value ──
CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(p_branch_id bigint, p_location_id bigint, p_lines jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant        BIGINT := public.auth_tenant_id();
  v_uid           UUID   := auth.uid();
  v_employee_id   BIGINT;
  v_employee_name TEXT;
  v_today         DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_slip_id       BIGINT;
  v_status        TEXT;
  v_line          jsonb;
  v_ingredient_id BIGINT;
  v_counted       NUMERIC(15,3);
  v_assigned_count INT;
  v_line_count    INT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l
    WHERE l.id = p_location_id AND l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant AND l.is_active
  ) THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.id, pr.full_name INTO v_employee_id, v_employee_name
  FROM public.employees e
  JOIN public.profiles pr ON pr.id = e.profile_id
  WHERE e.profile_id = v_uid AND e.tenant_id = v_tenant AND e.is_active
    AND pr.tenant_id = v_tenant AND pr.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'no_active_employee_in_branch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  -- Every submitted line must be an active assignment for this employee.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_counted := (v_line->>'counted_quantity')::NUMERIC;
    IF v_ingredient_id IS NULL OR v_counted IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;
    IF v_counted < 0 THEN
      RAISE EXCEPTION 'negative_count' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_count_assignments a
      WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
        AND a.location_id = p_location_id AND a.employee_id = v_employee_id
        AND a.ingredient_id = v_ingredient_id AND a.is_active
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Completeness: every active assignment must be counted (preserves the
  -- blind anti-shrinkage intent — no cherry-picking which items to report).
  SELECT count(*) INTO v_assigned_count
  FROM public.inventory_count_assignments a
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id AND a.employee_id = v_employee_id AND a.is_active;

  SELECT count(DISTINCT (l->>'ingredient_id')::BIGINT) INTO v_line_count
  FROM jsonb_array_elements(p_lines) l;

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_slip_id, v_status
  FROM public.inventory_count_slips
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND location_id = p_location_id
    AND employee_id = v_employee_id AND count_date = v_today
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved' USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips
      (tenant_id, branch_id, location_id, employee_id, count_date, status, submitted_by, submitted_at)
    VALUES
      (v_tenant, p_branch_id, p_location_id, v_employee_id, v_today, 'submitted', v_uid, now())
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted', submitted_by = v_uid, submitted_at = now(),
        reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, updated_at = now()
    WHERE id = v_slip_id;
    DELETE FROM public.inventory_count_slip_lines WHERE slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines
    (tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id, note)
  SELECT
    v_tenant,
    v_slip_id,
    (l->>'ingredient_id')::BIGINT,
    COALESCE((
      SELECT stl.current_quantity FROM public.stock_levels stl
      WHERE stl.tenant_id = v_tenant AND stl.branch_id = p_branch_id
        AND stl.location_id = p_location_id AND stl.ingredient_id = (l->>'ingredient_id')::BIGINT
    ), 0),
    (l->>'counted_quantity')::NUMERIC,
    NULLIF(l->>'entry_unit_id','')::BIGINT,
    NULLIF(trim(l->>'note'), '')
  FROM jsonb_array_elements(p_lines) l;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    p_branch_id,
    ARRAY['branch_manager', 'warehouse_manager', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm tồn mới',
    format('%s đã gửi phiếu đếm tồn (%s mục) chờ duyệt.', COALESCE(v_employee_name, 'Nhân viên'), v_line_count),
    'inventory_count_slip',
    v_slip_id,
    '/inventory/count-slips',
    jsonb_build_object(
      'slip_id', v_slip_id, 'employee_id', v_employee_id,
      'branch_id', p_branch_id, 'location_id', p_location_id, 'line_count', v_line_count
    ),
    format('inventory.count_slip:%s:submitted', v_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  PERFORM public.log_audit(
    'submit'::TEXT,
    'inventory_count_slip'::TEXT,
    v_slip_id,
    NULL,
    jsonb_build_object('branch_id', p_branch_id, 'location_id', p_location_id, 'line_count', v_line_count)
  );

  RETURN v_slip_id;
END;
$function$;

-- ── approve_inventory_count_slip: convert each line's counted qty to base before
--    the delta. system_quantity source (v_fresh) is stock_levels.current_quantity
--    (already base) => NOT converted. delta = counted_base - system_base; the
--    count_adjustment movement posts that base delta and records the entry unit +
--    pre-conversion counted qty. entry_unit_id NULL => counted already base ──
CREATE OR REPLACE FUNCTION public.approve_inventory_count_slip(p_slip_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_line            RECORD;
  v_fresh           NUMERIC(15,3);
  v_counted_base    NUMERIC(15,3);
  v_delta           NUMERIC(15,3);
  v_adjusted        INT := 0;
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_slip.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'already_approved', true);
  END IF;

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN
    SELECT * FROM public.inventory_count_slip_lines
    WHERE slip_id = p_slip_id AND tenant_id = v_tenant
  LOOP
    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh
    FROM public.stock_levels stl
    WHERE stl.tenant_id = v_tenant AND stl.branch_id = v_slip.branch_id
      AND stl.location_id = v_slip.location_id AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh := 0;
    END IF;

    -- counted qty is in v_line.entry_unit_id (NULL => already base); system side
    -- (v_fresh) is base already, so only the counted side is converted.
    v_counted_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_line.counted_quantity);
    v_delta := v_counted_base - v_fresh;

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant, v_slip.branch_id, v_line.ingredient_id, 'count_adjustment', v_delta,
        'Count slip #' || p_slip_id::text, v_uid, v_slip.location_id,
        v_line.entry_unit_id, v_line.counted_quantity
      );
      v_adjusted := v_adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.inventory_count_slips
  SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved', 'adjusted_lines', v_adjusted)
  );

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'office')]::text[],
    'inventory.count_slip_approved',
    'info',
    'Phiếu đếm tồn đã được duyệt',
    'Phiếu đếm tồn của bạn đã được duyệt và điều chỉnh kho.',
    'inventory_count_slip',
    p_slip_id,
    '/employee/count',
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'approved', 'adjusted_lines', v_adjusted
    ),
    format('inventory.count_slip:%s:approved', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'adjusted_lines', v_adjusted);
END;
$function$;

-- ── complete_stocktake: convert each line's counted qty to base before the delta.
--    v_fresh_qty is stock_levels.current_quantity (already base) => NOT converted.
--    delta = counted_base - system_base; count_adjustment movement posts base delta
--    and records entry unit + pre-conversion counted qty. entry_unit_id NULL =>
--    counted already base, inv_to_base returns qty unchanged ──
CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_session       RECORD;
  v_line          RECORD;
  v_fresh_qty     NUMERIC(15,3);
  v_counted_base  NUMERIC(15,3);
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

    -- counted qty is in v_line.entry_unit_id (NULL => already base); system side
    -- (v_fresh_qty) is base already, so only the counted side is converted.
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
$function$;
