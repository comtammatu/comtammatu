\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_employee_id bigint;
  v_shift_id bigint;
  v_attendance_id bigint;
  v_requested_at timestamptz;
  v_business_date date := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1);
BEGIN
  SELECT e.tenant_id, p.branch_id, e.id
  INTO v_tenant_id, v_branch_id, v_employee_id
  FROM public.employees e
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE COALESCE(e.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
    AND p.branch_id IS NOT NULL
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: no active branch employee found';
  END IF;

  INSERT INTO public.shifts (
    tenant_id,
    branch_id,
    name,
    start_time,
    end_time,
    is_active
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    'Test overnight checkout',
    '18:00:00',
    '02:00:00',
    true
  )
  RETURNING id INTO v_shift_id;

  INSERT INTO public.attendance_records (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    date,
    check_in,
    status,
    method
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    v_employee_id,
    v_shift_id,
    v_business_date,
    now() - INTERVAL '1 hour',
    'present',
    'manual'
  )
  RETURNING id INTO v_attendance_id;

  v_requested_at := public.employee_request_clock_out(
    v_tenant_id,
    v_employee_id,
    v_attendance_id
  );

  IF v_requested_at IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.id = v_attendance_id
      AND ar.date = v_business_date
      AND ar.checkout_requested_at = v_requested_at
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: previous-date overnight attendance was not selected';
  END IF;

  IF public.employee_request_clock_out(
    v_tenant_id,
    v_employee_id,
    v_attendance_id
  ) IS DISTINCT FROM v_requested_at THEN
    RAISE EXCEPTION 'TEST FAILED: checkout request replay was not idempotent';
  END IF;
END;
$$;

ROLLBACK;
