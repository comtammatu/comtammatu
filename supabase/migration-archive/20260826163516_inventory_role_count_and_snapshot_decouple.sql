-- Migration: Role Count Templates, Snapshot Unit Factors, and Count Slip Decoupling
-- Description:
-- 1. Create inventory_count_templates and inventory_count_template_items for role/station-based count lists.
-- 2. Seed initial templates (drink_bar, grill_station, main_kitchen) for comtammatu tenant.
-- 3. Add entry_to_base_factor and counted_base_quantity to inventory_count_slip_lines and backfill.
-- 4. Update submit_inventory_count_slip to snapshot conversion factors and base counted quantity.
-- 5. Update execute_approve_inventory_count_slip to decouple count slips from stock_movements (no count_adjustment).
-- 6. Create RPC set_inventory_count_assignments_by_template for atomic station-role assignments.

-- ─── 1. Tables: inventory_count_templates & template_items ───────────────────

CREATE TABLE IF NOT EXISTS public.inventory_count_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id bigint REFERENCES public.branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  station_role text NOT NULL,
  is_system boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT inventory_count_templates_code_len CHECK (char_length(code) <= 64),
  CONSTRAINT inventory_count_templates_name_len CHECK (char_length(name) <= 128),
  CONSTRAINT inventory_count_templates_unique UNIQUE (tenant_id, branch_id, code)
);

CREATE INDEX IF NOT EXISTS idx_count_templates_lookup
  ON public.inventory_count_templates (tenant_id, branch_id, station_role, is_active);

ALTER TABLE public.inventory_count_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_count_templates_select ON public.inventory_count_templates;
CREATE POLICY inventory_count_templates_select ON public.inventory_count_templates
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id IS NULL
      OR branch_id = (SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid())
      OR public.has_permission(branch_id, 'inventory:count_assign')
      OR public.has_permission(branch_id, 'inventory:count_submit')
    )
  );

DROP POLICY IF EXISTS inventory_count_templates_manage ON public.inventory_count_templates;
CREATE POLICY inventory_count_templates_manage ON public.inventory_count_templates
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id IS NOT NULL
      AND public.has_permission(branch_id, 'inventory:count_assign')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      branch_id IS NOT NULL
      AND public.has_permission(branch_id, 'inventory:count_assign')
    )
  );

CREATE TABLE IF NOT EXISTS public.inventory_count_template_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id bigint NOT NULL REFERENCES public.inventory_count_templates(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT inventory_count_template_items_unique UNIQUE (template_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_count_template_items_template
  ON public.inventory_count_template_items (template_id, sort_order);

ALTER TABLE public.inventory_count_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_count_template_items_select ON public.inventory_count_template_items;
CREATE POLICY inventory_count_template_items_select ON public.inventory_count_template_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.inventory_count_templates t
      WHERE t.id = inventory_count_template_items.template_id
        AND t.tenant_id = public.auth_tenant_id()
    )
  );

DROP POLICY IF EXISTS inventory_count_template_items_manage ON public.inventory_count_template_items;
CREATE POLICY inventory_count_template_items_manage ON public.inventory_count_template_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.inventory_count_templates t
      WHERE t.id = inventory_count_template_items.template_id
        AND t.tenant_id = public.auth_tenant_id()
        AND t.branch_id IS NOT NULL
        AND public.has_permission(t.branch_id, 'inventory:count_assign')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.inventory_count_templates t
      WHERE t.id = inventory_count_template_items.template_id
        AND t.tenant_id = public.auth_tenant_id()
        AND t.branch_id IS NOT NULL
        AND public.has_permission(t.branch_id, 'inventory:count_assign')
    )
  );

-- ─── 2. Seed Initial Standard Tenant Templates ──────────────────────────────

