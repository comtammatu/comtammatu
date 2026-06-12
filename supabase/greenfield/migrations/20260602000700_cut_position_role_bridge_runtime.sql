-- GREENFIELD_ONLY: rehearsal SQL for staging jmasiwuqiyedqvyfzhuq; not part of supabase/migrations.
-- =============================================================
-- Greenfield PBAC cleanup: derive runtime role buckets from positions.code.
--
-- The app still receives a user_role claim because route ACL and existing
-- shells consume that StaffRole bucket. The source of that bucket is now the
-- canonical HR position code plus an explicit mapping function.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(
  p_position_code TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_position_code
    WHEN 'owner'             THEN 'owner'
    WHEN 'super_manager'     THEN 'super_manager'
    WHEN 'executive_assistant' THEN 'super_manager'
    WHEN 'area_manager'      THEN 'area_manager'
    WHEN 'branch_manager'    THEN 'branch_manager'
    WHEN 'chief_accountant'  THEN 'office'
    WHEN 'accountant'        THEN 'office'
    WHEN 'office'            THEN 'office'
    WHEN 'warehouse_head'    THEN 'warehouse_manager'
    WHEN 'warehouse_keeper'  THEN 'warehouse_manager'
    WHEN 'head_chef'         THEN 'production_manager'
    WHEN 'chef'              THEN 'chef'
    WHEN 'kitchen_helper'    THEN 'chef'
    WHEN 'cashier'           THEN 'cashier'
    WHEN 'waiter'            THEN 'waiter'
    WHEN 'warehouse_manager' THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(TEXT)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.staff_role_from_position_code(TEXT) IS
  'Maps canonical HR position codes to the StaffRole bucket still emitted for route ACL compatibility.';

DO $$
DECLARE
  v_unresolved_count INT;
BEGIN
  SELECT COUNT(*)
    INTO v_unresolved_count
    FROM public.profiles p
    JOIN public.positions po ON po.id = p.position_id
   WHERE COALESCE(p.is_active, TRUE) = TRUE
     AND private.staff_role_from_position_code(po.code) IS NULL;

  IF v_unresolved_count > 0 THEN
    RAISE EXCEPTION
      'position role cleanup pre-flight: % active profile(s) have position codes that do not map to a StaffRole bucket. Inspect active profiles joined to positions before applying.',
      v_unresolved_count
      USING ERRCODE = 'P0001';
  END IF;
END$$;

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
    p.area_id,
    private.staff_role_from_position_code(po.code) AS user_role,
    po.code AS position_code
  INTO user_profile
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = (event ->> 'user_id')::uuid
  LIMIT 1;

  IF user_profile.tenant_id IS NOT NULL THEN
    IF user_profile.user_role IS NULL THEN
      RAISE EXCEPTION
        'custom_access_token_hook: position_role_not_resolved for position=% tenant=%',
        user_profile.position_code, user_profile.tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', user_profile.tenant_id,
        'branch_id', user_profile.branch_id,
        'area_id', user_profile.area_id,
        'user_role', user_profile.user_role,
        'position', user_profile.position_code
      )
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB)
  TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.custom_access_token_hook(JSONB) IS
  'Auth hook emits tenant/branch/area plus position and a StaffRole bucket derived from positions.code.';

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT private.staff_role_from_position_code(po.code)
        FROM public.profiles p
        JOIN public.positions po ON po.id = p.position_id
       WHERE p.id = auth.uid()
       LIMIT 1
    ),
    'unassigned'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.auth_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;

