-- =============================================================
-- Atomic toggle for profile is_active
-- Eliminates read-then-write race in toggleStaffActive action
-- Uses same role hierarchy checks as admin_update_profile
-- =============================================================

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_tenant BIGINT;
  v_target_role TEXT;
  v_new_state BOOLEAN;
BEGIN
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();

  -- Fetch target (same tenant only)
  SELECT role INTO v_target_role
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Role hierarchy checks (same as admin_update_profile)
  IF v_actor_role = 'owner' THEN
    NULL; -- unrestricted
  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target_role IN ('owner', 'super_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target_role IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Atomic toggle
  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_profile_active(UUID) TO authenticated;
