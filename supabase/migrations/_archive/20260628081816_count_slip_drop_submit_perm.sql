-- =========================================================================
-- Count-slip authz model refinement: the count-ASSIGNMENT is the authorization
-- to submit a count slip, so the redundant inventory:count_submit permission is
-- dropped. submit_inventory_count_slip is re-defined without the count_submit
-- gate; the active-employee-in-branch resolution plus the per-line assignment
-- check are now the gate. The permission key is removed (references cleaned
-- first to satisfy the ON DELETE RESTRICT FK), and existing manager-position
-- staff are backfilled with count_assign + count_approve.
-- =========================================================================

-- ─── 1. submit_inventory_count_slip without the count_submit gate ────────

CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(
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
  'Employee submits a blind count slip for their assigned ingredients at a location. Snapshots system_quantity, requires all assignments counted. Authorization = active employee at the branch + an active count assignment per line (no separate permission).';

REVOKE ALL ON FUNCTION public.submit_inventory_count_slip(BIGINT, BIGINT, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_slip(BIGINT, BIGINT, jsonb) TO authenticated, service_role;

-- ─── 2. Drop the inventory:count_submit permission key ──────────────────
-- Clean references first (staff_permissions.permission_key → permission_keys.key
-- is ON DELETE RESTRICT).

DELETE FROM public.staff_permissions WHERE permission_key = 'inventory:count_submit';

UPDATE public.role_templates
  SET permission_keys = array_remove(permission_keys, 'inventory:count_submit')
  WHERE 'inventory:count_submit' = ANY(permission_keys);

DELETE FROM public.permission_keys WHERE key = 'inventory:count_submit';

-- ─── 3. Backfill manager grants (count_assign + count_approve) ──────────
-- Owner auto-bypasses has_permission, so owner is excluded.

INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, granted_at, valid_from)
SELECT pr.id, pr.tenant_id, pr.branch_id, perm.key, now(), now()
FROM public.profiles pr
JOIN public.positions po ON po.id = pr.position_id AND po.tenant_id = pr.tenant_id
CROSS JOIN (VALUES ('inventory:count_assign'), ('inventory:count_approve')) AS perm(key)
WHERE pr.is_active
  AND po.code IN ('branch_manager', 'warehouse_manager', 'production_manager')
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    WHERE sp.user_id = pr.id AND sp.permission_key = perm.key
      AND sp.branch_id IS NOT DISTINCT FROM pr.branch_id
  );
