-- Migration: split_shift_support
BEGIN;

-- 1. Extend shifts table with split window support
ALTER TABLE public.shifts
  ADD COLUMN is_split boolean NOT NULL DEFAULT false,
  ADD COLUMN start_time_2 time without time zone,
  ADD COLUMN end_time_2 time without time zone;

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_split_window_check CHECK (
    (NOT is_split AND start_time_2 IS NULL AND end_time_2 IS NULL)
    OR
    (is_split AND start_time_2 IS NOT NULL AND end_time_2 IS NOT NULL
     AND end_time > start_time
     AND end_time_2 > start_time_2
     AND end_time <= start_time_2)
  );

COMMENT ON COLUMN public.shifts.is_split IS 'True when shift consists of two discontinuous scheduled intervals in the same calendar work day (ca gãy).';
COMMENT ON COLUMN public.shifts.start_time_2 IS 'Start time of second interval for split shift.';
COMMENT ON COLUMN public.shifts.end_time_2 IS 'End time of second interval for split shift.';

-- 2. Extend attendance_records table for second window freeze and pause/resume lifecycle
ALTER TABLE public.attendance_records
  ADD COLUMN window_1_out_at timestamptz,
  ADD COLUMN check_in_2 timestamptz,
  ADD COLUMN check_in_photo_path_2 text,
  ADD COLUMN scheduled_start_at_2 timestamptz,
  ADD COLUMN scheduled_end_at_2 timestamptz;

COMMENT ON COLUMN public.attendance_records.window_1_out_at IS 'Timestamp when employee paused at end of interval 1 for split shift.';
COMMENT ON COLUMN public.attendance_records.check_in_2 IS 'Timestamp when employee clocked in for interval 2 for split shift.';
COMMENT ON COLUMN public.attendance_records.check_in_photo_path_2 IS 'Photo storage path for interval 2 clock-in.';
COMMENT ON COLUMN public.attendance_records.scheduled_start_at_2 IS 'Frozen scheduled start for interval 2 of split shift.';
COMMENT ON COLUMN public.attendance_records.scheduled_end_at_2 IS 'Frozen scheduled end for interval 2 of split shift.';

