-- =============================================================
-- Auth v3 alpha4b: remove cached auth_role() reliance from the
-- remaining active staff/admin RPC definitions that are safe to cut.
--
-- Goals:
--   1. Role hierarchy checks still use legacy role semantics.
--   2. Actor role/branch/area is read live from profiles + positions.
--   3. Tenant settings writes use Auth v2 permission gates.
--
-- can_access_branch() intentionally stays out of this batch because it is
-- a branch-scope predicate used by RLS policies and needs a separate policy
-- verification pass.
-- =============================================================

-- -----------------------------------------------------------------
-- admin_update_profile: live actor context, no auth_role()/branch/area
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id  UUID,
  p_full_name  TEXT    DEFAULT NULL,
  p_phone      TEXT    DEFAULT NULL,
  p_role       TEXT    DEFAULT NULL,
  p_branch_id  BIGINT  DEFAULT NULL,
  p_is_active  BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id        UUID := auth.uid();
  v_actor_tenant    BIGINT;
  v_actor_role_text TEXT;
  v_actor_branch    BIGINT;
  v_actor_area      BIGINT;
  v_target          RECORD;
  v_target_role     TEXT;
  v_final_role      TEXT;
  v_final_branch    BIGINT;
  v_final_position  BIGINT;
  v_branch_kind     TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    p.tenant_id,
    COALESCE(po.legacy_role_code, 'unassigned') AS role_text,
    p.branch_id,
    p.area_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch, v_actor_area
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN (
    'owner','super_manager','area_manager','branch_manager',
    'warehouse_manager','production_manager','cashier','waiter','chef','office'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
    COALESCE(po.legacy_role_code, 'unassigned') AS role_text
  INTO v_target
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  v_target_role  := v_target.role_text;
  v_final_role   := COALESCE(p_role, v_target_role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  IF v_final_role IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
     AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch AND tenant_id = v_actor_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;

    IF v_final_role IN ('cashier','waiter','chef','branch_manager')
       AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'operational roles must be assigned to branch site' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'central_warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to central_warehouse branch' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'production_manager' AND v_branch_kind <> 'central_kitchen' THEN
      RAISE EXCEPTION 'production_manager must be assigned to central_kitchen branch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'super_manager' THEN
    IF v_target_role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;
  ELSIF v_actor_role_text = 'area_manager' THEN
    IF v_target_role IN ('owner','super_manager','area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
    END IF;
    IF v_final_role IN ('owner','super_manager','area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;
    IF v_target.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area AND branch_id = v_target.branch_id AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN RAISE EXCEPTION 'area_manager: target not in your area branches'; END IF;
    END IF;
    IF v_final_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area AND branch_id = v_final_branch AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN RAISE EXCEPTION 'area_manager: target branch not in your area'; END IF;
    END IF;
  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    IF v_final_role NOT IN ('cashier','waiter','chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  v_final_position := public._auth_v2_position_id_from_role(v_final_role, v_actor_tenant);

  IF v_final_position IS NULL THEN
    RAISE EXCEPTION
      'admin_update_profile: position_not_resolved for role=% tenant=% - verify positions seeded',
      v_final_role, v_actor_tenant
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles SET
    full_name   = COALESCE(p_full_name, full_name),
    phone       = COALESCE(p_phone,     phone),
    position_id = v_final_position,
    branch_id   = v_final_branch,
    is_active   = COALESCE(p_is_active, is_active),
    updated_at  = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF p_role IS NOT NULL AND p_role <> v_target_role THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('user_role', v_final_role, 'role', v_final_role)
    WHERE id = p_target_id;
  END IF;
  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) IS
  'Auth v3 alpha4b: reads actor role/branch/area live from profiles + positions instead of cached JWT auth_role helpers; preserves H3a position_id guard.';

-- -----------------------------------------------------------------
-- toggle_profile_active: live actor context, no auth_role()/branch/area
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_actor_role    TEXT;
  v_actor_tenant  BIGINT;
  v_actor_branch  BIGINT;
  v_actor_area    BIGINT;
  v_target_role   TEXT;
  v_target_branch BIGINT;
  v_target_active BOOLEAN;
  v_new_state     BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    COALESCE(po.legacy_role_code, 'unassigned') AS role_text,
    p.tenant_id,
    p.branch_id,
    p.area_id
  INTO v_actor_role, v_actor_tenant, v_actor_branch, v_actor_area
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(po.legacy_role_code, 'unassigned'),
         p.branch_id,
         p.is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
    WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;

  IF v_actor_role = 'owner' THEN
    NULL;
  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
    IF v_target_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area';
      END IF;
    END IF;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target_role IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied';
  END IF;

  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_profile_active(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_profile_active(UUID) TO authenticated;

COMMENT ON FUNCTION public.toggle_profile_active(UUID) IS
  'Auth v3 alpha4b: reads actor role/branch/area live from profiles + positions instead of cached JWT auth_role helpers.';

-- -----------------------------------------------------------------
-- set_branch_kind: permission gate instead of owner/super JWT role
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_branch_kind(
  p_branch_id BIGINT,
  p_kind      TEXT DEFAULT 'central_warehouse'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_tenant   BIGINT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id
  INTO v_tenant
  FROM public.profiles p
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('central_warehouse', 'central_kitchen', 'branch') THEN
    RAISE EXCEPTION 'invalid branch_kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  UPDATE public.branches
  SET branch_kind = p_kind,
      updated_at  = now()
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_branch_kind(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_kind(BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_branch_kind(BIGINT, TEXT) IS
  'Auth v3 alpha4b: gates tenant branch-kind changes with settings:tenant permission instead of cached JWT auth_role.';
