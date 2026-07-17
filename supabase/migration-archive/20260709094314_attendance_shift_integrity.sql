CREATE OR REPLACE FUNCTION public.employee_request_clock_out(
  p_tenant_id bigint,
  p_employee_id bigint,
  p_attendance_id bigint
) RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_record public.attendance_records%ROWTYPE;
  v_requested_at timestamptz;
  v_employee_name text;
  v_requester_role text;
  v_target_roles text[];
  v_business_date date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  SELECT ar.*
  INTO v_record
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.employee_id = p_employee_id
    AND ar.branch_id = p.branch_id
    AND ar.date = v_business_date
    AND ar.check_out IS NULL
    AND COALESCE(e.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
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
    WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]
    WHEN v_requester_role IN ('cashier', 'chef', 'branch_staff') THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner']::text[]
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
    AND branch_id = v_record.branch_id
    AND date = v_business_date
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
    format('/br/%s/shift/checkout-approvals', v_record.branch_id),
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

CREATE OR REPLACE FUNCTION public.admin_force_close_attendance(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL::text
) RETURNS timestamp with time zone
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_business_date date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF v_uid IS NULL OR v_uid <> p_approved_by THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT ar.check_in
  INTO v_check_in
  FROM public.attendance_records ar
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_in IS NOT NULL
    AND ar.check_out IS NULL
    AND ar.date < v_business_date
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    check_out = v_check_in,
    check_out_code_verified = false,
    checkout_approved_at = now(),
    checkout_approved_by = p_approved_by,
    checkout_approval_note = COALESCE(NULLIF(btrim(p_note), ''), 'Force closed: Quên kết ca trong ngày (không tính công)'),
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  RETURNING check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_manager_reject_employee_clock_out(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_rejected_by uuid,
  p_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_requester_profile_id uuid;
  v_requester_role text;
  v_approver_branch_id bigint;
  v_approver_role text;
BEGIN
  SELECT
    e.profile_id,
    COALESCE(ar.checkout_requested_by_role, private.staff_role_from_position_code(po.code), 'office')
  INTO
    v_requester_profile_id,
    v_requester_role
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  LEFT JOIN public.profiles p
    ON p.id = e.profile_id
   AND p.tenant_id = e.tenant_id
  LEFT JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND ar.branch_id = p_branch_id
    AND ar.check_out IS NULL
    AND ar.checkout_requested_at IS NOT NULL
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_requester_profile_id = p_rejected_by THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  SELECT
    p.branch_id,
    private.staff_role_from_position_code(po.code)
  INTO v_approver_branch_id, v_approver_role
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_rejected_by
    AND p.tenant_id = p_tenant_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_approver_role IS NULL THEN
    RAISE EXCEPTION 'checkout_approver_not_found' USING ERRCODE = '42501';
  END IF;

  v_requester_role := COALESCE(v_requester_role, 'office');

  IF v_requester_role = 'branch_manager' THEN
    IF v_approver_role NOT IN ('owner') THEN
      RAISE EXCEPTION 'checkout_requires_upper_manager' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role = 'branch_manager' THEN
    IF v_approver_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;

    IF v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN
      RAISE EXCEPTION 'branch_manager_can_only_approve_branch_staff' USING ERRCODE = '42501';
    END IF;
  ELSIF v_approver_role NOT IN ('owner') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records
  SET
    checkout_requested_at = NULL,
    checkout_requested_by_role = NULL,
    checkout_approval_target_roles = ARRAY[]::text[],
    checkout_approval_note = NULLIF(btrim(p_note), ''),
    updated_at = now()
  WHERE id = p_attendance_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND check_out IS NULL
    AND checkout_requested_at IS NOT NULL;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_position_shift_tasks(
  p_position_id bigint,
  p_tasks jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_tasks jsonb := COALESCE(p_tasks, '[]'::jsonb);
  v_item jsonb;
  v_title text;
  v_kind text;
  v_appl text;
  v_phase text;
  v_done text;
  v_req boolean;
  v_sort integer := 0;
  v_task_id bigint;
  v_ingredient_ids jsonb;
  v_ingredient_value text;
  v_ingredient_id bigint;
  v_ingredient_sort integer;
BEGIN
  IF NOT (SELECT public.has_permission_any('staff:manage')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.positions
    WHERE id = p_position_id
      AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'position_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(v_tasks) <> 'array' THEN
    RAISE EXCEPTION 'tasks_invalid' USING ERRCODE = '23514';
  END IF;

  IF jsonb_array_length(v_tasks) > 40 THEN
    RAISE EXCEPTION 'too_many_tasks' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.position_shift_tasks
  WHERE tenant_id = v_tenant_id
    AND position_id = p_position_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_tasks) LOOP
    v_title := btrim(COALESCE(v_item->>'title', ''));
    v_kind := COALESCE(NULLIF(v_item->>'kind', ''), 'standard');
    v_appl := COALESCE(NULLIF(v_item->>'applicability', ''), 'every_shift');
    v_phase := COALESCE(NULLIF(v_item->>'phase', ''), 'start_of_shift');
    v_done := btrim(COALESCE(v_item->>'doneDefinition', ''));
    v_req := COALESCE(NULLIF(v_item->>'isRequired', '')::boolean, true);

    IF v_title = '' THEN
      CONTINUE;
    END IF;

    IF char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'task_title_too_long' USING ERRCODE = '23514';
    END IF;
    IF v_kind <> ALL (ARRAY['standard', 'consumption_report']::text[]) THEN
      RAISE EXCEPTION 'task_kind_invalid' USING ERRCODE = '23514';
    END IF;
    IF v_appl <> ALL (ARRAY['every_shift', 'opening', 'closing']::text[]) THEN
      RAISE EXCEPTION 'task_applicability_invalid' USING ERRCODE = '23514';
    END IF;
    IF v_phase <> ALL (ARRAY['start_of_shift', 'end_of_shift']::text[]) THEN
      RAISE EXCEPTION 'task_phase_invalid' USING ERRCODE = '23514';
    END IF;
    IF char_length(v_done) > 240 THEN
      RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE = '23514';
    END IF;

    v_sort := v_sort + 1;

    INSERT INTO public.position_shift_tasks (
      tenant_id,
      position_id,
      title,
      kind,
      applicability,
      phase,
      is_required,
      done_definition,
      sort_order
    ) VALUES (
      v_tenant_id,
      p_position_id,
      v_title,
      v_kind,
      v_appl,
      v_phase,
      v_req,
      v_done,
      v_sort
    )
    RETURNING id INTO v_task_id;

    IF v_kind = 'consumption_report' THEN
      v_ingredient_ids := COALESCE(v_item->'ingredientIds', '[]'::jsonb);
      IF jsonb_typeof(v_ingredient_ids) <> 'array' THEN
        RAISE EXCEPTION 'ingredients_invalid' USING ERRCODE = '23514';
      END IF;
      IF jsonb_array_length(v_ingredient_ids) > 80 THEN
        RAISE EXCEPTION 'too_many_ingredients' USING ERRCODE = '23514';
      END IF;

      v_ingredient_sort := 0;
      FOR v_ingredient_value IN SELECT value FROM jsonb_array_elements_text(v_ingredient_ids) LOOP
        v_ingredient_id := v_ingredient_value::bigint;
        IF NOT EXISTS (
          SELECT 1
          FROM public.ingredients
          WHERE id = v_ingredient_id
            AND tenant_id = v_tenant_id
            AND is_active = true
        ) THEN
          RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
        END IF;

        v_ingredient_sort := v_ingredient_sort + 1;
        INSERT INTO public.shift_checklist_consumption_default_items (
          tenant_id,
          template_item_id,
          position_task_id,
          ingredient_id,
          sort_order
        ) VALUES (
          v_tenant_id,
          NULL,
          v_task_id,
          v_ingredient_id,
          v_ingredient_sort
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN p_position_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_manager_reject_employee_clock_out(bigint, bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(bigint, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_close_attendance(bigint, bigint, bigint, uuid, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_manager_reject_employee_clock_out(bigint, bigint, bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) TO authenticated, service_role;