-- 3. Update self_service_clock_in to freeze interval 2 when is_split is true
CREATE OR REPLACE FUNCTION public.self_service_clock_in(
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint;
  v_employee_id bigint;
  v_assigned_branch_id bigint;
  v_role text;
  v_position_id bigint;
  v_branch_kind text;
  v_is_company_self_service boolean := false;
  v_is_opening boolean;
  v_is_closing boolean;
  v_attendance_id bigint;
  v_assignment public.shift_assignments%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_now timestamptz := now();
  v_work_date date;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_scheduled_start_2 timestamptz := NULL;
  v_scheduled_end_2 timestamptz := NULL;
  v_candidate_count int;
BEGIN
  SELECT profile.tenant_id, employee.id, profile.branch_id,
         private.staff_role_from_position_code(position.code), profile.position_id
  INTO v_tenant_id, v_employee_id, v_assigned_branch_id, v_role, v_position_id
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  JOIN public.employees employee
    ON employee.profile_id = profile.id
   AND employee.tenant_id = profile.tenant_id
  WHERE profile.id = v_actor
    AND profile.is_active
    AND position.is_active
    AND employee.is_active;

  SELECT EXISTS (
    SELECT 1
    FROM public.auth_role_bindings binding
    WHERE binding.user_id = v_actor
      AND binding.tenant_id = v_tenant_id
      AND binding.role_code = 'self_service_member'
      AND binding.scope_type = 'tenant'
      AND binding.branch_id IS NULL
      AND binding.valid_from <= v_now
      AND (binding.valid_until IS NULL OR binding.valid_until > v_now)
  )
  INTO v_is_company_self_service;
  v_is_company_self_service :=
    v_role IS NULL
    AND v_assigned_branch_id IS NULL
    AND v_is_company_self_service;

  IF v_actor IS NULL
     OR v_employee_id IS NULL
     OR v_role = 'owner'
     OR (v_role IS NULL AND NOT v_is_company_self_service) THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;
  IF p_shift_id IS NULL OR p_business_date IS NULL THEN
    RAISE EXCEPTION 'shift_assignment_required' USING ERRCODE = '22023';
  END IF;

  IF v_is_company_self_service THEN
    IF p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'company_scope_must_be_null' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'accountant' THEN
    IF v_assigned_branch_id IS NOT NULL OR p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'accountant_scope_must_be_null' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_assigned_branch_id IS NULL
       OR p_branch_id IS DISTINCT FROM v_assigned_branch_id THEN
      RAISE EXCEPTION 'assigned_site_mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT branch.branch_kind
    INTO v_branch_kind
    FROM public.branches branch
    WHERE branch.id = v_assigned_branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active
      AND branch.branch_kind IN ('branch', 'central_supply', 'central_kitchen');
    IF v_branch_kind IS NULL THEN
      RAISE EXCEPTION 'assigned_site_not_active' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT count(*)
  INTO v_candidate_count
  FROM public.shift_assignments sa
  JOIN public.shifts sh
    ON sh.id = sa.shift_id
   AND sh.tenant_id = sa.tenant_id
   AND sh.is_active
  WHERE sa.tenant_id = v_tenant_id
    AND sa.employee_id = v_employee_id
    AND sa.branch_id IS NOT DISTINCT FROM v_assigned_branch_id
    AND sa.work_date = p_business_date
    AND sa.shift_id IS NOT NULL;

  IF v_candidate_count > 1 AND p_shift_id IS NULL THEN
    RAISE EXCEPTION 'multiple_shift_candidates' USING ERRCODE = '22023';
  END IF;

  SELECT sa.*
  INTO v_assignment
  FROM public.shift_assignments sa
  JOIN public.shifts sh
    ON sh.id = sa.shift_id
   AND sh.tenant_id = sa.tenant_id
   AND sh.is_active
  WHERE sa.tenant_id = v_tenant_id
    AND sa.employee_id = v_employee_id
    AND sa.branch_id IS NOT DISTINCT FROM v_assigned_branch_id
    AND sa.work_date = p_business_date
    AND sa.shift_id = p_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_assignment_required' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts sh
  WHERE sh.id = v_assignment.shift_id
    AND sh.tenant_id = v_tenant_id
    AND sh.is_active
    AND sh.branch_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_work_date := v_assignment.work_date;
  v_is_opening := v_shift.is_opening;
  v_is_closing := v_shift.is_closing;

  v_scheduled_start := ((v_work_date + v_shift.start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh');
  IF v_shift.end_time > v_shift.start_time THEN
    v_scheduled_end := ((v_work_date + v_shift.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh');
  ELSE
    v_scheduled_end := (((v_work_date + 1) + v_shift.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh');
  END IF;

  IF v_shift.is_split THEN
    v_scheduled_start_2 := ((v_work_date + v_shift.start_time_2) AT TIME ZONE 'Asia/Ho_Chi_Minh');
    v_scheduled_end_2 := ((v_work_date + v_shift.end_time_2) AT TIME ZONE 'Asia/Ho_Chi_Minh');
  END IF;

  INSERT INTO public.attendance_records (
    tenant_id, branch_id, employee_id, shift_id, date, check_in, status,
    method, check_in_photo_path, checklist_template_id,
    shift_assignment_id, scheduled_start_at, scheduled_end_at,
    scheduled_start_at_2, scheduled_end_at_2
  )
  VALUES (
    v_tenant_id, v_assigned_branch_id, v_employee_id, v_assignment.shift_id,
    v_work_date, v_now, 'present', 'pwa', p_photo_path, NULL,
    v_assignment.id, v_scheduled_start, v_scheduled_end,
    v_scheduled_start_2, v_scheduled_end_2
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items (
    tenant_id, attendance_record_id, template_item_id, title, phase,
    done_definition, is_required, allows_photo, scope, task_kind, sort_order
  )
  SELECT v_tenant_id, v_attendance_id, template.id, template.title, template.phase,
         template.done_definition, template.is_required, template.allows_photo,
         template.scope, template.task_kind, template.sort_order
  FROM public.shift_checklist_template_items template
  WHERE template.tenant_id = v_tenant_id
    AND template.is_active
    AND (
      template.template_id = (
        SELECT default_checklist_template_id
        FROM public.employees
        WHERE id = v_employee_id
      )
      OR (
        template.position_id = v_position_id
        AND template.branch_id IS NOT DISTINCT FROM v_assigned_branch_id
      )
    )
    AND (
      template.applicability = 'every_shift'
      OR (template.applicability = 'opening' AND v_is_opening)
      OR (template.applicability = 'closing' AND v_is_closing)
    );

  RETURN v_attendance_id;
END;
$$;

-- 4. New RPC: self_service_split_pause
CREATE OR REPLACE FUNCTION public.self_service_split_pause(
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
  v_now timestamptz := now();
  v_record public.attendance_records%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT employee.id
  INTO v_employee_id
  FROM public.profiles profile
  JOIN public.employees employee
    ON employee.profile_id = profile.id
   AND employee.tenant_id = profile.tenant_id
  WHERE profile.id = v_actor
    AND profile.tenant_id = v_tenant_id
    AND COALESCE(profile.is_active, true)
    AND COALESCE(employee.is_active, true)
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_record
  FROM public.attendance_records
  WHERE id = p_attendance_id
    AND tenant_id = v_tenant_id
    AND employee_id = v_employee_id
  FOR UPDATE;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_record.check_out IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_already_closed' USING ERRCODE = '23514';
  END IF;

  IF v_record.scheduled_start_at_2 IS NULL THEN
    RAISE EXCEPTION 'split_pause_not_applicable' USING ERRCODE = '22023';
  END IF;

  IF v_record.window_1_out_at IS NOT NULL THEN
    RETURN v_record.window_1_out_at;
  END IF;

  UPDATE public.attendance_records
  SET window_1_out_at = v_now,
      updated_at = v_now
  WHERE id = v_record.id;

  RETURN v_now;
END;
$$;

-- 5. New RPC: self_service_split_resume
CREATE OR REPLACE FUNCTION public.self_service_split_resume(
  p_attendance_id bigint,
  p_photo_path text
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_employee_id bigint;
  v_now timestamptz := now();
  v_record public.attendance_records%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT employee.id
  INTO v_employee_id
  FROM public.profiles profile
  JOIN public.employees employee
    ON employee.profile_id = profile.id
   AND employee.tenant_id = profile.tenant_id
  WHERE profile.id = v_actor
    AND profile.tenant_id = v_tenant_id
    AND COALESCE(profile.is_active, true)
    AND COALESCE(employee.is_active, true)
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_record
  FROM public.attendance_records
  WHERE id = p_attendance_id
    AND tenant_id = v_tenant_id
    AND employee_id = v_employee_id
  FOR UPDATE;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_record.check_out IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_already_closed' USING ERRCODE = '23514';
  END IF;

  IF v_record.scheduled_start_at_2 IS NULL THEN
    RAISE EXCEPTION 'split_resume_not_applicable' USING ERRCODE = '22023';
  END IF;

  IF v_record.window_1_out_at IS NULL THEN
    RAISE EXCEPTION 'split_pause_required_before_resume' USING ERRCODE = '23514';
  END IF;

  IF v_record.check_in_2 IS NOT NULL THEN
    RETURN v_record.check_in_2;
  END IF;

  -- Window 2 early gate: 60 minutes before scheduled_start_at_2
  IF v_now < (v_record.scheduled_start_at_2 - interval '60 minutes') THEN
    RAISE EXCEPTION 'too_early_for_window_2' USING ERRCODE = '23514';
  END IF;

  IF v_now > v_record.scheduled_end_at_2 THEN
    RAISE EXCEPTION 'too_late_for_window_2' USING ERRCODE = '23514';
  END IF;

  UPDATE public.attendance_records
  SET check_in_2 = v_now,
      check_in_photo_path_2 = p_photo_path,
      updated_at = v_now
  WHERE id = v_record.id;

  RETURN v_now;
END;
$$;

-- 6. SQL SSOT work credit for record: attendance_shift_workdays_for_record
CREATE OR REPLACE FUNCTION public.attendance_shift_workdays_for_record(
  p_record public.attendance_records
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_w1_start timestamptz := p_record.scheduled_start_at;
  v_w1_end timestamptz := p_record.scheduled_end_at;
  v_w2_start timestamptz := p_record.scheduled_start_at_2;
  v_w2_end timestamptz := p_record.scheduled_end_at_2;
  v_punch1_start timestamptz := p_record.check_in;
  v_punch1_end timestamptz := COALESCE(p_record.window_1_out_at, p_record.check_out);
  v_punch2_start timestamptz := p_record.check_in_2;
  v_punch2_end timestamptz := p_record.check_out;
  v_overlap1 numeric := 0;
  v_overlap2 numeric := 0;
  v_shift_seconds numeric;
  v_ratio numeric;
BEGIN
  IF p_record.check_out IS NULL OR p_record.check_in IS NULL OR v_w1_start IS NULL OR v_w1_end IS NULL THEN
    RETURN 0;
  END IF;

  IF v_w2_start IS NULL OR v_w2_end IS NULL THEN
    RETURN public.attendance_shift_workdays(
      p_record.check_in,
      p_record.check_out,
      v_w1_start,
      v_w1_end
    );
  END IF;

  IF v_w1_end <= v_w1_start OR v_w2_end <= v_w2_start THEN
    RETURN 0;
  END IF;

  v_shift_seconds := EXTRACT(EPOCH FROM (v_w1_end - v_w1_start)) + EXTRACT(EPOCH FROM (v_w2_end - v_w2_start));
  IF v_shift_seconds <= 0 THEN
    RETURN 0;
  END IF;

  IF v_punch1_start IS NOT NULL AND v_punch1_end IS NOT NULL AND v_punch1_end > v_punch1_start THEN
    IF LEAST(v_punch1_end, v_w1_end) > GREATEST(v_punch1_start, v_w1_start) THEN
      v_overlap1 := EXTRACT(EPOCH FROM (LEAST(v_punch1_end, v_w1_end) - GREATEST(v_punch1_start, v_w1_start)));
    END IF;
  END IF;

  IF v_punch2_start IS NOT NULL AND v_punch2_end IS NOT NULL AND v_punch2_end > v_punch2_start THEN
    IF LEAST(v_punch2_end, v_w2_end) > GREATEST(v_punch2_start, v_w2_start) THEN
      v_overlap2 := EXTRACT(EPOCH FROM (LEAST(v_punch2_end, v_w2_end) - GREATEST(v_punch2_start, v_w2_start)));
    END IF;
  ELSIF v_punch1_start IS NOT NULL AND v_punch1_start >= v_w1_end AND v_punch1_end IS NOT NULL AND v_punch1_end > v_punch1_start THEN
    IF LEAST(v_punch1_end, v_w2_end) > GREATEST(v_punch1_start, v_w2_start) THEN
      v_overlap2 := EXTRACT(EPOCH FROM (LEAST(v_punch1_end, v_w2_end) - GREATEST(v_punch1_start, v_w2_start)));
    END IF;
  END IF;

  IF (v_overlap1 + v_overlap2) <= 0 THEN
    RETURN 0;
  END IF;

  v_ratio := (v_overlap1 + v_overlap2) / v_shift_seconds;
  IF v_w1_start >= timestamptz '2026-09-01 00:00:00+07' THEN
    RETURN LEAST(1.0, FLOOR(v_ratio * 4) / 4);
  END IF;

  RETURN LEAST(1.0, ROUND(v_ratio, 1));
END;
$$;

-- 7. Grants
GRANT EXECUTE ON FUNCTION public.self_service_split_pause(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_split_resume(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_shift_workdays_for_record(public.attendance_records) TO authenticated;

COMMIT;
