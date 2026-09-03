-- Migration: staff_count_kitchen_location
-- Staff count assignment and slip submit accept kitchen after the branch
-- warehouse/kitchen split, and keep warehouse for unsplit sites.

CREATE OR REPLACE FUNCTION public.set_inventory_count_assignments(
  p_branch_id bigint,
  p_location_id bigint,
  p_employee_id bigint,
  p_ingredient_ids bigint[],
  p_shift_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_ingredient_ids bigint[] :=
    coalesce(p_ingredient_ids, ARRAY[]::bigint[]);
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
    AND location.location_kind = ANY (ARRAY['warehouse'::text, 'kitchen'::text])
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'inventory:count_assign'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'employee_not_in_branch'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_ingredient_ids) AS selected(ingredient_id)
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.id = selected.ingredient_id
     AND ingredient.tenant_id = v_tenant
    WHERE ingredient.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;

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

  UPDATE public.inventory_count_assignments AS assignment
  SET is_active = FALSE,
      updated_at = now()
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.employee_id = p_employee_id
    AND assignment.shift_id IS NOT DISTINCT FROM p_shift_id
    AND assignment.is_active IS TRUE
    AND NOT (
      assignment.ingredient_id = ANY(v_ingredient_ids)
    );

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
  FROM (
    SELECT DISTINCT unnest(v_ingredient_ids) AS ingredient_id
  ) AS selected
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
    'set_count_assignments',
    'inventory_count_assignment',
    p_employee_id,
    NULL,
    jsonb_build_object(
      'branch_id',
      p_branch_id,
      'location_id',
      p_location_id,
      'employee_id',
      p_employee_id,
      'shift_id',
      p_shift_id,
      'ingredient_ids',
      v_ingredient_ids
    )
  );

  RETURN jsonb_build_object(
    'success',
    TRUE,
    'employee_id',
    p_employee_id,
    'location_id',
    p_location_id,
    'shift_id',
    p_shift_id,
    'count',
    coalesce(array_length(v_ingredient_ids, 1), 0)
  );
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count_assignments(
  bigint,
  bigint,
  bigint,
  bigint[],
  bigint
) IS 'Assigns staff counts for the authenticated tenant site kitchen after split, or warehouse before split.';

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
    AND location.location_kind = ANY (ARRAY['warehouse'::text, 'kitchen'::text])
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

COMMENT ON FUNCTION public.set_inventory_count_assignments_by_template(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) IS 'Assigns staff counts from a template for the authenticated tenant site kitchen after split, or warehouse before split.';

CREATE OR REPLACE FUNCTION public.set_station_count_assignments(
  p_branch_id bigint,
  p_location_id bigint,
  p_shift_id bigint,
  p_template_id bigint,
  p_assignments jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant bigint;
  v_uid uuid := auth.uid();
  v_station_ingredient_ids bigint[];
  v_assignment record;
  v_emp_id bigint;
  v_emp_ingredient_ids bigint[];
  v_total_assigned integer := 0;
BEGIN
  v_tenant := public.auth_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (
    public.has_permission(p_branch_id, 'inventory:count_assign')
    OR public.has_permission(p_branch_id, 'inventory:ops')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
    AND location.location_kind = ANY (ARRAY['warehouse'::text, 'kitchen'::text])
    AND location.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Fetch all ingredients belonging to this station template
  SELECT array_agg(ingredient_id)
  INTO v_station_ingredient_ids
  FROM public.inventory_count_template_items
  WHERE template_id = p_template_id AND tenant_id = v_tenant;

  IF v_station_ingredient_ids IS NULL OR array_length(v_station_ingredient_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'assigned_count', 0);
  END IF;

  -- Deactivate all assignments for ingredients in this station in the specified branch/location/shift
  UPDATE public.inventory_count_assignments AS assignment
  SET is_active = FALSE,
      updated_at = now()
  WHERE assignment.tenant_id = v_tenant
    AND assignment.branch_id = p_branch_id
    AND assignment.location_id = p_location_id
    AND assignment.ingredient_id = ANY(v_station_ingredient_ids)
    AND assignment.shift_id IS NOT DISTINCT FROM p_shift_id
    AND assignment.is_active IS TRUE;

  -- Apply new assignments from p_assignments: [{ employee_id: 123, ingredient_ids: [1, 2, 3] }]
  FOR v_assignment IN SELECT * FROM jsonb_to_recordset(p_assignments) AS x(employee_id bigint, ingredient_ids jsonb)
  LOOP
    v_emp_id := v_assignment.employee_id;
    IF v_emp_id IS NOT NULL AND v_assignment.ingredient_ids IS NOT NULL THEN
      SELECT array_agg(value::text::bigint)
      INTO v_emp_ingredient_ids
      FROM jsonb_array_elements_text(v_assignment.ingredient_ids) AS value;

      IF v_emp_ingredient_ids IS NOT NULL AND array_length(v_emp_ingredient_ids, 1) > 0 THEN
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
          v_emp_id,
          item_id,
          p_shift_id,
          TRUE,
          v_uid
        FROM unnest(v_emp_ingredient_ids) AS item_id
        WHERE item_id = ANY(v_station_ingredient_ids)
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

        v_total_assigned := v_total_assigned + array_length(v_emp_ingredient_ids, 1);
      END IF;
    END IF;
  END LOOP;

  PERFORM public.log_audit(
    'set_station_count_assignments',
    'inventory_count_assignment',
    p_template_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'location_id', p_location_id,
      'shift_id', p_shift_id,
      'template_id', p_template_id,
      'total_assigned', v_total_assigned
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'assigned_count', v_total_assigned
  );
END;
$$;

COMMENT ON FUNCTION public.set_station_count_assignments(
  bigint,
  bigint,
  bigint,
  bigint,
  jsonb
) IS 'Assigns a station template across staff for the authenticated tenant site kitchen after split, or warehouse before split.';

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
    AND location.location_kind = ANY (ARRAY['warehouse'::text, 'kitchen'::text])
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

COMMENT ON FUNCTION public.submit_inventory_count_slip(
  bigint,
  bigint,
  jsonb,
  bigint
) IS 'Submits assigned staff counts for the authenticated tenant site kitchen after split, or warehouse before split.';
