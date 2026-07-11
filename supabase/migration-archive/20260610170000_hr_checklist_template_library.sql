-- =====================================================================
-- HR Checklist Template Library
-- - Checklist templates are operational work templates, not system roles.
-- - Templates can be global (branch_id IS NULL) or branch scoped.
-- - Effective template at clock-in:
--   shift assignment override > employee default > empty checklist.
-- - Attendance checklist rows are snapshots and keep template item metadata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schema evolution
-- ---------------------------------------------------------------------

ALTER TABLE public.shift_checklist_templates
  ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE public.shift_checklist_templates
  ADD COLUMN IF NOT EXISTS role_code text;

ALTER TABLE public.shift_checklist_templates
  ALTER COLUMN role_code DROP DEFAULT,
  ALTER COLUMN role_code DROP NOT NULL;

ALTER TABLE public.shift_checklist_templates
  DROP CONSTRAINT IF EXISTS shift_checklist_templates_role_code_valid;

COMMENT ON COLUMN public.shift_checklist_templates.role_code IS
  'Legacy compatibility only. Checklist selection no longer uses role_code.';

DROP INDEX IF EXISTS public.uq_shift_checklist_templates_active_branch;
DROP INDEX IF EXISTS public.uq_shift_checklist_templates_active_branch_role;

CREATE INDEX IF NOT EXISTS idx_shift_checklist_templates_tenant_scope
  ON public.shift_checklist_templates (tenant_id, branch_id, is_active);

CREATE INDEX IF NOT EXISTS idx_shift_checklist_templates_tenant_name
  ON public.shift_checklist_templates (tenant_id, lower(name));

ALTER TABLE public.shift_checklist_template_items
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'trong_ca',
  ADD COLUMN IF NOT EXISTS done_definition text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.attendance_checklist_items
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'trong_ca',
  ADD COLUMN IF NOT EXISTS done_definition text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS checklist_template_id bigint
    REFERENCES public.shift_checklist_templates(id) ON DELETE SET NULL;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS default_checklist_template_id bigint
    REFERENCES public.shift_checklist_templates(id) ON DELETE SET NULL;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS checklist_template_id bigint
    REFERENCES public.shift_checklist_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_checklist_template
  ON public.attendance_records (tenant_id, checklist_template_id)
  WHERE checklist_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_default_checklist_template
  ON public.employees (tenant_id, default_checklist_template_id)
  WHERE default_checklist_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shift_assignments_checklist_template
  ON public.shift_assignments (tenant_id, checklist_template_id)
  WHERE checklist_template_id IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.shift_checklist_template_items
    ADD CONSTRAINT shift_checklist_template_items_phase_valid
    CHECK (phase = ANY (ARRAY['dau_ca', 'trong_ca', 'cuoi_ca']::text[]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.shift_checklist_template_items
    ADD CONSTRAINT shift_checklist_template_items_done_definition_length
    CHECK (char_length(done_definition) <= 240);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.attendance_checklist_items
    ADD CONSTRAINT attendance_checklist_items_phase_valid
    CHECK (phase = ANY (ARRAY['dau_ca', 'trong_ca', 'cuoi_ca']::text[]));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.attendance_checklist_items
    ADD CONSTRAINT attendance_checklist_items_done_definition_length
    CHECK (char_length(done_definition) <= 240);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

COMMENT ON COLUMN public.shift_checklist_template_items.phase IS
  'Operational checklist phase: dau_ca, trong_ca, or cuoi_ca.';
COMMENT ON COLUMN public.shift_checklist_template_items.done_definition IS
  'Short acceptance criteria shown to employees and managers.';
COMMENT ON COLUMN public.shift_checklist_template_items.is_required IS
  'Required items must be done before checkout can be requested.';
COMMENT ON COLUMN public.attendance_checklist_items.phase IS
  'Snapshot of the template item phase at clock-in time.';
COMMENT ON COLUMN public.attendance_checklist_items.done_definition IS
  'Snapshot of the template item acceptance criteria at clock-in time.';
COMMENT ON COLUMN public.attendance_checklist_items.is_required IS
  'Snapshot of whether this item blocks checkout.';
COMMENT ON COLUMN public.attendance_records.checklist_template_id IS
  'Template used to snapshot checklist items for this attendance record.';
COMMENT ON COLUMN public.employees.default_checklist_template_id IS
  'Default checklist template used when a shift assignment has no override.';
COMMENT ON COLUMN public.shift_assignments.checklist_template_id IS
  'Optional checklist template override for this scheduled shift.';

-- ---------------------------------------------------------------------
-- RLS read policies stay browser-readable; writes are service-role only.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS shift_checklist_templates_select
  ON public.shift_checklist_templates;
CREATE POLICY shift_checklist_templates_select
  ON public.shift_checklist_templates
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('settings:tenant')
      OR public.has_permission_any('staff:manage')
      OR public.has_permission_any('hr:view_employee')
      OR (
        branch_id IS NOT NULL
        AND (
          public.has_permission(branch_id, 'settings:branch')
          OR public.has_permission(branch_id, 'staff:manage')
          OR public.has_permission(branch_id, 'hr:view_employee')
        )
      )
    )
  );

