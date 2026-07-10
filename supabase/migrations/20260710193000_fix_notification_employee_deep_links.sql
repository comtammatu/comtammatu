-- Fix PROD notification deep-links still pointing at retired /employee/* routes.
-- Repo baseline already uses /br/{branchId}/...; PROD RPCs were never re-applied.
-- Also backfill historical notification rows so taps stop 404ing.

BEGIN;

-- approve_inventory_count_slip
CREATE OR REPLACE FUNCTION public.approve_inventory_count_slip(p_slip_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
    format('/br/%s/stock/count', v_slip.branch_id),
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
$$;

-- reject_leave_request
CREATE OR REPLACE FUNCTION public.reject_leave_request(p_request_id bigint, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
  v_reason    TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_employee_bucket TEXT;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'reject_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reject_leave_request: reason too long'
      USING ERRCODE = 'string_data_right_truncation';
  END IF;

  SELECT * INTO v_request
  FROM public.leave_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'reject_leave_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_leave_request') THEN
    RAISE EXCEPTION 'reject_leave_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'reject_leave_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'reject_leave_request: cannot review own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.leave_requests
  SET status = 'rejected',
      reviewed_by = v_user_id,
      reviewed_at = now(),
      rejected_reason = v_reason
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'reject'::TEXT,
    'leave_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'reason', v_reason)
  );

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_request.employee_id
     AND e.tenant_id = v_tenant_id;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    meta,
    dedup_key
  )
  VALUES (
    v_tenant_id,
    v_request.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'office')]::text[],
    'hr.leave_rejected',
    'info',
    'Đơn nghỉ phép bị từ chối',
    format(
      'Đơn nghỉ %s đã bị từ chối%s',
      CASE
        WHEN v_request.start_date = v_request.end_date
          THEN format('ngày %s', to_char(v_request.start_date, 'DD/MM'))
        ELSE format('từ %s đến %s', to_char(v_request.start_date, 'DD/MM'), to_char(v_request.end_date, 'DD/MM'))
      END,
      CASE WHEN v_reason IS NOT NULL THEN format(' (Lý do: %s)', v_reason) ELSE '' END
    ),
    'leave_request',
    p_request_id,
    format('/br/%s/shift/schedule/leave', v_request.branch_id),
    jsonb_build_object(
      'leave_request_id', p_request_id,
      'employee_id', v_request.employee_id,
      'branch_id', v_request.branch_id,
      'start_date', v_request.start_date,
      'end_date', v_request.end_date,
      'leave_type', v_request.leave_type,
      'result', 'rejected',
      'reason', v_reason
    ),
    format('hr.leave_rejected:%s', p_request_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

-- request_inventory_count_recount
CREATE OR REPLACE FUNCTION public.request_inventory_count_recount(p_slip_id bigint, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_note            TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = 'string_data_right_truncation';
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

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'needs_changes', review_note = v_note, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'request_recount'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'needs_changes')
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
    'inventory.count_slip_recount',
    'warning',
    'Phiếu đếm tồn cần đếm lại',
    COALESCE(format('Quản lý yêu cầu đếm lại: %s', v_note), 'Quản lý yêu cầu đếm lại phiếu đếm tồn của bạn.'),
    'inventory_count_slip',
    p_slip_id,
    format('/br/%s/stock/count', v_slip.branch_id),
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'needs_changes'
    ),
    format('inventory.count_slip:%s:recount', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

-- Historical rows written by the stale PROD RPC bodies.
UPDATE public.notifications
SET action_url = format(
  '/br/%s/stock/count',
  COALESCE(target_branch_id, NULLIF(meta->>'branch_id', '')::bigint)
)
WHERE action_url = '/employee/count'
  AND COALESCE(target_branch_id, NULLIF(meta->>'branch_id', '')::bigint) IS NOT NULL;

UPDATE public.notifications
SET action_url = format(
  '/br/%s/shift/schedule/leave',
  COALESCE(target_branch_id, NULLIF(meta->>'branch_id', '')::bigint)
)
WHERE action_url = '/employee/leave'
  AND COALESCE(target_branch_id, NULLIF(meta->>'branch_id', '')::bigint) IS NOT NULL;

UPDATE public.notifications
SET action_url = format(
  '/br/%s/shift/checkout-approvals',
  COALESCE(target_branch_id, NULLIF(meta->>'branch_id', '')::bigint)
)
WHERE action_url = '/employee/checkout-approvals'
  AND COALESCE(target_branch_id, NULLIF(meta->>'branch_id', '')::bigint) IS NOT NULL;

REVOKE ALL ON FUNCTION public.approve_inventory_count_slip(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reject_leave_request(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_leave_request(bigint, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_inventory_count_recount(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_inventory_count_recount(bigint, text) TO authenticated, service_role;

COMMIT;
