BEGIN;

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT
  tenant.id,
  setting.key,
  setting.value,
  setting.description
FROM public.tenants tenant
CROSS JOIN (
  VALUES
    ('hr_standard_workdays', '26', 'Số ngày công chuẩn mỗi tháng'),
    ('hr_monthly_leave_days', '2', 'Số ngày phép có lương phân bổ mỗi tháng')
) AS setting(key, value, description)
ON CONFLICT (key, tenant_id) DO NOTHING;

ALTER TABLE public.shift_assignments
  ALTER COLUMN shift_id DROP NOT NULL,
  ADD COLUMN source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.shift_assignments
  ADD CONSTRAINT shift_assignments_source_valid
    CHECK (source = ANY (ARRAY['manual', 'recurring', 'day_off']::text[])),
  ADD CONSTRAINT shift_assignments_shift_source_valid
    CHECK (
      (source = 'day_off' AND shift_id IS NULL)
      OR (source IN ('manual', 'recurring') AND shift_id IS NOT NULL)
    );

CREATE TABLE public.employee_weekly_schedules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id bigint NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  monday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  tuesday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  wednesday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  thursday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  friday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  saturday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  sunday_shift_id bigint REFERENCES public.shifts(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_weekly_schedules_employee_unique
    UNIQUE (tenant_id, employee_id),
  CONSTRAINT employee_weekly_schedules_has_workday
    CHECK (num_nonnulls(
      monday_shift_id,
      tuesday_shift_id,
      wednesday_shift_id,
      thursday_shift_id,
      friday_shift_id,
      saturday_shift_id,
      sunday_shift_id
    ) > 0)
);

CREATE INDEX employee_weekly_schedules_tenant_effective_idx
  ON public.employee_weekly_schedules (tenant_id, effective_from);

CREATE TRIGGER trg_employee_weekly_schedules_updated_at
  BEFORE UPDATE ON public.employee_weekly_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.employee_weekly_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_weekly_schedules_select
ON public.employee_weekly_schedules
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.employees employee
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = employee_weekly_schedules.employee_id
      AND employee.tenant_id = employee_weekly_schedules.tenant_id
      AND (
        employee.profile_id = (SELECT auth.uid())
        OR public.has_permission(profile.branch_id, 'hr:assign_shift')
        OR public.has_permission(NULL::bigint, 'hr:assign_shift')
      )
  )
);

REVOKE ALL ON TABLE public.employee_weekly_schedules FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.employee_weekly_schedules TO authenticated;
GRANT ALL ON TABLE public.employee_weekly_schedules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.employee_weekly_schedules_id_seq
  TO service_role;

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
    END,
    dates.work_day::date,
    schedule.updated_by,
    now(),
    'recurring'
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
    greatest(v_today, schedule.effective_from, coalesce(employee.start_date, schedule.effective_from)),
    p_through_date,
    interval '1 day'
  ) AS dates(work_day)
  WHERE (p_employee_id IS NULL OR schedule.employee_id = p_employee_id)
    AND CASE extract(isodow FROM dates.work_day)::integer
      WHEN 1 THEN schedule.monday_shift_id
      WHEN 2 THEN schedule.tuesday_shift_id
      WHEN 3 THEN schedule.wednesday_shift_id
      WHEN 4 THEN schedule.thursday_shift_id
      WHEN 5 THEN schedule.friday_shift_id
      WHEN 6 THEN schedule.saturday_shift_id
      WHEN 7 THEN schedule.sunday_shift_id
    END IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance_records attendance
      WHERE attendance.tenant_id = schedule.tenant_id
        AND attendance.employee_id = schedule.employee_id
        AND attendance.date = dates.work_day::date
    )
  ON CONFLICT (tenant_id, employee_id, work_date)
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

