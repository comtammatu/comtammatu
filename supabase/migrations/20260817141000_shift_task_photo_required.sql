-- Shift-task photo evidence is required to mark the item done and to checkout.
-- allows_photo stays the column name; the runtime contract is now mandatory.

COMMENT ON COLUMN public.position_shift_tasks.allows_photo IS
  'When true, completing the task requires photo evidence (ADR 0011).';

COMMENT ON COLUMN public.attendance_checklist_items.allows_photo IS
  'Snapshot of position_shift_tasks.allows_photo at clock-in. When true, done requires photo_path.';

COMMENT ON COLUMN public.attendance_checklist_items.photo_path IS
  'Storage object path in attendance-photos when the task requires photo evidence.';

CREATE OR REPLACE FUNCTION public.self_service_toggle_task(
  p_item_id bigint,
  p_done boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_allows_photo boolean;
  v_photo_path text;
BEGIN
  IF v_actor IS NULL OR public.auth_role() = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT item.allows_photo, item.photo_path
  INTO v_allows_photo, v_photo_path
  FROM public.attendance_checklist_items AS item
  JOIN public.attendance_records AS attendance
    ON attendance.id = item.attendance_record_id
   AND attendance.tenant_id = item.tenant_id
  JOIN public.employees AS employee
    ON employee.id = attendance.employee_id
   AND employee.tenant_id = attendance.tenant_id
  WHERE item.id = p_item_id
    AND employee.profile_id = v_actor
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_editable' USING ERRCODE = '42501';
  END IF;

  IF p_done
     AND COALESCE(v_allows_photo, false)
     AND btrim(COALESCE(v_photo_path, '')) = '' THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.attendance_checklist_items AS item
  SET is_done = p_done,
      completed_at = CASE WHEN p_done THEN now() ELSE NULL END
  FROM public.attendance_records AS attendance
  JOIN public.employees AS employee
    ON employee.id = attendance.employee_id
   AND employee.tenant_id = attendance.tenant_id
  WHERE item.id = p_item_id
    AND item.attendance_record_id = attendance.id
    AND item.tenant_id = attendance.tenant_id
    AND employee.profile_id = v_actor
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_editable' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_service_attach_task_photo(
  p_item_id bigint,
  p_photo_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_path text := btrim(COALESCE(p_photo_path, ''));
BEGIN
  IF v_actor IS NULL OR public.auth_role() = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_path = '' OR char_length(v_path) > 500 THEN
    RAISE EXCEPTION 'photo_path_invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.attendance_checklist_items AS item
  SET photo_path = v_path,
      is_done = true,
      completed_at = now(),
      updated_at = now()
  FROM public.attendance_records AS attendance
  JOIN public.employees AS employee
    ON employee.id = attendance.employee_id
   AND employee.tenant_id = attendance.tenant_id
  WHERE item.id = p_item_id
    AND item.attendance_record_id = attendance.id
    AND item.tenant_id = attendance.tenant_id
    AND item.allows_photo
    AND employee.profile_id = v_actor
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_photo_not_allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.self_service_request_checkout(
  p_attendance_id bigint
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_employee_id bigint;
  v_role text := public.auth_role();
  v_record public.attendance_records%ROWTYPE;
  v_branch_kind text;
  v_requested_at timestamptz := now();
  v_target_roles text[];
BEGIN
  IF v_actor IS NULL OR v_tenant_id IS NULL OR v_role = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT employee.id
  INTO v_employee_id
  FROM public.employees AS employee
  WHERE employee.profile_id = v_actor
    AND employee.tenant_id = v_tenant_id
    AND employee.is_active;

  SELECT attendance.*
  INTO v_record
  FROM public.attendance_records AS attendance
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.employee_id = v_employee_id
    AND attendance.check_out IS NULL
  FOR UPDATE;
  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'open_attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_checklist_items AS item
    WHERE item.attendance_record_id = v_record.id
      AND item.tenant_id = v_tenant_id
      AND item.is_required
      AND NOT item.is_done
  ) THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.attendance_checklist_items AS item
    WHERE item.attendance_record_id = v_record.id
      AND item.tenant_id = v_tenant_id
      AND item.is_required
      AND item.allows_photo
      AND btrim(COALESCE(item.photo_path, '')) = ''
  ) THEN
    RAISE EXCEPTION 'photo_required' USING ERRCODE = '23514';
  END IF;

  IF v_record.checkout_requested_at IS NOT NULL THEN
    RETURN v_record.checkout_requested_at;
  END IF;

  SELECT branch.branch_kind INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = v_record.branch_id
    AND branch.tenant_id = v_tenant_id;

  v_target_roles := CASE
    WHEN v_role IN ('cashier', 'chef', 'branch_staff')
      AND v_branch_kind = 'branch'
      THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner']::text[]
  END;

  UPDATE public.attendance_records AS attendance
  SET checkout_requested_at = v_requested_at,
      checkout_requested_by_role = v_role,
      checkout_approval_target_roles = v_target_roles,
      updated_at = now()
  WHERE attendance.id = v_record.id
    AND attendance.check_out IS NULL;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant_id,
    CASE WHEN v_target_roles = ARRAY['branch_manager']::text[] THEN v_record.branch_id ELSE NULL END,
    v_target_roles,
    'hr.checkout_requested', 'info', 'Yêu cầu kết ca mới',
    'Nhân viên đã gửi yêu cầu kết ca.',
    'attendance_record', v_record.id,
    CASE
      WHEN v_target_roles = ARRAY['branch_manager']::text[]
        THEN format('/br/%s/shift/checkout-approvals', v_record.branch_id)
      ELSE '/hr/attendance/checkout-approvals'
    END,
    jsonb_build_object('attendance_id', v_record.id, 'branch_id', v_record.branch_id),
    format('hr.checkout_request:%s', v_record.id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  RETURN v_requested_at;
END;
$$;
