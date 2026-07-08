CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'warehouse_manager' THEN 'warehouse_manager'
    WHEN 'central_supply_manager' THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    WHEN 'central_kitchen_manager' THEN 'production_manager'
    WHEN 'head_chef' THEN 'production_manager'
    WHEN 'kitchen_counter' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'grill_counter' THEN 'chef'
    WHEN 'chef' THEN 'chef'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'cashier_server' THEN 'cashier'
    WHEN 'waiter' THEN 'cashier'
    WHEN 'office' THEN 'office'
    WHEN 'accountant' THEN 'office'
    WHEN 'marketing' THEN 'office'
    WHEN 'technician' THEN 'office'
    WHEN 'design_construction' THEN 'office'
    WHEN 'cleaner' THEN 'branch_staff'
    WHEN 'guard' THEN 'branch_staff'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION private.staff_role_from_position_code(text) IS
  'SQL twin of POSITION_CODE_TO_STAFF_ROLE (packages/shared/src/auth/types.ts). English position codes only. Legacy waiter maps to cashier; guard/cleaner map to branch_staff.';

UPDATE auth.users au
SET raw_app_meta_data = COALESCE(au.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'user_role', 'branch_staff',
    'role', 'branch_staff',
    'access_bucket', 'branch_staff',
    'position', po.code,
    'position_code', po.code,
    'branch_id', p.branch_id
  )
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
WHERE au.id = p.id
  AND po.code IN ('guard', 'cleaner');

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

CREATE OR REPLACE FUNCTION public.branch_manager_approve_employee_clock_out(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record_branch_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_approver_branch_id bigint;
  v_approver_role text;
  v_requested_at timestamptz;
  v_check_out timestamptz;
BEGIN
  SELECT
    ar.branch_id,
    e.profile_id,
    COALESCE(ar.checkout_requested_by_role, private.staff_role_from_position_code(po.code), 'office'),
    ar.checkout_requested_at
  INTO
    v_record_branch_id,
    v_requester_profile_id,
    v_requester_role,
    v_requested_at
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_out IS NULL
    AND ar.checkout_requested_at IS NOT NULL
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = p_approved_by THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.branch_id,
    private.staff_role_from_position_code(po.code)
  INTO v_approver_branch_id, v_approver_role
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_approved_by
    AND p.tenant_id = p_tenant_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_approver_role IS NULL THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  v_requester_role := COALESCE(v_requester_role, 'office');

  IF v_requester_role = 'branch_manager' THEN
    IF v_approver_role NOT IN ('owner') THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role = 'branch_manager' THEN
    IF v_approver_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;

    IF v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role NOT IN ('owner') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    check_out = v_requested_at,
    check_out_code_verified = false,
    checkout_approved_at = now(),
    checkout_approved_by = p_approved_by,
    checkout_approval_note = NULLIF(btrim(p_note), ''),
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND check_out IS NULL
  RETURNING check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_manager_approve_employee_clock_out(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.branch_manager_approve_employee_clock_out(bigint, bigint, bigint, uuid, text) TO service_role;
