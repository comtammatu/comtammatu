-- =============================================================
-- V0.1.1 Security Fix: RLS, Self-Update, Branch Constraint, Invite-Only
-- Addresses: P1-1 privilege escalation, P1-2 cross-branch leak,
--            P2-3 manager scope, P2-4 branch_id constraint,
--            P3-5 updated_at trigger, P3-6 indexes, P3-8 invite-only
-- =============================================================

-- =====================
-- P3-5: updated_at trigger (missing from initial migration)
-- =====================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================
-- P3-6: Composite indexes for RLS performance
-- =====================
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE INDEX idx_profiles_tenant_branch ON public.profiles(tenant_id, branch_id);
CREATE INDEX idx_profiles_tenant_role ON public.profiles(tenant_id, role);

-- =====================
-- P2-4: Role-aware branch_id constraint
-- MUST clean up legacy data FIRST — old trigger created waiter + NULL branch
-- =====================

-- Deactivate any ops-role profiles with NULL branch_id (created by old trigger)
UPDATE public.profiles
SET is_active = false
WHERE role IN ('cashier', 'waiter', 'chef', 'branch_manager')
  AND branch_id IS NULL;

-- NOW safe to add the constraint
ALTER TABLE public.profiles ADD CONSTRAINT chk_branch_required_for_ops
  CHECK (
    CASE
      WHEN role IN ('cashier', 'waiter', 'chef', 'branch_manager')
        THEN branch_id IS NOT NULL
      ELSE true
    END
  ) NOT VALID;

-- Validate separately — does not block concurrent reads
ALTER TABLE public.profiles VALIDATE CONSTRAINT chk_branch_required_for_ops;

-- =====================
-- P1-1: Fix self-update privilege escalation
-- Drop old overly-permissive UPDATE policy (exact name from initial migration)
-- Replace with column-level GRANT + RPC
-- =====================

-- Drop the dangerous policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Revoke ALL direct DML from authenticated — profiles go through RPCs only
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

-- Re-grant only safe columns for self-update
GRANT UPDATE(full_name, phone, avatar_url) ON public.profiles TO authenticated;

-- Keep SELECT so RLS policies work
-- (SELECT was already granted in initial migration and remains)

-- Drop the overly-permissive manager policy that allowed direct INSERT/DELETE
DROP POLICY IF EXISTS "Managers can manage all profiles" ON public.profiles;

-- Re-add a scoped policy for the safe columns only
CREATE POLICY "Users can update own safe fields"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- RPC: self-update (primary path for app layer)
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

-- Lock down RPC execution
REVOKE EXECUTE ON FUNCTION public.update_my_profile FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_my_profile FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile TO authenticated;

-- =====================
-- P1-2: Fix cross-branch profile leak + office visibility
-- Drop old tenant-wide SELECT, replace with role-aware scoping
-- office is HQ-wide (no branch), needs tenant-wide read for HR functions
-- =====================

DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON public.profiles;

CREATE POLICY "Users can view profiles branch-scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Always see own profile
      id = auth.uid()
      -- Tenant-wide roles see all (office = HQ staff with HR access)
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'office')
      -- Branch manager sees own branch
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
      -- Staff sees own branch colleagues
      OR branch_id = public.auth_branch_id()
    )
  );

-- =====================
-- P2-3: Manager RPC with actor scope + target restrictions
-- This is the ONLY path for role/branch/active changes (no direct DML)
-- =====================
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_role public.staff_role DEFAULT NULL,
  p_branch_id BIGINT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
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
    updated_at = now()
  WHERE id = p_target_id;
END;
$$;

-- Lock down RPC execution
REVOKE EXECUTE ON FUNCTION public.admin_update_profile FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile TO authenticated;

-- =====================
-- P3-8: Invite-only flow — use raw_app_meta_data, reject self-signup
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Require tenant_id from app_metadata (set by admin invite, not user-controlled)
  IF NEW.raw_app_meta_data ->> 'tenant_id' IS NULL THEN
    RAISE EXCEPTION 'tenant_id required in app_metadata — use admin invite flow';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, role, full_name)
  VALUES (
    NEW.id,
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (NEW.raw_app_meta_data ->> 'branch_id')::bigint,
    COALESCE((NEW.raw_app_meta_data ->> 'role')::public.staff_role, 'waiter'),
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;
