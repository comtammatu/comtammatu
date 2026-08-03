-- Universal HR self-service for every non-Owner role.

ALTER TABLE public.attendance_records
  ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE public.leave_requests
  ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE public.employment_contracts
  ADD COLUMN pay_basis text NOT NULL DEFAULT 'attendance_prorated',
  ADD CONSTRAINT employment_contracts_pay_basis_check
    CHECK (pay_basis IN ('attendance_prorated', 'fixed_monthly'));

-- Default missing pay_basis only. Never infer from JWT/role/position —
-- Owner sets Theo công / Lương tháng on the contract.
CREATE OR REPLACE FUNCTION private.set_contract_pay_basis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.pay_basis := COALESCE(NEW.pay_basis, 'attendance_prorated');
  RETURN NEW;
END;
$$;

CREATE TRIGGER employment_contracts_set_pay_basis
BEFORE INSERT OR UPDATE OF pay_basis
ON public.employment_contracts
FOR EACH ROW EXECUTE FUNCTION private.set_contract_pay_basis();

ALTER TABLE public.payroll_entries
  ADD COLUMN pay_basis text NOT NULL DEFAULT 'attendance_prorated',
  ADD CONSTRAINT payroll_entries_pay_basis_check
    CHECK (pay_basis IN ('attendance_prorated', 'fixed_monthly'));

