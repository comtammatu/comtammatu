-- Keep owner authorization centralized for every RLS/RPC permission gate.
CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id bigint, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.auth_is_owner(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.auth_is_owner(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      WHERE sp.user_id = auth.uid()
        AND sp.permission_key = p_key
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
    );
$$;

UPDATE public.role_templates rt
SET permission_keys = all_keys.permission_keys
FROM (
  SELECT array_agg(pk.key ORDER BY pk.key) AS permission_keys
  FROM public.permission_keys pk
) all_keys
WHERE rt.position_code = 'owner';

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_role text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_is_active boolean DEFAULT NULL::boolean
) RETURNS void
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

  SELECT p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
         po.code AS position_code,
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
      v_final_role := CASE
        WHEN v_requested_code = 'waiter' THEN 'cashier'
        ELSE v_requested_code
      END;
      IF v_final_role NOT IN (
        'owner',
        'branch_manager',
        'warehouse_manager',
        'production_manager',
        'cashier',
        'chef',
        'office'
      ) THEN
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
    RAISE EXCEPTION 'admin_update_profile: position_not_resolved for position=% tenant=%',
      v_requested_code,
      v_actor_tenant
      USING ERRCODE = 'P0001';
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
    WHEN 'guard' THEN 'branch'
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
    IF v_final_role NOT IN ('cashier', 'chef')
       AND v_final_position_code NOT IN ('guard', 'cleaner', 'waiter') THEN
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

REVOKE ALL ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean)
TO authenticated, service_role;