CREATE OR REPLACE FUNCTION private.refresh_weekly_schedule_after_profile_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_employee_id bigint;
BEGIN
  IF OLD.branch_id IS NOT DISTINCT FROM NEW.branch_id THEN
    RETURN NEW;
  END IF;

  SELECT employee.id
  INTO v_employee_id
  FROM public.employees employee
  WHERE employee.tenant_id = NEW.tenant_id
    AND employee.profile_id = NEW.id;

  IF v_employee_id IS NOT NULL THEN
    PERFORM private.materialize_employee_weekly_schedules(v_employee_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_refresh_weekly_schedule
  AFTER UPDATE OF branch_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.refresh_weekly_schedule_after_profile_move();

CREATE OR REPLACE FUNCTION private.refresh_weekly_schedule_after_employee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.start_date IS DISTINCT FROM NEW.start_date
     OR OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    DELETE FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = NEW.tenant_id
      AND assignment.employee_id = NEW.id
      AND assignment.source = 'recurring'
      AND assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND NOT EXISTS (
        SELECT 1
        FROM public.attendance_records attendance
        WHERE attendance.tenant_id = assignment.tenant_id
          AND attendance.employee_id = assignment.employee_id
          AND attendance.date = assignment.work_date
      );
    PERFORM private.materialize_employee_weekly_schedules(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employees_refresh_weekly_schedule
  AFTER UPDATE OF start_date, is_active ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION private.refresh_weekly_schedule_after_employee_change();

CREATE OR REPLACE FUNCTION private.protect_active_weekly_schedule_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1
    FROM public.employee_weekly_schedules schedule
    WHERE schedule.tenant_id = NEW.tenant_id
      AND NEW.id = ANY (ARRAY[
        schedule.monday_shift_id,
        schedule.tuesday_shift_id,
        schedule.wednesday_shift_id,
        schedule.thursday_shift_id,
        schedule.friday_shift_id,
        schedule.saturday_shift_id,
        schedule.sunday_shift_id
      ])
  ) THEN
    RAISE EXCEPTION 'shift_used_by_weekly_schedule' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shifts_protect_weekly_schedule
  BEFORE UPDATE OF is_active ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_active_weekly_schedule_shift();

REVOKE ALL ON FUNCTION private.materialize_employee_weekly_schedules(bigint, date)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.refresh_weekly_schedule_after_profile_move()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.refresh_weekly_schedule_after_employee_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.protect_active_weekly_schedule_shift()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.materialize_employee_weekly_schedules()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT private.materialize_employee_weekly_schedules();
$$;

REVOKE ALL ON FUNCTION public.materialize_employee_weekly_schedules()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_employee_weekly_schedules()
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_employee_weekly_schedule(
  p_employee_id bigint,
  p_effective_from date,
  p_days jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_branch_id bigint;
  v_start_date date;
  v_day jsonb;
  v_weekday integer;
  v_shift_id bigint;
  v_shift_ids bigint[] := ARRAY[]::bigint[];
  v_shift_by_day bigint[] := ARRAY[NULL, NULL, NULL, NULL, NULL, NULL, NULL]::bigint[];
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'effective_from_required' USING ERRCODE = '22023';
  END IF;
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'schedule_days_must_be_array' USING ERRCODE = '22023';
  END IF;

  SELECT profile.branch_id, employee.start_date
  INTO v_branch_id, v_start_date
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.id = p_employee_id
    AND employee.tenant_id = v_tenant_id
    AND employee.is_active
    AND profile.is_active
  FOR UPDATE OF employee;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (
    public.has_permission(v_branch_id, 'hr:assign_shift')
    OR public.has_permission(NULL::bigint, 'hr:assign_shift')
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_start_date IS NOT NULL AND p_effective_from < v_start_date THEN
    RAISE EXCEPTION 'schedule_before_employee_start' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_days) = 0 THEN
    DELETE FROM public.employee_weekly_schedules schedule
    WHERE schedule.tenant_id = v_tenant_id
      AND schedule.employee_id = p_employee_id;

    DELETE FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = v_tenant_id
      AND assignment.employee_id = p_employee_id
      AND assignment.source IN ('recurring', 'day_off')
      AND assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND NOT EXISTS (
        SELECT 1
        FROM public.attendance_records attendance
        WHERE attendance.tenant_id = assignment.tenant_id
          AND attendance.employee_id = assignment.employee_id
          AND attendance.date = assignment.work_date
      );

    RETURN jsonb_build_object('cleared', true);
  END IF;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days)
  LOOP
    v_weekday := (v_day->>'weekday')::integer;
    v_shift_id := (v_day->>'shift_id')::bigint;
    IF v_weekday < 1 OR v_weekday > 7 OR v_shift_id IS NULL THEN
      RAISE EXCEPTION 'schedule_day_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_shift_by_day[v_weekday] IS NOT NULL THEN
      RAISE EXCEPTION 'schedule_day_duplicate' USING ERRCODE = '22023';
    END IF;
    v_shift_by_day[v_weekday] := v_shift_id;
    v_shift_ids := array_append(v_shift_ids, v_shift_id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_shift_ids) requested_shift_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.shifts shift
      WHERE shift.id = requested_shift_id
        AND shift.tenant_id = v_tenant_id
        AND shift.branch_id IS NULL
        AND shift.is_active
    )
  ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.employee_weekly_schedules (
    tenant_id,
    employee_id,
    effective_from,
    monday_shift_id,
    tuesday_shift_id,
    wednesday_shift_id,
    thursday_shift_id,
    friday_shift_id,
    saturday_shift_id,
    sunday_shift_id,
    updated_by
  )
  VALUES (
    v_tenant_id,
    p_employee_id,
    p_effective_from,
    v_shift_by_day[1],
    v_shift_by_day[2],
    v_shift_by_day[3],
    v_shift_by_day[4],
    v_shift_by_day[5],
    v_shift_by_day[6],
    v_shift_by_day[7],
    v_actor
  )
  ON CONFLICT (tenant_id, employee_id)
  DO UPDATE SET
    effective_from = EXCLUDED.effective_from,
    monday_shift_id = EXCLUDED.monday_shift_id,
    tuesday_shift_id = EXCLUDED.tuesday_shift_id,
    wednesday_shift_id = EXCLUDED.wednesday_shift_id,
    thursday_shift_id = EXCLUDED.thursday_shift_id,
    friday_shift_id = EXCLUDED.friday_shift_id,
    saturday_shift_id = EXCLUDED.saturday_shift_id,
    sunday_shift_id = EXCLUDED.sunday_shift_id,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  DELETE FROM public.shift_assignments assignment
  WHERE assignment.tenant_id = v_tenant_id
    AND assignment.employee_id = p_employee_id
    AND assignment.source = 'recurring'
    AND assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance_records attendance
      WHERE attendance.tenant_id = assignment.tenant_id
        AND attendance.employee_id = assignment.employee_id
        AND attendance.date = assignment.work_date
    );

  PERFORM private.materialize_employee_weekly_schedules(p_employee_id);
  RETURN jsonb_build_object('cleared', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_employee_weekly_schedule(bigint, date, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_employee_weekly_schedule(bigint, date, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_shift_assignments_week(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_week_start date,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := public.auth_role();
  v_actor_branch bigint := public.auth_branch_id();
  v_tenant bigint := public.auth_tenant_id();
  v_week_end date := p_week_start + 6;
  v_created int := 0;
  v_updated int := 0;
  v_deleted int := 0;
  v_skipped int := 0;
  v_item jsonb;
  v_employee_id bigint;
  v_work_date date;
  v_shift_id bigint;
  v_emp_branch bigint;
  v_lock_key bigint;
  v_existing_id bigint;
  v_existing_shift bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL OR v_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF (
    public.has_permission(p_branch_id, 'hr:assign_shift')
    OR public.has_permission(NULL::bigint, 'hr:assign_shift')
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'branch_manager' AND (
    p_branch_id IS NULL OR v_actor_branch IS DISTINCT FROM p_branch_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'week_start_must_be_monday' USING ERRCODE = '22023';
  END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments_must_be_array' USING ERRCODE = '22023';
  END IF;

  v_lock_key := pg_catalog.hashtextextended(
    format('%s:%s:%s', p_tenant_id, coalesce(p_branch_id::text, 'null'), p_week_start::text),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  WITH desired AS (
    SELECT DISTINCT
      (element->>'employee_id')::bigint AS employee_id,
      (element->>'work_date')::date AS work_date,
      (element->>'shift_id')::bigint AS shift_id
    FROM jsonb_array_elements(p_assignments) element
  ),
  omitted AS (
    SELECT assignment.id
    FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = p_tenant_id
      AND assignment.branch_id IS NOT DISTINCT FROM p_branch_id
      AND assignment.work_date BETWEEN p_week_start AND v_week_end
      AND NOT EXISTS (
        SELECT 1
        FROM desired
        WHERE desired.employee_id = assignment.employee_id
          AND desired.work_date = assignment.work_date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.attendance_records attendance
        WHERE attendance.tenant_id = assignment.tenant_id
          AND attendance.employee_id = assignment.employee_id
          AND attendance.date = assignment.work_date
      )
  ),
  marked_off AS (
    UPDATE public.shift_assignments assignment
    SET shift_id = NULL,
        source = 'day_off',
        assigned_by = v_actor,
        assigned_at = now(),
        updated_at = now()
    FROM omitted
    JOIN public.employee_weekly_schedules schedule
      ON schedule.tenant_id = p_tenant_id
    WHERE assignment.id = omitted.id
      AND schedule.employee_id = assignment.employee_id
      AND assignment.work_date >= schedule.effective_from
      AND CASE extract(isodow FROM assignment.work_date)::integer
        WHEN 1 THEN schedule.monday_shift_id
        WHEN 2 THEN schedule.tuesday_shift_id
        WHEN 3 THEN schedule.wednesday_shift_id
        WHEN 4 THEN schedule.thursday_shift_id
        WHEN 5 THEN schedule.friday_shift_id
        WHEN 6 THEN schedule.saturday_shift_id
        WHEN 7 THEN schedule.sunday_shift_id
      END IS NOT NULL
    RETURNING assignment.id
  ),
  removed AS (
    DELETE FROM public.shift_assignments assignment
    USING omitted
    WHERE assignment.id = omitted.id
      AND NOT EXISTS (
        SELECT 1 FROM marked_off WHERE marked_off.id = assignment.id
      )
    RETURNING assignment.id
  )
  SELECT count(*) INTO v_deleted FROM removed;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_employee_id := (v_item->>'employee_id')::bigint;
    v_work_date := (v_item->>'work_date')::date;
    v_shift_id := (v_item->>'shift_id')::bigint;

    IF v_employee_id IS NULL OR v_work_date IS NULL OR v_shift_id IS NULL THEN
      RAISE EXCEPTION 'assignment_fields_required' USING ERRCODE = '22023';
    END IF;
    IF v_work_date < p_week_start OR v_work_date > v_week_end THEN
      RAISE EXCEPTION 'work_date_outside_week' USING ERRCODE = '22023';
    END IF;

    SELECT profile.branch_id
    INTO v_emp_branch
    FROM public.employees employee
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = v_employee_id
      AND employee.tenant_id = p_tenant_id
      AND employee.is_active
      AND profile.is_active;
    IF NOT FOUND OR v_emp_branch IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'employee_not_in_site' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.shifts shift
      WHERE shift.id = v_shift_id
        AND shift.tenant_id = p_tenant_id
        AND shift.is_active
        AND shift.branch_id IS NULL
    ) THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.attendance_records attendance
      WHERE attendance.tenant_id = p_tenant_id
        AND attendance.employee_id = v_employee_id
        AND attendance.date = v_work_date
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT assignment.id, assignment.shift_id
    INTO v_existing_id, v_existing_shift
    FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = p_tenant_id
      AND assignment.employee_id = v_employee_id
      AND assignment.work_date = v_work_date;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.shift_assignments (
        tenant_id, branch_id, employee_id, shift_id, work_date,
        assigned_by, assigned_at, source
      )
      VALUES (
        p_tenant_id, p_branch_id, v_employee_id, v_shift_id, v_work_date,
        v_actor, now(), 'manual'
      );
      v_created := v_created + 1;
    ELSIF v_existing_shift IS DISTINCT FROM v_shift_id THEN
      UPDATE public.shift_assignments
      SET shift_id = v_shift_id,
          branch_id = p_branch_id,
          source = 'manual',
          assigned_by = v_actor,
          assigned_at = now(),
          updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'deleted', v_deleted,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_shift_assignments_week(bigint, bigint, date, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_shift_assignments_week(bigint, bigint, date, jsonb)
  TO authenticated, service_role;

SELECT cron.schedule(
  'materialize-employee-weekly-schedules',
  '10 16 * * *',
  'SELECT public.materialize_employee_weekly_schedules();'
);

INSERT INTO private.cron_job_health_grace (jobid, registered_at)
SELECT jobid, now()
FROM cron.job
WHERE jobname = 'materialize-employee-weekly-schedules'
ON CONFLICT (jobid) DO UPDATE
SET registered_at = EXCLUDED.registered_at;

COMMIT;
