-- =============================================================
-- Auth v2 hotfix — sync_missing_permissions_from_template()
-- =============================================================
-- Bug: the RPC still references profiles.role which was dropped in M5 cleanup
-- (migration 20260423030000_auth_v2_m5_drop_legacy.sql). The function crashes
-- on any invocation with:
--   ERROR 42703: column p.role does not exist
--
-- Fix: derive legacy role from positions.legacy_role_code via profiles.position_id.
-- Semantics preserved end-to-end:
--   - Same branching: area_manager (per-branch via area_branches),
--     tenant-wide roles (branch_id = NULL), branch roles (profile's branch_id).
--   - Same helpers: _auth_v2_role_to_position(role), _auth_v2_is_tenant_wide_role(role).
--   - Same ON CONFLICT DO NOTHING idempotency.
--
-- Discovered during task α2 (bep_truong template fix) where the RPC failed
-- during backfill; α2 bypassed by inserting grants directly. This hotfix
-- restores the RPC so future template fixes can rely on it.
-- =============================================================

CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template()
RETURNS TABLE(rows_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    SELECT p.id           AS user_id,
           p.tenant_id,
           p.branch_id,
           p.area_id,
           pos.code        AS position_code,
           pos.legacy_role_code::text AS role,
           p.position_id
    FROM public.profiles p
    JOIN public.positions pos ON pos.id = p.position_id
    WHERE p.is_active = TRUE
      AND p.position_id IS NOT NULL
  LOOP
    -- position_code already known from join; keep mapping call as fallback
    -- for legacy mappings where legacy_role_code differs from code.
    v_position_code := COALESCE(
      v_profile.position_code,
      public._auth_v2_role_to_position(v_profile.role)
    );
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
        WHERE ab.tenant_id = v_profile.tenant_id
          AND ab.area_id   = v_profile.area_id
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
$function$;
