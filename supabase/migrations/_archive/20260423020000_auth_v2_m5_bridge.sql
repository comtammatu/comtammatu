-- =============================================================
-- Auth v2 — M5 bridge: reroute all role-reading code paths through
-- positions, so profiles.role can be dropped without touching 57 client
-- files. JWT continues to emit `user_role` for legacy-compat consumers.
--
-- Non-destructive. Safe to apply before the DROP migration.
--
-- Changes:
--   1. positions.legacy_role_code TEXT  — maps HR position → legacy role string
--   2. Backfill from _auth_v2_role_to_position (reverse direction)
--   3. JWT hook: user_role := positions.legacy_role_code (no longer reads profiles.role)
--   4. handle_new_user trigger: write position_id, not role
--   5. admin_update_profile: accepts p_role, writes position_id via mapping
--   6. chk_branch_required_for_ops: replace with position_id-based constraint
-- =============================================================

-- ═════════════════════════════════════════════════════
-- 1. positions.legacy_role_code
-- ═════════════════════════════════════════════════════
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS legacy_role_code TEXT;

-- Seed mapping (inverse of _auth_v2_role_to_position)
UPDATE public.positions
SET legacy_role_code = CASE code
  WHEN 'owner'              THEN 'owner'
  WHEN 'super_manager'      THEN 'super_manager'
  WHEN 'quan_ly_vung'       THEN 'area_manager'
  WHEN 'quan_ly_CN'         THEN 'branch_manager'
  WHEN 'kho_truong'         THEN 'warehouse_manager'
  WHEN 'bep_truong'         THEN 'production_manager'
  WHEN 'cashier'            THEN 'cashier'
  WHEN 'waiter'             THEN 'waiter'
  WHEN 'chef'               THEN 'chef'
  WHEN 'office'             THEN 'office'
  -- HR-only codes with no direct role equivalent → fall back to closest
  WHEN 'phu_bep'            THEN 'chef'
  WHEN 'thu_kho'            THEN 'warehouse_manager'
  WHEN 'ke_toan'            THEN 'office'
  WHEN 'ke_toan_truong'     THEN 'office'
  WHEN 'tro_ly_giam_doc'    THEN 'super_manager'
  ELSE code  -- fallback: identity
END
WHERE legacy_role_code IS NULL;

ALTER TABLE public.positions
  ALTER COLUMN legacy_role_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_positions_legacy_role_code
  ON public.positions (legacy_role_code);

COMMENT ON COLUMN public.positions.legacy_role_code IS
  'Bridge to legacy staff_role enum. JWT hook emits this as user_role for 57 client files that still compare role strings. After full client refactor to position, this column + JWT user_role claim can be dropped.';

-- ═════════════════════════════════════════════════════
-- 2. JWT hook — read from positions, not profiles.role
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims JSONB;
  user_profile RECORD;
BEGIN
  claims := event -> 'claims';

  SELECT
    p.tenant_id,
    p.branch_id,
    COALESCE(po.legacy_role_code, 'office')     AS user_role,    -- legacy-compat
    COALESCE(po.code,             'unassigned') AS position_code -- canonical
  INTO user_profile
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF user_profile IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'user_role', user_profile.user_role,
        'position',  user_profile.position_code
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;

-- ═════════════════════════════════════════════════════
-- 3. Helper: resolve position_id from a legacy role string
-- ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._auth_v2_position_id_from_role(
  p_role    TEXT,
  p_tenant  BIGINT
)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id
  FROM public.positions
  WHERE tenant_id = p_tenant
    AND code = public._auth_v2_role_to_position(p_role)
  LIMIT 1;
$$;

-- ═════════════════════════════════════════════════════
-- 4. handle_new_user trigger — write position_id instead of role
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

  INSERT INTO public.profiles (id, tenant_id, branch_id, role, position_id, full_name)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_role_text::public.staff_role,  -- still writes role until DROP phase
    v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- ═════════════════════════════════════════════════════
-- 5. admin_update_profile — rewrite using position
-- Drops BOTH old overloads (text + staff_role signatures)
-- ═════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, public.staff_role, bigint, boolean, text, text);
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, bigint, boolean, text, text);

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
  v_actor_id        UUID   := auth.uid();
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
    COALESCE(po.legacy_role_code, p.role::text) AS role_text
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

  -- Branch required for operational roles
  IF v_final_role IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
     AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  -- branch_kind compatibility
  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches WHERE id = v_final_branch AND tenant_id = v_actor_tenant;
    IF v_final_role IN ('cashier','waiter','chef','branch_manager')
       AND v_branch_kind IN ('warehouse','branch') THEN
      RAISE EXCEPTION 'operational roles cannot be assigned to warehouse/branch branch' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to warehouse branch' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'production_manager' AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'production_manager must be assigned to branch branch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Actor privilege gates
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

  -- Resolve new position_id from final role string
  v_final_position := public._auth_v2_position_id_from_role(v_final_role, v_actor_tenant);

  -- Apply update (both role + position_id for transition safety)
  UPDATE public.profiles SET
    full_name   = COALESCE(p_full_name, full_name),
    phone       = COALESCE(p_phone,     phone),
    role        = v_final_role::public.staff_role,
    position_id = v_final_position,
    branch_id   = v_final_branch,
    is_active   = COALESCE(p_is_active, is_active),
    updated_at  = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  -- Sync raw_app_meta_data for JWT hint
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

-- ═════════════════════════════════════════════════════
-- 6. Replace chk_branch_required_for_ops
--    New logic: driven by position.legacy_role_code (equivalent of role check)
--    Uses position_id → positions.legacy_role_code where operational roles need branch.
-- ═════════════════════════════════════════════════════
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_branch_required_for_ops;

-- Re-add using legacy_role_code via subquery — but CHECK can't reference other tables.
-- Instead: duplicate the check via a trigger.
CREATE OR REPLACE FUNCTION public._auth_v2_check_branch_required()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
BEGIN
  SELECT legacy_role_code INTO v_code
  FROM public.positions WHERE id = NEW.position_id;

  IF v_code IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
     AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role: position=%', v_code
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_branch_required ON public.profiles;
CREATE TRIGGER trg_profiles_branch_required
  BEFORE INSERT OR UPDATE OF position_id, branch_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._auth_v2_check_branch_required();
