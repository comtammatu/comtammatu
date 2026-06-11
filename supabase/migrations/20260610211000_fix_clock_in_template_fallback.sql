-- Fix employee clock-in template fallback so invalid shift assignment override
-- does not discard an active employee default template.

DROP FUNCTION IF EXISTS public.employee_clock_in_with_checklist(
  bigint,
  bigint,
  bigint,
  bigint,
  date,
  text
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

  -- Shift assignment override takes precedence only when the template is valid.
  IF v_assignment_template_id IS NOT NULL THEN
    SELECT t.id
    INTO v_template_id
    FROM public.shift_checklist_templates t
    WHERE t.id = v_assignment_template_id
      AND t.tenant_id = p_tenant_id
      AND t.is_active = true
      AND (t.branch_id IS NULL OR t.branch_id = p_branch_id)
    LIMIT 1;
  END IF;

  IF v_template_id IS NULL THEN
    v_template_id := v_employee_template_id;
  END IF;

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

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) TO service_role;

COMMENT ON FUNCTION public.employee_clock_in_with_checklist(
  bigint, bigint, bigint, bigint, date, text
) IS 'Employee clock-in with checklist snapshot selected from valid shift assignment override, then employee default template.';
