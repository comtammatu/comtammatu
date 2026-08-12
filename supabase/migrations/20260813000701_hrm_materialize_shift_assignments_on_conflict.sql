-- ADR 0036 follow-up: recurring materialize still targeted the dropped
-- UNIQUE (tenant_id, employee_id, work_date). Postgres 42P10 on roster
-- save / weekly-schedule save / nightly cron.

CREATE OR REPLACE FUNCTION private.materialize_employee_weekly_schedules(
  p_employee_id bigint DEFAULT NULL,
  p_through_date date DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 120)
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer := 0;
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  INSERT INTO public.shift_assignments AS existing_assignment (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    work_date,
    assigned_by,
    assigned_at,
    source
  )
  SELECT
    planned.tenant_id,
    planned.branch_id,
    planned.employee_id,
    planned.shift_id,
    planned.work_date,
    planned.updated_by,
    now(),
    'recurring'
  FROM (
    SELECT
      schedule.tenant_id,
      profile.branch_id,
      schedule.employee_id,
      CASE extract(isodow FROM dates.work_day)::integer
        WHEN 1 THEN schedule.monday_shift_id
        WHEN 2 THEN schedule.tuesday_shift_id
        WHEN 3 THEN schedule.wednesday_shift_id
        WHEN 4 THEN schedule.thursday_shift_id
        WHEN 5 THEN schedule.friday_shift_id
        WHEN 6 THEN schedule.saturday_shift_id
        WHEN 7 THEN schedule.sunday_shift_id
      END AS shift_id,
      dates.work_day::date AS work_date,
      schedule.updated_by
    FROM public.employee_weekly_schedules schedule
    JOIN public.employees employee
      ON employee.id = schedule.employee_id
     AND employee.tenant_id = schedule.tenant_id
     AND employee.is_active
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
     AND profile.is_active
    CROSS JOIN LATERAL generate_series(
      greatest(
        v_today,
        schedule.effective_from,
        coalesce(employee.start_date, schedule.effective_from)
      ),
      p_through_date,
      interval '1 day'
    ) AS dates(work_day)
    WHERE (p_employee_id IS NULL OR schedule.employee_id = p_employee_id)
  ) planned
  WHERE planned.shift_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance_records attendance
      WHERE attendance.tenant_id = planned.tenant_id
        AND attendance.employee_id = planned.employee_id
        AND attendance.date = planned.work_date
        AND attendance.shift_id IS NOT DISTINCT FROM planned.shift_id
    )
  ON CONFLICT (tenant_id, employee_id, work_date, shift_id)
  DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    shift_id = EXCLUDED.shift_id,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = EXCLUDED.assigned_at,
    source = 'recurring',
    updated_at = now()
  WHERE existing_assignment.source = 'recurring';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.materialize_employee_weekly_schedules(bigint, date)
  FROM PUBLIC, anon, authenticated, service_role;
