-- Migration: Inventory Count Template CRUD and Station Multi-Staff Assignment Matrix
-- Description:
-- 1. Create RPC upsert_inventory_count_template for creating/updating station templates with ingredients list.
-- 2. Create RPC delete_inventory_count_template for deleting branch-specific custom templates.
-- 3. Create RPC set_station_count_assignments for atomic multi-staff assignment distribution within a station.

CREATE OR REPLACE FUNCTION public.upsert_inventory_count_template(
  p_branch_id bigint,
  p_template_id bigint,
  p_code text,
  p_name text,
  p_station_role text,
  p_ingredient_ids bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant bigint;
  v_uid uuid := auth.uid();
  v_template_id bigint;
  v_code text := trim(p_code);
  v_name text := trim(p_name);
  v_is_system boolean := false;
  v_item_id bigint;
  v_sort integer := 0;
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

  IF v_name = '' THEN
    RAISE EXCEPTION 'Tên mẫu không được để trống' USING ERRCODE = '22000';
  END IF;

  IF v_code = '' OR v_code IS NULL THEN
    v_code := 'custom_' || to_char(now(), 'YYYYMMDDHH24MISS') || '_' || floor(random() * 1000)::text;
  END IF;

  IF p_template_id IS NOT NULL THEN
    -- Check if editing existing template
    SELECT is_system INTO v_is_system
    FROM public.inventory_count_templates
    WHERE id = p_template_id AND tenant_id = v_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mẫu kiểm đếm không tồn tại' USING ERRCODE = 'P0002';
    END IF;

    IF v_is_system THEN
      -- Create a branch override copy if modifying a system template
      INSERT INTO public.inventory_count_templates (
        tenant_id,
        branch_id,
        code,
        name,
        station_role,
        is_system,
        is_active
      )
      VALUES (
        v_tenant,
        p_branch_id,
        v_code || '_br' || p_branch_id::text,
        v_name,
        p_station_role,
        false,
        true
      )
      RETURNING id INTO v_template_id;
    ELSE
      -- Update existing branch template
      UPDATE public.inventory_count_templates
      SET name = v_name,
          station_role = p_station_role,
          updated_at = now()
      WHERE id = p_template_id
        AND tenant_id = v_tenant
        AND (branch_id = p_branch_id OR branch_id IS NULL)
      RETURNING id INTO v_template_id;
    END IF;
  ELSE
    -- Create new template
    INSERT INTO public.inventory_count_templates (
      tenant_id,
      branch_id,
      code,
      name,
      station_role,
      is_system,
      is_active
    )
    VALUES (
      v_tenant,
      p_branch_id,
      v_code,
      v_name,
      p_station_role,
      false,
      true
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- Refresh template items
  DELETE FROM public.inventory_count_template_items
  WHERE template_id = v_template_id AND tenant_id = v_tenant;

  IF p_ingredient_ids IS NOT NULL AND array_length(p_ingredient_ids, 1) > 0 THEN
    FOREACH v_item_id IN ARRAY p_ingredient_ids
    LOOP
      v_sort := v_sort + 10;
      INSERT INTO public.inventory_count_template_items (
        tenant_id,
        template_id,
        ingredient_id,
        sort_order
      )
      VALUES (
        v_tenant,
        v_template_id,
        v_item_id,
        v_sort
      )
      ON CONFLICT (template_id, ingredient_id) DO NOTHING;
    END LOOP;
  END IF;

  PERFORM public.log_audit(
    'upsert_inventory_count_template',
    'inventory_count_template',
    v_template_id,
    NULL,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'template_id', v_template_id,
      'name', v_name,
      'station_role', p_station_role,
      'item_count', coalesce(array_length(p_ingredient_ids, 1), 0)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_inventory_count_template(bigint, bigint, text, text, text, bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_inventory_count_template(bigint, bigint, text, text, text, bigint[]) TO authenticated, service_role;

-- Delete template RPC
CREATE OR REPLACE FUNCTION public.delete_inventory_count_template(
  p_branch_id bigint,
  p_template_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant bigint;
  v_is_system boolean;
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

  SELECT is_system INTO v_is_system
  FROM public.inventory_count_templates
  WHERE id = p_template_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mẫu kiểm đếm không tồn tại' USING ERRCODE = 'P0002';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'Không thể xóa mẫu hệ thống mặc định' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.inventory_count_templates
  WHERE id = p_template_id
    AND tenant_id = v_tenant
    AND branch_id = p_branch_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_inventory_count_template(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_inventory_count_template(bigint, bigint) TO authenticated, service_role;

-- Station Multi-Staff Assignment Matrix RPC
CREATE OR REPLACE FUNCTION public.set_station_count_assignments(
  p_branch_id bigint,
  p_location_id bigint,
  p_shift_id bigint,
  p_template_id bigint,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.set_station_count_assignments(bigint, bigint, bigint, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_station_count_assignments(bigint, bigint, bigint, bigint, jsonb) TO authenticated, service_role;
