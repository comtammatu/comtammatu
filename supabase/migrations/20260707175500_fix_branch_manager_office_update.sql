-- Fix admin_update_profile to allow branch_manager to update guard, cleaner
CREATE OR REPLACE FUNCTION public.admin_update_profile(p_target_id uuid, p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_branch_id bigint DEFAULT NULL::bigint, p_is_active boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_actor_tenant bigint;
  v_actor_role_text text;
  v_actor_branch bigint;
  v_target_tenant bigint;
  v_target_role text;
  v_target_branch bigint;
  v_requested_code text;
  v_final_role text;
  v_final_position_code text;
  v_final_branch bigint;
  v_required_branch_kind text;
  v_is_active boolean;
  v_target_pos_id bigint;
  v_target_pos_code text;
BEGIN
  -- 1) Basic actor context
  v_actor_tenant := public.auth_tenant_id();
  v_actor_role_text := auth.jwt() ->> 'user_role';

  IF v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'admin_update_profile: actor has no tenant_id' USING ERRCODE = 'P0001';
  END IF;

  v_actor_branch := (auth.jwt() ->> 'branch_id')::bigint;

  -- 2) Pre-fetch target current state from profiles view + position
  SELECT p.tenant_id, po.code, p.branch_id
  INTO v_target_tenant, v_target_pos_code, v_target_branch
  FROM public.profiles p
  JOIN public.positions po ON p.position_id = po.id
  WHERE p.id = p_target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_update_profile: target not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_tenant != v_actor_tenant THEN
    RAISE EXCEPTION 'admin_update_profile: cross-tenant target' USING ERRCODE = '42501';
  END IF;

  -- Current bucket mapped from position
  v_target_role := public.staff_role_from_position_code(v_target_pos_code)::text;

  -- 3) Resolve the intended new role and position_code
  v_requested_code := COALESCE(p_role, v_target_pos_code);
  v_final_role := public.staff_role_from_position_code(v_requested_code)::text;
  v_final_position_code := v_requested_code;

  IF v_final_role = 'unassigned' THEN
    RAISE EXCEPTION 'admin_update_profile: position_not_resolved for position=% tenant=%', v_requested_code, v_actor_tenant USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_target_pos_id FROM public.positions 
  WHERE tenant_id = v_actor_tenant AND code = v_final_position_code;

  IF v_target_pos_id IS NULL THEN
    RAISE EXCEPTION 'admin_update_profile: position record not found for code=% tenant=%', v_final_position_code, v_actor_tenant USING ERRCODE = 'P0001';
  END IF;

  v_final_branch := COALESCE(p_branch_id, v_target_branch);
  v_is_active := COALESCE(p_is_active, true);

  -- 4) Branch kind validation
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

  IF v_required_branch_kind IS NOT NULL THEN
    IF v_final_branch IS NULL THEN
      RAISE EXCEPTION 'admin_update_profile: position % requires a branch', v_final_position_code USING ERRCODE = '23502';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.branches 
      WHERE id = v_final_branch AND tenant_id = v_actor_tenant AND branch_kind = v_required_branch_kind
    ) THEN
      RAISE EXCEPTION 'admin_update_profile: branch % is not %', v_final_branch, v_required_branch_kind USING ERRCODE = '23503';
    END IF;
  ELSE
    IF v_final_branch IS NOT NULL THEN
      RAISE EXCEPTION 'admin_update_profile: position % must not have a branch', v_final_position_code USING ERRCODE = '23502';
    END IF;
  END IF;

  -- 5) Hierarchy and Scope checks
  IF v_actor_role_text = 'owner' THEN
    IF v_target_role = 'owner' AND v_final_role != 'owner' THEN
      RAISE EXCEPTION 'owner_cannot_demote_owner' USING ERRCODE = '42501';
    END IF;
    -- Owner can do anything else

  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target_role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'branch_manager_cannot_modify_owner' USING ERRCODE = '42501';
    END IF;
    
    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager_cannot_modify_peer' USING ERRCODE = '42501';
    END IF;

    -- ONLY branch_manager target role limitation modification:
    IF v_final_role NOT IN ('cashier','chef') AND v_final_position_code NOT IN ('guard', 'cleaner', 'waiter') THEN
      RAISE EXCEPTION 'branch_manager_can_only_assign_branch_staff' USING ERRCODE = '42501';
    END IF;

    -- Must only operate within own branch
    IF v_target_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_target_not_in_branch' USING ERRCODE = '42501';
    END IF;
    
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_cannot_move_staff_out_of_branch' USING ERRCODE = '42501';
    END IF;

  ELSE
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- 6) Update base profiles view (trigger handles user_role fallback)
  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    position_id = v_target_pos_id,
    branch_id = v_final_branch,
    is_active = v_is_active
  WHERE id = p_target_id;

  -- 7) Force Supabase Auth metadata refresh to keep JWT in sync
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'user_role', v_final_role::text,
      'role', v_final_role::text,
      'access_bucket', v_final_role::text,
      'position', v_final_position_code,
      'position_code', v_final_position_code,
      'branch_id', v_final_branch
    )
  WHERE id = p_target_id;

END;
$$;

-- Apply to API
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, bigint, boolean) TO authenticated;
