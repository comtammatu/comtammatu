-- Employee-specific full-replacement shift task templates.

ALTER TABLE public.employees
  ADD CONSTRAINT employees_id_tenant_key UNIQUE (id, tenant_id);

ALTER TABLE public.shift_checklist_templates
  ADD COLUMN employee_id bigint,
  ADD CONSTRAINT shift_checklist_templates_employee_tenant_fkey
    FOREIGN KEY (employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE CASCADE,
  ADD CONSTRAINT shift_checklist_templates_employee_scope_check
    CHECK (employee_id IS NULL OR branch_id IS NULL);

CREATE UNIQUE INDEX shift_checklist_templates_one_active_employee
  ON public.shift_checklist_templates (tenant_id, employee_id)
  WHERE employee_id IS NOT NULL AND is_active;

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
  v_template_id bigint;
  v_employee_name text;
  v_task jsonb;
  v_item_id bigint;
  v_sort_order integer := 0;
  v_ingredient_id bigint;
  v_ingredient_sort_order integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL
     OR NOT public.has_permission(NULL, 'hr:manage_position_tasks') THEN
    RAISE EXCEPTION 'position_tasks_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tasks IS NULL OR jsonb_typeof(p_tasks) <> 'array'
     OR jsonb_array_length(p_tasks) > 40 THEN
    RAISE EXCEPTION 'too_many_tasks' USING ERRCODE = '22023';
  END IF;

  SELECT profile.full_name, employee.default_checklist_template_id
  INTO v_employee_name, v_template_id
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
  v_template_id bigint;
BEGIN
  IF auth.uid() IS NULL OR v_tenant_id IS NULL
     OR NOT public.has_permission(NULL, 'hr:manage_position_tasks') THEN
    RAISE EXCEPTION 'position_tasks_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT employee.default_checklist_template_id
  INTO v_template_id
  FROM public.employees employee
  WHERE employee.id = p_employee_id
    AND employee.tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found' USING ERRCODE = 'P0002';
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

-- Materialize the override at the attendance boundary; existing attendance stays unchanged.
CREATE OR REPLACE FUNCTION private.materialize_employee_shift_task_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_template_id bigint;
  v_is_opening boolean;
  v_is_closing boolean;
BEGIN
  SELECT template.id
  INTO v_template_id
  FROM public.employees employee
  JOIN public.shift_checklist_templates template
    ON template.id = employee.default_checklist_template_id
   AND template.tenant_id = employee.tenant_id
   AND template.employee_id = employee.id
   AND template.branch_id IS NULL
   AND template.is_active
  WHERE employee.id = NEW.employee_id
    AND employee.tenant_id = NEW.tenant_id;
  IF v_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT shift_row.is_opening, shift_row.is_closing
  INTO v_is_opening, v_is_closing
  FROM public.shifts shift_row
  WHERE shift_row.id = NEW.shift_id
    AND shift_row.tenant_id = NEW.tenant_id;

  UPDATE public.attendance_records
  SET checklist_template_id = v_template_id
  WHERE id = NEW.id
    AND tenant_id = NEW.tenant_id;

  INSERT INTO public.attendance_checklist_items (
    tenant_id, attendance_record_id, template_item_id, title, phase,
    done_definition, is_required, scope, task_kind, sort_order
  )
  SELECT
    NEW.tenant_id,
    NEW.id,
    item.id,
    item.title,
    item.phase,
    item.done_definition,
    item.is_required,
    item.scope,
    item.task_kind,
    row_number() OVER (ORDER BY item.sort_order, item.id)::integer
  FROM public.shift_checklist_template_items item
  WHERE item.tenant_id = NEW.tenant_id
    AND item.template_id = v_template_id
    AND item.is_active
    AND (
      item.scope = 'every_shift'
      OR (item.scope = 'opening' AND COALESCE(v_is_opening, false))
      OR (item.scope = 'closing' AND COALESCE(v_is_closing, false))
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.suppress_position_tasks_for_employee_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.template_item_id IS NULL
     AND NEW.task_kind IN ('standard', 'consumption_report')
     AND EXISTS (
       SELECT 1
       FROM public.attendance_records attendance
       JOIN public.employees employee
         ON employee.id = attendance.employee_id
        AND employee.tenant_id = attendance.tenant_id
       JOIN public.shift_checklist_templates template
         ON template.id = employee.default_checklist_template_id
        AND template.tenant_id = employee.tenant_id
        AND template.employee_id = employee.id
        AND template.is_active
       WHERE attendance.id = NEW.attendance_record_id
         AND attendance.tenant_id = NEW.tenant_id
     ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER materialize_employee_shift_task_override
AFTER INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION private.materialize_employee_shift_task_override();

CREATE TRIGGER suppress_position_tasks_for_employee_override
BEFORE INSERT ON public.attendance_checklist_items
FOR EACH ROW EXECUTE FUNCTION private.suppress_position_tasks_for_employee_override();

REVOKE ALL ON FUNCTION public.save_employee_shift_task_override(bigint, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_employee_shift_task_override(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.materialize_employee_shift_task_override() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.suppress_position_tasks_for_employee_override() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_employee_shift_task_override(bigint, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_employee_shift_task_override(bigint) TO authenticated, service_role;
