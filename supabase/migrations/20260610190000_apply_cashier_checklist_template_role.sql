-- Apply a checklist template to all active employees of a specific role.

CREATE OR REPLACE FUNCTION public.apply_checklist_template_to_role(
  p_tenant_id bigint,
  p_role text,
  p_template_name text
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_template_id bigint;
  v_updated bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_role IS NULL OR btrim(p_role) = '' THEN
    RAISE EXCEPTION 'invalid_cashier_role' USING ERRCODE = '22023';
  END IF;

  IF p_template_name IS NULL OR btrim(p_template_name) = '' THEN
    RAISE EXCEPTION 'invalid_template_name' USING ERRCODE = '22023';
  END IF;

  SELECT id
    INTO v_template_id
  FROM public.shift_checklist_templates
  WHERE tenant_id = p_tenant_id
    AND is_active = true
    AND branch_id IS NULL
    AND lower(trim(name)) = lower(trim(p_template_name))
  ORDER BY id
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'checklist_template_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- profiles không có cột role — vai trò canonical nằm ở positions.code.
  WITH target_employees AS (
    SELECT e.id
    FROM public.employees e
    JOIN public.profiles p
      ON p.id = e.profile_id
     AND p.tenant_id = e.tenant_id
    JOIN public.positions po
      ON po.id = p.position_id
     AND po.tenant_id = p.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.is_active = true
      AND lower(trim(po.code)) = lower(trim(p_role))
  )
  UPDATE public.employees e
  SET default_checklist_template_id = v_template_id
  FROM target_employees t
  WHERE e.id = t.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN COALESCE(v_updated, 0);
END;
$$;

COMMENT ON FUNCTION public.apply_checklist_template_to_role(
  bigint,
  text,
  text
) IS 'Assigns one checklist template to all active employees in the tenant matching a role.';

REVOKE ALL ON FUNCTION public.apply_checklist_template_to_role(
  bigint,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_checklist_template_to_role(
  bigint,
  text,
  text
) TO service_role;
