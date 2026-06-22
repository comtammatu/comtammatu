-- Drop dead role-strings (super_manager + area_manager) from live RLS policies
-- and SECURITY DEFINER functions — follow-up to D018.
--
-- After 20260613110000 removed the super_manager position/template/metadata,
-- and after the earlier position-codes work retired area_manager, both tokens
-- are UNREACHABLE: no profile resolves to them, so every
-- `auth_role()/role IN ('owner','super_manager',...)` membership and every
-- notification `target_roles` array carrying them is dead. This migration
-- re-creates the affected objects from their EXACT current definitions, only
-- removing the dead tokens — zero behavior change for live roles (owner / the
-- other operational buckets are always present alongside).
--
-- Method: Part A regex-strips the token from array-membership functions off
-- their own `pg_get_functiondef`; Part B re-creates the two functions that
-- carry a dead `ELSIF actor_role = 'super_manager'` branch by hand; Part C
-- ALTERs every policy off its own `pg_policies` expression. The final DO block
-- asserts zero residue and RAISEs (rollback) otherwise. Idempotent + replayable:
-- on a clean def the regex matches nothing and the re-create is a no-op.
--
-- Function/policy bodies only; no schema DDL → no `pnpm db:types`.

BEGIN;

-- ─── Part A. Array-membership functions (token in a role-list) ──────────────
DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ '(super_manager|area_manager)'
      AND p.proname NOT IN ('admin_update_profile','toggle_profile_active')
  LOOP
    d := pg_get_functiondef(r.oid);
    d := regexp_replace(d, ',\s*''(super_manager|area_manager)''', '', 'g');
    d := regexp_replace(d, '''(super_manager|area_manager)''\s*,', '', 'g');
    EXECUTE d;
  END LOOP;
END $$;

-- ─── Part B. Functions with a dead ELSIF actor-role branch (hand-crafted) ───
CREATE OR REPLACE FUNCTION public.admin_update_profile(p_target_id uuid, p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_branch_id bigint DEFAULT NULL::bigint, p_is_active boolean DEFAULT NULL::boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant bigint; v_actor_role_text text; v_actor_branch bigint;
  v_target record; v_target_role text; v_final_role text; v_final_branch bigint;
  v_final_position bigint; v_final_position_code text; v_branch_kind text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT p.tenant_id, private.staff_role_from_position_code(po.code), p.branch_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch
  FROM public.profiles p JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
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
  IF p_role IS NOT NULL AND p_role NOT IN ('owner','branch_manager','warehouse_manager','production_manager','cashier','waiter','chef','office') THEN
    RAISE EXCEPTION 'invalid_access_bucket: %', p_role USING ERRCODE = '22023';
  END IF;
  SELECT p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id, private.staff_role_from_position_code(po.code) AS role_text
  INTO v_target
  FROM public.profiles p JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;
  v_target_role := v_target.role_text;
  v_final_role := COALESCE(p_role, v_target_role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);
  IF v_final_role IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager') AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;
  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind FROM public.branches WHERE id = v_final_branch AND tenant_id = v_actor_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_final_role IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager') AND v_branch_kind <> 'branch' THEN
      RAISE EXCEPTION 'operational positions must be assigned to branch site' USING ERRCODE = 'P0001';
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
    IF v_final_role NOT IN ('cashier','waiter','chef') THEN
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
    RAISE EXCEPTION 'admin_update_profile: position_not_resolved for access_bucket=% tenant=%', v_final_role, v_actor_tenant USING ERRCODE = 'P0001';
  END IF;
  SELECT po.code INTO v_final_position_code FROM public.positions po WHERE po.id = v_final_position AND po.tenant_id = v_actor_tenant;
  UPDATE public.profiles SET full_name = COALESCE(p_full_name, full_name), phone = COALESCE(p_phone, phone), position_id = v_final_position, branch_id = v_final_branch, is_active = COALESCE(p_is_active, is_active), updated_at = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;
  UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('user_role', v_final_role, 'role', v_final_role, 'access_bucket', v_final_role, 'position', v_final_position_code, 'position_code', v_final_position_code, 'branch_id', v_final_branch)
  WHERE id = p_target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_profile_active(p_target_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT; v_actor_tenant BIGINT; v_actor_branch BIGINT;
  v_target_role TEXT; v_target_branch BIGINT; v_target_active BOOLEAN; v_new_state BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned'), p.tenant_id, p.branch_id
  INTO v_actor_role, v_actor_tenant, v_actor_branch
  FROM public.profiles p LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_actor_id AND COALESCE(p.is_active, true) = true;
  IF NOT FOUND OR v_actor_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(private.staff_role_from_position_code(po.code), 'unassigned'), p.branch_id, p.is_active
  INTO v_target_role, v_target_branch, v_target_active
  FROM public.profiles p LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF p_target_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_toggle_self';
  END IF;
  IF v_actor_role = 'owner' THEN
    NULL;
  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target_role IN ('owner','branch_manager') THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied';
  END IF;
  UPDATE public.profiles SET is_active = NOT is_active WHERE id = p_target_id AND tenant_id = v_actor_tenant RETURNING is_active INTO v_new_state;
  RETURN v_new_state;
END;
$function$;

-- ─── Part C. RLS policies (token in a role-list) ────────────────────────────
DO $$
DECLARE r record; u text; c text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual,'') ~ '(super_manager|area_manager)' OR COALESCE(with_check,'') ~ '(super_manager|area_manager)')
  LOOP
    u := r.qual; c := r.with_check;
    IF u IS NOT NULL THEN
      u := regexp_replace(u, ',\s*''(super_manager|area_manager)''(::text)?', '', 'g');
      u := regexp_replace(u, '''(super_manager|area_manager)''(::text)?\s*,', '', 'g');
    END IF;
    IF c IS NOT NULL THEN
      c := regexp_replace(c, ',\s*''(super_manager|area_manager)''(::text)?', '', 'g');
      c := regexp_replace(c, '''(super_manager|area_manager)''(::text)?\s*,', '', 'g');
    END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s', r.policyname, r.tablename,
      CASE WHEN u IS NOT NULL THEN ' USING ('||u||')' ELSE '' END,
      CASE WHEN c IS NOT NULL THEN ' WITH CHECK ('||c||')' ELSE '' END);
  END LOOP;
END $$;

-- ─── Self-check — fail = rollback ───────────────────────────────────────────
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ '(super_manager|area_manager)';
  IF v > 0 THEN RAISE EXCEPTION '% functions still carry a dead role-string', v; END IF;
  SELECT count(*) INTO v FROM pg_policies WHERE schemaname = 'public'
    AND (COALESCE(qual,'')||' '||COALESCE(with_check,'')) ~ '(super_manager|area_manager)';
  IF v > 0 THEN RAISE EXCEPTION '% policies still carry a dead role-string', v; END IF;
END $$;

COMMIT;
