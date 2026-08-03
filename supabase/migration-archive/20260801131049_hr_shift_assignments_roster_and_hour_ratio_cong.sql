-- ADR 0019 amend: hard-require shift_assignments for clock-in; freeze shift
-- windows on attendance; hour-ratio công helper; hr:assign_shift.

-- ─── permission catalog ─────────────────────────────────────────────────────

INSERT INTO public.permission_keys (
  key, module, description, scope, is_delegable_to_staff
)
VALUES (
  'hr:assign_shift',
  'hr',
  'Phân ca làm việc theo tuần cho nhân viên tại chi nhánh hoặc Văn phòng',
  'either',
  true
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module,
    scope = EXCLUDED.scope,
    is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = 'hr:assign_shift';

UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[])
  FROM unnest(
    template.permission_keys || ARRAY['hr:assign_shift']::text[]
  ) AS k
),
updated_at = now()
WHERE template.position_code IN ('owner', 'branch_manager')
  AND NOT ('hr:assign_shift' = ANY (template.permission_keys));

-- Backfill active BM/owner grants from templates (tenant-wide for owner,
-- branch-scoped for BM via sync helper if present; otherwise insert missing).
INSERT INTO public.staff_permissions (
  tenant_id, user_id, permission_key, branch_id, source_template, valid_from
)
SELECT
  pr.tenant_id,
  pr.id,
  'hr:assign_shift',
  CASE
    WHEN po.code = 'owner' THEN NULL
    ELSE pr.branch_id
  END,
  rt.id,
  now()
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
JOIN public.role_templates rt
  ON rt.tenant_id = pr.tenant_id
 AND rt.position_code = po.code
WHERE COALESCE(pr.is_active, true)
  AND po.code IN ('owner', 'branch_manager')
  AND 'hr:assign_shift' = ANY (rt.permission_keys)
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions sp
    WHERE sp.tenant_id = pr.tenant_id
      AND sp.user_id = pr.id
      AND sp.permission_key = 'hr:assign_shift'
      AND sp.valid_from <= now()
      AND (sp.valid_until IS NULL OR sp.valid_until > now())
      AND (
        (po.code = 'owner' AND sp.branch_id IS NULL)
        OR (po.code = 'branch_manager' AND sp.branch_id IS NOT DISTINCT FROM pr.branch_id)
      )
  );

-- ─── shift_assignments ──────────────────────────────────────────────────────

CREATE TABLE public.shift_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id bigint NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id bigint NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_assignments_one_per_employee_day
    UNIQUE (tenant_id, employee_id, work_date)
);

CREATE INDEX idx_shift_assignments_tenant_branch_date
  ON public.shift_assignments (tenant_id, branch_id, work_date);
CREATE INDEX idx_shift_assignments_employee_date
  ON public.shift_assignments (employee_id, work_date);

CREATE TRIGGER trg_shift_assignments_updated_at
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY shift_assignments_select ON public.shift_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.employees emp
        WHERE emp.id = shift_assignments.employee_id
          AND emp.tenant_id = shift_assignments.tenant_id
          AND emp.profile_id = (SELECT auth.uid())
      )
      OR public.has_permission(branch_id, 'staff:view')
      OR public.has_permission(branch_id, 'hr:view_employee')
      OR public.has_permission(branch_id, 'hr:assign_shift')
      OR public.has_permission(NULL::bigint, 'hr:assign_shift')
    )
  );

REVOKE ALL ON TABLE public.shift_assignments FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.shift_assignments TO authenticated;
GRANT ALL ON TABLE public.shift_assignments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.shift_assignments_id_seq TO authenticated, service_role;

-- ─── attendance freeze columns ──────────────────────────────────────────────

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS shift_assignment_id bigint
    REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_attendance_records_shift_assignment
  ON public.attendance_records (shift_assignment_id)
  WHERE shift_assignment_id IS NOT NULL;

