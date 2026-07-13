BEGIN;

WITH branch_kitchens AS (
  SELECT
    b.tenant_id,
    b.id AS branch_id,
    il.id AS kitchen_location_id
  FROM public.branches b
  JOIN LATERAL (
    SELECT loc.id
    FROM public.inventory_locations loc
    WHERE loc.tenant_id = b.tenant_id
      AND loc.branch_id = b.id
      AND loc.location_kind = 'kitchen'
      AND loc.is_active = TRUE
    ORDER BY loc.is_default_consumption DESC, loc.sort_order NULLS LAST, loc.id
    LIMIT 1
  ) il ON TRUE
  WHERE b.branch_kind = 'branch'
)
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
  a.tenant_id,
  a.branch_id,
  bk.kitchen_location_id,
  a.employee_id,
  a.ingredient_id,
  a.shift_id,
  TRUE,
  a.assigned_by
FROM public.inventory_count_assignments a
JOIN public.inventory_locations old_loc
  ON old_loc.id = a.location_id
 AND old_loc.tenant_id = a.tenant_id
 AND old_loc.branch_id = a.branch_id
JOIN branch_kitchens bk
  ON bk.tenant_id = a.tenant_id
 AND bk.branch_id = a.branch_id
WHERE a.is_active = TRUE
  AND old_loc.location_kind = 'warehouse'
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_count_assignments active_kitchen
    WHERE active_kitchen.tenant_id = a.tenant_id
      AND active_kitchen.branch_id = a.branch_id
      AND active_kitchen.location_id = bk.kitchen_location_id
      AND active_kitchen.ingredient_id = a.ingredient_id
      AND active_kitchen.shift_id IS NOT DISTINCT FROM a.shift_id
      AND active_kitchen.is_active = TRUE
  )
ON CONFLICT (
  tenant_id,
  branch_id,
  location_id,
  employee_id,
  ingredient_id,
  (COALESCE(shift_id, 0::bigint))
)
DO UPDATE SET is_active = TRUE, assigned_by = EXCLUDED.assigned_by, updated_at = now();

WITH branch_kitchens AS (
  SELECT
    b.tenant_id,
    b.id AS branch_id,
    il.id AS kitchen_location_id
  FROM public.branches b
  JOIN LATERAL (
    SELECT loc.id
    FROM public.inventory_locations loc
    WHERE loc.tenant_id = b.tenant_id
      AND loc.branch_id = b.id
      AND loc.location_kind = 'kitchen'
      AND loc.is_active = TRUE
    ORDER BY loc.is_default_consumption DESC, loc.sort_order NULLS LAST, loc.id
    LIMIT 1
  ) il ON TRUE
  WHERE b.branch_kind = 'branch'
)
UPDATE public.inventory_count_assignments a
SET is_active = FALSE, updated_at = now()
FROM public.inventory_locations old_loc
JOIN branch_kitchens bk
  ON bk.tenant_id = old_loc.tenant_id
 AND bk.branch_id = old_loc.branch_id
WHERE a.tenant_id = old_loc.tenant_id
  AND a.branch_id = old_loc.branch_id
  AND a.location_id = old_loc.id
  AND a.is_active = TRUE
  AND old_loc.location_kind = 'warehouse';

WITH branch_kitchens AS (
  SELECT
    b.tenant_id,
    b.id AS branch_id,
    il.id AS kitchen_location_id
  FROM public.branches b
  JOIN LATERAL (
    SELECT loc.id
    FROM public.inventory_locations loc
    WHERE loc.tenant_id = b.tenant_id
      AND loc.branch_id = b.id
      AND loc.location_kind = 'kitchen'
      AND loc.is_active = TRUE
    ORDER BY loc.is_default_consumption DESC, loc.sort_order NULLS LAST, loc.id
    LIMIT 1
  ) il ON TRUE
  WHERE b.branch_kind = 'branch'
),
moved_slips AS (
  UPDATE public.inventory_count_slips s
  SET location_id = bk.kitchen_location_id, updated_at = now()
  FROM public.inventory_locations old_loc
  JOIN branch_kitchens bk
    ON bk.tenant_id = old_loc.tenant_id
   AND bk.branch_id = old_loc.branch_id
  WHERE s.tenant_id = old_loc.tenant_id
    AND s.branch_id = old_loc.branch_id
    AND s.location_id = old_loc.id
    AND old_loc.location_kind = 'warehouse'
    AND s.status IN ('submitted', 'needs_changes')
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_count_slips existing
      WHERE existing.tenant_id = s.tenant_id
        AND existing.branch_id = s.branch_id
        AND existing.location_id = bk.kitchen_location_id
        AND existing.employee_id = s.employee_id
        AND existing.count_date = s.count_date
        AND existing.shift_id IS NOT DISTINCT FROM s.shift_id
        AND existing.id <> s.id
    )
  RETURNING s.id, s.tenant_id, s.branch_id, s.location_id
)
UPDATE public.inventory_count_slip_lines line
SET system_quantity = COALESCE((
  SELECT stock.current_quantity
  FROM public.stock_levels stock
  WHERE stock.tenant_id = moved_slips.tenant_id
    AND stock.branch_id = moved_slips.branch_id
    AND stock.location_id = moved_slips.location_id
    AND stock.ingredient_id = line.ingredient_id
), 0)
FROM moved_slips
WHERE line.tenant_id = moved_slips.tenant_id
  AND line.slip_id = moved_slips.id;

