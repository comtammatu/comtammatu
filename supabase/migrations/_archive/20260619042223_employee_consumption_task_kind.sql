ALTER TABLE public.shift_checklist_template_items
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'standard';

ALTER TABLE public.attendance_checklist_items
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'standard';

UPDATE public.shift_checklist_template_items
SET task_kind = 'standard'
WHERE task_kind IS NULL
   OR task_kind NOT IN ('standard', 'consumption_report');

UPDATE public.attendance_checklist_items
SET task_kind = 'standard'
WHERE task_kind IS NULL
   OR task_kind NOT IN ('standard', 'consumption_report');

UPDATE public.shift_checklist_template_items
SET task_kind = 'consumption_report'
WHERE title = 'Tiêu hao bếp trong ngày'
  AND task_kind <> 'consumption_report';

UPDATE public.attendance_checklist_items
SET task_kind = 'consumption_report'
WHERE title = 'Tiêu hao bếp trong ngày'
  AND task_kind <> 'consumption_report';

ALTER TABLE public.shift_checklist_template_items
  DROP CONSTRAINT IF EXISTS shift_checklist_template_items_task_kind_valid;
ALTER TABLE public.shift_checklist_template_items
  ADD CONSTRAINT shift_checklist_template_items_task_kind_valid
  CHECK (task_kind IN ('standard', 'consumption_report'));

ALTER TABLE public.attendance_checklist_items
  DROP CONSTRAINT IF EXISTS attendance_checklist_items_task_kind_valid;
ALTER TABLE public.attendance_checklist_items
  ADD CONSTRAINT attendance_checklist_items_task_kind_valid
  CHECK (task_kind IN ('standard', 'consumption_report'));

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
  v_scope text;
  v_task_kind text;
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
    v_phase := COALESCE(NULLIF(v_item ->> 'phase', ''), 'during_shift');
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
    v_scope := COALESCE(NULLIF(v_item ->> 'scope', ''), 'every_shift');
    v_task_kind := COALESCE(NULLIF(v_item ->> 'taskKind', ''), 'standard');

    IF v_title = '' THEN
      CONTINUE;
    END IF;

    IF char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'checklist_item_too_long' USING ERRCODE = '23514';
    END IF;

    IF v_phase <> ALL (ARRAY['start_of_shift', 'during_shift', 'end_of_shift']::text[]) THEN
      RAISE EXCEPTION 'checklist_phase_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_scope <> ALL (ARRAY['every_shift', 'opening', 'closing', 'weekly']::text[]) THEN
      RAISE EXCEPTION 'checklist_scope_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_task_kind <> ALL (ARRAY['standard', 'consumption_report']::text[]) THEN
      RAISE EXCEPTION 'checklist_task_kind_invalid' USING ERRCODE = '23514';
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
      scope,
      task_kind,
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
      v_scope,
      v_task_kind,
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

