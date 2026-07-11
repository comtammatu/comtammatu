-- HR bulk scheduling workflow.
-- Preserves one primary shift assignment per employee per business date.

CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant_branch_date
  ON public.shift_assignments (tenant_id, branch_id, date);

CREATE OR REPLACE FUNCTION public.bulk_upsert_shift_assignments(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_employee_ids bigint[],
  p_dates date[],
  p_mode text DEFAULT 'skip_existing'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_mode text := COALESCE(NULLIF(btrim(p_mode), ''), 'skip_existing');
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_employee_id bigint;
  v_date date;
  v_existing_id bigint;
  v_inserted_id bigint;
  v_is_replacement boolean;
  v_created integer := 0;
  v_replaced integer := 0;
  v_skipped integer := 0;
  v_requested integer := 0;
  v_valid_employee_ids bigint[] := ARRAY[]::bigint[];
  v_valid_dates date[] := ARRAY[]::date[];
  v_invalid_employee_ids bigint[] := ARRAY[]::bigint[];
  v_invalid_dates date[] := ARRAY[]::date[];
BEGIN
  IF v_mode NOT IN ('skip_existing', 'replace_future') THEN
    RAISE EXCEPTION 'invalid_bulk_assignment_mode' USING ERRCODE = '22023';
  END IF;

  IF p_employee_ids IS NULL OR array_length(p_employee_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'employee_ids_required' USING ERRCODE = '22023';
  END IF;

  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'assignment_dates_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shifts s
    WHERE s.id = p_shift_id
      AND s.tenant_id = p_tenant_id
      AND s.branch_id = p_branch_id
      AND COALESCE(s.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(valid.employee_id ORDER BY valid.employee_id), ARRAY[]::bigint[])
  INTO v_valid_employee_ids
  FROM (
    SELECT DISTINCT input.employee_id
    FROM unnest(p_employee_ids) AS input(employee_id)
    JOIN public.employees e
      ON e.id = input.employee_id
     AND e.tenant_id = p_tenant_id
     AND e.is_active = true
    JOIN public.profiles p
      ON p.id = e.profile_id
     AND p.tenant_id = e.tenant_id
     AND p.branch_id = p_branch_id
    WHERE input.employee_id IS NOT NULL
  ) AS valid;

  SELECT COALESCE(array_agg(invalid.employee_id ORDER BY invalid.employee_id), ARRAY[]::bigint[])
  INTO v_invalid_employee_ids
  FROM (
    SELECT DISTINCT input.employee_id
    FROM unnest(p_employee_ids) AS input(employee_id)
    WHERE input.employee_id IS NOT NULL
    EXCEPT
    SELECT unnest(v_valid_employee_ids)
  ) AS invalid;

  SELECT COALESCE(array_agg(valid.date_value ORDER BY valid.date_value), ARRAY[]::date[])
  INTO v_valid_dates
  FROM (
    SELECT DISTINCT input.date_value
    FROM unnest(p_dates) AS input(date_value)
    WHERE input.date_value IS NOT NULL
      AND input.date_value >= v_today
  ) AS valid;

  SELECT COALESCE(array_agg(invalid.date_value ORDER BY invalid.date_value), ARRAY[]::date[])
  INTO v_invalid_dates
  FROM (
    SELECT DISTINCT input.date_value
    FROM unnest(p_dates) AS input(date_value)
    WHERE input.date_value IS NOT NULL
      AND input.date_value < v_today
  ) AS invalid;

  FOREACH v_employee_id IN ARRAY v_valid_employee_ids LOOP
    FOREACH v_date IN ARRAY v_valid_dates LOOP
      v_requested := v_requested + 1;
      v_existing_id := NULL;
      v_inserted_id := NULL;
      v_is_replacement := false;

      SELECT sa.id
      INTO v_existing_id
      FROM public.shift_assignments sa
      WHERE sa.tenant_id = p_tenant_id
        AND sa.employee_id = v_employee_id
        AND sa.date = v_date
      FOR UPDATE;

      IF v_existing_id IS NOT NULL THEN
        IF v_mode = 'replace_future' AND v_date > v_today THEN
          DELETE FROM public.shift_assignments
          WHERE id = v_existing_id
            AND tenant_id = p_tenant_id;
          v_is_replacement := true;
        ELSE
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
      END IF;

      INSERT INTO public.shift_assignments (
        tenant_id,
        branch_id,
        employee_id,
        shift_id,
        date
      )
      VALUES (
        p_tenant_id,
        p_branch_id,
        v_employee_id,
        p_shift_id,
        v_date
      )
      ON CONFLICT (employee_id, date, tenant_id) DO NOTHING
      RETURNING id INTO v_inserted_id;

      IF v_inserted_id IS NULL THEN
        v_skipped := v_skipped + 1;
      ELSIF v_is_replacement THEN
        v_replaced := v_replaced + 1;
      ELSE
        v_created := v_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'requested', v_requested,
    'created', v_created,
    'replaced', v_replaced,
    'skipped', v_skipped,
    'invalidEmployeeIds', to_jsonb(v_invalid_employee_ids),
    'invalidDates', to_jsonb(v_invalid_dates)
  );
END;
$$;

COMMENT ON FUNCTION public.bulk_upsert_shift_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  date[],
  text
) IS 'Atomically assigns one active shift to many active branch employees across many current/future dates. Preserves one assignment per employee/date.';

