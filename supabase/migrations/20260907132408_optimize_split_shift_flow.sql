-- Migration: optimize_split_shift_flow
-- Optimizes split shift attendance to support both 2-touch flow (punch in at window 1,
-- checkout at window 2 with auto break deduction) and 4-touch flow (with smart resume
-- that auto-records window 1 end if split pause was missed).

BEGIN;

-- 1. Update self_service_split_resume to auto-close window 1 if paused was missed
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
  v_record public.attendance_records;
  v_now timestamptz := clock_timestamp();
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

  -- Auto-record window 1 end if the employee forgot to pause between shifts
  IF v_record.window_1_out_at IS NULL THEN
    v_record.window_1_out_at := COALESCE(v_record.scheduled_end_at, v_record.check_in);
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
  SET window_1_out_at = v_record.window_1_out_at,
      check_in_2 = v_now,
      check_in_photo_path_2 = p_photo_path,
      updated_at = v_now
  WHERE id = v_record.id;

  RETURN v_now;
END;
$$;

-- 2. Update attendance_shift_workdays_for_record to credit both windows on 2-touch punch
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
  ELSIF (p_record.window_1_out_at IS NULL OR v_punch1_start >= v_w1_end)
        AND v_punch1_start IS NOT NULL AND v_punch1_end IS NOT NULL AND v_punch1_end > v_punch1_start THEN
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

COMMIT;
