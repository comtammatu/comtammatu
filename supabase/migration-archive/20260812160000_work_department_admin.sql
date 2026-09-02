-- Work department admin RPCs (Owner / work:manage).
-- work_departments stays SELECT-only for authenticated; mutations via RPC.

CREATE OR REPLACE FUNCTION public.upsert_work_department(
  p_name text,
  p_department_id bigint DEFAULT NULL
)
RETURNS public.work_departments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_row public.work_departments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_work_membership() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_department_id IS NULL THEN
    INSERT INTO public.work_departments (tenant_id, name)
    VALUES (v_tenant, v_name)
    ON CONFLICT (tenant_id, name) DO UPDATE
    SET is_active = true,
        updated_at = now()
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  UPDATE public.work_departments department
  SET name = v_name,
      updated_at = now()
  WHERE department.id = p_department_id
    AND department.tenant_id = v_tenant
    AND department.is_active IS TRUE
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_work_department(
  p_department_id bigint
)
RETURNS public.work_departments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_row public.work_departments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_work_membership() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_department_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.work_tasks task
    WHERE task.tenant_id = v_tenant
      AND task.department_id = p_department_id
      AND task.status <> ALL (ARRAY['done'::text, 'canceled'::text])
  ) THEN
    RAISE EXCEPTION 'department_has_active_tasks' USING ERRCODE = '22023';
  END IF;

  UPDATE public.work_department_members member
  SET is_active = false,
      updated_at = now()
  WHERE member.tenant_id = v_tenant
    AND member.department_id = p_department_id
    AND member.is_active IS TRUE;

  UPDATE public.work_departments department
  SET is_active = false,
      updated_at = now()
  WHERE department.id = p_department_id
    AND department.tenant_id = v_tenant
    AND department.is_active IS TRUE
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_work_department(text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_work_department(text, bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deactivate_work_department(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_work_department(bigint)
  TO authenticated, service_role;
