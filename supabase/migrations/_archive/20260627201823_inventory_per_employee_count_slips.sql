-- =========================================================================
-- Per-employee inventory count slips (đếm tồn theo nhân viên)
--
-- A manager assigns each employee the ingredients they are responsible for
-- counting at a specific stock location. The employee submits a blind count
-- slip (on-hand only, never sees system quantity). A manager reviews the
-- variance and either approves (posts count_adjustment movements, reconciling
-- stock_levels to the counted value) or requests a recount.
--
-- Reuses, not forks:
--   - adjustment math copies complete_stocktake (insert count_adjustment
--     movement only; trg_update_stock_on_movement applies the delta and stamps
--     last_counted_at — DO NOT touch stock_levels directly).
--   - submit/approve/notify shape copies the leave_requests workflow.
--
-- role_templates are snapshot-only: this backfill affects FUTURE grants for
-- existing tenants. Existing staff must be granted inventory:count_* via the
-- staff permissions UI (/admin/staff/[id]/permissions) by the owner.
-- =========================================================================

-- ─── 1. Permission keys + role-template backfill ────────────────────────

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('inventory:count_assign',  'inventory', 'Phân công nhân viên đếm tồn nguyên liệu', 'branch'),
  ('inventory:count_submit',  'inventory', 'Gửi phiếu đếm tồn được phân công',         'branch'),
  ('inventory:count_approve', 'inventory', 'Duyệt phiếu đếm tồn và điều chỉnh kho',     'branch')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['inventory:count_submit']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN (
        'owner', 'branch_manager', 'warehouse_manager', 'production_manager',
        'head_chef', 'kitchen_helper', 'chef', 'cashier'
      );

    UPDATE public.role_templates
    SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['inventory:count_assign', 'inventory:count_approve']) ORDER BY 1
    )
    WHERE tenant_id = t.id
      AND position_code IN (
        'owner', 'branch_manager', 'warehouse_manager', 'production_manager'
      );
  END LOOP;
END $$;

-- ─── 2. Tables ──────────────────────────────────────────────────────────

CREATE TABLE public.inventory_count_assignments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  location_id   BIGINT NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  employee_id   BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  assigned_by   UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_count_assignment
    UNIQUE (tenant_id, branch_id, location_id, employee_id, ingredient_id)
);

-- One active owner per (location, ingredient): prevents two employees counting
-- the same cell and double-adjusting stock.
CREATE UNIQUE INDEX uq_count_assignment_active_cell
  ON public.inventory_count_assignments (tenant_id, branch_id, location_id, ingredient_id)
  WHERE is_active;

CREATE INDEX idx_count_assignments_employee
  ON public.inventory_count_assignments (tenant_id, branch_id, employee_id)
  WHERE is_active;

CREATE TABLE public.inventory_count_slips (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id    BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  location_id  BIGINT NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  employee_id  BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  count_date   DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'submitted',
  note         TEXT,
  submitted_by UUID,
  submitted_at TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_count_slips_status_check
    CHECK (status = ANY (ARRAY['submitted', 'needs_changes', 'approved'])),
  CONSTRAINT inventory_count_slips_note_len
    CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT inventory_count_slips_review_note_len
    CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  CONSTRAINT uq_count_slip_per_day
    UNIQUE (tenant_id, branch_id, location_id, employee_id, count_date)
);

CREATE INDEX idx_count_slips_review
  ON public.inventory_count_slips (tenant_id, branch_id, status);

CREATE TABLE public.inventory_count_slip_lines (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slip_id          BIGINT NOT NULL REFERENCES public.inventory_count_slips(id) ON DELETE CASCADE,
  ingredient_id    BIGINT NOT NULL REFERENCES public.ingredients(id),
  system_quantity  NUMERIC(15,3) NOT NULL,
  counted_quantity NUMERIC(15,3) NOT NULL,
  variance         NUMERIC(15,3) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  note             TEXT,
  CONSTRAINT inventory_count_slip_lines_counted_nonneg CHECK (counted_quantity >= 0),
  CONSTRAINT inventory_count_slip_lines_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT uq_count_slip_line UNIQUE (slip_id, ingredient_id)
);

CREATE INDEX idx_count_slip_lines_slip
  ON public.inventory_count_slip_lines (slip_id);

CREATE TRIGGER trg_inventory_count_assignments_updated_at
  BEFORE UPDATE ON public.inventory_count_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_inventory_count_slips_updated_at
  BEFORE UPDATE ON public.inventory_count_slips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 3. RLS + Data API grants ───────────────────────────────────────────