CREATE OR REPLACE FUNCTION private.set_payroll_entry_pay_basis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_period_end date;
BEGIN
  SELECT (
    make_date(period.period_year, period.period_month, 1)
    + interval '1 month - 1 day'
  )::date
  INTO v_period_end
  FROM public.payroll_periods period
  WHERE period.id = NEW.payroll_period_id
    AND period.tenant_id = NEW.tenant_id;

  SELECT contract.pay_basis
  INTO NEW.pay_basis
  FROM public.employment_contracts contract
  WHERE contract.tenant_id = NEW.tenant_id
    AND contract.employee_id = NEW.employee_id
    AND contract.start_date <= v_period_end
    AND (contract.end_date IS NULL OR contract.end_date >= v_period_end)
  ORDER BY contract.start_date DESC, contract.id DESC
  LIMIT 1;

  NEW.pay_basis := COALESCE(NEW.pay_basis, 'attendance_prorated');
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_entries_set_pay_basis
BEFORE INSERT ON public.payroll_entries
FOR EACH ROW EXECUTE FUNCTION private.set_payroll_entry_pay_basis();

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

  SELECT shift_row.is_opening, shift_row.is_closing
  INTO v_is_opening, v_is_closing
  FROM public.shifts shift_row
  WHERE shift_row.id = p_shift_id
    AND shift_row.tenant_id = v_tenant_id
    AND shift_row.is_active
    AND (
      shift_row.branch_id IS NULL
      OR shift_row.branch_id IS NOT DISTINCT FROM v_assigned_branch_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.attendance_records (
    tenant_id, branch_id, employee_id, shift_id, date, check_in, status,
    method, check_in_photo_path, checklist_template_id
  )
  VALUES (
    v_tenant_id, v_assigned_branch_id, v_employee_id, p_shift_id,
    p_business_date, now(), 'present', 'pwa', p_photo_path, NULL
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
    AND task.is_active
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
BEGIN
  IF v_actor IS NULL OR public.auth_role() = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_checklist_items item
  SET is_done = p_done,
      completed_at = CASE WHEN p_done THEN now() ELSE NULL END
  FROM public.attendance_records attendance
  JOIN public.employees employee
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
  FROM public.employees employee
  WHERE employee.profile_id = v_actor
    AND employee.tenant_id = v_tenant_id
    AND employee.is_active;

  SELECT attendance.*
  INTO v_record
  FROM public.attendance_records attendance
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
    FROM public.attendance_checklist_items item
    WHERE item.attendance_record_id = v_record.id
      AND item.tenant_id = v_tenant_id
      AND item.is_required
      AND NOT item.is_done
  ) THEN
    RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514';
  END IF;

  IF v_record.checkout_requested_at IS NOT NULL THEN
    RETURN v_record.checkout_requested_at;
  END IF;

  SELECT branch.branch_kind INTO v_branch_kind
  FROM public.branches branch
  WHERE branch.id = v_record.branch_id
    AND branch.tenant_id = v_tenant_id;

  v_target_roles := CASE
    WHEN v_role IN ('cashier', 'chef', 'branch_staff')
      AND v_branch_kind = 'branch'
      THEN ARRAY['branch_manager']::text[]
    ELSE ARRAY['owner']::text[]
  END;

  UPDATE public.attendance_records attendance
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

CREATE OR REPLACE FUNCTION public.self_service_cancel_checkout(
  p_attendance_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.auth_role() = 'owner' THEN
    RAISE EXCEPTION 'self_service_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records attendance
  SET checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      updated_at = now()
  FROM public.employees employee
  WHERE attendance.id = p_attendance_id
    AND attendance.employee_id = employee.id
    AND attendance.tenant_id = employee.tenant_id
    AND employee.profile_id = auth.uid()
    AND attendance.check_out IS NULL
    AND attendance.checkout_approved_at IS NULL
    AND attendance.checkout_requested_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_checkout_review_queue(
  p_branch_id bigint,
  p_include_rows boolean DEFAULT true
)
RETURNS TABLE(pending_count bigint, rows jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_is_owner boolean;
BEGIN
  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile
  WHERE profile.id = v_actor AND profile.tenant_id = v_tenant_id AND profile.is_active;
  v_is_owner := v_role = 'owner' AND public.auth_is_owner(v_actor);

  IF v_actor IS NULL OR (
    NOT v_is_owner
    AND (
      v_role <> 'branch_manager'
      OR p_branch_id IS NULL
      OR v_actor_branch_id IS DISTINCT FROM p_branch_id
      OR NOT public.has_permission(p_branch_id, 'hr:approve_checkout')
    )
  ) THEN
    RAISE EXCEPTION 'checkout_review_queue_not_allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible_requests AS MATERIALIZED (
    SELECT attendance.id, attendance.date, attendance.branch_id,
           attendance.check_in, attendance.checkout_requested_at,
           attendance.checkout_requested_by_role,
           attendance.checkout_approval_target_roles, attendance.employee_id,
           branch.name AS branch_name, employee.employee_code,
           requester.full_name AS employee_full_name,
           private.staff_role_from_position_code(position.code) AS requester_role,
           shift_row.name AS shift_name, shift_row.start_time AS shift_start_time,
           shift_row.end_time AS shift_end_time
    FROM public.attendance_records attendance
    JOIN public.employees employee
      ON employee.id = attendance.employee_id AND employee.tenant_id = attendance.tenant_id
    JOIN public.profiles requester
      ON requester.id = employee.profile_id AND requester.tenant_id = employee.tenant_id
    JOIN public.positions position
      ON position.id = requester.position_id AND position.tenant_id = requester.tenant_id
    LEFT JOIN public.branches branch
      ON branch.id = attendance.branch_id AND branch.tenant_id = attendance.tenant_id
    LEFT JOIN public.shifts shift_row
      ON shift_row.id = attendance.shift_id AND shift_row.tenant_id = attendance.tenant_id
    WHERE attendance.tenant_id = v_tenant_id
      AND attendance.check_out IS NULL
      AND attendance.checkout_requested_at IS NOT NULL
      AND requester.id <> v_actor
      AND employee.is_active
      AND requester.is_active
      AND position.is_active
      AND (
        (
          v_is_owner
          AND 'owner' = ANY(attendance.checkout_approval_target_roles)
          AND (p_branch_id IS NULL OR attendance.branch_id IS NOT DISTINCT FROM p_branch_id)
        )
        OR (
          NOT v_is_owner
          AND attendance.branch_id = p_branch_id
          AND 'branch_manager' = ANY(attendance.checkout_approval_target_roles)
        )
      )
  ), limited_requests AS (
    SELECT * FROM visible_requests
    ORDER BY checkout_requested_at, id
    LIMIT 100
  )
  SELECT count(*)::bigint,
    CASE WHEN p_include_rows THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', limited.id,
        'date', limited.date,
        'branch_id', limited.branch_id,
        'check_in', limited.check_in,
        'checkout_requested_at', limited.checkout_requested_at,
        'checkout_requested_by_role', limited.checkout_requested_by_role,
        'checkout_approval_target_roles', limited.checkout_approval_target_roles,
        'employee_id', limited.employee_id,
        'branch_name', limited.branch_name,
        'employee_code', limited.employee_code,
        'employee_full_name', limited.employee_full_name,
        'requester_role', limited.requester_role,
        'shift_name', limited.shift_name,
        'shift_start_time', limited.shift_start_time,
        'shift_end_time', limited.shift_end_time,
        'checklist', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', item.id, 'title', item.title,
            'is_done', item.is_done, 'is_required', item.is_required
          ) ORDER BY item.sort_order, item.id)
          FROM public.attendance_checklist_items item
          WHERE item.attendance_record_id = limited.id
            AND item.tenant_id = v_tenant_id
        ), '[]'::jsonb)
      ) ORDER BY limited.checkout_requested_at, limited.id)
      FROM limited_requests limited
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  FROM visible_requests;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_employee_clock_out(
  p_attendance_id bigint,
  p_note text DEFAULT NULL
)
RETURNS TABLE(branch_id bigint, check_out timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_actor_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_branch_id bigint;
  v_branch_kind text;
  v_requested_at timestamptz;
  v_check_out timestamptz;
BEGIN
  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile
  WHERE profile.id = v_actor AND profile.tenant_id = v_tenant_id AND profile.is_active;

  IF v_actor IS NULL OR v_actor_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT requester.id, private.staff_role_from_position_code(position.code),
         attendance.branch_id, branch.branch_kind, attendance.checkout_requested_at
  INTO v_requester_profile_id, v_requester_role, v_branch_id, v_branch_kind, v_requested_at
  FROM public.attendance_records attendance
  JOIN public.employees employee
    ON employee.id = attendance.employee_id AND employee.tenant_id = attendance.tenant_id
  JOIN public.profiles requester
    ON requester.id = employee.profile_id AND requester.tenant_id = employee.tenant_id
  JOIN public.positions position
    ON position.id = requester.position_id AND position.tenant_id = requester.tenant_id
  LEFT JOIN public.branches branch
    ON branch.id = attendance.branch_id AND branch.tenant_id = attendance.tenant_id
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL
  FOR UPDATE OF attendance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_requester_profile_id = v_actor THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  -- Floor branch → BM (or Owner). Accountant (null site) + central → Owner only.
  IF v_branch_kind = 'branch'
     AND v_requester_role IN ('cashier', 'chef', 'branch_staff')
     AND v_branch_id IS NOT NULL THEN
    IF v_actor_role <> 'owner'
       AND (v_actor_role <> 'branch_manager' OR v_actor_branch_id IS DISTINCT FROM v_branch_id
            OR NOT public.has_permission(v_branch_id, 'hr:approve_checkout')) THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'checkout_requires_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records attendance
  SET check_out = v_requested_at,
      checkout_approved_at = now(),
      checkout_approved_by = v_actor,
      checkout_approval_note = NULLIF(btrim(p_note), ''),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
  RETURNING attendance.check_out INTO v_check_out;

  RETURN QUERY SELECT v_branch_id, v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_employee_clock_out(
  p_attendance_id bigint,
  p_note text DEFAULT NULL
)
RETURNS TABLE(branch_id bigint, rejected boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_actor_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_branch_id bigint;
  v_branch_kind text;
BEGIN
  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile
  WHERE profile.id = v_actor AND profile.tenant_id = v_tenant_id AND profile.is_active;

  SELECT requester.id, private.staff_role_from_position_code(position.code),
         attendance.branch_id, branch.branch_kind
  INTO v_requester_profile_id, v_requester_role, v_branch_id, v_branch_kind
  FROM public.attendance_records attendance
  JOIN public.employees employee
    ON employee.id = attendance.employee_id AND employee.tenant_id = attendance.tenant_id
  JOIN public.profiles requester
    ON requester.id = employee.profile_id AND requester.tenant_id = employee.tenant_id
  JOIN public.positions position
    ON position.id = requester.position_id AND position.tenant_id = requester.tenant_id
  LEFT JOIN public.branches branch
    ON branch.id = attendance.branch_id AND branch.tenant_id = attendance.tenant_id
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL
  FOR UPDATE OF attendance;
  IF NOT FOUND OR v_actor IS NULL OR v_requester_profile_id = v_actor THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind = 'branch'
     AND v_requester_role IN ('cashier', 'chef', 'branch_staff')
     AND v_branch_id IS NOT NULL THEN
    IF v_actor_role <> 'owner'
       AND (v_actor_role <> 'branch_manager' OR v_actor_branch_id IS DISTINCT FROM v_branch_id
            OR NOT public.has_permission(v_branch_id, 'hr:approve_checkout')) THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'checkout_requires_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records attendance
  SET checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      checkout_approval_note = NULLIF(btrim(p_note), ''),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL;

  RETURN QUERY SELECT v_branch_id, true;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_close_stale_attendance(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_attendance_id bigint,
  p_approved_by uuid,
  p_note text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_record public.attendance_records%ROWTYPE;
  v_requester uuid;
  v_requester_role text;
  v_branch_kind text;
  v_shift_start time;
  v_shift_end time;
  v_shift_end_at timestamp;
  v_now_local timestamp := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_check_out timestamptz;
BEGIN
  IF v_actor IS NULL OR v_actor <> p_approved_by
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'not_authenticated_or_mismatch' USING ERRCODE = '28000';
  END IF;

  -- ROWTYPE cannot share an INTO list with scalar targets (42601).
  SELECT attendance.*
  INTO v_record
  FROM public.attendance_records attendance
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = p_tenant_id
    AND attendance.branch_id IS NOT DISTINCT FROM p_branch_id
    AND attendance.check_in IS NOT NULL
    AND attendance.check_out IS NULL
  FOR UPDATE;
  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT employee.profile_id,
         private.staff_role_from_position_code(position.code),
         branch.branch_kind,
         shift_row.start_time,
         shift_row.end_time
  INTO v_requester, v_requester_role, v_branch_kind, v_shift_start, v_shift_end
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id AND profile.tenant_id = employee.tenant_id
  JOIN public.positions position
    ON position.id = profile.position_id AND position.tenant_id = profile.tenant_id
  LEFT JOIN public.branches branch
    ON branch.id = v_record.branch_id AND branch.tenant_id = v_record.tenant_id
  LEFT JOIN public.shifts shift_row
    ON shift_row.id = v_record.shift_id AND shift_row.tenant_id = v_record.tenant_id
  WHERE employee.id = v_record.employee_id
    AND employee.tenant_id = v_record.tenant_id;
  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_shift_start IS NULL OR v_shift_end IS NULL THEN
    IF v_record.date >= v_now_local::date THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_shift_end_at := v_record.date + v_shift_end;
    IF v_shift_end <= v_shift_start THEN
      v_shift_end_at := v_shift_end_at + interval '1 day';
    END IF;
    IF v_now_local < v_shift_end_at THEN
      RAISE EXCEPTION 'stale_attendance_request_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_actor = v_requester THEN
    RAISE EXCEPTION 'cannot_force_close_own_attendance' USING ERRCODE = '42501';
  END IF;

  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile
  WHERE profile.id = v_actor AND profile.tenant_id = p_tenant_id;

  IF v_branch_kind = 'branch'
     AND v_requester_role IN ('cashier', 'chef', 'branch_staff')
     AND v_record.branch_id IS NOT NULL THEN
    IF v_role <> 'owner'
       AND (
         v_role <> 'branch_manager'
         OR v_actor_branch_id IS DISTINCT FROM v_record.branch_id
         OR NOT public.has_permission(v_record.branch_id, 'hr:approve_checkout')
       ) THEN
      RAISE EXCEPTION 'force_close_hierarchy_not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role <> 'owner' OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'force_close_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records attendance
  SET check_out = v_record.check_in,
      checkout_approved_at = now(),
      checkout_approved_by = v_actor,
      checkout_approval_note = COALESCE(
        NULLIF(btrim(p_note), ''),
        'Force closed: missed checkout, no workday credit'
      ),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = p_tenant_id
    AND attendance.branch_id IS NOT DISTINCT FROM p_branch_id
    AND attendance.check_out IS NULL
  RETURNING attendance.check_out INTO v_check_out;

  RETURN v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_leave_request(
  p_branch_id bigint,
  p_start_date date,
  p_end_date date,
  p_leave_type text DEFAULT 'annual',
  p_reason text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_role text := public.auth_role();
  v_employee_id bigint;
  v_assigned_branch_id bigint;
  v_branch_kind text;
  v_request_id bigint;
  v_leave_type text := COALESCE(NULLIF(btrim(p_leave_type), ''), 'annual');
BEGIN
  SELECT employee.id, profile.branch_id
  INTO v_employee_id, v_assigned_branch_id
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id AND profile.tenant_id = employee.tenant_id
  WHERE employee.profile_id = v_actor
    AND employee.tenant_id = v_tenant_id
    AND employee.is_active
    AND profile.is_active;

  IF v_actor IS NULL OR v_employee_id IS NULL OR v_role = 'owner' THEN
    RAISE EXCEPTION 'submit_leave_request: self service not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
     OR p_start_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'submit_leave_request: invalid date range' USING ERRCODE = '23514';
  END IF;
  IF v_leave_type NOT IN ('annual', 'sick', 'unpaid', 'personal', 'other') THEN
    RAISE EXCEPTION 'submit_leave_request: invalid leave type' USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'submit_leave_request: reason too long' USING ERRCODE = '22001';
  END IF;

  IF v_role = 'accountant' THEN
    IF v_assigned_branch_id IS NOT NULL OR p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'submit_leave_request: accountant scope must be null' USING ERRCODE = '42501';
    END IF;
    v_branch_kind := NULL;
  ELSE
    IF v_assigned_branch_id IS NULL
       OR p_branch_id IS DISTINCT FROM v_assigned_branch_id THEN
      RAISE EXCEPTION 'submit_leave_request: assigned site mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT branch.branch_kind INTO v_branch_kind
    FROM public.branches branch
    WHERE branch.id = v_assigned_branch_id
      AND branch.tenant_id = v_tenant_id
      AND branch.is_active
      AND branch.branch_kind IN ('branch', 'central_supply', 'central_kitchen');
    IF v_branch_kind IS NULL THEN
      RAISE EXCEPTION 'submit_leave_request: branch not found or inactive' USING ERRCODE = '23503';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);
  IF EXISTS (
    SELECT 1 FROM public.leave_requests request
    WHERE request.tenant_id = v_tenant_id
      AND request.employee_id = v_employee_id
      AND request.status IN ('pending', 'approved')
      AND daterange(request.start_date, request.end_date, '[]')
          && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'submit_leave_request: date range overlaps existing request'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.leave_requests (
    tenant_id, branch_id, employee_id, start_date, end_date, leave_type,
    status, reason
  )
  VALUES (
    v_tenant_id, v_assigned_branch_id, v_employee_id, p_start_date, p_end_date,
    v_leave_type, 'pending', NULLIF(btrim(p_reason), '')
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant_id,
    CASE WHEN v_branch_kind = 'branch' AND v_role <> 'branch_manager'
      THEN v_assigned_branch_id ELSE NULL END,
    CASE WHEN v_branch_kind = 'branch' AND v_role <> 'branch_manager'
      THEN ARRAY['branch_manager', 'owner']::text[] ELSE ARRAY['owner']::text[] END,
    'hr.leave_requested', 'info', 'Yêu cầu nghỉ phép mới',
    'Nhân viên đã gửi yêu cầu nghỉ phép.',
    'leave_request', v_request_id,
    CASE WHEN v_branch_kind = 'branch' AND v_role <> 'branch_manager'
      THEN format('/br/%s/shift/leave-approvals', v_assigned_branch_id)
      ELSE '/hr/attendance?tab=approvals' END,
    jsonb_build_object('leave_request_id', v_request_id, 'branch_id', v_assigned_branch_id),
    format('hr.leave_request:%s', v_request_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.authorize_leave_review(
  p_request_id bigint
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
  v_actor uuid := auth.uid();
  v_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_branch_kind text;
BEGIN
  SELECT * INTO v_request
  FROM public.leave_requests request
  WHERE request.id = p_request_id
    AND request.tenant_id = public.auth_tenant_id()
  FOR UPDATE;
  IF v_request.id IS NULL OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'leave_request_not_pending' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employees employee
    WHERE employee.id = v_request.employee_id AND employee.profile_id = v_actor
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_leave' USING ERRCODE = '42501';
  END IF;

  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile WHERE profile.id = v_actor;
  SELECT branch.branch_kind INTO v_branch_kind
  FROM public.branches branch
  WHERE branch.id = v_request.branch_id
    AND branch.tenant_id = v_request.tenant_id;

  IF v_request.branch_id IS NULL OR v_branch_kind IN ('central_supply', 'central_kitchen') THEN
    IF v_role <> 'owner' OR NOT public.auth_is_owner(v_actor) THEN
      RAISE EXCEPTION 'leave_review_requires_owner' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role <> 'owner'
    AND (v_role <> 'branch_manager'
      OR v_actor_branch_id IS DISTINCT FROM v_request.branch_id
      OR NOT public.has_permission(v_request.branch_id, 'hr:approve_leave_request')) THEN
    RAISE EXCEPTION 'leave_review_wrong_branch' USING ERRCODE = '42501';
  END IF;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
BEGIN
  v_request := private.authorize_leave_review(p_request_id);
  UPDATE public.leave_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = v_request.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave_request_not_pending' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_audit(
    'approve', 'leave_request', p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_leave_request(
  p_request_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
BEGIN
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reject_leave_request: reason too long' USING ERRCODE = '22001';
  END IF;
  v_request := private.authorize_leave_review(p_request_id);
  UPDATE public.leave_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      rejected_reason = NULLIF(btrim(p_reason), '')
  WHERE id = v_request.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave_request_not_pending' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_audit(
    'reject', 'leave_request', p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'reason', NULLIF(btrim(p_reason), ''))
  );
END;
$$;

DROP POLICY IF EXISTS leave_requests_self_insert ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_manager_update ON public.leave_requests;
DROP POLICY IF EXISTS leave_requests_select ON public.leave_requests;

CREATE POLICY leave_requests_select
ON public.leave_requests
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    EXISTS (
      SELECT 1 FROM public.employees employee
      WHERE employee.id = leave_requests.employee_id
        AND employee.profile_id = (SELECT auth.uid())
    )
    OR public.auth_role() = 'owner'
    OR (
      branch_id IS NOT NULL
      AND public.has_permission(branch_id, 'hr:approve_leave_request')
    )
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.attendance_records FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.attendance_checklist_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.leave_requests FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.self_service_clock_in(bigint, bigint, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_service_toggle_task(bigint, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_service_request_checkout(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.self_service_cancel_checkout(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.authorize_leave_review(bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.self_service_clock_in(bigint, bigint, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_toggle_task(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_request_checkout(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.self_service_cancel_checkout(bigint) TO authenticated;
