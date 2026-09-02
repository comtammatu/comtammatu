-- WP-D: allows_photo on position_shift_tasks + checklist snapshot/attach path.
-- WP-E: seed default KDS station "Quầy lên món" for branches with none.
-- Also: clear is_shift_leader when reconcile moves/clears a shift (unique per shift/day).

-- ---------------------------------------------------------------------------
-- Schema: photo evidence flags
-- ---------------------------------------------------------------------------

ALTER TABLE public.position_shift_tasks
  ADD COLUMN IF NOT EXISTS allows_photo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.position_shift_tasks.allows_photo IS
  'When true, PWA may attach optional photo evidence on task completion (ADR 0011).';

ALTER TABLE public.attendance_checklist_items
  ADD COLUMN IF NOT EXISTS allows_photo boolean NOT NULL DEFAULT false;

ALTER TABLE public.attendance_checklist_items
  ADD COLUMN IF NOT EXISTS photo_path text;

COMMENT ON COLUMN public.attendance_checklist_items.allows_photo IS
  'Snapshot of position_shift_tasks.allows_photo at clock-in.';

COMMENT ON COLUMN public.attendance_checklist_items.photo_path IS
  'Optional storage object path in attendance-photos bucket when task allows_photo.';

-- ---------------------------------------------------------------------------
-- upsert_position_shift_tasks: persist allowsPhoto
-- ---------------------------------------------------------------------------

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
  v_allows_photo boolean;
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
    v_allows_photo := COALESCE(
      NULLIF(v_item->>'allowsPhoto', '')::boolean,
      false
    );

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
      allows_photo,
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
      v_allows_photo,
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

-- ---------------------------------------------------------------------------
-- Clock-in snapshots: include allows_photo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.self_service_clock_in(p_branch_id bigint, p_shift_id bigint, p_business_date date, p_photo_path text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
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
    done_definition, is_required, allows_photo, scope, task_kind, sort_order
  )
  SELECT v_tenant_id, v_attendance_id, NULL, task.title, task.phase,
         task.done_definition, task.is_required, task.allows_photo,
         task.applicability, task.kind,
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
    p_photo_path,
    NULL
  )
  RETURNING id INTO v_attendance_id;

  INSERT INTO public.attendance_checklist_items
    (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, allows_photo, scope, task_kind, sort_order)
  SELECT p_tenant_id, v_attendance_id, NULL, t.title, t.phase, t.done_definition, t.is_required,
         t.allows_photo, t.applicability, t.kind, row_number() OVER (ORDER BY t.sort_order, t.id)::integer
  FROM public.position_shift_tasks t
  WHERE t.tenant_id = p_tenant_id AND t.position_id = v_position_id AND t.is_active
    AND ( t.applicability = 'every_shift'
          OR (t.applicability = 'opening' AND v_is_open)
          OR (t.applicability = 'closing' AND v_is_close) );

  IF EXISTS (
    SELECT 1 FROM public.inventory_count_assignments a
    WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
      AND a.employee_id = p_employee_id AND a.is_active
  ) THEN
    INSERT INTO public.attendance_checklist_items
      (tenant_id, attendance_record_id, template_item_id, title, phase, done_definition, is_required, allows_photo, scope, task_kind, sort_order)
    VALUES (p_tenant_id, v_attendance_id, NULL, 'Kiểm kê tồn', 'end_of_shift',
            'Nộp phiếu đếm tại màn Kiểm kê tồn.', true, false, 'every_shift', 'inventory_count',
            COALESCE((SELECT max(sort_order) FROM public.attendance_checklist_items WHERE attendance_record_id = v_attendance_id), 0) + 1);
  END IF;

  RETURN v_attendance_id;
END;
$$;

-- Attach optional task photo (ADR 0011 bucket path already uploaded by app)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.self_service_attach_task_photo(
  p_item_id bigint,
  p_photo_path text
) RETURNS void
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

  UPDATE public.attendance_checklist_items item
  SET photo_path = v_path,
      updated_at = now()
  FROM public.attendance_records attendance
  JOIN public.employees employee
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