ALTER TABLE public.inventory_count_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_slip_lines ENABLE ROW LEVEL SECURITY;

-- Assignment: employee sees own (to know what to count); managers see branch.
CREATE POLICY inventory_count_assignments_select ON public.inventory_count_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = inventory_count_assignments.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission(branch_id, 'inventory:count_assign')
      OR public.has_permission(branch_id, 'inventory:count_approve')
    )
  );

-- Slip header (no system_quantity here): employee sees own; managers see branch.
CREATE POLICY inventory_count_slips_select ON public.inventory_count_slips
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = inventory_count_slips.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission(branch_id, 'inventory:count_approve')
    )
  );

-- Lines carry system_quantity: manager-only base-table read (blind for the
-- counting employee). Employees read their own counted values via the
-- get_my_count_slip definer RPC, which strips system_quantity/variance.
CREATE POLICY inventory_count_slip_lines_select ON public.inventory_count_slip_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.inventory_count_slips s
      WHERE s.id = inventory_count_slip_lines.slip_id
        AND s.tenant_id = public.auth_tenant_id()
        AND public.has_permission(s.branch_id, 'inventory:count_approve')
    )
  );

GRANT SELECT ON TABLE public.inventory_count_assignments TO authenticated;
GRANT SELECT ON TABLE public.inventory_count_slips TO authenticated;
GRANT SELECT ON TABLE public.inventory_count_slip_lines TO authenticated;
GRANT ALL ON TABLE public.inventory_count_assignments TO service_role;
GRANT ALL ON TABLE public.inventory_count_slips TO service_role;
GRANT ALL ON TABLE public.inventory_count_slip_lines TO service_role;
GRANT ALL ON SEQUENCE public.inventory_count_assignments_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.inventory_count_slips_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.inventory_count_slip_lines_id_seq TO service_role;

-- ─── 4. RPC: set_inventory_count_assignments (manager) ──────────────────

CREATE FUNCTION public.set_inventory_count_assignments(
  p_branch_id     BIGINT,
  p_location_id   BIGINT,
  p_employee_id   BIGINT,
  p_ingredient_ids BIGINT[]
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_uid    UUID   := auth.uid();
  v_ids    BIGINT[] := COALESCE(p_ingredient_ids, ARRAY[]::BIGINT[]);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:count_assign') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l
    WHERE l.id = p_location_id AND l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant AND l.is_active
  ) THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.profiles pr ON pr.id = e.profile_id
    WHERE e.id = p_employee_id AND e.tenant_id = v_tenant AND e.is_active
      AND pr.tenant_id = v_tenant AND pr.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'employee_not_in_branch' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) gid
    LEFT JOIN public.ingredients i ON i.id = gid AND i.tenant_id = v_tenant
    WHERE i.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Reassign: take any of these cells away from other employees first.
  UPDATE public.inventory_count_assignments a
  SET is_active = false, updated_at = now()
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id
    AND a.ingredient_id = ANY (v_ids)
    AND a.employee_id <> p_employee_id
    AND a.is_active;

  -- Deactivate this employee's assignments not in the new set.
  UPDATE public.inventory_count_assignments a
  SET is_active = false, updated_at = now()
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id
    AND a.employee_id = p_employee_id
    AND a.is_active
    AND NOT (a.ingredient_id = ANY (v_ids));

  -- Activate the new set.
  INSERT INTO public.inventory_count_assignments
    (tenant_id, branch_id, location_id, employee_id, ingredient_id, is_active, assigned_by)
  SELECT v_tenant, p_branch_id, p_location_id, p_employee_id, gid, true, v_uid
  FROM unnest(v_ids) gid
  ON CONFLICT (tenant_id, branch_id, location_id, employee_id, ingredient_id)
  DO UPDATE SET is_active = true, assigned_by = v_uid, updated_at = now();

  PERFORM public.log_audit(
    'set_count_assignments'::TEXT,
    'inventory_count_assignment'::TEXT,
    p_employee_id,
    NULL,
    jsonb_build_object('branch_id', p_branch_id, 'location_id', p_location_id, 'ingredient_ids', v_ids)
  );

  RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'count', COALESCE(array_length(v_ids, 1), 0));
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count_assignments(BIGINT, BIGINT, BIGINT, BIGINT[]) IS
  'Manager sets the exact set of ingredients an employee counts at a location. Reassigns cells owned by other employees. Gated by inventory:count_assign.';

