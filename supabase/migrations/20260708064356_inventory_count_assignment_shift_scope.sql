ALTER TABLE public.inventory_count_assignments
  ADD COLUMN IF NOT EXISTS shift_id bigint;

ALTER TABLE public.inventory_count_slips
  ADD COLUMN IF NOT EXISTS shift_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inventory_count_assignments'::regclass
      AND conname = 'inventory_count_assignments_shift_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_count_assignments
      ADD CONSTRAINT inventory_count_assignments_shift_id_fkey
      FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inventory_count_slips'::regclass
      AND conname = 'inventory_count_slips_shift_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_count_slips
      ADD CONSTRAINT inventory_count_slips_shift_id_fkey
      FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.inventory_count_assignments
  DROP CONSTRAINT IF EXISTS uq_count_assignment;

DROP INDEX IF EXISTS public.uq_count_assignment_scope;
CREATE UNIQUE INDEX uq_count_assignment_scope
  ON public.inventory_count_assignments (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    ingredient_id,
    (COALESCE(shift_id, 0::bigint))
  );

DROP INDEX IF EXISTS public.uq_count_assignment_active_cell;
CREATE UNIQUE INDEX uq_count_assignment_active_cell
  ON public.inventory_count_assignments (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    (COALESCE(shift_id, 0::bigint))
  )
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_count_assignments_employee_shift
  ON public.inventory_count_assignments (tenant_id, branch_id, employee_id, shift_id)
  WHERE is_active;

ALTER TABLE public.inventory_count_slips
  DROP CONSTRAINT IF EXISTS uq_count_slip_per_day;

DROP INDEX IF EXISTS public.uq_count_slip_per_day_shift_scope;
CREATE UNIQUE INDEX uq_count_slip_per_day_shift_scope
  ON public.inventory_count_slips (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    count_date,
    (COALESCE(shift_id, 0::bigint))
  );

CREATE INDEX IF NOT EXISTS idx_count_slips_employee_shift_date
  ON public.inventory_count_slips (tenant_id, branch_id, employee_id, count_date, shift_id);

DROP FUNCTION IF EXISTS public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[]);

CREATE FUNCTION public.set_inventory_count_assignments(
  p_branch_id bigint,
  p_location_id bigint,
  p_employee_id bigint,
  p_ingredient_ids bigint[],
  p_shift_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_uid    UUID   := auth.uid();
  v_ids    BIGINT[] := COALESCE(p_ingredient_ids, ARRAY[]::BIGINT[]);
  v_shift_id BIGINT := p_shift_id;
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

  IF v_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = v_shift_id
      AND s.tenant_id = v_tenant
      AND s.is_active
      AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
  ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
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

  UPDATE public.inventory_count_assignments a
  SET is_active = false, updated_at = now()
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id
    AND a.ingredient_id = ANY (v_ids)
    AND a.is_active
    AND (a.employee_id <> p_employee_id OR a.shift_id IS DISTINCT FROM v_shift_id)
    AND a.shift_id IS NOT DISTINCT FROM v_shift_id;

  UPDATE public.inventory_count_assignments a
  SET is_active = false, updated_at = now()
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id
    AND a.employee_id = p_employee_id
    AND a.shift_id IS NOT DISTINCT FROM v_shift_id
    AND a.is_active
    AND NOT (a.ingredient_id = ANY (v_ids));

  INSERT INTO public.inventory_count_assignments
    (tenant_id, branch_id, location_id, employee_id, ingredient_id, shift_id, is_active, assigned_by)
  SELECT v_tenant, p_branch_id, p_location_id, p_employee_id, selected.gid, v_shift_id, true, v_uid
  FROM (SELECT DISTINCT unnest(v_ids) AS gid) selected
  ON CONFLICT (
    tenant_id,
    branch_id,
    location_id,
    employee_id,
    ingredient_id,
    (COALESCE(shift_id, 0::bigint))
  )
  DO UPDATE SET is_active = true, assigned_by = v_uid, updated_at = now();

  PERFORM public.log_audit(
    'set_count_assignments'::TEXT,
    'inventory_count_assignment'::TEXT,
    p_employee_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'location_id', p_location_id,
      'employee_id', p_employee_id,
      'shift_id', v_shift_id,
      'ingredient_ids', v_ids
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'shift_id', v_shift_id,
    'count', COALESCE(array_length(v_ids, 1), 0)
  );
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[], bigint) IS
  'Manager sets the exact set of ingredients an employee counts at a location and optional shift. NULL shift applies every shift. Gated by inventory:count_assign.';

