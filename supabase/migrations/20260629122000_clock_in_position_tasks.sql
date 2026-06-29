-- 20260629122000_clock_in_position_tasks.sql
-- Rewrite employee_clock_in_with_checklist to snapshot per-position shift tasks
-- (filtered by the picked shift's explicit is_opening/is_closing flags) and to
-- auto-surface a single inventory_count task when the employee has active count
-- assignments in this branch. Same signature; runtime-only count kind.

CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist(p_tenant_id bigint, p_employee_id bigint, p_branch_id bigint, p_shift_id bigint, p_business_date date, p_photo_path text) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_attendance_id bigint;
  v_shift_id bigint;
  v_is_open boolean;
  v_is_close boolean;
  v_position_id bigint;
BEGIN
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  -- Resolve POSITION (not template).
  SELECT p.position_id INTO v_position_id
  FROM public.employees e
  JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
  WHERE e.id = p_employee_id AND e.tenant_id = p_tenant_id AND e.is_active AND p.branch_id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'employee_not_found' USING ERRCODE='P0002'; END IF;

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

  -- Read EXPLICIT open/close flags of the picked shift (no MIN/MAX).
  SELECT s.id, s.is_opening, s.is_closing
  INTO v_shift_id, v_is_open, v_is_close
  FROM public.shifts s
  WHERE s.id = p_shift_id AND s.tenant_id = p_tenant_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id) AND COALESCE(s.is_active, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'shift_not_found' USING ERRCODE='P0002'; END IF;

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
    NULL
  )
  RETURNING id INTO v_attendance_id;

  -- Snapshot the position's tasks for this shift kind.
  INSERT INTO public.attendance_checklist_items
    (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, scope, task_kind, sort_order)
  SELECT p_tenant_id, v_attendance_id, NULL, t.title, t.phase, t.done_definition, t.is_required,
         t.applicability, t.kind, row_number() OVER (ORDER BY t.sort_order, t.id)::integer
  FROM public.position_shift_tasks t
  WHERE t.tenant_id = p_tenant_id AND t.position_id = v_position_id AND t.is_active
    AND ( t.applicability = 'every_shift'
          OR (t.applicability = 'opening' AND v_is_open)
          OR (t.applicability = 'closing' AND v_is_close) );

  -- Auto-surface ONE count task if the employee has active count assignments in this branch.
  IF EXISTS (
    SELECT 1 FROM public.inventory_count_assignments a
    WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
      AND a.employee_id = p_employee_id AND a.is_active
  ) THEN
    INSERT INTO public.attendance_checklist_items
      (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, scope, task_kind, sort_order)
    VALUES (p_tenant_id, v_attendance_id, NULL, 'Kiểm kê tồn', 'end_of_shift',
            'Nộp phiếu đếm tại màn Kiểm kê tồn.', false, 'every_shift', 'inventory_count',
            COALESCE((SELECT max(sort_order) FROM public.attendance_checklist_items WHERE attendance_record_id = v_attendance_id), 0) + 1);
  END IF;

  RETURN v_attendance_id;
END;
$$;
