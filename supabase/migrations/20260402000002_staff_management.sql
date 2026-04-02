-- =============================================================
-- Sprint 1 S3: Staff Management — Extend admin_update_profile
-- Adds p_full_name and p_phone so admins can edit staff details
-- =============================================================

-- Replace function with extended signature
-- CREATE OR REPLACE preserves existing GRANTs and SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_role public.staff_role DEFAULT NULL,
  p_branch_id BIGINT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT;
  v_actor_branch BIGINT;
  v_actor_tenant BIGINT;
  v_target RECORD;
  v_final_role public.staff_role;
  v_final_branch BIGINT;
BEGIN
  -- Actor context
  v_actor_role   := public.auth_role();
  v_actor_branch := public.auth_branch_id();
  v_actor_tenant := public.auth_tenant_id();

  -- Fetch target (same tenant only)
  SELECT role, branch_id, tenant_id
    INTO v_target
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  -- Compute final values
  v_final_role   := COALESCE(p_role, v_target.role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  -- ========== ACTOR PERMISSION CHECKS ==========

  IF v_actor_role = 'owner' THEN
    -- Owner: unrestricted within tenant
    NULL;

  ELSIF v_actor_role = 'super_manager' THEN
    -- Cannot touch owner
    IF v_target.role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;

  ELSIF v_actor_role = 'area_manager' THEN
    -- Cannot create/modify owner, super_manager, or peer area_manager
    IF v_target.role IN ('owner', 'super_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager';
    END IF;
    IF v_final_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;

  ELSIF v_actor_role = 'branch_manager' THEN
    -- Must be same branch
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    -- Cannot modify another branch_manager
    IF v_target.role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    -- Can only set role to operational roles
    IF v_final_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    -- Cannot reassign to different branch
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;

  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  -- ========== TARGET INTEGRITY CHECKS ==========

  -- Operational roles must have branch_id
  IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
     AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'operational roles require branch_id';
  END IF;

  -- branch_id must belong to same tenant
  IF v_final_branch IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = v_final_branch AND tenant_id = v_actor_tenant
    ) THEN
      RAISE EXCEPTION 'branch_id does not belong to tenant';
    END IF;
  END IF;

  -- ========== APPLY UPDATE ==========
  UPDATE public.profiles SET
    role       = v_final_role,
    branch_id  = v_final_branch,
    is_active  = COALESCE(p_is_active, is_active),
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    updated_at = now()
  WHERE id = p_target_id;
END;
$$;
