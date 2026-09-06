-- Migration: attendance_direct_checkout_quarter_day_credit
BEGIN;

CREATE OR REPLACE FUNCTION public.attendance_shift_workdays(
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_overlap_start timestamptz;
  v_overlap_end timestamptz;
  v_worked_seconds numeric;
  v_shift_seconds numeric;
  v_ratio numeric;
BEGIN
  IF p_check_in IS NULL
     OR p_check_out IS NULL
     OR p_scheduled_start IS NULL
     OR p_scheduled_end IS NULL
     OR p_check_out <= p_check_in
     OR p_scheduled_end <= p_scheduled_start THEN
    RETURN 0;
  END IF;

  v_overlap_start := GREATEST(p_check_in, p_scheduled_start);
  v_overlap_end := LEAST(p_check_out, p_scheduled_end);
  IF v_overlap_end <= v_overlap_start THEN
    RETURN 0;
  END IF;

  v_worked_seconds := EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start));
  v_shift_seconds := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start));
  IF v_shift_seconds <= 0 THEN
    RETURN 0;
  END IF;

  v_ratio := v_worked_seconds / v_shift_seconds;
  IF p_scheduled_start >= timestamptz '2026-09-01 00:00:00+07' THEN
    RETURN LEAST(1.0, FLOOR(v_ratio * 4) / 4);
  END IF;

  RETURN LEAST(1.0, ROUND(v_ratio, 1));
END;
$$;

COMMENT ON FUNCTION public.attendance_shift_workdays(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) IS 'Versioned attendance credit: legacy tenth-day rounding before September 2026, then completed quarter-day buckets within the frozen scheduled window.';

CREATE OR REPLACE FUNCTION public.self_service_clock_out(
  p_attendance_id bigint
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_employee_id bigint;
  v_profile_branch_id bigint;
  v_position_code text;
  v_record public.attendance_records%ROWTYPE;
  v_count_remaining integer;
  v_check_out timestamptz := now();
  v_calendar_date date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT employee.id, profile.branch_id, position.code
  INTO v_employee_id, v_profile_branch_id, v_position_code
  FROM public.profiles AS profile
  JOIN public.employees AS employee
    ON employee.profile_id = profile.id
   AND employee.tenant_id = profile.tenant_id
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.id = v_actor
    AND profile.tenant_id = v_tenant_id
    AND COALESCE(profile.is_active, true)
    AND COALESCE(employee.is_active, true)
  LIMIT 1;

  IF v_employee_id IS NULL
     OR v_position_code IS NULL
     OR v_position_code = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF v_profile_branch_id IS NOT NULL
     AND v_position_code NOT IN (
       'branch_manager',
       'hr_manager',
       'central_supply_ops',
       'central_kitchen_lead'
     ) THEN
    RAISE EXCEPTION 'direct_checkout_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT attendance.*
  INTO v_record
  FROM public.attendance_records AS attendance
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.employee_id = v_employee_id
    AND attendance.branch_id IS NOT DISTINCT FROM v_profile_branch_id
    AND attendance.date BETWEEN v_calendar_date - 1 AND v_calendar_date
  FOR UPDATE;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_record.check_out IS NOT NULL THEN
    RETURN v_record.check_out;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_checklist_items AS item
    WHERE item.attendance_record_id = v_record.id
      AND item.tenant_id = v_tenant_id
      AND item.is_required
      AND COALESCE(item.task_kind, 'standard') <> 'inventory_count'
      AND NOT item.is_done
  ) THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_checklist_items AS item
    WHERE item.attendance_record_id = v_record.id
      AND item.tenant_id = v_tenant_id
      AND item.is_required
      AND item.allows_photo
      AND btrim(COALESCE(item.photo_path, '')) = ''
  ) THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer
  INTO v_count_remaining
  FROM (
    SELECT assignment.location_id
    FROM public.inventory_count_assignments AS assignment
    WHERE assignment.tenant_id = v_tenant_id
      AND assignment.branch_id IS NOT DISTINCT FROM v_record.branch_id
      AND assignment.employee_id = v_employee_id
      AND assignment.is_active
      AND (assignment.shift_id IS NULL OR assignment.shift_id = v_record.shift_id)
    GROUP BY assignment.location_id
  ) AS assigned
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.inventory_count_slips AS slip
    WHERE slip.tenant_id = v_tenant_id
      AND slip.branch_id IS NOT DISTINCT FROM v_record.branch_id
      AND slip.employee_id = v_employee_id
      AND slip.location_id = assigned.location_id
      AND slip.count_date = v_record.date
      AND slip.shift_id IS NOT DISTINCT FROM v_record.shift_id
      AND slip.status IN ('submitted', 'approved')
  );

  IF v_count_remaining > 0 THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  UPDATE public.attendance_records AS attendance
  SET check_out = v_check_out,
      checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      checkout_approved_at = NULL,
      checkout_approved_by = NULL,
      checkout_approval_note = NULL,
      updated_at = v_check_out
  WHERE attendance.id = v_record.id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.employee_id = v_employee_id
    AND attendance.check_out IS NULL;

  UPDATE public.notifications AS notification
  SET expires_at = v_check_out
  WHERE notification.tenant_id = v_tenant_id
    AND notification.entity_type = 'attendance_record'
    AND notification.entity_id = v_record.id
    AND notification.kind = 'hr.checkout_requested'
    AND notification.expires_at IS NULL;

  PERFORM public.log_audit(
    'attendance.direct_clock_out',
    'attendance_record',
    v_record.id,
    jsonb_build_object('check_out', v_record.check_out),
    jsonb_build_object('check_out', v_check_out, 'position_code', v_position_code)
  );

  RETURN v_check_out;
END;
$$;

COMMENT ON FUNCTION public.self_service_clock_out(bigint) IS
  'Closes the caller-owned current attendance immediately for office scope or approved management positions, while preserving checklist, photo, and inventory-count gates.';

REVOKE ALL ON FUNCTION public.self_service_clock_out(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_service_clock_out(bigint)
  TO authenticated, service_role;

COMMIT;
