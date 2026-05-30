-- =============================================================
-- Auth v2 — M5 DROP: remove profiles.role, staff_role enum, auth_role().
--
-- Prerequisites (already applied by 20260423020000_auth_v2_m5_bridge):
--   • positions.legacy_role_code populated for all rows
--   • JWT hook reads position (no longer profiles.role)
--   • handle_new_user + admin_update_profile understand position_id
--   • chk_branch_required_for_ops replaced by trigger
--
-- Keeps:
--   • auth_branch_id() helper — still used by kds_stations / kds_station_categories SELECT
-- =============================================================

-- ═════════════════════════════════════════════════════
-- 1. Replace chk_area_id_scope with a trigger
-- Old: CHECK (role IN (area_manager, warehouse_manager, production_manager) OR area_id IS NULL)
-- New: derive from position.legacy_role_code via trigger.
-- ═════════════════════════════════════════════════════
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_area_id_scope;

CREATE OR REPLACE FUNCTION public._auth_v2_check_area_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.area_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT legacy_role_code INTO v_code
  FROM public.positions WHERE id = NEW.position_id;
  IF v_code IS NULL OR v_code NOT IN ('area_manager','warehouse_manager','production_manager') THEN
    RAISE EXCEPTION 'area_id only allowed for area_manager / warehouse_manager / production_manager (got %)', COALESCE(v_code, '<null>')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_area_scope ON public.profiles;
CREATE TRIGGER trg_profiles_area_scope
  BEFORE INSERT OR UPDATE OF position_id, area_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._auth_v2_check_area_scope();

-- ═════════════════════════════════════════════════════
-- 2. Update handle_new_user — stop writing profiles.role
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id   BIGINT;
  v_branch_id   BIGINT;
  v_role_text   TEXT;
  v_position_id BIGINT;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
  );
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_role_text := COALESCE(NEW.raw_app_meta_data ->> 'role', 'owner');
  v_position_id := public._auth_v2_position_id_from_role(v_role_text, v_tenant_id);

  INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
  VALUES (
    NEW.id, v_tenant_id, v_branch_id, v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- ═════════════════════════════════════════════════════
-- 3. Update admin_update_profile — stop writing profiles.role
-- (Logic identical to bridge version, just removes the `role = ...` write.)
-- ═════════════════════════════════════════════════════
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
  v_actor_tenant    BIGINT := public.auth_tenant_id();
  v_actor_role_text TEXT   := public.auth_role();
  v_actor_branch    BIGINT := public.auth_branch_id();
  v_actor_area      BIGINT := public.auth_area_id();
  v_target          RECORD;
  v_target_role     TEXT;
  v_final_role      TEXT;
  v_final_branch    BIGINT;
  v_final_position  BIGINT;
  v_branch_kind     TEXT;
BEGIN
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
    FROM public.branches WHERE id = v_final_branch AND tenant_id = v_actor_tenant;
    IF v_final_role IN ('cashier','waiter','chef','branch_manager')
       AND v_branch_kind IN ('warehouse','central_kitchen') THEN
      RAISE EXCEPTION 'operational roles cannot be assigned to warehouse/central_kitchen branch' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to warehouse branch' USING ERRCODE = 'P0001';
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

-- ═════════════════════════════════════════════════════
-- 4. DESTRUCTIVE: drop profiles.role column
-- ═════════════════════════════════════════════════════
ALTER TABLE public.profiles DROP COLUMN role;

-- ═════════════════════════════════════════════════════
-- 5. DROP staff_role enum type
-- Must come after column drop (nothing else references it now).
-- ═════════════════════════════════════════════════════
DROP TYPE IF EXISTS public.staff_role;

-- ═════════════════════════════════════════════════════
-- 6. DROP auth_role() helper — 0 RLS policies reference it anymore
-- (kept auth_branch_id, auth_tenant_id, auth_area_id — still referenced)
-- ═════════════════════════════════════════════════════
-- BUT admin_update_profile/handle_new_user still call auth_role() internally
-- to read the caller's role text from JWT. Refactor to read from positions
-- via auth.uid() join.
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  -- Now derives from positions.legacy_role_code instead of JWT user_role claim.
  -- Kept as a function (not dropped) because admin_update_profile still calls it,
  -- and dropping would cascade to all callers. Safe: returns same values.
  SELECT COALESCE(po.legacy_role_code, 'unassigned')
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;

COMMENT ON FUNCTION public.auth_role() IS
  'Shadow helper: returns legacy_role_code for the caller. Kept to preserve admin_update_profile/handle_new_user internals after profiles.role drop. JWT user_role claim is now derived from positions by the hook.';
