-- =====================================================================
-- Employee checkout approval
-- - Employee checkout code now sends a pending request instead of setting
--   check_out directly.
-- - Branch Manager approves pending requests for their own branch.
-- - Branch Manager checkout escalates to owner/super_manager/area_manager.
-- - Final check_out is the employee request time, not manager click time.
-- =====================================================================

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS checkout_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_requested_code_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkout_requested_by_role text,
  ADD COLUMN IF NOT EXISTS checkout_approval_target_roles text[] NOT NULL DEFAULT ARRAY['branch_manager']::text[],
  ADD COLUMN IF NOT EXISTS checkout_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS checkout_approval_note text;

COMMENT ON COLUMN public.attendance_records.checkout_requested_at IS
  'When the employee submitted checkout for Branch Manager approval.';

COMMENT ON COLUMN public.attendance_records.checkout_requested_code_verified IS
  'True when the checkout request passed the branch closing code check in server action.';

COMMENT ON COLUMN public.attendance_records.checkout_requested_by_role IS
  'StaffRole bucket of the requester at the time they submitted checkout.';

COMMENT ON COLUMN public.attendance_records.checkout_approval_target_roles IS
  'StaffRole buckets that should approve this checkout request. Normal branch staff target branch_manager; branch_manager targets owner/super_manager/area_manager.';

COMMENT ON COLUMN public.attendance_records.checkout_approved_at IS
  'When an authorized manager approved the checkout request.';

COMMENT ON COLUMN public.attendance_records.checkout_approved_by IS
  'Auth user id of the manager who approved the checkout request.';

COMMENT ON COLUMN public.attendance_records.checkout_approval_note IS
  'Optional manager note attached to checkout approval.';

CREATE INDEX IF NOT EXISTS idx_attendance_records_checkout_pending
  ON public.attendance_records (tenant_id, branch_id, checkout_requested_at DESC)
  WHERE check_out IS NULL
    AND checkout_requested_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_checkout_target_roles
  ON public.attendance_records USING gin (checkout_approval_target_roles)
  WHERE check_out IS NULL
    AND checkout_requested_at IS NOT NULL;

UPDATE public.attendance_records ar
SET
  checkout_requested_by_role = COALESCE(po.legacy_role_code::text, 'office'),
  checkout_approval_target_roles = CASE
    WHEN COALESCE(po.legacy_role_code::text, 'office') = 'branch_manager'
      THEN ARRAY['owner', 'super_manager', 'area_manager']::text[]
    ELSE ARRAY['branch_manager']::text[]
  END
FROM public.employees e
LEFT JOIN public.profiles p
  ON p.id = e.profile_id
 AND p.tenant_id = e.tenant_id
LEFT JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
WHERE ar.employee_id = e.id
  AND ar.tenant_id = e.tenant_id
  AND ar.checkout_requested_at IS NOT NULL
  AND ar.check_out IS NULL
  AND ar.checkout_requested_by_role IS NULL;

CREATE OR REPLACE FUNCTION public.employee_request_clock_out_with_code(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record public.attendance_records%ROWTYPE;
  v_remaining integer;
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
    AND i.is_done = false;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  IF v_record.checkout_requested_at IS NOT NULL THEN
    RETURN v_record.checkout_requested_at;
  END IF;

  v_requested_at := now();

  SELECT
    p.full_name,
    COALESCE(po.legacy_role_code::text, 'office')
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
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner', 'super_manager', 'area_manager']::text[]
    ELSE ARRAY['branch_manager']::text[]
  END;

  UPDATE public.attendance_records
  SET
    checkout_requested_at = v_requested_at,
    checkout_requested_code_verified = true,
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

CREATE OR REPLACE FUNCTION public.employee_clock_out_with_code(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.employee_request_clock_out_with_code(
    p_tenant_id,
    p_employee_id,
    p_attendance_id
  );
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
  v_approver_role text;
  v_requested_at timestamptz;
  v_check_out timestamptz;
BEGIN
  SELECT
    ar.branch_id,
    e.profile_id,
    COALESCE(ar.checkout_requested_by_role, po.legacy_role_code::text, 'office'),
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = p_approved_by THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(po.legacy_role_code::text, 'office')
  INTO v_approver_role
  FROM public.profiles p
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_approved_by
    AND p.tenant_id = p_tenant_id;

  v_approver_role := COALESCE(v_approver_role, 'office');
  v_requester_role := COALESCE(v_requester_role, 'office');

  IF v_requester_role = 'branch_manager' THEN
    IF v_approver_role NOT IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role = 'branch_manager' THEN
    IF v_requester_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role NOT IN ('owner', 'super_manager', 'area_manager') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    check_out = v_requested_at,
    check_out_code_verified = checkout_requested_code_verified,
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

REVOKE ALL ON FUNCTION public.employee_request_clock_out_with_code(
  bigint,
  bigint,
  bigint
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.branch_manager_approve_employee_clock_out(
  bigint,
  bigint,
  bigint,
  uuid,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.employee_request_clock_out_with_code(
  bigint,
  bigint,
  bigint
) TO service_role;

GRANT EXECUTE ON FUNCTION public.branch_manager_approve_employee_clock_out(
  bigint,
  bigint,
  bigint,
  uuid,
  text
) TO service_role;
