BEGIN;

UPDATE public.attendance_checklist_items
SET is_required = true,
    updated_at = now()
WHERE task_kind = 'inventory_count'
  AND is_required = false;

CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text
) RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id bigint;
  v_shift_id bigint;
  v_is_open boolean;
  v_is_close boolean;
  v_position_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT p.position_id INTO v_position_id
  FROM public.employees e
  JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
  WHERE e.id = p_employee_id AND e.tenant_id = p_tenant_id AND e.is_active AND p.branch_id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'employee_not_found' USING ERRCODE='P0002'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_shift_id IS NULL OR p_shift_id = 0 THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.is_opening, s.is_closing
  INTO v_shift_id, v_is_open, v_is_close
  FROM public.shifts s
  WHERE s.id = p_shift_id AND s.tenant_id = p_tenant_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id) AND COALESCE(s.is_active, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'shift_not_found' USING ERRCODE='P0002'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id
      AND ar.employee_id = p_employee_id
      AND ar.date = p_business_date
      AND ar.shift_id = v_shift_id
  ) THEN
    RAISE EXCEPTION 'duplicate_clock_in' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.attendance_records (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    date,
    check_in,
    status,
    method,
    code_verified,
    check_in_photo_path,
    checklist_template_id
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    p_employee_id,
    v_shift_id,
    p_business_date,
    now(),
    'present',
    'pwa',
    false,
    p_photo_path,
    NULL
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items
    (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, scope, task_kind, sort_order)
  SELECT p_tenant_id, v_attendance_id, NULL, t.title, t.phase, t.done_definition, t.is_required,
         t.applicability, t.kind, row_number() OVER (ORDER BY t.sort_order, t.id)::integer
  FROM public.position_shift_tasks t
  WHERE t.tenant_id = p_tenant_id AND t.position_id = v_position_id AND t.is_active
    AND ( t.applicability = 'every_shift'
          OR (t.applicability = 'opening' AND v_is_open)
          OR (t.applicability = 'closing' AND v_is_close) );

  IF EXISTS (
    SELECT 1 FROM public.inventory_count_assignments a
    WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
      AND a.employee_id = p_employee_id AND a.is_active
  ) THEN
    INSERT INTO public.attendance_checklist_items
      (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, scope, task_kind, sort_order)
    VALUES (p_tenant_id, v_attendance_id, NULL, 'Kiểm kê tồn', 'end_of_shift',
            'Nộp phiếu đếm tại màn Kiểm kê tồn.', true, 'every_shift', 'inventory_count',
            COALESCE((SELECT max(sort_order) FROM public.attendance_checklist_items WHERE attendance_record_id = v_attendance_id), 0) + 1);
  END IF;

  RETURN v_attendance_id;
END;
$$;

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
  v_remaining integer;
  v_count_remaining integer;
  v_requested_at timestamptz;
  v_employee_name text;
  v_requester_role text;
  v_target_roles text[];
BEGIN
  SELECT *
  INTO v_record
  FROM public.attendance_records ar
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.employee_id = p_employee_id
    AND ar.check_out IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer
  INTO v_remaining
  FROM public.attendance_checklist_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.attendance_record_id = p_attendance_id
    AND i.is_required = true
    AND i.task_kind <> 'inventory_count'
    AND i.is_done = false;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
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
    COALESCE(private.staff_role_from_position_code(po.code), 'office')
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

  v_requester_role := COALESCE(v_requester_role, 'office');
  v_target_roles := CASE
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]
    WHEN v_requester_role IN ('cashier', 'waiter', 'chef') THEN ARRAY['branch_manager']::text[]
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
    '/employee/checkout-approvals',
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

COMMIT;