CREATE OR REPLACE FUNCTION public.set_inventory_count_assignments(
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
  v_location_id BIGINT := p_location_id;
  v_branch_kind TEXT;
  v_location_kind TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'inventory:count_assign') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT b.branch_kind, l.location_kind
  INTO v_branch_kind, v_location_kind
  FROM public.inventory_locations l
  JOIN public.branches b
    ON b.id = l.branch_id
   AND b.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
    AND l.branch_id = p_branch_id
    AND l.tenant_id = v_tenant
    AND l.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind = 'branch' AND v_location_kind <> 'kitchen' THEN
    SELECT l.id INTO v_location_id
    FROM public.inventory_locations l
    WHERE l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant
      AND l.location_kind = 'kitchen'
      AND l.is_active
    ORDER BY l.is_default_consumption DESC, l.sort_order NULLS LAST, l.id
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'branch_kitchen_location_missing' USING ERRCODE = 'P0002';
    END IF;
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
    AND a.location_id = v_location_id
    AND a.ingredient_id = ANY (v_ids)
    AND a.is_active
    AND (a.employee_id <> p_employee_id OR a.shift_id IS DISTINCT FROM v_shift_id)
    AND a.shift_id IS NOT DISTINCT FROM v_shift_id;

  UPDATE public.inventory_count_assignments a
  SET is_active = false, updated_at = now()
  WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
    AND a.location_id = v_location_id
    AND a.employee_id = p_employee_id
    AND a.shift_id IS NOT DISTINCT FROM v_shift_id
    AND a.is_active
    AND NOT (a.ingredient_id = ANY (v_ids));

  INSERT INTO public.inventory_count_assignments
    (tenant_id, branch_id, location_id, employee_id, ingredient_id, shift_id, is_active, assigned_by)
  SELECT v_tenant, p_branch_id, v_location_id, p_employee_id, selected.gid, v_shift_id, true, v_uid
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
      'location_id', v_location_id,
      'employee_id', p_employee_id,
      'shift_id', v_shift_id,
      'ingredient_ids', v_ids
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'location_id', v_location_id,
    'shift_id', v_shift_id,
    'count', COALESCE(array_length(v_ids, 1), 0)
  );
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[], bigint) IS
  'Manager sets employee count assignments. Branch sites normalize count slips to the branch kitchen location.';

REVOKE ALL ON FUNCTION public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[], bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_inventory_count_assignments(bigint, bigint, bigint, bigint[], bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_inventory_count_slip(
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
  v_location_id   BIGINT := p_location_id;
  v_branch_kind   TEXT;
  v_location_kind TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'empty_count' USING ERRCODE = '22023';
  END IF;

  SELECT b.branch_kind, l.location_kind
  INTO v_branch_kind, v_location_kind
  FROM public.inventory_locations l
  JOIN public.branches b
    ON b.id = l.branch_id
   AND b.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
    AND l.branch_id = p_branch_id
    AND l.tenant_id = v_tenant
    AND l.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind = 'branch' AND v_location_kind <> 'kitchen' THEN
    SELECT l.id INTO v_location_id
    FROM public.inventory_locations l
    WHERE l.branch_id = p_branch_id
      AND l.tenant_id = v_tenant
      AND l.location_kind = 'kitchen'
      AND l.is_active
    ORDER BY l.is_default_consumption DESC, l.sort_order NULLS LAST, l.id
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'branch_kitchen_location_missing' USING ERRCODE = 'P0002';
    END IF;
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
        AND a.location_id = v_location_id AND a.employee_id = v_employee_id
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
                    AND specific.location_id = v_location_id
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
    AND a.location_id = v_location_id AND a.employee_id = v_employee_id
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
                AND specific.location_id = v_location_id
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
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND location_id = v_location_id
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
      (v_tenant, p_branch_id, v_location_id, v_employee_id, v_today, v_shift_id, 'submitted', v_uid, now())
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
        AND stl.location_id = v_location_id AND stl.ingredient_id = (l->>'ingredient_id')::BIGINT
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
      'location_id', v_location_id,
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
      'location_id', v_location_id,
      'shift_id', v_shift_id,
      'line_count', v_line_count
    )
  );

  RETURN v_slip_id;
END;
$$;

COMMENT ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) IS
  'Employee submits assigned count lines. Branch sites normalize count slips to the branch kitchen location.';

REVOKE ALL ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_slip(bigint, bigint, jsonb, bigint) TO authenticated, service_role;

COMMIT;
