-- =============================================================
-- Auth v3 — H3a: profiles.position_id integrity invariant
--
-- Driver: 4-agent security audit 2026-05-07. has_permission() owner-bypass
-- (`20260423040000_auth_v2_m5_hotfix_has_permission.sql:14-18,32-36,52-58`)
-- uses INNER JOIN positions — any profile with `position_id IS NULL` silently
-- loses owner status (returns false, not error). Combined with the M5 drop of
-- `profiles.role` (`20260423030000_auth_v2_m5_drop_legacy.sql:216`), there is
-- no fallback path: a missing position_id permanently demotes an owner.
--
-- This migration enforces the invariant "every profile has a position":
--   1. PRE-FLIGHT GATE: RAISE EXCEPTION if any profiles.position_id IS NULL.
--      Operator must decide remediation (backfill, deactivate, terminate)
--      BEFORE rerunning. Auto-assigning a sentinel hides the original
--      misconfiguration.
--   2. ALTER profiles.position_id SET NOT NULL (defense-in-depth).
--   3. FK ON DELETE: SET NULL → RESTRICT (block delete of a position still
--      assigned to active profiles; admin must reassign first).
--   4. handle_new_user: RAISE EXCEPTION when role string does not resolve to
--      a position_id (no silent NULL insert). Fail-fast over fallback —
--      'office' sentinel would mask root cause and is a privilege-escalation
--      vector for handle_new_user's `COALESCE(... 'owner')` default.
--   5. admin_update_profile: same defensive NULL check before UPDATE.
--
-- Out of scope (deferred to H3b):
--   - `tenants.representative`-based owner-bypass fallback. Existing column is
--     TEXT (legal name), not UUID. Adding a new `tenants.owner_user_id UUID`
--     requires ownership-semantics ADR + dedicated migration.
--   - JWT force-refresh for users with stale `user_role='office'` claim. Ops
--     procedure (Supabase Admin API signOut or wait for natural TTL).
--   - Changing handle_new_user default role from 'owner' → 'office' (low-
--     priority security hardening; not blocking H3a).
--
-- See: tasks/regressions.md PROFILES-POSITION-ID-MUST-NOT-NULL,
-- PLPGSQL-RECORD-IS-NOT-NULL (sibling rule).
-- =============================================================

-- ─── 1. PRE-FLIGHT AUDIT GATE ─────────────────────────────────
-- Refuse to apply if any profile has NULL position_id. Includes inactive
-- rows (M2 backfill `20260422130000` filtered is_active=TRUE only).
DO $$
DECLARE
  v_null_count INT;
  v_unseeded_tenants INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
    FROM public.profiles
   WHERE position_id IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'H3a pre-flight: % profile(s) have position_id IS NULL — backfill required before applying NOT NULL constraint. Inspect: SELECT id, tenant_id, branch_id, is_active FROM profiles WHERE position_id IS NULL;',
      v_null_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify every tenant has the 'owner' position seeded — handle_new_user
  -- defaults v_role_text='owner' so this position MUST exist for any tenant
  -- that may receive a signup post-migration.
  SELECT COUNT(*) INTO v_unseeded_tenants
    FROM public.tenants t
   WHERE NOT EXISTS (
     SELECT 1 FROM public.positions p
      WHERE p.tenant_id = t.id AND p.code = 'owner'
   );

  IF v_unseeded_tenants > 0 THEN
    RAISE EXCEPTION
      'H3a pre-flight: % tenant(s) missing position code=''owner'' — seed positions before applying. Inspect: SELECT t.id, t.slug FROM tenants t LEFT JOIN positions p ON p.tenant_id=t.id AND p.code=''owner'' WHERE p.id IS NULL;',
      v_unseeded_tenants
      USING ERRCODE = 'P0001';
  END IF;
END$$;

-- ─── 2. SET NOT NULL on profiles.position_id ──────────────────
ALTER TABLE public.profiles
  ALTER COLUMN position_id SET NOT NULL;

COMMENT ON COLUMN public.profiles.position_id IS
  'HR chức vụ — REQUIRED. NOT NULL since H3a (2026-05-07). FK ON DELETE RESTRICT — admin must reassign profiles before deleting a position. has_permission() owner-bypass relies on this invariant; NULL would silently demote owners. See regressions.md PROFILES-POSITION-ID-MUST-NOT-NULL.';

-- ─── 3. FK ON DELETE: SET NULL → RESTRICT ─────────────────────
-- Find current FK constraint name and replace.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'profiles'
     AND c.contype = 'f'
     AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES positions%';

  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'H3a: could not locate FK constraint on profiles.position_id → positions';
  END IF;

  EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_constraint_name);
END$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_position_id_fkey
    FOREIGN KEY (position_id)
    REFERENCES public.positions(id)
    ON DELETE RESTRICT;

-- ─── 4. handle_new_user: RAISE EXCEPTION on unresolved position ───
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

  -- H3a invariant: profiles.position_id is NOT NULL. Refuse to insert a
  -- broken row — surface the misconfiguration to the operator instead of
  -- silently demoting the new user (or — worse — auto-falling-back to
  -- 'office', which historically defaulted to 'owner' and would be a
  -- privilege-escalation vector via raw_app_meta_data role typos).
  IF v_position_id IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for role=% tenant=% — verify positions seeded for tenant + role string is one of (owner, super_manager, area_manager, branch_manager, warehouse_manager, production_manager, cashier, waiter, chef, office)',
      v_role_text, v_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
  VALUES (
    NEW.id, v_tenant_id, v_branch_id, v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth trigger — creates a profile row when an auth.users row is inserted. H3a: refuses to insert NULL position_id (RAISE EXCEPTION). Operator must seed positions before tenant signup or pass a valid role in raw_app_meta_data.';

-- ─── 5. admin_update_profile: defensive NULL check ────────────
-- Same NULL leak vector at line 189 of `20260423030000_auth_v2_m5_drop_legacy`:
-- v_final_position := _auth_v2_position_id_from_role(v_final_role, v_actor_tenant);
-- Could silently NULL out an active profile's position_id. Add explicit
-- guard before UPDATE so the migration's NOT NULL invariant cannot be
-- violated via this path.
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

  -- H3a invariant: refuse to UPDATE with NULL position_id. Operator must
  -- pass a valid role string OR seed the matching position for the tenant.
  IF v_final_position IS NULL THEN
    RAISE EXCEPTION
      'admin_update_profile: position_not_resolved for role=% tenant=% — verify positions seeded',
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
  'H3a: now refuses to UPDATE with NULL position_id (RAISE EXCEPTION). Caller must pass a valid role string mapped to a seeded position.';
