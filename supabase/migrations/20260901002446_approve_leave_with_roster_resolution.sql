-- Migration: approve_leave_with_roster_resolution
-- Approve leave and resolve affected roster rows in one transaction. The
-- request row owns employee, date, tenant, and branch scope; callers choose
-- only the resolution and an optional same-site replacement.
CREATE OR REPLACE FUNCTION public.approve_leave_request_with_roster(
  p_request_id bigint,
  p_shift_resolution text DEFAULT 'keep',
  p_replacement_employee_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
  v_replacement_branch_id bigint;
  v_assignments_changed integer := 0;
  v_first_employee_id bigint;
  v_second_employee_id bigint;
BEGIN
  IF p_shift_resolution IS NULL
     OR p_shift_resolution NOT IN ('keep', 'unassign', 'substitute') THEN
    RAISE EXCEPTION 'leave_shift_resolution_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_shift_resolution = 'substitute' AND p_replacement_employee_id IS NULL THEN
    RAISE EXCEPTION 'leave_replacement_employee_required' USING ERRCODE = '22023';
  END IF;
  IF p_shift_resolution <> 'substitute' AND p_replacement_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'leave_replacement_employee_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_request := private.authorize_leave_review(p_request_id);

  v_first_employee_id := least(
    v_request.employee_id,
    coalesce(p_replacement_employee_id, v_request.employee_id)
  );
  v_second_employee_id := greatest(
    v_request.employee_id,
    coalesce(p_replacement_employee_id, v_request.employee_id)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      format('leave-roster:%s:%s', v_request.tenant_id, v_first_employee_id),
      0
    )
  );
  IF v_second_employee_id IS DISTINCT FROM v_first_employee_id THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        format('leave-roster:%s:%s', v_request.tenant_id, v_second_employee_id),
        0
      )
    );
  END IF;

  IF p_shift_resolution <> 'keep' THEN
    IF (
      public.has_permission(v_request.branch_id, 'hr:assign_shift')
      OR public.has_permission(NULL::bigint, 'hr:assign_shift')
    ) IS NOT TRUE THEN
      RAISE EXCEPTION 'leave_shift_resolution_forbidden' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.shift_assignments assignment
      WHERE assignment.tenant_id = v_request.tenant_id
        AND assignment.employee_id = v_request.employee_id
        AND assignment.work_date BETWEEN v_request.start_date AND v_request.end_date
        AND assignment.shift_id IS NOT NULL
        AND assignment.branch_id IS DISTINCT FROM v_request.branch_id
    ) THEN
      RAISE EXCEPTION 'leave_roster_assignment_scope_mismatch' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.shift_assignments assignment
      JOIN public.attendance_records attendance
        ON attendance.tenant_id = assignment.tenant_id
       AND attendance.employee_id = assignment.employee_id
       AND attendance.date = assignment.work_date
       AND attendance.shift_id IS NOT DISTINCT FROM assignment.shift_id
      WHERE assignment.tenant_id = v_request.tenant_id
        AND assignment.employee_id = v_request.employee_id
        AND assignment.work_date BETWEEN v_request.start_date AND v_request.end_date
        AND assignment.shift_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'leave_roster_attendance_exists' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF p_shift_resolution = 'substitute' THEN
    IF p_replacement_employee_id = v_request.employee_id THEN
      RAISE EXCEPTION 'leave_replacement_employee_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT profile.branch_id
    INTO v_replacement_branch_id
    FROM public.employees employee
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = p_replacement_employee_id
      AND employee.tenant_id = v_request.tenant_id
      AND employee.is_active
      AND profile.is_active;

    IF NOT FOUND OR v_replacement_branch_id IS DISTINCT FROM v_request.branch_id THEN
      RAISE EXCEPTION 'leave_replacement_employee_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.shift_assignments (
      tenant_id,
      branch_id,
      employee_id,
      work_date,
      shift_id,
      is_shift_leader,
      assigned_by,
      assigned_at,
      source
    )
    SELECT
      assignment.tenant_id,
      assignment.branch_id,
      p_replacement_employee_id,
      assignment.work_date,
      assignment.shift_id,
      false,
      auth.uid(),
      now(),
      'manual'
    FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = v_request.tenant_id
      AND assignment.branch_id IS NOT DISTINCT FROM v_request.branch_id
      AND assignment.employee_id = v_request.employee_id
      AND assignment.work_date BETWEEN v_request.start_date AND v_request.end_date
      AND assignment.shift_id IS NOT NULL
    ON CONFLICT (tenant_id, employee_id, work_date, shift_id)
    DO UPDATE SET
      branch_id = EXCLUDED.branch_id,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = EXCLUDED.assigned_at,
      source = 'manual',
      updated_at = now();
  END IF;

  IF p_shift_resolution IN ('unassign', 'substitute') THEN
    DELETE FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = v_request.tenant_id
      AND assignment.branch_id IS NOT DISTINCT FROM v_request.branch_id
      AND assignment.employee_id = v_request.employee_id
      AND assignment.work_date BETWEEN v_request.start_date AND v_request.end_date
      AND assignment.shift_id IS NOT NULL;
    GET DIAGNOSTICS v_assignments_changed = ROW_COUNT;
  END IF;

  UPDATE public.leave_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = v_request.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave_request_not_pending' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit(
    'approve',
    'leave_request',
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', 'approved',
      'shift_resolution', p_shift_resolution,
      'replacement_employee_id', p_replacement_employee_id,
      'assignments_changed', v_assignments_changed
    )
  );

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  )
  SELECT
    v_request.tenant_id,
    v_request.branch_id,
    ARRAY[role_bucket]::text[],
    'hr.leave_approved',
    'info',
    'Nghỉ phép đã được duyệt',
    'Yêu cầu nghỉ phép của bạn đã được duyệt.',
    'leave_request',
    v_request.id,
    CASE
      WHEN v_request.branch_id IS NULL THEN '/hr/attendance?tab=leave'
      ELSE format('/br/%s/shift/schedule/leave', v_request.branch_id)
    END,
    format('hr.leave_approved:%s', v_request.id),
    jsonb_build_object(
      'leave_request_id', v_request.id,
      'decision', 'approved',
      'shift_resolution', p_shift_resolution
    )
  FROM (
    SELECT private.staff_role_from_position_code(position.code) AS role_bucket
    FROM public.employees employee
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    LEFT JOIN public.positions position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE employee.id = v_request.employee_id
      AND employee.tenant_id = v_request.tenant_id
  ) AS mapped
  WHERE role_bucket IS NOT NULL
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    meta = EXCLUDED.meta,
    created_at = now(),
    expires_at = NULL;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', 'approved',
    'shift_resolution', p_shift_resolution,
    'replacement_employee_id', p_replacement_employee_id,
    'assignments_changed', v_assignments_changed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_leave_request_with_roster(bigint, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave_request_with_roster(bigint, text, bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_leave_request_with_roster(bigint, text, bigint) IS
  'Approves a pending leave request and atomically keeps, unassigns, or substitutes its roster assignments.';

-- Preserve the established one-argument API for callers that intentionally
-- approve leave without changing roster assignments.
CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public.approve_leave_request_with_roster(p_request_id, 'keep', NULL);
END;
$$;
