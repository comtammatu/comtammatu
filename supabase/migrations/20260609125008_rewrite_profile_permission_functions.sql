-- Rewrite profile and permission helpers onto positions.code mapping.

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
  SELECT po.id
  FROM public.positions po
  WHERE po.tenant_id = p_tenant
    AND COALESCE(po.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) = p_access_bucket
  ORDER BY
    CASE po.code
      WHEN 'owner' THEN 0
      WHEN 'super_manager' THEN 0
      WHEN 'branch_manager' THEN 0
      WHEN 'quan_ly_CN' THEN 1
      WHEN 'warehouse_head' THEN 0
      WHEN 'kho_truong' THEN 1
      WHEN 'warehouse_keeper' THEN 2
      WHEN 'thu_kho' THEN 3
      WHEN 'head_chef' THEN 0
      WHEN 'bep_truong' THEN 1
      WHEN 'chef' THEN 0
      WHEN 'phu_bep' THEN 1
      WHEN 'cashier' THEN 0
      WHEN 'waiter' THEN 0
      WHEN 'office' THEN 0
      WHEN 'ke_toan' THEN 1
      WHEN 'ke_toan_truong' THEN 2
      ELSE 9
    END,
    po.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.position_id_from_access_bucket(text, bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_access_bucket text;
  v_position_id bigint;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
  );
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_access_bucket := COALESCE(
    NEW.raw_app_meta_data ->> 'access_bucket',
    NEW.raw_app_meta_data ->> 'user_role',
    NEW.raw_app_meta_data ->> 'role',
    'owner'
  );
  v_position_id := public.position_id_from_access_bucket(v_access_bucket, v_tenant_id);

  IF v_position_id IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for access_bucket=% tenant=%',
      v_access_bucket, v_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant bigint;
  v_actor_role_text text;
  v_actor_branch bigint;
  v_target record;
  v_target_role text;
  v_final_role text;
  v_final_branch bigint;
  v_final_position bigint;
  v_final_position_code text;
  v_branch_kind text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    p.tenant_id,
    private.staff_role_from_position_code(po.code) AS role_text,
    p.branch_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL OR v_actor_role_text IS NULL THEN
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
    'owner',
    'super_manager',
    'branch_manager',
    'warehouse_manager',
    'production_manager',
    'cashier',
    'waiter',
    'chef',
    'office'
  ) THEN
    RAISE EXCEPTION 'invalid_access_bucket: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id,
    p.branch_id,
    p.full_name,
    p.phone,
    p.tenant_id,
    p.position_id,
    private.staff_role_from_position_code(po.code) AS role_text
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po
    ON po.id = p.position_id
   AND po.tenant_id = p.tenant_id
  WHERE p.id = p_target_id
    AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  v_target_role := v_target.role_text;
  v_final_role := COALESCE(p_role, v_target_role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  IF v_final_role IN (
    'cashier',
    'waiter',
    'chef',
    'branch_manager',
    'warehouse_manager',
    'production_manager'
  )
  AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind
    INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch
      AND tenant_id = v_actor_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;

    IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
       AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'operational positions must be assigned to branch site' USING ERRCODE = 'P0001';
    END IF;

    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'central_warehouse' THEN
      RAISE EXCEPTION 'warehouse position must be assigned to central_warehouse branch' USING ERRCODE = 'P0001';
    END IF;

    IF v_final_role = 'production_manager' AND v_branch_kind <> 'central_kitchen' THEN
      RAISE EXCEPTION 'production position must be assigned to central_kitchen branch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'super_manager' THEN
    IF v_target_role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager_cannot_modify_owner' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_target_not_in_branch' USING ERRCODE = '42501';
    END IF;

    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager_cannot_modify_peer' USING ERRCODE = '42501';
    END IF;

    IF v_final_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager_can_only_assign_branch_staff' USING ERRCODE = '42501';
    END IF;

    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_cannot_reassign_branch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient_privileges_for_profile_management' USING ERRCODE = '42501';
  END IF;

  v_final_position := public.position_id_from_access_bucket(v_final_role, v_actor_tenant);

  IF v_final_position IS NULL THEN
    RAISE EXCEPTION
      'admin_update_profile: position_not_resolved for access_bucket=% tenant=%',
      v_final_role, v_actor_tenant
      USING ERRCODE = 'P0001';
  END IF;

  SELECT po.code
  INTO v_final_position_code
  FROM public.positions po
  WHERE po.id = v_final_position
    AND po.tenant_id = v_actor_tenant;

  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    position_id = v_final_position,
    branch_id = v_final_branch,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_target_id
    AND tenant_id = v_actor_tenant;

  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
      'user_role', v_final_role,
      'role', v_final_role,
      'access_bucket', v_final_role,
      'position', v_final_position_code,
      'position_code', v_final_position_code,
      'branch_id', v_final_branch
    )
  WHERE id = p_target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template()
RETURNS TABLE(rows_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_profile record;
  v_template record;
  v_perm_key text;
  v_branch bigint;
  v_added integer := 0;
  v_rows integer;
BEGIN
  FOR v_profile IN
    SELECT
      p.id AS user_id,
      p.tenant_id,
      p.branch_id,
      pos.code AS position_code,
      private.staff_role_from_position_code(pos.code) AS access_bucket
    FROM public.profiles p
    JOIN public.positions pos
      ON pos.id = p.position_id
     AND pos.tenant_id = p.tenant_id
    WHERE p.is_active = true
      AND p.position_id IS NOT NULL
  LOOP
    IF v_profile.access_bucket IS NULL THEN
      CONTINUE;
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

    IF v_profile.access_bucket IN ('owner', 'super_manager') THEN
      v_branch := NULL;
    ELSE
      v_branch := v_profile.branch_id;
      IF v_branch IS NULL THEN
        CONTINUE;
      END IF;
    END IF;

    FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
      INSERT INTO public.staff_permissions (
        user_id,
        tenant_id,
        branch_id,
        permission_key,
        source_template
      )
      VALUES (
        v_profile.user_id,
        v_profile.tenant_id,
        v_branch,
        v_perm_key,
        v_template.id
      )
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_added := v_added + v_rows;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_added;
END;
$$;
