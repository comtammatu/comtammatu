-- Remove the super_manager access bucket — fold into owner.
--
-- Owner decision 2026-06-13 (D018, supersedes the super_manager mention in
-- D017): the single Hộ Kinh Doanh does not need a second tenant-admin tier.
-- `super_manager` ("Giám đốc điều hành") is removed and folded into `owner`.
-- `owner` already appears in every allowedRoles / RLS list that contained
-- `super_manager`, so removing super_manager from those lists drops no access;
-- the one prod user holding it is reassigned to `owner` (full bypass).
--
-- Prod state at authoring (SELECT-only verify): 1 profile, 1 role_template,
-- 83 notifications, 1 auth.users metadata row carry super_manager.
--
-- TS twins edited in the SAME PR: ACCESS_BUCKETS + POSITION_CODE_TO_STAFF_ROLE
-- + role-constant arrays (packages/shared/src/auth/types.ts) and the 16
-- module-acl allowedRoles lists.
--
-- SCOPE / residue note: this migration makes super_manager UNREACHABLE
-- (no position, no template, no user metadata, mapper returns NULL). Inline
-- `auth_role() IN ('owner','super_manager',...)` lists across other RLS
-- policies + the `admin_update_profile` / `toggle_profile_active` /
-- `stock_transfer_list_branches` actor-role branches still contain the literal
-- 'super_manager' — these are now DEAD (no user can resolve to it), exactly as
-- the other already-retired intermediate-scope role strings are. A dedicated
-- dead-role-string cleanup migration (covering super_manager and the other
-- retired role tokens) is the safe follow-up; it is intentionally NOT bundled
-- here to avoid re-creating dozens of policies in one pass. See tasks/todo.md.
--
-- Data + function bodies only; no schema DDL → no `pnpm db:types`. Replayable:
-- every data step is a no-op on an empty DB; the final DO block self-checks and
-- RAISEs (rollback) if any super_manager residue survives or any profile maps
-- to a NULL access bucket (which would brick logins via the auth hook).

BEGIN;

-- ─── S1. Reassign the lone super_manager profile(s) -> owner ────────────────

UPDATE public.profiles p
SET position_id = own.id, updated_at = now()
FROM public.positions sm
JOIN public.positions own
  ON own.tenant_id = sm.tenant_id AND own.code = 'owner'
WHERE p.position_id = sm.id
  AND sm.code = 'super_manager'
  AND p.tenant_id = sm.tenant_id;

-- ─── S2. Drop the super_manager role_template ──────────────────────────────
-- Seeded grants live in staff_permissions (FK source_template ON DELETE SET
-- NULL); the reassigned user is now owner = has_permission bypass, so no grant
-- loss.

DELETE FROM public.role_templates WHERE position_code = 'super_manager';

-- ─── S3. Drop the super_manager position ───────────────────────────────────
-- profiles.position_id FK is ON DELETE RESTRICT; S1 must have repointed every
-- profile first, else this RAISEs and rolls back the whole transaction.

DELETE FROM public.positions WHERE code = 'super_manager';

-- ─── S4. notifications.target_roles: super_manager -> owner ─────────────────
-- array_agg(DISTINCT ...) dedupes when owner is already in the array; CHECK
-- array_length >= 1 cannot be violated (input array is non-empty).

UPDATE public.notifications n
SET target_roles = sub.new_roles
FROM (
  SELECT n2.id,
         array_agg(DISTINCT CASE WHEN r.role = 'super_manager' THEN 'owner' ELSE r.role END) AS new_roles
  FROM public.notifications n2
  CROSS JOIN LATERAL unnest(n2.target_roles) AS r(role)
  WHERE 'super_manager' = ANY (n2.target_roles)
  GROUP BY n2.id
) sub
WHERE n.id = sub.id;

-- ─── S5. auth.users.raw_app_meta_data: super_manager -> owner ──────────────
-- Secondary (custom_access_token_hook recomputes claims from profiles each
-- token issue) but admin_update_profile writes here directly, so keep honest.
-- Per-key updates (not a blanket overwrite) so only the matching key flips.

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('position', 'owner')
WHERE u.raw_app_meta_data->>'position' = 'super_manager';

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('position_code', 'owner')
WHERE u.raw_app_meta_data->>'position_code' = 'super_manager';

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('role', 'owner')
WHERE u.raw_app_meta_data->>'role' = 'super_manager';

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('user_role', 'owner')
WHERE u.raw_app_meta_data->>'user_role' = 'super_manager';

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('access_bucket', 'owner')
WHERE u.raw_app_meta_data->>'access_bucket' = 'super_manager';