DO $$
DECLARE
  v_tenant_id bigint;
  v_drink_tpl_id bigint;
  v_grill_tpl_id bigint;
  v_kitchen_tpl_id bigint;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. Quầy Nước & Phục Vụ
  INSERT INTO public.inventory_count_templates (
    tenant_id, branch_id, code, name, station_role, is_system, is_active
  )
  VALUES (
    v_tenant_id, NULL, 'drink_bar', 'Quầy Nước & Phục Vụ', 'cashier_waiter', true, true
  )
  ON CONFLICT (tenant_id, branch_id, code) DO UPDATE
  SET name = EXCLUDED.name, station_role = EXCLUDED.station_role, is_active = true
  RETURNING id INTO v_drink_tpl_id;

  -- 2. Quầy Nướng
  INSERT INTO public.inventory_count_templates (
    tenant_id, branch_id, code, name, station_role, is_system, is_active
  )
  VALUES (
    v_tenant_id, NULL, 'grill_station', 'Quầy Nướng', 'grill', true, true
  )
  ON CONFLICT (tenant_id, branch_id, code) DO UPDATE
  SET name = EXCLUDED.name, station_role = EXCLUDED.station_role, is_active = true
  RETURNING id INTO v_grill_tpl_id;

  -- 3. Bếp Chính & Kho
  INSERT INTO public.inventory_count_templates (
    tenant_id, branch_id, code, name, station_role, is_system, is_active
  )
  VALUES (
    v_tenant_id, NULL, 'main_kitchen', 'Bếp Chính & Kho', 'kitchen', true, true
  )
  ON CONFLICT (tenant_id, branch_id, code) DO UPDATE
  SET name = EXCLUDED.name, station_role = EXCLUDED.station_role, is_active = true
  RETURNING id INTO v_kitchen_tpl_id;

  -- Link ingredients for Drink Bar (Beverages, Drink ingredients)
  INSERT INTO public.inventory_count_template_items (tenant_id, template_id, ingredient_id, sort_order)
  SELECT v_tenant_id, v_drink_tpl_id, i.id, row_number() over (ORDER BY i.name)
  FROM public.ingredients i
  WHERE i.tenant_id = v_tenant_id
    AND i.is_active IS TRUE
    AND (
      i.category ILIKE '%nước%'
      OR i.category ILIKE '%uống%'
      OR i.category ILIKE '%beverage%'
      OR i.category ILIKE '%drink%'
      OR i.name ILIKE '%rau má%'
      OR i.name ILIKE '%trà tắc%'
      OR i.name ILIKE '%nước sâm%'
      OR i.name ILIKE '%coca%'
      OR i.name ILIKE '%pepsi%'
      OR i.name ILIKE '%7up%'
      OR i.name ILIKE '%đá bi%'
      OR i.name ILIKE '%cốt trà%'
    )
  ON CONFLICT (template_id, ingredient_id) DO NOTHING;

  -- Link ingredients for Grill (Pork, ribs, charcoal, marinade)
  INSERT INTO public.inventory_count_template_items (tenant_id, template_id, ingredient_id, sort_order)
  SELECT v_tenant_id, v_grill_tpl_id, i.id, row_number() over (ORDER BY i.name)
  FROM public.ingredients i
  WHERE i.tenant_id = v_tenant_id
    AND i.is_active IS TRUE
    AND (
      i.category ILIKE '%nướng%'
      OR i.category ILIKE '%thịt%'
      OR i.category ILIKE '%grill%'
      OR i.name ILIKE '%sườn%'
      OR i.name ILIKE '%cốt lết%'
      OR i.name ILIKE '%thịt nướng%'
      OR i.name ILIKE '%than%'
      OR i.name ILIKE '%mỡ hành%'
      OR i.name ILIKE '%sốt nướng%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_count_template_items ti
      WHERE ti.template_id = v_drink_tpl_id AND ti.ingredient_id = i.id
    )
  ON CONFLICT (template_id, ingredient_id) DO NOTHING;

  -- Link ingredients for Main Kitchen (Remaining items)
  INSERT INTO public.inventory_count_template_items (tenant_id, template_id, ingredient_id, sort_order)
  SELECT v_tenant_id, v_kitchen_tpl_id, i.id, row_number() over (ORDER BY i.name)
  FROM public.ingredients i
  WHERE i.tenant_id = v_tenant_id
    AND i.is_active IS TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_count_template_items ti
      WHERE ti.template_id IN (v_drink_tpl_id, v_grill_tpl_id) AND ti.ingredient_id = i.id
    )
  ON CONFLICT (template_id, ingredient_id) DO NOTHING;
END;
$$;

-- ─── 3. Add Columns to inventory_count_slip_lines & Backfill ─────────────────

ALTER TABLE public.inventory_count_slip_lines
  ADD COLUMN IF NOT EXISTS entry_to_base_factor numeric(15,6),
  ADD COLUMN IF NOT EXISTS counted_base_quantity numeric(15,3);

