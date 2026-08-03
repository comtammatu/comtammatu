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
  v_is_company_self_service boolean := false;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.auth_role_bindings binding
    WHERE binding.user_id = v_actor
      AND binding.tenant_id = v_tenant_id
      AND binding.role_code = 'self_service_member'
      AND binding.scope_type = 'tenant'
      AND binding.branch_id IS NULL
      AND binding.valid_from <= v_now
      AND (binding.valid_until IS NULL OR binding.valid_until > v_now)
  )
  INTO v_is_company_self_service;
  v_is_company_self_service :=
    v_role IS NULL
    AND v_assigned_branch_id IS NULL
    AND v_is_company_self_service;

  IF v_actor IS NULL
     OR v_employee_id IS NULL
     OR v_role = 'owner'
     OR (v_role IS NULL AND NOT v_is_company_self_service) THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NULL OR btrim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  IF v_is_company_self_service THEN
    IF p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'company_scope_must_be_null' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role = 'accountant' THEN
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
      (
        sa.work_date = v_vn_date
        AND (
          (sh.end_time > sh.start_time AND v_vn_time >= sh.start_time AND v_vn_time < sh.end_time)
          OR (sh.end_time <= sh.start_time AND (v_vn_time >= sh.start_time OR v_vn_time < sh.end_time))
        )
      )
      OR (
        sa.work_date = (v_vn_date - 1)
        AND sh.end_time <= sh.start_time
        AND v_vn_time < sh.end_time
      )
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