-- ─── S6. Mapper functions: drop the super_manager branch ───────────────────
-- TS twins: POSITION_CODE_TO_STAFF_ROLE + ACCESS_BUCKETS.

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner'              THEN 'owner'
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'warehouse_manager'  THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    WHEN 'head_chef'          THEN 'production_manager'
    WHEN 'kitchen_helper'     THEN 'chef'
    WHEN 'chef'               THEN 'chef'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
    WHEN 'office'             THEN 'office'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.auth_role_to_position(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_role
    WHEN 'owner'              THEN 'owner'
    WHEN 'branch_manager'     THEN 'branch_manager'
    WHEN 'warehouse_manager'  THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'head_chef'
    WHEN 'head_chef'          THEN 'head_chef'
    WHEN 'kitchen_helper'     THEN 'kitchen_helper'
    WHEN 'chef'               THEN 'chef'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
    WHEN 'office'             THEN 'office'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.position_id_from_access_bucket(
  p_access_bucket text,
  p_tenant bigint
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH resolved AS (
    SELECT
      public.auth_role_to_position(p_access_bucket) AS preferred_position_code,
      COALESCE(
        private.staff_role_from_position_code(public.auth_role_to_position(p_access_bucket)),
        p_access_bucket
      ) AS access_bucket
  )
  SELECT po.id
  FROM public.positions po
  CROSS JOIN resolved r
  WHERE po.tenant_id = p_tenant
    AND COALESCE(po.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) = r.access_bucket
  ORDER BY
    CASE WHEN po.code = r.preferred_position_code THEN -1 ELSE 0 END,
    CASE po.code
      WHEN 'owner'              THEN 0
      WHEN 'branch_manager'     THEN 0
      WHEN 'warehouse_manager'  THEN 0
      WHEN 'head_chef'          THEN 0
      WHEN 'chef'               THEN 0
      WHEN 'cashier'            THEN 0
      WHEN 'waiter'             THEN 0
      WHEN 'office'             THEN 0
      WHEN 'kitchen_helper'     THEN 1
      WHEN 'production_manager' THEN 1
      ELSE 9
    END,
    po.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_role_from_position_code(text)
  TO service_role;
REVOKE ALL ON FUNCTION public.auth_role_to_position(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text)
  TO service_role;
REVOKE ALL ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  TO service_role;

COMMENT ON FUNCTION private.staff_role_from_position_code(text) IS
  'SQL twin of POSITION_CODE_TO_STAFF_ROLE (packages/shared/src/auth/types.ts). Canonical English codes only (10) — no aliases, no super_manager. ELSE NULL is fail-closed: auth hook RAISEs on unknown codes.';

-- ─── S7. notifications_select policy: drop super_manager from HQ branch ─────

ALTER POLICY notifications_select ON public.notifications
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_role() = ANY (target_roles)
  AND (
    target_branch_id IS NULL
    OR target_branch_id = public.auth_branch_id()
    OR public.auth_role() = ANY (ARRAY['owner'::text])
  )
);

-- ─── S8. Self-check — fail = rollback the whole transaction ────────────────

DO $$
DECLARE
  v_count integer;
  v_tenant bigint;
  v_bucket text;
BEGIN
  -- no position / template carries super_manager
  SELECT count(*) INTO v_count FROM public.positions WHERE code = 'super_manager';
  IF v_count > 0 THEN RAISE EXCEPTION 'positions still carry super_manager (%)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.role_templates WHERE position_code = 'super_manager';
  IF v_count > 0 THEN RAISE EXCEPTION 'role_templates still carry super_manager (%)', v_count; END IF;

  -- every profile (incl. inactive) still maps to a non-NULL bucket
  SELECT count(*) INTO v_count
  FROM public.profiles p JOIN public.positions po ON po.id = p.position_id
  WHERE private.staff_role_from_position_code(po.code) IS NULL;
  IF v_count > 0 THEN RAISE EXCEPTION '% profiles map to NULL access bucket — would brick logins', v_count; END IF;

  -- no notifications / auth metadata residue
  SELECT count(*) INTO v_count FROM public.notifications WHERE 'super_manager' = ANY (target_roles);
  IF v_count > 0 THEN RAISE EXCEPTION '% notifications still target super_manager', v_count; END IF;

  SELECT count(*) INTO v_count FROM auth.users u
  WHERE u.raw_app_meta_data->>'position' = 'super_manager'
     OR u.raw_app_meta_data->>'position_code' = 'super_manager'
     OR u.raw_app_meta_data->>'role' = 'super_manager'
     OR u.raw_app_meta_data->>'user_role' = 'super_manager'
     OR u.raw_app_meta_data->>'access_bucket' = 'super_manager';
  IF v_count > 0 THEN RAISE EXCEPTION '% auth.users rows still carry super_manager metadata', v_count; END IF;

  -- each remaining operational bucket still resolves to a position on every
  -- tenant that has positions (new-user creation path must not break)
  FOR v_tenant IN SELECT DISTINCT tenant_id FROM public.positions LOOP
    FOREACH v_bucket IN ARRAY ARRAY[
      'owner', 'branch_manager', 'warehouse_manager',
      'production_manager', 'chef', 'cashier', 'waiter', 'office'
    ] LOOP
      IF public.position_id_from_access_bucket(v_bucket, v_tenant) IS NULL THEN
        RAISE EXCEPTION 'bucket % cannot resolve a position for tenant %', v_bucket, v_tenant;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
