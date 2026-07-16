BEGIN;

CREATE OR REPLACE FUNCTION public.employee_request_clock_out(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
) RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record public.attendance_records%ROWTYPE;
  v_count_remaining integer;
  v_requested_at timestamptz;
  v_employee_name text;
  v_requester_role text;
  v_target_roles text[];
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_calendar_date date := v_now_local::date;
BEGIN
  SELECT ar.*
  INTO v_record
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.employee_id = p_employee_id
    AND ar.branch_id = p.branch_id
    AND ar.date BETWEEN v_calendar_date - 1 AND v_calendar_date
    AND ar.check_out IS NULL
    AND COALESCE(e.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer
  INTO v_count_remaining
  FROM (
    SELECT a.location_id
    FROM public.inventory_count_assignments a
    WHERE a.tenant_id = p_tenant_id
      AND a.branch_id = v_record.branch_id
      AND a.employee_id = p_employee_id
      AND a.is_active
    GROUP BY a.location_id
  ) assigned
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.inventory_count_slips s
    WHERE s.tenant_id = p_tenant_id
      AND s.branch_id = v_record.branch_id
      AND s.employee_id = p_employee_id
      AND s.location_id = assigned.location_id
      AND s.count_date = v_record.date
      AND s.status IN ('submitted', 'approved')
  );

  IF v_count_remaining > 0 THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  IF v_record.checkout_requested_at IS NOT NULL THEN
    RETURN v_record.checkout_requested_at;
  END IF;

  v_requested_at := now();

  SELECT
    p.full_name,
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned')
  INTO v_employee_name, v_requester_role
  FROM public.employees e
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id;

  v_requester_role := COALESCE(v_requester_role, 'unassigned');
  v_target_roles := CASE
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]
    WHEN v_requester_role IN ('cashier', 'chef', 'branch_staff') THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner']::text[]
  END;

  UPDATE public.attendance_records
  SET
    checkout_requested_at = v_requested_at,
    checkout_requested_by_role = v_requester_role,
    checkout_approval_target_roles = v_target_roles,
    check_out_code_verified = false,
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND employee_id = p_employee_id
    AND branch_id = v_record.branch_id
    AND date = v_record.date
    AND check_out IS NULL;

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
    p_tenant_id,
    v_record.branch_id,
    v_target_roles,
    'attendance.checkout_requested',
    'info',
    'Yêu cầu duyệt kết ca',
    format(
      '%s đã gửi yêu cầu kết ca lúc %s.',
      COALESCE(v_employee_name, 'Nhân viên'),
      to_char(v_requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
    ),
    'attendance_record',
    p_attendance_id,
    format('/br/%s/shift/checkout-approvals', v_record.branch_id),
    jsonb_build_object(
      'attendance_id', p_attendance_id,
      'employee_id', p_employee_id,
      'requester_role', v_requester_role,
      'approval_target_roles', to_jsonb(v_target_roles),
      'branch_id', v_record.branch_id,
      'business_date', v_record.date,
      'requested_at', v_requested_at
    ),
    format('attendance.checkout_request:%s', p_attendance_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    created_at = EXCLUDED.created_at,
    expires_at = NULL,
    meta = EXCLUDED.meta;

  RETURN v_requested_at;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) TO service_role;

COMMIT;