-- Backfill without the request-scoped conversion helper: migration sessions do
-- not carry a JWT tenant and that helper intentionally rejects such calls.
WITH line_factors AS (
  SELECT
    line.id,
    coalesce((
      SELECT ingredient_unit.to_base_factor
      FROM public.ingredient_units AS ingredient_unit
      WHERE ingredient_unit.tenant_id = line.tenant_id
        AND ingredient_unit.ingredient_id = line.ingredient_id
        AND ingredient_unit.unit_id = line.entry_unit_id
        AND ingredient_unit.is_active IS TRUE
      LIMIT 1
    ), 1::numeric)::numeric(15,6) AS factor
  FROM public.inventory_count_slip_lines AS line
  WHERE line.entry_to_base_factor IS NULL
     OR line.counted_base_quantity IS NULL
)
UPDATE public.inventory_count_slip_lines AS line
SET entry_to_base_factor = line_factor.factor,
    counted_base_quantity = round(
      line.counted_quantity * line_factor.factor,
      3
    )::numeric(15,3)
FROM line_factors AS line_factor
WHERE line_factor.id = line.id;

-- ─── 4. RPC: submit_inventory_count_slip with Snapshot Factors ───────────────

CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(
  p_branch_id bigint,
  p_location_id bigint,
  p_lines jsonb,
  p_shift_id bigint DEFAULT NULL::bigint
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_employee_id bigint;
  v_employee_name text;
  v_today date :=
    (current_timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_slip_id bigint;
  v_status text;
  v_line jsonb;
  v_ingredient_id bigint;
  v_counted numeric(15,3);
  v_assigned_count integer;
  v_line_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_shift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.shifts AS shift
       WHERE shift.id = p_shift_id
         AND shift.tenant_id = v_tenant
         AND shift.is_active IS TRUE
         AND (
           shift.branch_id IS NULL
           OR shift.branch_id = p_branch_id
         )
     ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT employee.id, profile.full_name
  INTO v_employee_id, v_employee_name
  FROM public.employees AS employee
  JOIN public.profiles AS profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.profile_id = v_uid
    AND employee.tenant_id = v_tenant
    AND employee.is_active IS TRUE
    AND profile.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'no_active_employee_in_branch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  FOR v_line IN
    SELECT element.value
    FROM jsonb_array_elements(p_lines) AS element(value)
  LOOP
    v_ingredient_id := (v_line ->> 'ingredient_id')::bigint;
    v_counted := (v_line ->> 'counted_quantity')::numeric;

    IF v_ingredient_id IS NULL OR v_counted IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;
    IF v_counted < 0
       OR v_counted = 'NaN'::numeric
       OR v_counted = 'Infinity'::numeric
       OR v_counted = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'counted_quantity_invalid'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.inventory_count_assignments AS assignment
      WHERE assignment.tenant_id = v_tenant
        AND assignment.branch_id = p_branch_id
        AND assignment.location_id = p_location_id
        AND assignment.employee_id = v_employee_id
        AND assignment.ingredient_id = v_ingredient_id
        AND assignment.is_active IS TRUE
        AND (
          (
            p_shift_id IS NULL
            AND assignment.shift_id IS NULL
          )
          OR (
            p_shift_id IS NOT NULL
            AND (
              assignment.shift_id = p_shift_id
              OR (
                assignment.shift_id IS NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.inventory_count_assignments
                    AS specific
                  WHERE specific.tenant_id = v_tenant
                    AND specific.branch_id = p_branch_id
                    AND specific.location_id = p_location_id
                    AND specific.ingredient_id = v_ingredient_id
                    AND specific.shift_id = p_shift_id
                    AND specific.is_active IS TRUE
                )
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT count(DISTINCT assignment.ingredient_id)
  INTO v_assigned_count
  FROM public.inventory_count_assignments AS assignment
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.employee_id = v_employee_id
    AND assignment.is_active IS TRUE
    AND (
      (
        p_shift_id IS NULL
        AND assignment.shift_id IS NULL
      )
      OR (
        p_shift_id IS NOT NULL
        AND (
          assignment.shift_id = p_shift_id
          OR (
            assignment.shift_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.inventory_count_assignments AS specific
              WHERE specific.tenant_id = v_tenant
                AND specific.branch_id = p_branch_id
                AND specific.location_id = p_location_id
                AND specific.ingredient_id =
                  assignment.ingredient_id
                AND specific.shift_id = p_shift_id
                AND specific.is_active IS TRUE
            )
          )
        )
      )
    );

  SELECT count(DISTINCT (line ->> 'ingredient_id')::bigint)
  INTO v_line_count
  FROM jsonb_array_elements(p_lines) AS submitted(line);

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT slip.id, slip.status
  INTO v_slip_id, v_status
  FROM public.inventory_count_slips AS slip
  WHERE slip.tenant_id = v_tenant
    AND slip.branch_id = p_branch_id
    AND slip.location_id = p_location_id
    AND slip.employee_id = v_employee_id
    AND slip.count_date = v_today
    AND slip.shift_id IS NOT DISTINCT FROM p_shift_id
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved'
      USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips (
      tenant_id,
      branch_id,
      location_id,
      employee_id,
      count_date,
      shift_id,
      status,
      submitted_by,
      submitted_at,
      slip_number
    )
    VALUES (
      v_tenant,
      p_branch_id,
      p_location_id,
      v_employee_id,
      v_today,
      p_shift_id,
      'submitted',
      v_uid,
      now(),
      public.next_inventory_doc_number(v_tenant, 'count_slip')
    )
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted',
        submitted_by = v_uid,
        submitted_at = now(),
        reviewed_by = NULL,
        reviewed_at = NULL,
        review_note = NULL,
        updated_at = now()
    WHERE id = v_slip_id
      AND tenant_id = v_tenant;

    DELETE FROM public.inventory_count_slip_lines
    WHERE tenant_id = v_tenant
      AND slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines (
    tenant_id,
    slip_id,
    ingredient_id,
    system_quantity,
    counted_quantity,
    entry_unit_id,
    entry_to_base_factor,
    counted_base_quantity,
    note
  )
  SELECT
    v_tenant,
    v_slip_id,
    (submitted.line ->> 'ingredient_id')::bigint,
    coalesce((
      SELECT stock.current_quantity
      FROM public.stock_levels AS stock
      WHERE stock.tenant_id = v_tenant
        AND stock.branch_id = p_branch_id
        AND stock.location_id = p_location_id
        AND stock.ingredient_id =
          (submitted.line ->> 'ingredient_id')::bigint
    ), 0),
    (submitted.line ->> 'counted_quantity')::numeric,
    nullif(
      submitted.line ->> 'entry_unit_id',
      ''
    )::bigint,
    coalesce((
      SELECT iu.to_base_factor
      FROM public.ingredient_units AS iu
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = (submitted.line ->> 'ingredient_id')::bigint
        AND iu.unit_id = nullif(submitted.line ->> 'entry_unit_id', '')::bigint
        AND iu.is_active IS TRUE
      LIMIT 1
    ), 1::numeric),
    public.inv_to_base_for_tenant(
      v_tenant,
      (submitted.line ->> 'ingredient_id')::bigint,
      nullif(submitted.line ->> 'entry_unit_id', '')::bigint,
      (submitted.line ->> 'counted_quantity')::numeric
    ),
    nullif(trim(submitted.line ->> 'note'), '')
  FROM jsonb_array_elements(p_lines) AS submitted(line);

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
    v_tenant,
    p_branch_id,
    ARRAY['branch_manager', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm tồn mới',
    format(
      '%s đã gửi phiếu đếm tồn (%s mục) chờ duyệt.',
      coalesce(v_employee_name, 'Nhân viên'),
      v_line_count
    ),
    'inventory_count_slip',
    v_slip_id,
    format('/br/%s/stock/count-slips', p_branch_id),
    jsonb_build_object(
      'slip_id',
      v_slip_id,
      'employee_id',
      v_employee_id,
      'branch_id',
      p_branch_id,
      'location_id',
      p_location_id,
      'shift_id',
      p_shift_id,
      'line_count',
      v_line_count
    ),
    format('inventory.count_slip:%s:submitted', v_slip_id)
  )
  ON CONFLICT (
    tenant_id,
    dedup_key
  ) WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET created_at = EXCLUDED.created_at,
      expires_at = NULL,
      meta = EXCLUDED.meta;

  PERFORM public.log_audit(
    'submit',
    'inventory_count_slip',
    v_slip_id,
    NULL,
    jsonb_build_object(
      'branch_id',
      p_branch_id,
      'location_id',
      p_location_id,
      'shift_id',
      p_shift_id,
      'line_count',
      v_line_count
    )
  );

  RETURN v_slip_id;
END;
$$;

-- ─── 5. RPC: execute_approve_inventory_count_slip (Decoupled from Stock Movements) ─

CREATE OR REPLACE FUNCTION private.execute_approve_inventory_count_slip(p_slip_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_slip.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'already_approved', true);
  END IF;

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  -- Decoupled: Count slips only confirm shift handover and do NOT generate count_adjustment movements.
  UPDATE public.inventory_count_slips
  SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved')
  );

  SELECT private.staff_role_from_position_code(po.code)
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  IF v_employee_bucket IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body,
      entity_type, entity_id, action_url, meta, dedup_key
    )
    VALUES (
      v_tenant,
      v_slip.branch_id,
      ARRAY[v_employee_bucket]::text[],
      'inventory.count_slip_approved',
      'info',
      'Phiếu đếm ca đã được xác nhận',
      'Phiếu đếm bàn giao ca của bạn đã được Quản lý xác nhận.',
      'inventory_count_slip',
      p_slip_id,
      format('/br/%s/stock/count', v_slip.branch_id),
      jsonb_build_object(
        'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
        'branch_id', v_slip.branch_id, 'result', 'approved'
      ),
      format('inventory.count_slip:%s:approved', p_slip_id)
    )
    ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
    DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
  END IF;

  RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'already_approved', false);
END;
$$;

-- ─── 6. RPC: set_inventory_count_assignments_by_template ────────────────────

CREATE OR REPLACE FUNCTION public.set_inventory_count_assignments_by_template(
  p_branch_id bigint,
  p_location_id bigint,
  p_employee_id bigint,
  p_template_id bigint,
  p_shift_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_ingredient_ids bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM 1
  FROM public.inventory_locations AS location
  JOIN public.branches AS branch
    ON branch.id = location.branch_id
   AND branch.tenant_id = location.tenant_id
   AND branch.is_active IS TRUE
  WHERE location.id = p_location_id
    AND location.tenant_id = v_tenant
    AND location.branch_id = p_branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:count_assign') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_shift_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.shifts AS shift
       WHERE shift.id = p_shift_id
         AND shift.tenant_id = v_tenant
         AND shift.is_active IS TRUE
         AND (shift.branch_id IS NULL OR shift.branch_id = p_branch_id)
     ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    JOIN public.profiles AS profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    WHERE employee.id = p_employee_id
      AND employee.tenant_id = v_tenant
      AND employee.is_active IS TRUE
      AND profile.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'employee_not_in_branch' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve template ingredients (supports tenant default or branch override)
  SELECT array_agg(ti.ingredient_id ORDER BY ti.sort_order)
  INTO v_ingredient_ids
  FROM public.inventory_count_template_items ti
  JOIN public.inventory_count_templates t ON t.id = ti.template_id
  WHERE t.id = p_template_id
    AND t.tenant_id = v_tenant
    AND (t.branch_id IS NULL OR t.branch_id = p_branch_id)
    AND t.is_active IS TRUE;

  IF v_ingredient_ids IS NULL OR array_length(v_ingredient_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'assigned_count', 0);
  END IF;

  -- Deactivate these ingredients if assigned to other employees in the same shift scope
  UPDATE public.inventory_count_assignments AS assignment
  SET is_active = FALSE,
      updated_at = now()
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.ingredient_id = ANY(v_ingredient_ids)
    AND assignment.is_active IS TRUE
    AND (
      assignment.employee_id <> p_employee_id
      OR assignment.shift_id IS DISTINCT FROM p_shift_id
    )
    AND assignment.shift_id IS NOT DISTINCT FROM p_shift_id;

  -- Upsert active assignments for the target employee
  INSERT INTO public.inventory_count_assignments (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    ingredient_id,
    shift_id,
    is_active,
    assigned_by
  )
  SELECT
    v_tenant,
    p_branch_id,
    p_location_id,
    p_employee_id,
    selected.ingredient_id,
    p_shift_id,
    TRUE,
    v_uid
  FROM unnest(v_ingredient_ids) AS selected(ingredient_id)
  ON CONFLICT (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    ingredient_id,
    (coalesce(shift_id, 0::bigint))
  )
  DO UPDATE
  SET is_active = TRUE,
      assigned_by = v_uid,
      updated_at = now();

  PERFORM public.log_audit(
    'set_count_assignments_by_template',
    'inventory_count_assignment',
    p_employee_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'location_id', p_location_id,
      'employee_id', p_employee_id,
      'shift_id', p_shift_id,
      'template_id', p_template_id,
      'assigned_count', array_length(v_ingredient_ids, 1)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'assigned_count', array_length(v_ingredient_ids, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_inventory_count_assignments_by_template(bigint, bigint, bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_assignments_by_template(bigint, bigint, bigint, bigint, bigint) TO authenticated, service_role;
