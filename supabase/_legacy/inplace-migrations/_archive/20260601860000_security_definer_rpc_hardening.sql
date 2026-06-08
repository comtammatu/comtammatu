-- Harden public SECURITY DEFINER RPCs that are exposed through PostgREST.
-- Keep user-facing Server Action contracts intact, but move the critical
-- authorization boundary into the database function or remove direct EXECUTE.

-- Payment and print helper RPCs are implementation details. They are called
-- from trusted SECURITY DEFINER wrappers or the print agent service role.
REVOKE EXECUTE ON FUNCTION public.finalize_paid_order(BIGINT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(BIGINT, UUID)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_print_job(BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_print_job(BIGINT, TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_print_job(BIGINT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_print_job(BIGINT, BOOLEAN, TEXT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stuck_print_jobs(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stuck_print_jobs(INT)
  TO service_role;

-- admin_update_profile remains callable by authenticated staff, but must
-- enforce the same staff permissions as the Server Action before role logic.
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
  v_actor_id        UUID := auth.uid();
  v_actor_tenant    BIGINT;
  v_actor_role_text TEXT;
  v_actor_branch    BIGINT;
  v_actor_area      BIGINT;
  v_target          RECORD;
  v_target_role     TEXT;
  v_final_role      TEXT;
  v_final_branch    BIGINT;
  v_final_position  BIGINT;
  v_branch_kind     TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    p.tenant_id,
    COALESCE(po.legacy_role_code, 'unassigned') AS role_text,
    p.branch_id,
    p.area_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch, v_actor_area
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
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
    FROM public.branches
    WHERE id = v_final_branch AND tenant_id = v_actor_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;

    IF v_final_role IN ('cashier','waiter','chef','branch_manager')
       AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'operational roles must be assigned to branch site' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'central_warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to central_warehouse branch' USING ERRCODE = 'P0001';
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

  IF v_final_position IS NULL THEN
    RAISE EXCEPTION
      'admin_update_profile: position_not_resolved for role=% tenant=% - verify positions seeded',
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

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN)
  TO authenticated;

COMMENT ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) IS
  'Staff profile update RPC. SECURITY DEFINER with staff:manage plus staff:assign_position gate before role hierarchy checks.';

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
    COALESCE(po.legacy_role_code, 'unassigned') AS role_text,
    p.tenant_id,
    p.branch_id,
    p.area_id
  INTO v_actor_role, v_actor_tenant, v_actor_branch, v_actor_area
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(po.legacy_role_code, 'unassigned'),
         p.branch_id,
         p.is_active
    INTO v_target_role, v_target_branch, v_target_active
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
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
  'Staff active-state toggle RPC. SECURITY DEFINER with staff:manage gate before role hierarchy checks.';
