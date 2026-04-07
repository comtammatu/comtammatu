-- HQ (trụ sở) is office-only: no POS/KDS floor. Operational roles cannot use HQ as branch.
-- 1. admin_update_profile — reject cashier/waiter/chef/branch_manager + HQ branch
-- 2. handle_new_user — same guard on invite/signup insert

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_full_name TEXT    DEFAULT NULL,
  p_phone     TEXT    DEFAULT NULL,
  p_role      TEXT    DEFAULT NULL,
  p_branch_id BIGINT  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id     UUID;
  v_actor_role   TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_actor_area   BIGINT;
  v_target       RECORD;
  v_final_role   TEXT;
  v_final_branch BIGINT;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();
  v_actor_area   := public.auth_area_id();

  IF p_role IS NOT NULL AND p_role NOT IN (
      'owner', 'super_manager', 'area_manager',
      'branch_manager', 'cashier', 'waiter', 'chef', 'office'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT id, role, branch_id, full_name, phone, tenant_id
    INTO v_target
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  v_final_role   := COALESCE(p_role,      v_target.role::TEXT);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
     AND v_final_branch IS NULL
  THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  -- Operational / floor roles cannot be assigned to headquarters (no POS/KDS)
  IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
     AND v_final_branch IS NOT NULL
  THEN
    IF EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = v_final_branch
        AND tenant_id = v_actor_tenant
        AND COALESCE(is_headquarters, false) = true
    ) THEN
      RAISE EXCEPTION 'operational roles cannot be assigned to headquarters branch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role = 'owner' THEN
    NULL;

  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target.role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;

  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target.role::TEXT IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
    END IF;
    IF v_final_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;
    IF v_target.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target.branch_id
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area branches';
      END IF;
    END IF;
    IF v_final_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_final_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target branch not in your area';
      END IF;
    END IF;

  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target.role::TEXT = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    IF v_final_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;

  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  UPDATE public.profiles
  SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    role       = v_final_role::public.staff_role,
    branch_id  = v_final_branch,
    updated_at = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF p_role IS NOT NULL AND p_role <> v_target.role::TEXT THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('user_role', v_final_role)
    WHERE id = p_target_id;
  END IF;

  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT;
  v_branch_id BIGINT;
  v_role      public.staff_role;
BEGIN
  IF NEW.raw_app_meta_data ->> 'tenant_id' IS NULL THEN
    RAISE EXCEPTION 'tenant_id required in app_metadata — use admin invite flow';
  END IF;

  v_tenant_id := (NEW.raw_app_meta_data ->> 'tenant_id')::bigint;
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_role := COALESCE((NEW.raw_app_meta_data ->> 'role')::public.staff_role, 'waiter');

  IF v_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
     AND v_branch_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.branches
       WHERE id = v_branch_id
         AND tenant_id = v_tenant_id
         AND COALESCE(is_headquarters, false) = true
     )
  THEN
    RAISE EXCEPTION 'operational roles cannot be assigned to headquarters branch' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, role, full_name)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_role,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;