COMMENT ON FUNCTION public.auth_role() IS
  'Compatibility helper: returns the StaffRole bucket derived from positions.code for the caller.';

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
  v_actor_id             UUID := auth.uid();
  v_actor_tenant         BIGINT;
  v_actor_role_text      TEXT;
  v_actor_branch         BIGINT;
  v_actor_area           BIGINT;
  v_target               RECORD;
  v_target_role          TEXT;
  v_final_role           TEXT;
  v_final_branch         BIGINT;
  v_final_position       BIGINT;
  v_final_position_code  TEXT;
  v_branch_kind          TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    p.tenant_id,
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned') AS role_text,
    p.branch_id,
    p.area_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch, v_actor_area
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;

  IF (p_role IS NOT NULL OR p_branch_id IS NOT NULL)
     AND NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN (
    'owner','super_manager','area_manager','branch_manager',
    'warehouse_manager','production_manager','cashier','waiter','chef','office'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned') AS role_text
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
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
    FROM public.branches
    WHERE id = v_final_branch AND tenant_id = v_actor_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;

    IF v_final_role IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
       AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'operational roles must be assigned to branch site' USING ERRCODE = 'P0001';
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

  IF v_final_position IS NULL THEN
    RAISE EXCEPTION
      'admin_update_profile: position_not_resolved for role=% tenant=% - verify positions seeded',
      v_final_role, v_actor_tenant
      USING ERRCODE = 'P0001';
  END IF;

  SELECT code INTO v_final_position_code
    FROM public.positions
   WHERE id = v_final_position
     AND tenant_id = v_actor_tenant;

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
    SET raw_app_meta_data = raw_app_meta_data ||
      jsonb_build_object(
        'user_role', v_final_role,
        'role', v_final_role,
        'position', v_final_position_code
      )
    WHERE id = p_target_id;
  END IF;
  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) IS
  'Staff profile update RPC. SECURITY DEFINER with staff:manage plus staff:assign_position gate; role hierarchy derives from positions.code.';

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_actor_role    TEXT;
  v_actor_tenant  BIGINT;
  v_actor_branch  BIGINT;
  v_actor_area    BIGINT;
  v_target_role   TEXT;
  v_target_branch BIGINT;
  v_target_active BOOLEAN;
  v_new_state     BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    COALESCE(private.staff_role_from_position_code(po.code), 'unassigned') AS role_text,
    p.tenant_id,
    p.branch_id,
    p.area_id
  INTO v_actor_role, v_actor_tenant, v_actor_branch, v_actor_area
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned'),
         p.branch_id,
         p.is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles p
    JOIN public.positions po ON po.id = p.position_id
    WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;

  IF v_actor_role = 'owner' THEN
    NULL;
  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target_role = 'owner' THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
    IF v_target_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area';
      END IF;
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

  UPDATE public.profiles
    SET is_active = NOT is_active
    WHERE id = p_target_id AND tenant_id = v_actor_tenant
    RETURNING is_active INTO v_new_state;

  RETURN v_new_state;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_profile_active(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_profile_active(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.toggle_profile_active(UUID) IS
  'Staff active-state toggle RPC. SECURITY DEFINER with staff:manage gate; role hierarchy derives from positions.code.';

CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template()
RETURNS TABLE(rows_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile RECORD;
  v_template RECORD;
  v_perm_key TEXT;
  v_branch BIGINT;
  v_ab RECORD;
  v_added INTEGER := 0;
  v_rows INTEGER;
  v_effective_branch_id BIGINT;
BEGIN
  FOR v_profile IN
    SELECT p.id AS user_id,
           p.tenant_id,
           p.branch_id,
           p.area_id,
           pos.code AS position_code,
           private.staff_role_from_position_code(pos.code) AS role
      FROM public.profiles p
      JOIN public.positions pos ON pos.id = p.position_id
     WHERE p.is_active = TRUE
       AND p.position_id IS NOT NULL
  LOOP
    IF v_profile.role IS NULL THEN
      RAISE EXCEPTION
        'sync_missing_permissions_from_template: position_role_not_resolved for position=% tenant=%',
        v_profile.position_code, v_profile.tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    SELECT rt.id, rt.permission_keys
      INTO v_template
      FROM public.role_templates rt
     WHERE rt.tenant_id = v_profile.tenant_id
       AND rt.position_code = v_profile.position_code
     LIMIT 1;

    IF v_template.permission_keys IS NULL THEN
      CONTINUE;
    END IF;

    IF v_profile.role = 'area_manager' THEN
      FOR v_ab IN
        SELECT ab.branch_id
          FROM public.area_branches ab
         WHERE ab.tenant_id = v_profile.tenant_id
           AND ab.area_id = v_profile.area_id
      LOOP
        FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
          v_effective_branch_id := private.staff_permission_effective_branch_id(v_perm_key, v_ab.branch_id);
          INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
          VALUES (v_profile.user_id, v_profile.tenant_id, v_effective_branch_id, v_perm_key, v_template.id)
          ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          v_added := v_added + v_rows;
        END LOOP;
      END LOOP;
    ELSIF v_profile.role IN ('owner', 'super_manager', 'office') THEN
      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        v_effective_branch_id := private.staff_permission_effective_branch_id(v_perm_key, NULL);
        INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
        VALUES (v_profile.user_id, v_profile.tenant_id, v_effective_branch_id, v_perm_key, v_template.id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_added := v_added + v_rows;
      END LOOP;
    ELSE
      v_branch := v_profile.branch_id;
      IF v_branch IS NULL THEN
        CONTINUE;
      END IF;

      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        v_effective_branch_id := private.staff_permission_effective_branch_id(v_perm_key, v_branch);
        INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
        VALUES (v_profile.user_id, v_profile.tenant_id, v_effective_branch_id, v_perm_key, v_template.id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_added := v_added + v_rows;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_added;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_missing_permissions_from_template()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_missing_permissions_from_template()
  TO service_role;
