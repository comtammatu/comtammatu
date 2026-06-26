-- HRM Đợt 2 residual: 2-way leave notification.
-- approve_leave_request / reject_leave_request previously only wrote log_audit;
-- they now also produce a notification back to the requesting employee, mirroring
-- the submit -> approver producer in submit_leave_request.
-- NOTE (known limitation): the notifications spine targets by role+branch, not
-- per-user, so this reaches everyone in the employee's role bucket at that branch.
-- A per-user channel is out of scope (no such column exists on public.notifications).

CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
  v_year_row  RECORD;
  v_entitlement_days NUMERIC;
  v_used_days NUMERIC;
  v_employee_bucket TEXT;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'approve_leave_request: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_request
  FROM public.leave_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'approve_leave_request: request not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_permission(v_request.branch_id, 'hr:approve_leave_request') THEN
    RAISE EXCEPTION 'approve_leave_request: missing permission for this branch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'approve_leave_request: request is %, not pending', v_request.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_request.employee_id
      AND e.profile_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'approve_leave_request: cannot review own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(v_request.employee_id);

  IF v_request.leave_type = 'annual' THEN
    FOR v_year_row IN
      SELECT
        EXTRACT(YEAR FROM day)::integer AS leave_year,
        COUNT(*)::numeric AS requested_days
      FROM generate_series(v_request.start_date, v_request.end_date, INTERVAL '1 day') AS day
      GROUP BY 1
    LOOP
      INSERT INTO public.annual_leave_entitlements (
        tenant_id,
        employee_id,
        year,
        entitlement_days
      )
      SELECT
        v_tenant_id,
        v_request.employee_id,
        v_year_row.leave_year,
        CASE
          WHEN e.start_date IS NULL OR e.start_date < make_date(v_year_row.leave_year, 1, 1) THEN 12
          WHEN e.start_date > make_date(v_year_row.leave_year, 12, 31) THEN 0
          ELSE GREATEST(0, 13 - EXTRACT(MONTH FROM e.start_date)::integer)::numeric
        END
      FROM public.employees e
      WHERE e.id = v_request.employee_id
        AND e.tenant_id = v_tenant_id
      ON CONFLICT (tenant_id, employee_id, year) DO NOTHING;

      SELECT entitlement_days INTO v_entitlement_days
      FROM public.annual_leave_entitlements
      WHERE tenant_id = v_tenant_id
        AND employee_id = v_request.employee_id
        AND year = v_year_row.leave_year
      FOR UPDATE;

      SELECT COALESCE(
        SUM(
          LEAST(lr.end_date, make_date(v_year_row.leave_year, 12, 31))
          - GREATEST(lr.start_date, make_date(v_year_row.leave_year, 1, 1))
          + 1
        ),
        0
      )::numeric INTO v_used_days
      FROM public.leave_requests lr
      WHERE lr.tenant_id = v_tenant_id
        AND lr.employee_id = v_request.employee_id
        AND lr.leave_type = 'annual'
        AND lr.status = 'approved'
        AND lr.start_date <= make_date(v_year_row.leave_year, 12, 31)
        AND lr.end_date >= make_date(v_year_row.leave_year, 1, 1);

      IF v_used_days + v_year_row.requested_days > COALESCE(v_entitlement_days, 0) THEN
        RAISE EXCEPTION 'approve_leave_request: annual leave quota exceeded'
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved',
      reviewed_by = v_user_id,
      reviewed_at = now()
  WHERE id = p_request_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'leave_request'::TEXT,
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
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
    'hr.leave_approved',
    'info',
    'Đơn nghỉ phép đã được duyệt',
    format(
      'Đơn nghỉ %s đã được duyệt.',
      CASE
        WHEN v_request.start_date = v_request.end_date
          THEN format('ngày %s', to_char(v_request.start_date, 'DD/MM'))
        ELSE format('từ %s đến %s', to_char(v_request.start_date, 'DD/MM'), to_char(v_request.end_date, 'DD/MM'))
      END
    ),
    'leave_request',
    p_request_id,
    '/employee/leave',
    jsonb_build_object(
      'leave_request_id', p_request_id,
      'employee_id', v_request.employee_id,
      'branch_id', v_request.branch_id,
      'start_date', v_request.start_date,
      'end_date', v_request.end_date,
      'leave_type', v_request.leave_type,
      'result', 'approved'
    ),
    format('hr.leave_approved:%s', p_request_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

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
    '/employee/leave',
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