-- ─── công helper (hour ∩ frozen window) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.attendance_shift_workdays(
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_overlap_start timestamptz;
  v_overlap_end timestamptz;
  v_worked_seconds numeric;
  v_shift_seconds numeric;
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

  RETURN LEAST(1.0, ROUND((v_worked_seconds / v_shift_seconds)::numeric, 1));
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_shift_workdays(timestamptz, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_shift_workdays(timestamptz, timestamptz, timestamptz, timestamptz)
  TO service_role;

-- ─── reconcile week ─────────────────────────────────────────────────────────

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

  IF v_role = 'owner' THEN
    IF NOT public.auth_is_owner(v_actor) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'branch_manager' THEN
    IF p_branch_id IS NULL
       OR v_actor_branch IS DISTINCT FROM p_branch_id
       OR NOT public.has_permission(p_branch_id, 'hr:assign_shift') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_week_start IS NULL OR EXTRACT(ISODOW FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'week_start_must_be_monday' USING ERRCODE = '22023';
  END IF;

  v_lock_key := pg_catalog.hashtextextended(
    format('%s:%s:%s', p_tenant_id, coalesce(p_branch_id::text, 'null'), p_week_start::text),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments_must_be_array' USING ERRCODE = '22023';
  END IF;

  WITH desired AS (
    SELECT DISTINCT
      (elem->>'employee_id')::bigint AS employee_id,
      (elem->>'work_date')::date AS work_date,
      (elem->>'shift_id')::bigint AS shift_id
    FROM jsonb_array_elements(p_assignments) AS elem
  ),
  removable AS (
    SELECT sa.id
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = p_tenant_id
      AND sa.branch_id IS NOT DISTINCT FROM p_branch_id
      AND sa.work_date BETWEEN p_week_start AND v_week_end
      AND NOT EXISTS (
        SELECT 1 FROM desired d
        WHERE d.employee_id = sa.employee_id
          AND d.work_date = sa.work_date
          AND d.shift_id = sa.shift_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.attendance_records ar
        WHERE ar.tenant_id = sa.tenant_id
          AND ar.employee_id = sa.employee_id
          AND ar.date = sa.work_date
      )
  )
  DELETE FROM public.shift_assignments sa
  USING removable r
  WHERE sa.id = r.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

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

    SELECT pr.branch_id
    INTO v_emp_branch
    FROM public.employees emp
    JOIN public.profiles pr
      ON pr.id = emp.profile_id
     AND pr.tenant_id = emp.tenant_id
    WHERE emp.id = v_employee_id
      AND emp.tenant_id = p_tenant_id
      AND emp.is_active
      AND COALESCE(pr.is_active, true);
    IF NOT FOUND OR v_emp_branch IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'employee_not_in_site' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.shifts sh
      WHERE sh.id = v_shift_id
        AND sh.tenant_id = p_tenant_id
        AND sh.is_active
        AND sh.branch_id IS NULL
    ) THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.attendance_records ar
      WHERE ar.tenant_id = p_tenant_id
        AND ar.employee_id = v_employee_id
        AND ar.date = v_work_date
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT sa.id, sa.shift_id
    INTO v_existing_id, v_existing_shift
    FROM public.shift_assignments sa
    WHERE sa.tenant_id = p_tenant_id
      AND sa.employee_id = v_employee_id
      AND sa.work_date = v_work_date;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.shift_assignments (
        tenant_id, branch_id, employee_id, shift_id, work_date, assigned_by, assigned_at
      )
      VALUES (
        p_tenant_id, p_branch_id, v_employee_id, v_shift_id, v_work_date, v_actor, now()
      );
      v_created := v_created + 1;
    ELSIF v_existing_shift IS DISTINCT FROM v_shift_id THEN
      UPDATE public.shift_assignments
      SET shift_id = v_shift_id,
          branch_id = p_branch_id,
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

CREATE OR REPLACE FUNCTION public.copy_shift_assignments_week(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_source_week_start date,
  p_target_week_start date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF (
    public.auth_tenant_id() IS NOT DISTINCT FROM p_tenant_id
    AND (
      (
        public.auth_role() = 'owner'
        AND public.auth_is_owner(auth.uid())
      )
      OR (
        public.auth_role() = 'branch_manager'
        AND p_branch_id IS NOT NULL
        AND public.auth_branch_id() IS NOT DISTINCT FROM p_branch_id
        AND public.has_permission(p_branch_id, 'hr:assign_shift')
      )
    )
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'employee_id', sa.employee_id,
        'work_date', (p_target_week_start + (sa.work_date - p_source_week_start)),
        'shift_id', sa.shift_id
      )
      ORDER BY sa.employee_id, sa.work_date
    ),
    '[]'::jsonb
  )
  INTO v_payload
  FROM public.shift_assignments sa
  JOIN public.employees emp
    ON emp.id = sa.employee_id
   AND emp.tenant_id = sa.tenant_id
   AND emp.is_active
  JOIN public.shifts sh
    ON sh.id = sa.shift_id
   AND sh.tenant_id = sa.tenant_id
   AND sh.is_active
  WHERE sa.tenant_id = p_tenant_id
    AND sa.branch_id IS NOT DISTINCT FROM p_branch_id
    AND sa.work_date BETWEEN p_source_week_start AND (p_source_week_start + 6);

  RETURN public.reconcile_shift_assignments_week(
    p_tenant_id,
    p_branch_id,
    p_target_week_start,
    v_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_shift_assignments_week(bigint, bigint, date, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_shift_assignments_week(bigint, bigint, date, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.copy_shift_assignments_week(bigint, bigint, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_shift_assignments_week(bigint, bigint, date, date)
  TO authenticated, service_role;

-- ─── hard-require clock-in: derive assignment + freeze window ───────────────

CREATE OR REPLACE FUNCTION public.self_service_clock_in(
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text
)
RETURNS bigint
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
  v_is_opening boolean;
  v_is_closing boolean;
  v_attendance_id bigint;
  v_assignment public.shift_assignments%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_now timestamptz := now();
  v_vn_date date := (v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_vn_time time := (v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
  v_candidate_dates date[];
  v_work_date date;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
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

  IF v_actor IS NULL OR v_employee_id IS NULL OR v_role = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  IF v_role = 'accountant' THEN
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

  -- Candidate work_dates: today and yesterday (overnight).
  v_candidate_dates := ARRAY[v_vn_date, (v_vn_date - 1)];

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
    AND sa.work_date = ANY (v_candidate_dates)
    AND (
      -- In-window today
      (
        sa.work_date = v_vn_date
        AND (
          (sh.end_time > sh.start_time AND v_vn_time >= sh.start_time AND v_vn_time < sh.end_time)
          OR (sh.end_time <= sh.start_time AND (v_vn_time >= sh.start_time OR v_vn_time < sh.end_time))
        )
      )
      -- Overnight tail of yesterday
      OR (
        sa.work_date = (v_vn_date - 1)
        AND sh.end_time <= sh.start_time
        AND v_vn_time < sh.end_time
      )
      -- Today's assignment even if early/late (never backdate a day shift)
      OR sa.work_date = v_vn_date
    )
  ORDER BY
    CASE
      WHEN sa.work_date = v_vn_date
           AND (
             (sh.end_time > sh.start_time AND v_vn_time >= sh.start_time AND v_vn_time < sh.end_time)
             OR (sh.end_time <= sh.start_time AND (v_vn_time >= sh.start_time OR v_vn_time < sh.end_time))
           )
        THEN 0
      WHEN sa.work_date = (v_vn_date - 1)
           AND sh.end_time <= sh.start_time
           AND v_vn_time < sh.end_time
        THEN 1
      ELSE 2
    END,
    sa.work_date DESC
  LIMIT 1;

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

  -- Optional client assertions (must match derived assignment when provided).
  IF p_shift_id IS DISTINCT FROM v_assignment.shift_id THEN
    RAISE EXCEPTION 'shift_assignment_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_business_date IS DISTINCT FROM v_assignment.work_date THEN
    RAISE EXCEPTION 'shift_assignment_mismatch' USING ERRCODE = '22023';
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

  INSERT INTO public.attendance_records (
    tenant_id, branch_id, employee_id, shift_id, date, check_in, status,
    method, check_in_photo_path, checklist_template_id,
    shift_assignment_id, scheduled_start_at, scheduled_end_at
  )
  VALUES (
    v_tenant_id, v_assigned_branch_id, v_employee_id, v_assignment.shift_id,
    v_work_date, v_now, 'present', 'pwa', p_photo_path, NULL,
    v_assignment.id, v_scheduled_start, v_scheduled_end
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items (
    tenant_id, attendance_record_id, template_item_id, title, phase,
    done_definition, is_required, scope, task_kind, sort_order
  )
  SELECT v_tenant_id, v_attendance_id, NULL, task.title, task.phase,
         task.done_definition, task.is_required, task.applicability, task.kind,
         row_number() OVER (ORDER BY task.sort_order, task.id)::integer
  FROM public.position_shift_tasks task
  WHERE task.tenant_id = v_tenant_id
    AND task.position_id = v_position_id
    AND (
      task.applicability = 'every_shift'
      OR (task.applicability = 'opening' AND v_is_opening)
      OR (task.applicability = 'closing' AND v_is_closing)
    );

  RETURN v_attendance_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_clock_in' USING ERRCODE = '23505';
END;
$$;