REVOKE ALL ON FUNCTION public.bulk_upsert_shift_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  date[],
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_shift_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  date[],
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.copy_shift_assignments_week(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_source_week_start date,
  p_target_week_start date,
  p_mode text DEFAULT 'skip_existing'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_mode text := COALESCE(NULLIF(btrim(p_mode), ''), 'skip_existing');
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_source record;
  v_target_date date;
  v_existing_id bigint;
  v_inserted_id bigint;
  v_is_replacement boolean;
  v_created integer := 0;
  v_replaced integer := 0;
  v_skipped integer := 0;
  v_requested integer := 0;
  v_invalid_dates date[] := ARRAY[]::date[];
BEGIN
  IF v_mode NOT IN ('skip_existing', 'replace_future') THEN
    RAISE EXCEPTION 'invalid_bulk_assignment_mode' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_source IN
    SELECT
      sa.employee_id,
      sa.shift_id,
      sa.date,
      p_target_week_start + (sa.date - p_source_week_start) AS target_date
    FROM public.shift_assignments sa
    JOIN public.shifts s
      ON s.id = sa.shift_id
     AND s.tenant_id = sa.tenant_id
     AND s.branch_id = sa.branch_id
     AND COALESCE(s.is_active, true) = true
    JOIN public.employees e
      ON e.id = sa.employee_id
     AND e.tenant_id = sa.tenant_id
     AND e.is_active = true
    JOIN public.profiles p
      ON p.id = e.profile_id
     AND p.tenant_id = e.tenant_id
     AND p.branch_id = sa.branch_id
    WHERE sa.tenant_id = p_tenant_id
      AND sa.branch_id = p_branch_id
      AND sa.date >= p_source_week_start
      AND sa.date < p_source_week_start + 7
    ORDER BY sa.date, sa.employee_id
  LOOP
    v_target_date := v_source.target_date;
    v_existing_id := NULL;
    v_inserted_id := NULL;
    v_is_replacement := false;

    IF v_target_date < v_today THEN
      v_invalid_dates := array_append(v_invalid_dates, v_target_date);
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_requested := v_requested + 1;

    SELECT sa.id
    INTO v_existing_id
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = p_tenant_id
      AND sa.employee_id = v_source.employee_id
      AND sa.date = v_target_date
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      IF v_mode = 'replace_future' AND v_target_date > v_today THEN
        DELETE FROM public.shift_assignments
        WHERE id = v_existing_id
          AND tenant_id = p_tenant_id;
        v_is_replacement := true;
      ELSE
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.shift_assignments (
      tenant_id,
      branch_id,
      employee_id,
      shift_id,
      date
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      v_source.employee_id,
      v_source.shift_id,
      v_target_date
    )
    ON CONFLICT (employee_id, date, tenant_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
      v_skipped := v_skipped + 1;
    ELSIF v_is_replacement THEN
      v_replaced := v_replaced + 1;
    ELSE
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'requested', v_requested,
    'created', v_created,
    'replaced', v_replaced,
    'skipped', v_skipped,
    'invalidEmployeeIds', to_jsonb(ARRAY[]::bigint[]),
    'invalidDates', to_jsonb(
      COALESCE(
        ARRAY(SELECT DISTINCT unnest(v_invalid_dates) ORDER BY 1),
        ARRAY[]::date[]
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.copy_shift_assignments_week(
  bigint,
  bigint,
  date,
  date,
  text
) IS 'Atomically copies one branch week of active shift assignments to another week. Preserves one assignment per employee/date.';

REVOKE ALL ON FUNCTION public.copy_shift_assignments_week(
  bigint,
  bigint,
  date,
  date,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_shift_assignments_week(
  bigint,
  bigint,
  date,
  date,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.bulk_delete_future_shift_assignments(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_assignment_ids bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_requested integer := 0;
  v_deleted integer := 0;
BEGIN
  IF p_assignment_ids IS NULL OR array_length(p_assignment_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'assignment_ids_required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
  INTO v_requested
  FROM (
    SELECT DISTINCT input.assignment_id
    FROM unnest(p_assignment_ids) AS input(assignment_id)
    WHERE input.assignment_id IS NOT NULL
  ) AS requested;

  WITH deleted AS (
    DELETE FROM public.shift_assignments sa
    WHERE sa.id IN (
      SELECT DISTINCT input.assignment_id
      FROM unnest(p_assignment_ids) AS input(assignment_id)
      WHERE input.assignment_id IS NOT NULL
    )
      AND sa.tenant_id = p_tenant_id
      AND sa.branch_id = p_branch_id
      AND sa.date > v_today
      AND NOT EXISTS (
        SELECT 1
        FROM public.attendance_records ar
        WHERE ar.tenant_id = sa.tenant_id
          AND ar.employee_id = sa.employee_id
          AND ar.date = sa.date
      )
    RETURNING sa.id
  )
  SELECT count(*)::integer
  INTO v_deleted
  FROM deleted;

  RETURN jsonb_build_object(
    'requested', v_requested,
    'deleted', v_deleted,
    'skipped', GREATEST(v_requested - v_deleted, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.bulk_delete_future_shift_assignments(
  bigint,
  bigint,
  bigint[]
) IS 'Atomically deletes future shift assignments in one branch. Past/today rows and rows with attendance are preserved.';

REVOKE ALL ON FUNCTION public.bulk_delete_future_shift_assignments(
  bigint,
  bigint,
  bigint[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_future_shift_assignments(
  bigint,
  bigint,
  bigint[]
) TO service_role;
