-- =============================================================
-- Auth v2 — M4b.1: Template fixes + additive grant sync
--
-- cashier template was missing `orders:write` and `orders:void`; real
-- cashiers take orders and occasionally void their own. Add them, then
-- grant any missing rows to existing cashier users (additive — never
-- removes extras granted manually).
-- =============================================================

-- Update cashier templates across tenants
UPDATE public.role_templates
SET permission_keys = ARRAY(
  SELECT DISTINCT unnest(permission_keys || ARRAY['orders:write', 'orders:void']::TEXT[])
),
    updated_at = now()
WHERE position_code = 'cashier' AND is_system = TRUE;

-- Update waiter templates: add orders:void (waiter can void own order in VN restaurants)
UPDATE public.role_templates
SET permission_keys = ARRAY(
  SELECT DISTINCT unnest(permission_keys || ARRAY['orders:void']::TEXT[])
),
    updated_at = now()
WHERE position_code = 'waiter' AND is_system = TRUE;

-- ────────────────────────────────────────────────────────────
-- Sync missing grants: for each active profile, insert any permission
-- row present in their template but missing from staff_permissions.
-- Idempotent: ON CONFLICT DO NOTHING.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template()
RETURNS TABLE (rows_added INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile       RECORD;
  v_position_code TEXT;
  v_template      RECORD;
  v_perm_key      TEXT;
  v_branch        BIGINT;
  v_ab            RECORD;
  v_added         INTEGER := 0;
  v_rows          INTEGER;
BEGIN
  FOR v_profile IN
    SELECT p.id AS user_id, p.tenant_id, p.branch_id, p.role::text AS role, p.position_id
    FROM public.profiles p
    WHERE p.is_active = TRUE AND p.role IS NOT NULL
  LOOP
    v_position_code := public._auth_v2_role_to_position(v_profile.role);
    IF v_position_code IS NULL THEN
      CONTINUE;
    END IF;

    SELECT rt.id, rt.permission_keys INTO v_template
    FROM public.role_templates rt
    WHERE rt.tenant_id = v_profile.tenant_id
      AND rt.position_code = v_position_code
    LIMIT 1;

    IF v_template.permission_keys IS NULL THEN
      CONTINUE;
    END IF;

    IF v_profile.role = 'area_manager' THEN
      FOR v_ab IN
        SELECT ab.branch_id
        FROM public.area_branches ab
        JOIN public.profiles p ON p.id = v_profile.user_id
        WHERE ab.tenant_id = v_profile.tenant_id
          AND ab.area_id = p.area_id
      LOOP
        FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
          INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
          VALUES (v_profile.user_id, v_profile.tenant_id, v_ab.branch_id, v_perm_key, v_template.id)
          ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          v_added := v_added + v_rows;
        END LOOP;
      END LOOP;
    ELSIF public._auth_v2_is_tenant_wide_role(v_profile.role) THEN
      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
        VALUES (v_profile.user_id, v_profile.tenant_id, NULL, v_perm_key, v_template.id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_added := v_added + v_rows;
      END LOOP;
    ELSE
      v_branch := v_profile.branch_id;
      IF v_branch IS NULL THEN CONTINUE; END IF;
      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
        VALUES (v_profile.user_id, v_profile.tenant_id, v_branch, v_perm_key, v_template.id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_added := v_added + v_rows;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_added;
END;
$$;

COMMENT ON FUNCTION public.sync_missing_permissions_from_template() IS
  'Additive backfill: inserts template rows missing from staff_permissions. Never removes. Safe to run anytime after a template edit.';

REVOKE EXECUTE ON FUNCTION public.sync_missing_permissions_from_template() FROM PUBLIC;

-- Run once
DO $$
DECLARE v_res RECORD;
BEGIN
  SELECT * INTO v_res FROM public.sync_missing_permissions_from_template();
  RAISE NOTICE 'M4b.1 grant sync: rows_added=%', v_res.rows_added;
END $$;