REVOKE ALL ON FUNCTION public.set_inventory_count_assignments(BIGINT, BIGINT, BIGINT, BIGINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_assignments(BIGINT, BIGINT, BIGINT, BIGINT[]) TO authenticated, service_role;

-- ─── 5. RPC: submit_inventory_count_slip (employee) ─────────────────────

CREATE FUNCTION public.submit_inventory_count_slip(
  p_branch_id   BIGINT,
  p_location_id BIGINT,
  p_lines       jsonb
) RETURNS BIGINT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant        BIGINT := public.auth_tenant_id();
  v_uid           UUID   := auth.uid();
  v_employee_id   BIGINT;
  v_employee_name TEXT;
  v_today         DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_slip_id       BIGINT;
  v_status        TEXT;
  v_line          jsonb;
  v_ingredient_id BIGINT;
  v_counted       NUMERIC(15,3);
  v_assigned_count INT;
  v_line_count    INT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:count_submit') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l
    WHERE l.id = p_location_id AND l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant AND l.is_active
  ) THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT e.id, pr.full_name INTO v_employee_id, v_employee_name
  FROM public.employees e
  JOIN public.profiles pr ON pr.id = e.profile_id
  WHERE e.profile_id = v_uid AND e.tenant_id = v_tenant AND e.is_active
    AND pr.tenant_id = v_tenant AND pr.branch_id = p_branch_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'no_active_employee_in_branch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(v_employee_id);

  -- Every submitted line must be an active assignment for this employee.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ingredient_id := (v_line->>'ingredient_id')::BIGINT;
    v_counted := (v_line->>'counted_quantity')::NUMERIC;
    IF v_ingredient_id IS NULL OR v_counted IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;
    IF v_counted < 0 THEN
      RAISE EXCEPTION 'negative_count' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.inventory_count_assignments a
      WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
        AND a.location_id = p_location_id AND a.employee_id = v_employee_id
        AND a.ingredient_id = v_ingredient_id AND a.is_active
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Completeness: every active assignment must be counted (preserves the
  -- blind anti-shrinkage intent — no cherry-picking which items to report).
  SELECT count(*) INTO v_assigned_count
  FROM public.inventory_count_assignments a
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id AND a.employee_id = v_employee_id AND a.is_active;

  SELECT count(DISTINCT (l->>'ingredient_id')::BIGINT) INTO v_line_count
  FROM jsonb_array_elements(p_lines) l;

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_slip_id, v_status
  FROM public.inventory_count_slips
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND location_id = p_location_id
    AND employee_id = v_employee_id AND count_date = v_today
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved' USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips
      (tenant_id, branch_id, location_id, employee_id, count_date, status, submitted_by, submitted_at)
    VALUES
      (v_tenant, p_branch_id, p_location_id, v_employee_id, v_today, 'submitted', v_uid, now())
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted', submitted_by = v_uid, submitted_at = now(),
        reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, updated_at = now()
    WHERE id = v_slip_id;
    DELETE FROM public.inventory_count_slip_lines WHERE slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines
    (tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, note)
  SELECT
    v_tenant,
    v_slip_id,
    (l->>'ingredient_id')::BIGINT,
    COALESCE((
      SELECT stl.current_quantity FROM public.stock_levels stl
      WHERE stl.tenant_id = v_tenant AND stl.branch_id = p_branch_id
        AND stl.location_id = p_location_id AND stl.ingredient_id = (l->>'ingredient_id')::BIGINT
    ), 0),
    (l->>'counted_quantity')::NUMERIC,
    NULLIF(trim(l->>'note'), '')
  FROM jsonb_array_elements(p_lines) l;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    p_branch_id,
    ARRAY['branch_manager', 'warehouse_manager', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm tồn mới',
    format('%s đã gửi phiếu đếm tồn (%s mục) chờ duyệt.', COALESCE(v_employee_name, 'Nhân viên'), v_line_count),
    'inventory_count_slip',
    v_slip_id,
    '/inventory/count-slips',
    jsonb_build_object(
      'slip_id', v_slip_id, 'employee_id', v_employee_id,
      'branch_id', p_branch_id, 'location_id', p_location_id, 'line_count', v_line_count
    ),
    format('inventory.count_slip:%s:submitted', v_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  PERFORM public.log_audit(
    'submit'::TEXT,
    'inventory_count_slip'::TEXT,
    v_slip_id,
    NULL,
    jsonb_build_object('branch_id', p_branch_id, 'location_id', p_location_id, 'line_count', v_line_count)
  );

  RETURN v_slip_id;
END;
$$;

COMMENT ON FUNCTION public.submit_inventory_count_slip(BIGINT, BIGINT, jsonb) IS
  'Employee submits a blind count slip for their assigned ingredients at a location. Snapshots system_quantity, requires all assignments counted. Gated by inventory:count_submit.';

REVOKE ALL ON FUNCTION public.submit_inventory_count_slip(BIGINT, BIGINT, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_slip(BIGINT, BIGINT, jsonb) TO authenticated, service_role;

-- ─── 6. RPC: get_my_count_slip (employee blind read) ────────────────────

CREATE FUNCTION public.get_my_count_slip(p_slip_id BIGINT)
RETURNS TABLE (ingredient_id BIGINT, counted_quantity NUMERIC, note TEXT)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT l.ingredient_id, l.counted_quantity, l.note
  FROM public.inventory_count_slip_lines l
  JOIN public.inventory_count_slips s ON s.id = l.slip_id
  JOIN public.employees e ON e.id = s.employee_id
  WHERE l.slip_id = p_slip_id
    AND s.tenant_id = public.auth_tenant_id()
    AND e.profile_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_count_slip(BIGINT) IS
  'Blind read of the caller''s own count slip lines (counted_quantity only — never system_quantity/variance).';

REVOKE ALL ON FUNCTION public.get_my_count_slip(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_count_slip(BIGINT) TO authenticated, service_role;

-- ─── 7. RPC: approve_inventory_count_slip (manager) ─────────────────────

CREATE FUNCTION public.approve_inventory_count_slip(p_slip_id BIGINT)
RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_line            RECORD;
  v_fresh           NUMERIC(15,3);
  v_delta           NUMERIC(15,3);
  v_adjusted        INT := 0;
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

  -- Post count_adjustment movements; the trigger applies the delta to
  -- stock_levels and stamps last_counted_at. Re-read fresh qty so interim
  -- sales/receipts are preserved (authoritative recount).
  FOR v_line IN
    SELECT * FROM public.inventory_count_slip_lines
    WHERE slip_id = p_slip_id AND tenant_id = v_tenant
  LOOP
    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh
    FROM public.stock_levels stl
    WHERE stl.tenant_id = v_tenant AND stl.branch_id = v_slip.branch_id
      AND stl.location_id = v_slip.location_id AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh := 0;
    END IF;

    v_delta := v_line.counted_quantity - v_fresh;

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id
      ) VALUES (
        v_tenant, v_slip.branch_id, v_line.ingredient_id, 'count_adjustment', v_delta,
        'Count slip #' || p_slip_id::text, v_uid, v_slip.location_id
      );
      v_adjusted := v_adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.inventory_count_slips
  SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved', 'adjusted_lines', v_adjusted)
  );

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'office')]::text[],
    'inventory.count_slip_approved',
    'info',
    'Phiếu đếm tồn đã được duyệt',
    'Phiếu đếm tồn của bạn đã được duyệt và điều chỉnh kho.',
    'inventory_count_slip',
    p_slip_id,
    '/employee/count',
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'approved', 'adjusted_lines', v_adjusted
    ),
    format('inventory.count_slip:%s:approved', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'adjusted_lines', v_adjusted);