REVOKE ALL ON FUNCTION public.self_service_attach_task_photo(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_service_attach_task_photo(bigint, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed minimal position_shift_tasks (only when position has zero active tasks)
-- ---------------------------------------------------------------------------

WITH seed(code, phase, title, done_definition, sort_order, allows_photo) AS (
  VALUES
    ('cashier', 'start_of_shift', 'Chuẩn bị quầy POS', 'Đăng nhập POS, đếm quỹ lẻ, kiểm tra máy in.', 1, false),
    ('cashier', 'end_of_shift', 'Chốt ca POS', 'Đếm tiền mặt theo mệnh giá và đóng phiên POS.', 2, true),
    ('kitchen_counter', 'start_of_shift', 'Bật KDS quầy nóng', 'KDS sẵn sàng; kiểm tra thố nguyên liệu quầy lên món.', 1, false),
    ('kitchen_counter', 'end_of_shift', 'Dọn quầy lên món', 'Tắt KDS, đóng nắp thố, bàn giao thực phẩm thừa.', 2, true),
    ('grill_counter', 'start_of_shift', 'Chuẩn bị bếp nướng', 'Bếp nướng sẵn sàng; lấy khay sườn ướp từ tủ mát.', 1, false),
    ('grill_counter', 'end_of_shift', 'Vệ sinh bếp nướng', 'Tắt bếp, vệ sinh vỉ/khay; báo số sườn dư.', 2, true),
    ('kitchen_helper', 'start_of_shift', 'Chuẩn bị cơm và canh', 'Nồi cơm tấm, canh nóng và đĩa cơm gối đầu sẵn sàng.', 1, false),
    ('kitchen_helper', 'end_of_shift', 'Vệ sinh khu bếp phụ', 'Vệ sinh nồi cơm, tủ hấp và quầy bếp.', 2, true),
    ('waiter', 'start_of_shift', 'Chuẩn bị sảnh phục vụ', 'Lau bàn ghế sảnh; kiểm tra đĩa/muỗng/đũa.', 1, false),
    ('waiter', 'end_of_shift', 'Dọn sảnh cuối ca', 'Lau sạch bàn ghế; gom đĩa dơ về khu rửa.', 2, true),
    ('cleaner', 'start_of_shift', 'Chuẩn bị khu rửa', 'Chuẩn bị bồn rửa, hóa chất và hũ dự phòng lên quầy.', 1, false),
    ('cleaner', 'end_of_shift', 'Rửa và đổ rác cuối ca', 'Rửa sạch tồn đọng, đổ rác chi nhánh, lau sàn.', 2, true)
)
INSERT INTO public.position_shift_tasks (
  tenant_id, position_id, title, kind, applicability, phase,
  is_required, allows_photo, done_definition, sort_order, is_active
)
SELECT
  position.tenant_id,
  position.id,
  seed.title,
  'standard',
  'every_shift',
  seed.phase,
  true,
  seed.allows_photo,
  seed.done_definition,
  seed.sort_order,
  true
FROM seed
JOIN public.positions position
  ON position.code = seed.code
 AND position.is_active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.position_shift_tasks existing
  WHERE existing.tenant_id = position.tenant_id
    AND existing.position_id = position.id
    AND existing.is_active
);

-- ---------------------------------------------------------------------------
-- WP-E: default KDS station for branches with none
-- ---------------------------------------------------------------------------

INSERT INTO public.kds_stations (tenant_id, branch_id, name, position, is_active)
SELECT
  branch.tenant_id,
  branch.id,
  'Quầy lên món',
  0,
  true
FROM public.branches branch
WHERE branch.is_active
  AND branch.branch_kind = 'branch'
  AND NOT EXISTS (
    SELECT 1
    FROM public.kds_stations station
    WHERE station.branch_id = branch.id
      AND station.tenant_id = branch.tenant_id
  );

-- ---------------------------------------------------------------------------
-- Clear leader flag when reconcile changes/clears shift assignment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reconcile_shift_assignments_week(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_week_start date,
  p_assignments jsonb
) RETURNS jsonb
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
  IF (
    public.has_permission(p_branch_id, 'hr:assign_shift')
    OR public.has_permission(NULL::bigint, 'hr:assign_shift')
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'branch_manager' AND (
    p_branch_id IS NULL OR v_actor_branch IS DISTINCT FROM p_branch_id
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'week_start_must_be_monday' USING ERRCODE = '22023';
  END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments_must_be_array' USING ERRCODE = '22023';
  END IF;

  v_lock_key := pg_catalog.hashtextextended(
    format('%s:%s:%s', p_tenant_id, coalesce(p_branch_id::text, 'null'), p_week_start::text),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  WITH desired AS (
    SELECT DISTINCT
      (element->>'employee_id')::bigint AS employee_id,
      (element->>'work_date')::date AS work_date,
      (element->>'shift_id')::bigint AS shift_id
    FROM jsonb_array_elements(p_assignments) element
  ),
  omitted AS (
    SELECT assignment.id
    FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = p_tenant_id
      AND assignment.branch_id IS NOT DISTINCT FROM p_branch_id
      AND assignment.work_date BETWEEN p_week_start AND v_week_end
      AND NOT EXISTS (
        SELECT 1
        FROM desired
        WHERE desired.employee_id = assignment.employee_id
          AND desired.work_date = assignment.work_date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.attendance_records attendance
        WHERE attendance.tenant_id = assignment.tenant_id
          AND attendance.employee_id = assignment.employee_id
          AND attendance.date = assignment.work_date
      )
  ),
  marked_off AS (
    UPDATE public.shift_assignments assignment
    SET shift_id = NULL,
        is_shift_leader = false,
        source = 'day_off',
        assigned_by = v_actor,
        assigned_at = now(),
        updated_at = now()
    FROM omitted
    JOIN public.employee_weekly_schedules schedule
      ON schedule.tenant_id = p_tenant_id
    WHERE assignment.id = omitted.id
      AND schedule.employee_id = assignment.employee_id
      AND assignment.work_date >= schedule.effective_from
      AND CASE extract(isodow FROM assignment.work_date)::integer
        WHEN 1 THEN schedule.monday_shift_id
        WHEN 2 THEN schedule.tuesday_shift_id
        WHEN 3 THEN schedule.wednesday_shift_id
        WHEN 4 THEN schedule.thursday_shift_id
        WHEN 5 THEN schedule.friday_shift_id
        WHEN 6 THEN schedule.saturday_shift_id
        WHEN 7 THEN schedule.sunday_shift_id
      END IS NOT NULL
    RETURNING assignment.id
  ),
  removed AS (
    DELETE FROM public.shift_assignments assignment
    USING omitted
    WHERE assignment.id = omitted.id
      AND NOT EXISTS (
        SELECT 1 FROM marked_off WHERE marked_off.id = assignment.id
      )
    RETURNING assignment.id
  )
  SELECT count(*) INTO v_deleted FROM removed;

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

    SELECT profile.branch_id
    INTO v_emp_branch
    FROM public.employees employee
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = v_employee_id
      AND employee.tenant_id = p_tenant_id
      AND employee.is_active
      AND profile.is_active;
    IF NOT FOUND OR v_emp_branch IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'employee_not_in_site' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.shifts shift
      WHERE shift.id = v_shift_id
        AND shift.tenant_id = p_tenant_id
        AND shift.is_active
        AND shift.branch_id IS NULL
    ) THEN
      RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.attendance_records attendance
      WHERE attendance.tenant_id = p_tenant_id
        AND attendance.employee_id = v_employee_id
        AND attendance.date = v_work_date
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT assignment.id, assignment.shift_id
    INTO v_existing_id, v_existing_shift
    FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = p_tenant_id
      AND assignment.employee_id = v_employee_id
      AND assignment.work_date = v_work_date;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.shift_assignments (
        tenant_id, branch_id, employee_id, shift_id, work_date,
        assigned_by, assigned_at, source
      )
      VALUES (
        p_tenant_id, p_branch_id, v_employee_id, v_shift_id, v_work_date,
        v_actor, now(), 'manual'
      );
      v_created := v_created + 1;
    ELSIF v_existing_shift IS DISTINCT FROM v_shift_id THEN
      UPDATE public.shift_assignments
      SET shift_id = v_shift_id,
          branch_id = p_branch_id,
          is_shift_leader = false,
          source = 'manual',
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