DROP POLICY IF EXISTS shift_checklist_template_items_select
  ON public.shift_checklist_template_items;
CREATE POLICY shift_checklist_template_items_select
  ON public.shift_checklist_template_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.shift_checklist_templates t
      WHERE t.id = shift_checklist_template_items.template_id
        AND t.tenant_id = shift_checklist_template_items.tenant_id
        AND (
          public.has_permission_any('settings:tenant')
          OR public.has_permission_any('staff:manage')
          OR public.has_permission_any('hr:view_employee')
          OR (
            t.branch_id IS NOT NULL
            AND (
              public.has_permission(t.branch_id, 'settings:branch')
              OR public.has_permission(t.branch_id, 'staff:manage')
              OR public.has_permission(t.branch_id, 'hr:view_employee')
            )
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- Employee clock-in snapshot now uses effective checklist template.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text, text
);

CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_business_date date,
  p_photo_path text
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attendance_id bigint;
  v_shift_id bigint;
  v_assignment_template_id bigint;
  v_employee_template_id bigint;
  v_template_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT e.default_checklist_template_id
  INTO v_employee_template_id
  FROM public.employees e
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id
    AND e.is_active = true
    AND p.branch_id = p_branch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
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

  IF p_shift_id IS NOT NULL AND p_shift_id <> 0 THEN
    SELECT s.id
    INTO v_shift_id
    FROM public.shifts s
    WHERE s.id = p_shift_id
      AND s.tenant_id = p_tenant_id
      AND s.branch_id = p_branch_id
      AND COALESCE(s.is_active, true) = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT sa.checklist_template_id
  INTO v_assignment_template_id
  FROM public.shift_assignments sa
  WHERE sa.tenant_id = p_tenant_id
    AND sa.employee_id = p_employee_id
    AND sa.branch_id = p_branch_id
    AND sa.date = p_business_date
  ORDER BY CASE WHEN sa.shift_id = v_shift_id THEN 0 ELSE 1 END, sa.id
  LIMIT 1;

  v_template_id := COALESCE(v_assignment_template_id, v_employee_template_id);

  IF v_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shift_checklist_templates t
    WHERE t.id = v_template_id
      AND t.tenant_id = p_tenant_id
      AND t.is_active = true
      AND (t.branch_id IS NULL OR t.branch_id = p_branch_id)
  ) THEN
    v_template_id := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id
      AND ar.employee_id = p_employee_id
      AND ar.date = p_business_date
  ) THEN
    RAISE EXCEPTION 'duplicate_clock_in' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.attendance_records (
    tenant_id,
    branch_id,
    employee_id,
    shift_id,
    date,
    check_in,
    status,
    method,
    code_verified,
    check_in_photo_path,
    checklist_template_id
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    p_employee_id,
    v_shift_id,
    p_business_date,
    now(),
    'present',
    'pwa',
    false,
    p_photo_path,
    v_template_id
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items (
    tenant_id,
    attendance_record_id,
    template_item_id,
    title,
    phase,
    done_definition,
    is_required,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_attendance_id,
    i.id,
    i.title,
    i.phase,
    i.done_definition,
    i.is_required,
    row_number() OVER (ORDER BY i.sort_order, i.id)::integer
  FROM public.shift_checklist_template_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.template_id = v_template_id
    AND i.is_active = true
  ORDER BY i.sort_order, i.id;

  RETURN v_attendance_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Template save RPC accepts a full item payload.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_shift_checklist_template(
  bigint, bigint, text, text[]
);
DROP FUNCTION IF EXISTS public.upsert_shift_checklist_template(
  bigint, bigint, text[]
);

CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_template_id bigint,
  p_name text,
  p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_template_id bigint;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_item jsonb;
  v_title text;
  v_phase text;
  v_done_definition text;
  v_is_required boolean;
  v_sort integer := 0;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'template_name_required' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'template_name_too_long' USING ERRCODE = '23514';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
      AND COALESCE(b.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'checklist_items_invalid' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_items) > 40 THEN
    RAISE EXCEPTION 'checklist_too_many_items' USING ERRCODE = '23514';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.shift_checklist_templates (
      tenant_id,
      branch_id,
      role_code,
      name,
      is_active
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      NULL,
      v_name,
      true
    )
    RETURNING id INTO v_template_id;
  ELSE
    SELECT id
    INTO v_template_id
    FROM public.shift_checklist_templates
    WHERE id = p_template_id
      AND tenant_id = p_tenant_id
      AND branch_id IS NOT DISTINCT FROM p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.shift_checklist_templates
    SET
      name = v_name,
      is_active = true
    WHERE id = v_template_id;
  END IF;

  DELETE FROM public.shift_checklist_template_items
  WHERE tenant_id = p_tenant_id
    AND template_id = v_template_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_title := btrim(COALESCE(v_item ->> 'title', ''));
    v_phase := COALESCE(NULLIF(v_item ->> 'phase', ''), 'trong_ca');
    v_done_definition := btrim(
      COALESCE(
        v_item ->> 'doneDefinition',
        v_item ->> 'done_definition',
        ''
      )
    );
    v_is_required := COALESCE(
      NULLIF(v_item ->> 'isRequired', '')::boolean,
      NULLIF(v_item ->> 'is_required', '')::boolean,
      true
    );

    IF v_title = '' THEN
      CONTINUE;
    END IF;

    IF char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'checklist_item_too_long' USING ERRCODE = '23514';
    END IF;

    IF v_phase <> ALL (ARRAY['dau_ca', 'trong_ca', 'cuoi_ca']::text[]) THEN
      RAISE EXCEPTION 'checklist_phase_invalid' USING ERRCODE = '23514';
    END IF;

    IF char_length(v_done_definition) > 240 THEN
      RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;

    INSERT INTO public.shift_checklist_template_items (
      tenant_id,
      template_id,
      title,
      phase,
      done_definition,
      is_required,
      sort_order,
      is_active
    )
    VALUES (
      p_tenant_id,
      v_template_id,
      v_title,
      v_phase,
      v_done_definition,
      v_is_required,
      v_sort,
      true
    );
  END LOOP;

  IF v_sort = 0 THEN
    RAISE EXCEPTION 'checklist_empty' USING ERRCODE = '23514';
  END IF;

  RETURN v_template_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Checkout blockers use required items only.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.employee_request_clock_out(
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
    AND i.is_required = true
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
    COALESCE(private.staff_role_from_position_code(po.code), 'office')
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
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner', 'super_manager']::text[]
    WHEN v_requester_role IN ('cashier', 'waiter', 'chef') THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner', 'super_manager']::text[]
  END;

  UPDATE public.attendance_records
  SET
    checkout_requested_at = v_requested_at,
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
  RETURN public.employee_request_clock_out(
    p_tenant_id,
    p_employee_id,
    p_attendance_id
  );
END;
$$;

-- ---------------------------------------------------------------------
-- Bulk scheduling accepts an optional checklist template override.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bulk_upsert_shift_assignments(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_shift_id bigint,
  p_employee_ids bigint[],
  p_dates date[],
  p_mode text DEFAULT 'skip_existing',
  p_checklist_template_id bigint DEFAULT NULL
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

  IF p_checklist_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shift_checklist_templates t
    WHERE t.id = p_checklist_template_id
      AND t.tenant_id = p_tenant_id
      AND t.is_active = true
      AND (t.branch_id IS NULL OR t.branch_id = p_branch_id)
  ) THEN
    RAISE EXCEPTION 'checklist_template_not_found' USING ERRCODE = 'P0002';
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
        date,
        checklist_template_id
      )
      VALUES (
        p_tenant_id,
        p_branch_id,
        v_employee_id,
        p_shift_id,
        v_date,
        p_checklist_template_id
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
      sa.checklist_template_id,
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
      date,
      checklist_template_id
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      v_source.employee_id,
      v_source.shift_id,
      v_target_date,
      v_source.checklist_template_id
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

-- ---------------------------------------------------------------------
-- Seed global checklist templates from the supplied CSVs.
-- ---------------------------------------------------------------------

WITH seed_templates(template_name) AS (
  VALUES
    ('Quầy'),
    ('Phục vụ'),
    ('Nướng'),
    ('Phụ bếp'),
    ('Tạp vụ')
)
INSERT INTO public.shift_checklist_templates (
  tenant_id,
  branch_id,
  role_code,
  name,
  is_active
)
SELECT
  tenants.id,
  NULL,
  NULL,
  seed_templates.template_name,
  true
FROM public.tenants
CROSS JOIN seed_templates
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shift_checklist_templates existing
  WHERE existing.tenant_id = tenants.id
    AND existing.branch_id IS NULL
    AND lower(existing.name) = lower(seed_templates.template_name)
    AND existing.is_active = true
);

WITH seed_items(template_name, item_title, phase, done_definition, sort_order) AS (
  VALUES
    ('Quầy', 'Chuẩn bị khay, dụng cụ', 'dau_ca', 'Đủ số lượng cần dùng và sẵn sàng trước giờ bán.', 1),
    ('Quầy', 'Chuẩn bị nguyên liệu: Bì, chả, trứng', 'dau_ca', 'Thành phẩm/nguyên liệu đủ, đúng chất lượng bán trong ca.', 2),
    ('Quầy', 'Setup quầy bán', 'dau_ca', 'Đủ số lượng cần dùng và sẵn sàng trước giờ bán.', 3),
    ('Quầy', 'Mở máy KDS', 'dau_ca', 'Thiết bị đúng trạng thái vận hành và sẵn sàng sử dụng.', 4),
    ('Quầy', 'Gói nguyên liệu còn thừa, cho vào tủ lạnh', 'cuoi_ca', 'Thành phẩm/nguyên liệu đủ, đúng chất lượng bán trong ca.', 5),
    ('Quầy', 'Rửa sạch dụng cụ, đồ dùng đã sử dụng', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 6),
    ('Quầy', 'Dọn dẹp, vệ sinh quầy', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 7),
    ('Quầy', 'Tắt máy KDS', 'cuoi_ca', 'Thiết bị đúng trạng thái vận hành và sẵn sàng sử dụng.', 8),
    ('Quầy', 'Kiểm tra, báo cáo nguyên liệu dư', 'cuoi_ca', 'Đã kiểm tra và ghi nhận số lượng/tình trạng để quản lý xem lại.', 9),
    ('Quầy', 'Kiểm tra, báo cáo tồn kho', 'cuoi_ca', 'Đã kiểm tra và ghi nhận số lượng/tình trạng để quản lý xem lại.', 10),

    ('Phục vụ', 'Lau bàn ghế, menu', 'dau_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 1),
    ('Phục vụ', 'Lau cửa kính', 'dau_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 2),
    ('Phục vụ', 'Setup sọt đựng rác', 'dau_ca', 'Đủ số lượng cần dùng và sẵn sàng trước giờ bán.', 3),
    ('Phục vụ', 'Setup nước chấm, muỗng, đũa, khăn giấy', 'dau_ca', 'Đủ số lượng cần dùng và sẵn sàng trước giờ bán.', 4),
    ('Phục vụ', 'Đếm tiền đầu ca', 'dau_ca', 'Số tiền đã được đếm, đối chiếu và ghi nhận trong ca.', 5),
    ('Phục vụ', 'Lau bàn sau mỗi lượt khách', 'trong_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 6),
    ('Phục vụ', 'Thu gom chén dĩa dơ về khu rửa', 'trong_ca', 'Khu vực phục vụ thông thoáng, chén dĩa dơ được đưa về đúng nơi.', 7),
    ('Phục vụ', 'Vệ sinh toàn bộ vật dụng: khay, hũ đựng', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 8),
    ('Phục vụ', 'Dọn rác cuối ca', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 9),
    ('Phục vụ', 'Đếm tiền cuối ca và báo cáo', 'cuoi_ca', 'Số tiền đã được đếm, đối chiếu và ghi nhận trong ca.', 10),

    ('Nướng', 'Lên lửa, kiểm tra than và khu nướng', 'dau_ca', 'Thiết bị đúng trạng thái vận hành và sẵn sàng sử dụng.', 1),
    ('Nướng', 'Chuẩn bị thịt nướng', 'dau_ca', 'Thành phẩm/nguyên liệu đủ, đúng chất lượng bán trong ca.', 2),
    ('Nướng', 'Thay vỉ nướng khi vỉ đen', 'trong_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 3),
    ('Nướng', 'Rửa vỉ nướng khi cần', 'trong_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 4),
    ('Nướng', 'Rửa sạch dụng cụ nướng', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 5),
    ('Nướng', 'Vệ sinh lò nướng', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 6),
    ('Nướng', 'Vệ sinh khu bếp nướng', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 7),
    ('Nướng', 'Kiểm tra, báo cáo tồn kho', 'cuoi_ca', 'Đã kiểm tra và ghi nhận số lượng/tình trạng để quản lý xem lại.', 8),

    ('Phụ bếp', 'Chuẩn bị canh mang về', 'dau_ca', 'Thành phẩm/nguyên liệu đủ, đúng chất lượng bán trong ca.', 1),
    ('Phụ bếp', 'Chuẩn bị rau, dưa leo, đồ chua', 'dau_ca', 'Thành phẩm/nguyên liệu đủ, đúng chất lượng bán trong ca.', 2),
    ('Phụ bếp', 'Kiểm tra chất lượng sản phẩm', 'dau_ca', 'Đã kiểm tra và ghi nhận số lượng/tình trạng để quản lý xem lại.', 3),
    ('Phụ bếp', 'Chuẩn bị hộp, túi, vật dụng mang về', 'dau_ca', 'Đủ số lượng cần dùng và sẵn sàng trước giờ bán.', 4),
    ('Phụ bếp', 'Bổ sung nguyên liệu cho quầy khi thiếu', 'trong_ca', 'Thành phẩm/nguyên liệu đủ, đúng chất lượng bán trong ca.', 5),
    ('Phụ bếp', 'Rửa sạch dụng cụ bếp', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 6),
    ('Phụ bếp', 'Vệ sinh khu sơ chế', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 7),
    ('Phụ bếp', 'Kiểm tra, báo cáo nguyên liệu dư', 'cuoi_ca', 'Đã kiểm tra và ghi nhận số lượng/tình trạng để quản lý xem lại.', 8),

    ('Tạp vụ', 'Dọn dẹp, vệ sinh khu vực phục vụ', 'dau_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 1),
    ('Tạp vụ', 'Tưới cây', 'dau_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 2),
    ('Tạp vụ', 'Thu gom chén dĩa', 'trong_ca', 'Khu vực phục vụ thông thoáng, chén dĩa dơ được đưa về đúng nơi.', 3),
    ('Tạp vụ', 'Lau bàn', 'trong_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 4),
    ('Tạp vụ', 'Rửa chén, muỗng, đũa', 'trong_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 5),
    ('Tạp vụ', 'Dọn nhà vệ sinh', 'trong_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 6),
    ('Tạp vụ', 'Lau sàn cuối ca', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 7),
    ('Tạp vụ', 'Đổ rác cuối ca', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 8),
    ('Tạp vụ', 'Vệ sinh khu rửa', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 9),
    ('Tạp vụ', 'Sắp xếp dụng cụ vệ sinh đúng nơi', 'cuoi_ca', 'Khu vực/dụng cụ sạch, đúng vị trí, không còn rác hoặc dầu mỡ.', 10)
),
target_templates AS (
  SELECT
    t.id,
    t.tenant_id,
    t.name
  FROM public.shift_checklist_templates t
  WHERE t.branch_id IS NULL
    AND t.is_active = true
    AND t.name IN ('Quầy', 'Phục vụ', 'Nướng', 'Phụ bếp', 'Tạp vụ')
)
INSERT INTO public.shift_checklist_template_items (
  tenant_id,
  template_id,
  title,
  phase,
  done_definition,
  is_required,
  sort_order,
  is_active
)
SELECT
  target_templates.tenant_id,
  target_templates.id,
  seed_items.item_title,
  seed_items.phase,
  seed_items.done_definition,
  true,
  seed_items.sort_order,
  true
FROM target_templates
JOIN seed_items
  ON seed_items.template_name = target_templates.name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shift_checklist_template_items existing
  WHERE existing.tenant_id = target_templates.tenant_id
    AND existing.template_id = target_templates.id
);

-- ---------------------------------------------------------------------
-- Grants for service-role-only RPCs.
-- ---------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, bigint, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_request_clock_out(
  bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_clock_out_with_code(
  bigint, bigint, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_upsert_shift_assignments(
  bigint, bigint, bigint, bigint[], date[], text, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.copy_shift_assignments_week(
  bigint, bigint, date, date, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, bigint, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(
  bigint, bigint, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.employee_clock_out_with_code(
  bigint, bigint, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_shift_assignments(
  bigint, bigint, bigint, bigint[], date[], text, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_shift_assignments_week(
  bigint, bigint, date, date, text
) TO service_role;

COMMENT ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) IS 'Employee clock-in with checklist snapshot selected from shift assignment override, then employee default template.';
COMMENT ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, bigint, text, jsonb
) IS 'Service-role-only atomic checklist template save. Payload includes item title, phase, done definition, and required flag.';
COMMENT ON FUNCTION public.bulk_upsert_shift_assignments(
  bigint, bigint, bigint, bigint[], date[], text, bigint
) IS 'Atomically assigns one active shift to many branch employees and optionally stores a checklist template override.';
COMMENT ON FUNCTION public.copy_shift_assignments_week(
  bigint, bigint, date, date, text
) IS 'Atomically copies one branch week of active shift assignments, preserving checklist template overrides.';