END;
$$;

COMMENT ON FUNCTION public.approve_inventory_count_slip(BIGINT) IS
  'Manager approves a submitted count slip: posts count_adjustment movements (delta vs fresh on-hand) and reconciles stock. Branch-scoped, self-approval blocked, idempotent.';

REVOKE ALL ON FUNCTION public.approve_inventory_count_slip(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip(BIGINT) TO authenticated, service_role;

-- ─── 8. RPC: request_inventory_count_recount (manager) ──────────────────

CREATE FUNCTION public.request_inventory_count_recount(p_slip_id BIGINT, p_note TEXT DEFAULT NULL)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_note            TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = 'string_data_right_truncation';
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

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'needs_changes', review_note = v_note, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'request_recount'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'needs_changes')
  );

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[COALESCE(v_employee_bucket, 'office')]::text[],
    'inventory.count_slip_recount',
    'warning',
    'Phiếu đếm tồn cần đếm lại',
    COALESCE(format('Quản lý yêu cầu đếm lại: %s', v_note), 'Quản lý yêu cầu đếm lại phiếu đếm tồn của bạn.'),
    'inventory_count_slip',
    p_slip_id,
    '/employee/count',
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'needs_changes'
    ),
    format('inventory.count_slip:%s:recount', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

COMMENT ON FUNCTION public.request_inventory_count_recount(BIGINT, TEXT) IS
  'Manager sends a submitted count slip back to needs_changes for recount with an optional note. Branch-scoped, self-review blocked.';

REVOKE ALL ON FUNCTION public.request_inventory_count_recount(BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_inventory_count_recount(BIGINT, TEXT) TO authenticated, service_role;
