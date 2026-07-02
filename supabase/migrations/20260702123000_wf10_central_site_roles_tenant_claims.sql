-- WF-10 / D055: central-site operator roles keep tenant-level branch claims.

CREATE OR REPLACE FUNCTION public.check_branch_required() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_access_bucket text;
BEGIN
  SELECT private.staff_role_from_position_code(po.code)
  INTO v_access_bucket
  FROM public.positions po
  WHERE po.id = NEW.position_id
    AND po.tenant_id = NEW.tenant_id;

  IF v_access_bucket IN (
    'cashier',
    'chef',
    'branch_manager'
  )
  AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position: position_id=%', NEW.position_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_branch_required() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_branch_required() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_role text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_is_active boolean DEFAULT NULL::boolean
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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
  v_requested_code text;
  v_required_branch_kind text;
  v_branch_kind text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, private.staff_role_from_position_code(po.code), p.branch_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
  WHERE p.id = v_actor_id AND COALESCE(p.is_active, true) = true;
  IF NOT FOUND OR v_actor_tenant IS NULL OR v_actor_role_text IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;
  IF (p_role IS NOT NULL OR p_branch_id IS NOT NULL) AND NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
         po.code AS position_code,
         private.staff_role_from_position_code(po.code) AS role_text
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  v_target_role := v_target.role_text;
  v_requested_code := NULLIF(p_role, '');

  IF v_requested_code IS NULL THEN
    v_final_position := v_target.position_id;
    v_final_position_code := v_target.position_code;
    v_final_role := v_target_role;
  ELSE
    SELECT po.id, po.code, private.staff_role_from_position_code(po.code)
    INTO v_final_position, v_final_position_code, v_final_role
    FROM public.positions po
    WHERE po.tenant_id = v_actor_tenant
      AND po.code = v_requested_code
      AND COALESCE(po.is_active, true) = true
    LIMIT 1;

    IF v_final_position IS NULL THEN
      v_final_role := CASE WHEN v_requested_code = 'waiter' THEN 'cashier' ELSE v_requested_code END;
      IF v_final_role NOT IN ('owner','branch_manager','warehouse_manager','production_manager','cashier','chef','office') THEN
        RAISE EXCEPTION 'invalid_access_bucket: %', v_requested_code USING ERRCODE = '22023';
      END IF;
      v_final_position := public.position_id_from_access_bucket(v_final_role, v_actor_tenant);
      SELECT po.code INTO v_final_position_code
      FROM public.positions po
      WHERE po.id = v_final_position
        AND po.tenant_id = v_actor_tenant;
    END IF;
  END IF;

  IF v_final_position IS NULL OR v_final_role IS NULL OR v_final_position_code IS NULL THEN
    RAISE EXCEPTION 'admin_update_profile: position_not_resolved for position=% tenant=%', v_requested_code, v_actor_tenant USING ERRCODE = 'P0001';
  END IF;

  IF v_final_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner' USING ERRCODE = '42501';
  END IF;

  v_required_branch_kind := CASE v_final_position_code
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'cashier_server' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'waiter' THEN 'branch'
    ELSE NULL
  END;

  IF v_final_role IN ('warehouse_manager', 'production_manager') THEN
    v_final_branch := NULL;
  ELSIF v_required_branch_kind IS NULL AND v_requested_code IS NOT NULL THEN
    v_final_branch := NULL;
  ELSE
    v_final_branch := COALESCE(p_branch_id, v_target.branch_id);
  END IF;

  IF v_required_branch_kind IS NOT NULL AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch
      AND tenant_id = v_actor_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_required_branch_kind IS NOT NULL AND v_branch_kind <> v_required_branch_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_target_not_in_branch' USING ERRCODE = '42501';
    END IF;
    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager_cannot_modify_peer' USING ERRCODE = '42501';
    END IF;
    IF v_final_role NOT IN ('cashier','chef') THEN
      RAISE EXCEPTION 'branch_manager_can_only_assign_branch_staff' USING ERRCODE = '42501';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_cannot_reassign_branch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient_privileges_for_profile_management' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      phone = COALESCE(p_phone, phone),
      position_id = v_final_position,
      branch_id = v_final_branch,
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
  WHERE id = p_target_id
    AND tenant_id = v_actor_tenant;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_access_bucket text;
  v_position_code text;
  v_position_id bigint;
  v_required_branch_kind text;
  v_branch_kind text;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
  );
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_position_code := COALESCE(
    NULLIF(NEW.raw_app_meta_data ->> 'position_code', ''),
    NULLIF(NEW.raw_app_meta_data ->> 'position', '')
  );
  v_access_bucket := COALESCE(
    NULLIF(NEW.raw_app_meta_data ->> 'access_bucket', ''),
    NULLIF(NEW.raw_app_meta_data ->> 'user_role', ''),
    NULLIF(NEW.raw_app_meta_data ->> 'role', ''),
    'owner'
  );
  IF v_position_code = 'waiter' THEN
    v_position_code := 'cashier';
  END IF;

  IF v_position_code IS NOT NULL THEN
    SELECT po.id INTO v_position_id
    FROM public.positions po
    WHERE po.tenant_id = v_tenant_id
      AND po.code = v_position_code
      AND COALESCE(po.is_active, true) = true
    LIMIT 1;

    v_access_bucket := private.staff_role_from_position_code(v_position_code);
  ELSE
    v_position_id := public.position_id_from_access_bucket(v_access_bucket, v_tenant_id);
    SELECT po.code INTO v_position_code
    FROM public.positions po
    WHERE po.id = v_position_id
      AND po.tenant_id = v_tenant_id;
    v_access_bucket := private.staff_role_from_position_code(v_position_code);
  END IF;

  IF v_position_id IS NULL OR v_access_bucket IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for position=% access_bucket=% tenant=%',
      v_position_code, v_access_bucket, v_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_access_bucket IN ('warehouse_manager', 'production_manager') THEN
    v_branch_id := NULL;
  END IF;

  v_required_branch_kind := CASE v_position_code
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'cashier_server' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'waiter' THEN 'branch'
    ELSE NULL
  END;

  IF v_required_branch_kind IS NOT NULL AND v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;

  IF v_branch_id IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_branch_id
      AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_required_branch_kind IS NOT NULL AND v_branch_kind <> v_required_branch_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = 'P0001';
    END IF;
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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