REVOKE ALL ON FUNCTION public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[], bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[], bigint) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.submit_inventory_count_slip(bigint, bigint, jsonb);

CREATE FUNCTION public.submit_inventory_count_slip(
  p_branch_id bigint,
  p_location_id bigint,
  p_lines jsonb,
  p_shift_id bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant        BIGINT := public.auth_tenant_id();
  v_uid           UUID   := auth.uid();
  v_employee_id   BIGINT;
  v_employee_name TEXT;
  v_today         DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_shift_id      BIGINT := p_shift_id;
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

  IF v_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = v_shift_id
      AND s.tenant_id = v_tenant
      AND s.is_active
      AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
  ) THEN
    RAISE EXCEPTION 'shift_not_found' USING ERRCODE = 'P0002';
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
        AND (
          (v_shift_id IS NULL AND a.shift_id IS NULL)
          OR (
            v_shift_id IS NOT NULL
            AND (
              a.shift_id = v_shift_id
              OR (
                a.shift_id IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.inventory_count_assignments specific
                  WHERE specific.tenant_id = v_tenant
                    AND specific.branch_id = p_branch_id
                    AND specific.location_id = p_location_id
                    AND specific.ingredient_id = v_ingredient_id
                    AND specific.shift_id = v_shift_id
                    AND specific.is_active
                )
              )
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'not_assigned' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT count(DISTINCT a.ingredient_id) INTO v_assigned_count
  FROM public.inventory_count_assignments a
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = p_location_id AND a.employee_id = v_employee_id
    AND a.is_active
    AND (
      (v_shift_id IS NULL AND a.shift_id IS NULL)
      OR (
        v_shift_id IS NOT NULL
        AND (
          a.shift_id = v_shift_id
          OR (
            a.shift_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.inventory_count_assignments specific
              WHERE specific.tenant_id = v_tenant
                AND specific.branch_id = p_branch_id
                AND specific.location_id = p_location_id
                AND specific.ingredient_id = a.ingredient_id
                AND specific.shift_id = v_shift_id
                AND specific.is_active
            )
          )
        )
      )
    );

  SELECT count(DISTINCT (l->>'ingredient_id')::BIGINT) INTO v_line_count
  FROM jsonb_array_elements(p_lines) l;

  IF v_line_count <> v_assigned_count THEN
    RAISE EXCEPTION 'incomplete_count' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_slip_id, v_status
  FROM public.inventory_count_slips
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND location_id = p_location_id
    AND employee_id = v_employee_id AND count_date = v_today
    AND shift_id IS NOT DISTINCT FROM v_shift_id
  FOR UPDATE;

  IF v_slip_id IS NOT NULL AND v_status = 'approved' THEN
    RAISE EXCEPTION 'slip_already_approved' USING ERRCODE = '22023';
  END IF;

  IF v_slip_id IS NULL THEN
    INSERT INTO public.inventory_count_slips
      (tenant_id, branch_id, location_id, employee_id, count_date, shift_id, status, submitted_by, submitted_at)
    VALUES
      (v_tenant, p_branch_id, p_location_id, v_employee_id, v_today, v_shift_id, 'submitted', v_uid, now())
    RETURNING id INTO v_slip_id;
  ELSE
    UPDATE public.inventory_count_slips
    SET status = 'submitted', submitted_by = v_uid, submitted_at = now(),
        reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, updated_at = now()
    WHERE id = v_slip_id;
    DELETE FROM public.inventory_count_slip_lines WHERE slip_id = v_slip_id;
  END IF;

  INSERT INTO public.inventory_count_slip_lines
    (tenant_id, slip_id, ingredient_id, system_quantity, counted_quantity, entry_unit_id, note)
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
    NULLIF(l->>'entry_unit_id','')::BIGINT,
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
      'slip_id', v_slip_id,
      'employee_id', v_employee_id,
      'branch_id', p_branch_id,
      'location_id', p_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
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
    jsonb_build_object(
      'branch_id', p_branch_id,
      'location_id', p_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
    )
  );

  RETURN v_slip_id;
END;
$$;

COMMENT ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) IS
  'Employee submits a blind count slip for assigned ingredients at a location and shift. Assignment shift NULL applies every shift.';

REVOKE ALL ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) TO authenticated, service_role;
