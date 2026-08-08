-- Branch managers may manage employee-specific shift task overrides for their
-- own branch. Company position templates remain tenant-HR only.

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES (
  'hr:manage_employee_shift_overrides',
  'hr',
  'Manage employee-specific shift task overrides at a branch',
  'branch',
  true
)
ON CONFLICT (key) DO UPDATE
SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES ('branch_manager', 'hr:manage_employee_shift_overrides')
ON CONFLICT DO NOTHING;

UPDATE public.role_templates
SET permission_keys = array_append(permission_keys, 'hr:manage_employee_shift_overrides')
WHERE position_code = 'branch_manager'
  AND NOT ('hr:manage_employee_shift_overrides' = ANY (permission_keys));

SELECT public.sync_missing_permissions_from_template();

CREATE OR REPLACE FUNCTION public.save_employee_shift_task_override(
  p_employee_id bigint,
  p_tasks jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_branch_id bigint;
  v_template_id bigint;
  v_employee_name text;
  v_task jsonb;
  v_item_id bigint;
  v_sort_order integer := 0;
  v_ingredient_id bigint;
  v_ingredient_sort_order integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'position_tasks_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tasks IS NULL OR jsonb_typeof(p_tasks) <> 'array'
     OR jsonb_array_length(p_tasks) > 40 THEN
    RAISE EXCEPTION 'too_many_tasks' USING ERRCODE = '22023';
  END IF;

  SELECT profile.full_name, employee.default_checklist_template_id, profile.branch_id
  INTO v_employee_name, v_template_id, v_branch_id
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.id = p_employee_id
    AND employee.tenant_id = v_tenant_id
    AND employee.is_active
  FOR UPDATE OF employee;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_permission(NULL, 'hr:manage_position_tasks')
    OR (
      v_branch_id IS NOT NULL
      AND public.has_permission(
        v_branch_id,
        'hr:manage_employee_shift_overrides'
      )
    )
  ) THEN
    RAISE EXCEPTION 'position_tasks_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shift_checklist_templates template
    WHERE template.id = v_template_id
      AND template.tenant_id = v_tenant_id
      AND template.employee_id = p_employee_id
  ) THEN
    v_template_id := NULL;
  END IF;

  IF v_template_id IS NULL THEN
    SELECT template.id
    INTO v_template_id
    FROM public.shift_checklist_templates template
    WHERE template.tenant_id = v_tenant_id
      AND template.employee_id = p_employee_id
      AND template.is_active
    FOR UPDATE;
  END IF;

  IF v_template_id IS NULL THEN
    INSERT INTO public.shift_checklist_templates (
      tenant_id, branch_id, employee_id, name, is_active
    ) VALUES (
      v_tenant_id,
      NULL,
      p_employee_id,
      format('Mẫu riêng · %s', COALESCE(NULLIF(btrim(v_employee_name), ''), 'Nhân viên')),
      true
    )
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE public.shift_checklist_templates
    SET branch_id = NULL,
        employee_id = p_employee_id,
        is_active = true,
        updated_at = now()
    WHERE id = v_template_id
      AND tenant_id = v_tenant_id;
  END IF;

  UPDATE public.employees
  SET default_checklist_template_id = v_template_id,
      updated_at = now()
  WHERE id = p_employee_id
    AND tenant_id = v_tenant_id;

  DELETE FROM public.shift_checklist_template_items item
  WHERE item.tenant_id = v_tenant_id
    AND item.template_id = v_template_id;

  FOR v_task IN SELECT value FROM jsonb_array_elements(p_tasks)
  LOOP
    v_sort_order := v_sort_order + 1;
    IF btrim(COALESCE(v_task ->> 'title', '')) = ''
       OR char_length(v_task ->> 'title') > 120 THEN
      RAISE EXCEPTION 'task_title_invalid' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_task ->> 'kind', 'standard') NOT IN ('standard', 'consumption_report') THEN
      RAISE EXCEPTION 'task_kind_invalid' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_task ->> 'applicability', 'every_shift') NOT IN ('every_shift', 'opening', 'closing') THEN
      RAISE EXCEPTION 'task_applicability_invalid' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_task ->> 'phase', 'start_of_shift') NOT IN ('start_of_shift', 'end_of_shift') THEN
      RAISE EXCEPTION 'task_phase_invalid' USING ERRCODE = '22023';
    END IF;
    IF char_length(COALESCE(v_task ->> 'doneDefinition', '')) > 240 THEN
      RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.shift_checklist_template_items (
      tenant_id, template_id, title, sort_order, is_active, phase,
      done_definition, is_required, scope, task_kind
    ) VALUES (
      v_tenant_id,
      v_template_id,
      btrim(v_task ->> 'title'),
      v_sort_order,
      true,
      COALESCE(v_task ->> 'phase', 'start_of_shift'),
      btrim(COALESCE(v_task ->> 'doneDefinition', '')),
      COALESCE((v_task ->> 'isRequired')::boolean, true),
      COALESCE(v_task ->> 'applicability', 'every_shift'),
      COALESCE(v_task ->> 'kind', 'standard')
    )
    RETURNING id INTO v_item_id;

    IF COALESCE(v_task ->> 'kind', 'standard') = 'consumption_report' THEN
      v_ingredient_sort_order := 0;
      FOR v_ingredient_id IN
        SELECT DISTINCT value::bigint
        FROM jsonb_array_elements_text(COALESCE(v_task -> 'ingredientIds', '[]'::jsonb))
      LOOP
        v_ingredient_sort_order := v_ingredient_sort_order + 1;
        IF NOT EXISTS (
          SELECT 1 FROM public.ingredients ingredient
          WHERE ingredient.id = v_ingredient_id
            AND ingredient.tenant_id = v_tenant_id
            AND ingredient.is_active
        ) THEN
          RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
        END IF;

        INSERT INTO public.shift_checklist_consumption_default_items (
          tenant_id, template_item_id, ingredient_id, sort_order, is_active
        ) VALUES (
          v_tenant_id, v_item_id, v_ingredient_id, v_ingredient_sort_order, true
        );
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public.log_audit(
    'update',
    'employee_shift_task_override',
    p_employee_id,
    NULL,
    jsonb_build_object(
      'template_id', v_template_id,
      'task_count', jsonb_array_length(p_tasks)
    )
  );

  RETURN v_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_employee_shift_task_override(
  p_employee_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_branch_id bigint;
  v_template_id bigint;
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'position_tasks_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT employee.default_checklist_template_id, profile.branch_id
  INTO v_template_id, v_branch_id
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.id = p_employee_id
    AND employee.tenant_id = v_tenant_id
  FOR UPDATE OF employee;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_permission(NULL, 'hr:manage_position_tasks')
    OR (
      v_branch_id IS NOT NULL
      AND public.has_permission(
        v_branch_id,
        'hr:manage_employee_shift_overrides'
      )
    )
  ) THEN
    RAISE EXCEPTION 'position_tasks_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_template_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shift_checklist_templates template
    WHERE template.id = v_template_id
      AND template.tenant_id = v_tenant_id
      AND template.employee_id = p_employee_id
      AND template.is_active
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.employees
  SET default_checklist_template_id = NULL,
      updated_at = now()
  WHERE id = p_employee_id
    AND tenant_id = v_tenant_id;

  UPDATE public.shift_checklist_templates
  SET is_active = false,
      updated_at = now()
  WHERE id = v_template_id
    AND tenant_id = v_tenant_id
    AND employee_id = p_employee_id;

  PERFORM public.log_audit(
    'update',
    'employee_shift_task_override',
    p_employee_id,
    jsonb_build_object('template_id', v_template_id),
    jsonb_build_object('template_id', NULL)
  );

  RETURN true;
END;
$$;
