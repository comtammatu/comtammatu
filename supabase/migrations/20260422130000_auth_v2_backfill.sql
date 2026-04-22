-- =============================================================
-- Auth v2 — M2: Backfill profiles.role → position_id + staff_permissions
-- Idempotent: uses ON CONFLICT DO NOTHING; safe to re-run.
--
-- Role → Position code map:
--   owner              → owner              (tenant-wide)
--   super_manager      → super_manager      (tenant-wide)
--   area_manager       → quan_ly_vung       (per-branch via area_branches)
--   branch_manager     → quan_ly_CN         (per-branch at profiles.branch_id)
--   warehouse_manager  → kho_truong         (per-branch at profiles.branch_id)
--   production_manager → bep_truong         (per-branch at profiles.branch_id)
--   cashier            → cashier            (per-branch)
--   waiter             → waiter             (per-branch)
--   chef               → chef               (per-branch)
--   office             → office             (tenant-wide)
-- =============================================================

-- Map legacy role → position code
CREATE OR REPLACE FUNCTION public._auth_v2_role_to_position(p_role TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_role
    WHEN 'owner'              THEN 'owner'
    WHEN 'super_manager'      THEN 'super_manager'
    WHEN 'area_manager'       THEN 'quan_ly_vung'
    WHEN 'branch_manager'     THEN 'quan_ly_CN'
    WHEN 'warehouse_manager'  THEN 'kho_truong'
    WHEN 'production_manager' THEN 'bep_truong'
    WHEN 'cashier'            THEN 'cashier'
    WHEN 'waiter'             THEN 'waiter'
    WHEN 'chef'               THEN 'chef'
    WHEN 'office'             THEN 'office'
    ELSE NULL
  END;
$$;

-- Tenant-wide roles: permission.branch_id = NULL
CREATE OR REPLACE FUNCTION public._auth_v2_is_tenant_wide_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_role IN ('owner', 'super_manager', 'office');
$$;

-- =====================
-- Main backfill RPC
-- =====================
CREATE OR REPLACE FUNCTION public.backfill_permissions_from_role()
RETURNS TABLE (
  total_profiles        INTEGER,
  positions_set         INTEGER,
  perm_rows_inserted    INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile          RECORD;
  v_position_code    TEXT;
  v_position_id      BIGINT;
  v_template         RECORD;
  v_perm_key         TEXT;
  v_branch_for_grant BIGINT;
  v_area_branch      RECORD;
  v_total_profiles   INTEGER := 0;
  v_positions_set    INTEGER := 0;
  v_perm_inserted    INTEGER := 0;
  v_rows_affected    INTEGER;
BEGIN
  -- Iterate all active profiles with a non-null legacy role
  FOR v_profile IN
    SELECT p.id AS user_id, p.tenant_id, p.branch_id, p.role::text AS role
    FROM public.profiles p
    WHERE p.role IS NOT NULL
      AND p.is_active = TRUE
  LOOP
    v_total_profiles := v_total_profiles + 1;

    v_position_code := public._auth_v2_role_to_position(v_profile.role);
    IF v_position_code IS NULL THEN
      CONTINUE;
    END IF;

    -- Resolve position_id within tenant
    SELECT id INTO v_position_id
    FROM public.positions
    WHERE tenant_id = v_profile.tenant_id AND code = v_position_code
    LIMIT 1;

    IF v_position_id IS NULL THEN
      RAISE WARNING 'position % not seeded for tenant %', v_position_code, v_profile.tenant_id;
      CONTINUE;
    END IF;

    -- Set position_id on profile (only if NULL → idempotent)
    UPDATE public.profiles
    SET position_id = v_position_id
    WHERE id = v_profile.user_id AND position_id IS NULL;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    v_positions_set := v_positions_set + v_rows_affected;

    -- Load matching role_template for this tenant
    SELECT rt.id, rt.permission_keys
    INTO v_template
    FROM public.role_templates rt
    WHERE rt.tenant_id = v_profile.tenant_id
      AND rt.position_code = v_position_code
    LIMIT 1;

    IF v_template.permission_keys IS NULL THEN
      RAISE WARNING 'role_template missing for position=% tenant=%', v_position_code, v_profile.tenant_id;
      CONTINUE;
    END IF;

    -- ============
    -- Grant rows
    -- ============
    IF v_profile.role = 'area_manager' THEN
      -- Area manager: grant per branch in their area
      FOR v_area_branch IN
        SELECT ab.branch_id
        FROM public.area_branches ab
        JOIN public.profiles p ON p.id = v_profile.user_id
        JOIN public.areas a ON a.tenant_id = p.tenant_id
        WHERE ab.tenant_id = v_profile.tenant_id
          AND ab.area_id = a.id
          AND a.id = (SELECT area_id FROM public.profiles WHERE id = v_profile.user_id)
      LOOP
        FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
          INSERT INTO public.staff_permissions (
            user_id, tenant_id, branch_id, permission_key, source_template
          ) VALUES (
            v_profile.user_id, v_profile.tenant_id, v_area_branch.branch_id, v_perm_key, v_template.id
          ) ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
          v_perm_inserted := v_perm_inserted + v_rows_affected;
        END LOOP;
      END LOOP;

    ELSIF public._auth_v2_is_tenant_wide_role(v_profile.role) THEN
      -- Tenant-wide: branch_id = NULL
      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        INSERT INTO public.staff_permissions (
          user_id, tenant_id, branch_id, permission_key, source_template
        ) VALUES (
          v_profile.user_id, v_profile.tenant_id, NULL, v_perm_key, v_template.id
        ) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        v_perm_inserted := v_perm_inserted + v_rows_affected;
      END LOOP;

    ELSE
      -- Branch-scoped: use profiles.branch_id
      v_branch_for_grant := v_profile.branch_id;
      IF v_branch_for_grant IS NULL THEN
        RAISE WARNING 'user % has role % but no branch_id; skipping branch-scoped grants',
          v_profile.user_id, v_profile.role;
        CONTINUE;
      END IF;

      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        INSERT INTO public.staff_permissions (
          user_id, tenant_id, branch_id, permission_key, source_template
        ) VALUES (
          v_profile.user_id, v_profile.tenant_id, v_branch_for_grant, v_perm_key, v_template.id
        ) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        v_perm_inserted := v_perm_inserted + v_rows_affected;
      END LOOP;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_total_profiles, v_positions_set, v_perm_inserted;
END;
$$;

COMMENT ON FUNCTION public.backfill_permissions_from_role() IS
  'M2 backfill. Idempotent: only inserts missing perm rows and only sets position_id where NULL. Safe to re-run.';

-- Restrict: only service_role / migration context runs this
REVOKE EXECUTE ON FUNCTION public.backfill_permissions_from_role() FROM PUBLIC;

-- =====================
-- EXECUTE backfill now (runs as migration owner ⇒ has privileges)
-- =====================
DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM public.backfill_permissions_from_role();
  RAISE NOTICE 'Auth v2 backfill: profiles=%, positions_set=%, perms_inserted=%',
    v_result.total_profiles, v_result.positions_set, v_result.perm_rows_inserted;
END $$;