REVOKE ALL ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, bigint, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shift_checklist_template(
  bigint, bigint, bigint, text, jsonb
) TO service_role;

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
  v_shift_start time;
  v_is_open boolean;
  v_is_close boolean;
  v_template_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(e.default_checklist_template_id, po.default_checklist_template_id)
  INTO v_template_id
  FROM public.employees e
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
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

  IF p_shift_id IS NULL OR p_shift_id = 0 THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id, s.start_time
  INTO v_shift_id, v_shift_start
  FROM public.shifts s
  WHERE s.id = p_shift_id
    AND s.tenant_id = p_tenant_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
    AND COALESCE(s.is_active, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT v_shift_start = min(s.start_time), v_shift_start = max(s.start_time)
  INTO v_is_open, v_is_close
  FROM public.shifts s
  WHERE s.tenant_id = p_tenant_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
    AND COALESCE(s.is_active, true) = true;

  IF v_template_id IS NOT NULL
    AND NOT EXISTS (
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
      AND ar.shift_id = v_shift_id
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
    scope,
    task_kind,
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
    i.scope,
    i.task_kind,
    row_number() OVER (ORDER BY i.sort_order, i.id)::integer
  FROM public.shift_checklist_template_items i
  WHERE i.tenant_id = p_tenant_id
    AND i.template_id = v_template_id
    AND i.is_active = true
    AND (
      i.scope = 'every_shift'
      OR (i.scope = 'opening' AND v_is_open)
      OR (i.scope = 'closing' AND v_is_close)
    )
  ORDER BY i.sort_order, i.id;

  RETURN v_attendance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.employee_submit_consumption_report(
  p_tenant_id bigint,
  p_attendance_id bigint,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_no_consumption boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_attendance record;
  v_report_id bigint;
  v_checklist_item_id bigint;
  v_line_count integer;
  v_distinct_line_count integer;
  v_no_consumption boolean := COALESCE(p_no_consumption, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR v_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'invalid_consumption_lines' USING ERRCODE = '22023';
  END IF;

  IF v_no_consumption AND jsonb_array_length(p_lines) <> 0 THEN
    RAISE EXCEPTION 'no_consumption_with_lines' USING ERRCODE = '22023';
  END IF;

  IF NOT v_no_consumption AND jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'consumption_lines_required' USING ERRCODE = '22023';
  END IF;

  SELECT ar.id, ar.tenant_id, ar.branch_id, ar.employee_id, ar.check_in, ar.check_out,
         ar.checkout_requested_at
  INTO v_attendance
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND e.profile_id = v_uid
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attendance.check_in IS NULL OR v_attendance.check_out IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_not_open' USING ERRCODE = '22023';
  END IF;

  IF v_attendance.checkout_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'checkout_already_requested' USING ERRCODE = '22023';
  END IF;

  SELECT ci.id
  INTO v_checklist_item_id
  FROM public.attendance_checklist_items ci
  WHERE ci.tenant_id = p_tenant_id
    AND ci.attendance_record_id = v_attendance.id
    AND ci.task_kind = 'consumption_report'
  LIMIT 1;

  IF v_checklist_item_id IS NULL THEN
    RAISE EXCEPTION 'consumption_checklist_not_assigned' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_line_count
  FROM jsonb_to_recordset(p_lines) AS src(
    default_item_id bigint,
    ingredient_id bigint,
    quantity numeric,
    note text
  )
  JOIN public.ingredients i
    ON i.id = src.ingredient_id
   AND i.tenant_id = p_tenant_id
   AND i.is_active = true
  LEFT JOIN public.shift_checklist_consumption_default_items d
    ON d.id = src.default_item_id
   AND d.tenant_id = p_tenant_id
   AND d.ingredient_id = src.ingredient_id
   AND d.is_active = true
  LEFT JOIN public.attendance_checklist_items ci
    ON ci.tenant_id = p_tenant_id
   AND ci.attendance_record_id = v_attendance.id
   AND ci.task_kind = 'consumption_report'
   AND ci.template_item_id = d.template_item_id
  WHERE src.quantity > 0
    AND (src.default_item_id IS NULL OR ci.id IS NOT NULL);

  SELECT count(DISTINCT src.ingredient_id)
  INTO v_distinct_line_count
  FROM jsonb_to_recordset(p_lines) AS src(
    default_item_id bigint,
    ingredient_id bigint,
    quantity numeric,
    note text
  );

  IF v_line_count <> jsonb_array_length(p_lines)
     OR v_distinct_line_count <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'invalid_consumption_line' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.attendance_consumption_reports (
    tenant_id,
    attendance_record_id,
    branch_id,
    employee_id,
    status,
    note,
    submitted_by,
    submitted_at,
    reviewed_by,
    reviewed_at,
    review_note,
    stock_issue_id,
    no_consumption
  )
  VALUES (
    p_tenant_id,
    v_attendance.id,
    v_attendance.branch_id,
    v_attendance.employee_id,
    'submitted',
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    v_uid,
    now(),
    NULL,
    NULL,
    NULL,
    NULL,
    v_no_consumption
  )
  ON CONFLICT (tenant_id, attendance_record_id)
  DO UPDATE SET
    status = 'submitted',
    note = EXCLUDED.note,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    reviewed_by = NULL,
    reviewed_at = NULL,
    review_note = NULL,
    stock_issue_id = NULL,
    no_consumption = EXCLUDED.no_consumption
  WHERE attendance_consumption_reports.status IN ('draft', 'submitted', 'needs_changes')
  RETURNING id INTO v_report_id;

  IF v_report_id IS NULL THEN
    RAISE EXCEPTION 'consumption_report_locked' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.attendance_consumption_report_lines
  WHERE tenant_id = p_tenant_id
    AND report_id = v_report_id;

  INSERT INTO public.attendance_consumption_report_lines (
    tenant_id,
    report_id,
    ingredient_id,
    default_item_id,
    quantity,
    unit,
    note,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_report_id,
    src.ingredient_id,
    src.default_item_id,
    src.quantity,
    i.purchase_unit,
    NULLIF(btrim(COALESCE(src.note, '')), ''),
    src.sort_order
  FROM (
    SELECT
      row_number() OVER ()::integer AS sort_order,
      default_item_id,
      ingredient_id,
      quantity,
      note
    FROM jsonb_to_recordset(p_lines) AS parsed(
      default_item_id bigint,
      ingredient_id bigint,
      quantity numeric,
      note text
    )
  ) src
  JOIN public.ingredients i
    ON i.id = src.ingredient_id
   AND i.tenant_id = p_tenant_id
   AND i.is_active = true;

  UPDATE public.attendance_checklist_items
  SET is_done = true,
      completed_at = now()
  WHERE tenant_id = p_tenant_id
    AND attendance_record_id = v_attendance.id
    AND task_kind = 'consumption_report';

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_manager_request_consumption_adjustment(
  p_tenant_id bigint,
  p_report_id bigint,
  p_review_note text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_report record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR v_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(COALESCE(p_review_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'review_note_required' USING ERRCODE = '22023';
  END IF;

  SELECT r.*, ar.id AS attendance_id
  INTO v_report
  FROM public.attendance_consumption_reports r
  JOIN public.attendance_records ar
    ON ar.id = r.attendance_record_id
   AND ar.tenant_id = r.tenant_id
  WHERE r.id = p_report_id
    AND r.tenant_id = p_tenant_id
  FOR UPDATE OF r, ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consumption_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_report.branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  IF v_report.status NOT IN ('submitted', 'needs_changes') THEN
    RAISE EXCEPTION 'consumption_report_not_reviewable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.attendance_consumption_reports
  SET status = 'needs_changes',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_note = NULLIF(btrim(p_review_note), '')
  WHERE id = p_report_id
    AND tenant_id = p_tenant_id;

  UPDATE public.attendance_records
  SET checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      updated_at = now()
  WHERE id = v_report.attendance_id
    AND tenant_id = p_tenant_id
    AND check_out IS NULL;

  UPDATE public.attendance_checklist_items
  SET is_done = false,
      completed_at = NULL
  WHERE tenant_id = p_tenant_id
    AND attendance_record_id = v_report.attendance_id
    AND task_kind = 'consumption_report';

  RETURN p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_submit_consumption_report(
  bigint,
  bigint,
  jsonb,
  text,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_manager_request_consumption_adjustment(
  bigint,
  bigint,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.employee_submit_consumption_report(
  bigint,
  bigint,
  jsonb,
  text,
  boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branch_manager_request_consumption_adjustment(
  bigint,
  bigint,
  text
) TO authenticated;
