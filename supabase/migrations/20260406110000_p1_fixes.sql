-- =============================================================
-- A2: P1 Fixes
-- 1. Table release trigger — auto-release when all orders done
-- 2. release_table RPC — manual release by staff
-- 3. toggle_profile_active — block ALL self-toggle
-- 4. admin_update_profile — block area_manager peer modification
-- =============================================================

-- ─── FIX 1: Table release trigger ───

-- Function: check if a table can be released after an order status change.
-- If ALL dine_in orders on that table are in a terminal state
-- (completed, cancelled, served), set table status back to 'available'.
CREATE OR REPLACE FUNCTION public.trg_release_table_on_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table_id BIGINT;
  v_active_count INT;
BEGIN
  -- Only care about dine_in orders with a table
  IF NEW.table_id IS NULL OR NEW.order_type <> 'dine_in' THEN
    RETURN NEW;
  END IF;

  -- Only fire when status changes to a terminal state
  IF NEW.status NOT IN ('completed', 'cancelled', 'served') THEN
    RETURN NEW;
  END IF;

  -- Only fire when status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_table_id := NEW.table_id;

  -- Count remaining active (non-terminal) orders on this table
  SELECT COUNT(*) INTO v_active_count
  FROM public.orders
  WHERE table_id = v_table_id
    AND tenant_id = NEW.tenant_id
    AND id <> NEW.id
    AND status NOT IN ('completed', 'cancelled', 'served');

  -- If no active orders remain, release the table
  IF v_active_count = 0 THEN
    UPDATE public.tables
    SET status = 'available'
    WHERE id = v_table_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to orders table
DROP TRIGGER IF EXISTS trg_order_release_table ON public.orders;
CREATE TRIGGER trg_order_release_table
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_release_table_on_order_status();


-- ─── FIX 2: release_table RPC — manual release ───

CREATE OR REPLACE FUNCTION public.release_table(p_table_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.tables
  SET status = 'available'
  WHERE id = p_table_id
    AND branch_id = public.auth_branch_id()
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found or not in your branch' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_table(BIGINT) TO authenticated;


-- ─── FIX 3: toggle_profile_active — block ALL self-toggle ───

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_target_role TEXT;
  v_target_branch BIGINT;
  v_target_active BOOLEAN;
  v_new_state BOOLEAN;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  -- Fetch target (same tenant only)
  SELECT role, branch_id, is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Block ALL self-toggle (deactivation AND reactivation)
  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;

  -- Role hierarchy checks (same as admin_update_profile)
  IF v_actor_role = 'owner' THEN
    NULL; -- unrestricted
  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'permission_denied';
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

  -- Atomic toggle
  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;

-- Grant already exists from original migration, but be explicit
GRANT EXECUTE ON FUNCTION public.toggle_profile_active(UUID) TO authenticated;


-- ─── FIX 4: admin_update_profile — block area_manager peer modification ───
-- Also fix: area_manager toggle check was missing peer guard in the original

-- Read the full current function and re-create with the fix.
-- The area_manager block needs: IF v_target.role = 'area_manager' THEN RAISE

-- We need to read the full function from 20260402000002. Since CREATE OR REPLACE
-- requires the full body, we replicate with the fix applied.

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_full_name TEXT     DEFAULT NULL,
  p_phone TEXT         DEFAULT NULL,
  p_role TEXT          DEFAULT NULL,
  p_branch_id BIGINT   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_target RECORD;
  v_final_role TEXT;
  v_final_branch BIGINT;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  -- Fetch target profile
  SELECT id, role, branch_id, full_name, phone, tenant_id
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
    -- Cannot modify owner, super_manager, or PEER area_manager
    IF v_target.role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
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

  -- ========== APPLY UPDATE ==========

  UPDATE public.profiles
  SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    role       = v_final_role,
    branch_id  = v_final_branch,
    updated_at = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  -- If role changed, update auth.users.raw_app_meta_data so next JWT reflects it
  IF p_role IS NOT NULL AND p_role <> v_target.role THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('user_role', v_final_role)
    WHERE id = p_target_id;
  END IF;

  -- If branch changed, update auth metadata
  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;
