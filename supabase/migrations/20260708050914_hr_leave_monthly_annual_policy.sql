CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_request   public.leave_requests%ROWTYPE;
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
    format('/br/%s/shift/schedule/leave', v_request.branch_id),
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

COMMENT ON FUNCTION public.approve_leave_request(p_request_id bigint) IS
  'Manager approves a pending leave_request within branch scope. Paid/unpaid leave split is calculated by payroll.';

REVOKE ALL ON FUNCTION public.approve_leave_request(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(bigint) TO authenticated, service_role;
