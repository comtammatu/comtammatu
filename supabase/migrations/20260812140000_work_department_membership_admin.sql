-- Work W-UI-4: department membership admin RPCs (Owner / work:manage).
-- Tables remain SELECT-only for authenticated; mutations go through these RPCs.

CREATE OR REPLACE FUNCTION public.can_manage_work_membership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.auth_tenant_id() IS NOT NULL
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_permission(NULL::bigint, 'work:manage'::text)
    );
$$;

CREATE OR REPLACE FUNCTION public.upsert_work_department_member(
  p_department_id bigint,
  p_user_id uuid,
  p_role text
)
RETURNS public.work_department_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := NULLIF(btrim(COALESCE(p_role, '')), '');
  v_row public.work_department_members%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_work_membership() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_department_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF v_role IS NULL OR v_role <> ALL (ARRAY['lead'::text, 'member'::text]) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.work_departments department
    WHERE department.id = p_department_id
      AND department.tenant_id = v_tenant
      AND department.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_user_id
      AND profile.tenant_id = v_tenant
      AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.work_department_members member
  SET is_active = false,
      updated_at = now()
  WHERE member.tenant_id = v_tenant
    AND member.user_id = p_user_id
    AND member.is_active IS TRUE
    AND member.department_id <> p_department_id;

  INSERT INTO public.work_department_members (
    tenant_id,
    department_id,
    user_id,
    role,
    is_active
  ) VALUES (
    v_tenant,
    p_department_id,
    p_user_id,
    v_role,
    true
  )
  ON CONFLICT (tenant_id, department_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      is_active = true,
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_work_department_member_role(
  p_department_id bigint,
  p_user_id uuid,
  p_role text
)
RETURNS public.work_department_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := NULLIF(btrim(COALESCE(p_role, '')), '');
  v_row public.work_department_members%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_work_membership() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_department_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF v_role IS NULL OR v_role <> ALL (ARRAY['lead'::text, 'member'::text]) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  UPDATE public.work_department_members member
  SET role = v_role,
      updated_at = now()
  WHERE member.tenant_id = v_tenant
    AND member.department_id = p_department_id
    AND member.user_id = p_user_id
    AND member.is_active IS TRUE
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_work_department_member(
  p_department_id bigint,
  p_user_id uuid
)
RETURNS public.work_department_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_row public.work_department_members%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_work_membership() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_department_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.work_department_members member
  SET is_active = false,
      updated_at = now()
  WHERE member.tenant_id = v_tenant
    AND member.department_id = p_department_id
    AND member.user_id = p_user_id
    AND member.is_active IS TRUE
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_work_membership()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_work_membership()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_work_department_member(bigint, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_work_department_member(bigint, uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_work_department_member_role(bigint, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_department_member_role(bigint, uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deactivate_work_department_member(bigint, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_work_department_member(bigint, uuid)
  TO authenticated, service_role;
