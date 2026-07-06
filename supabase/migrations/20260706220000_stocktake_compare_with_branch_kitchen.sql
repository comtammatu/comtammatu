-- Migration: Default stocktake location to branch kitchen for branch sites, and compare with Bếp CN.
-- Created At: 2026-07-06T21:33:00Z

-- 1. Redefine create_stocktake_session
CREATE OR REPLACE FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_session_id BIGINT;
  v_loc_id BIGINT;
  v_branch_kind TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT branch_kind INTO v_branch_kind FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002'; END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT il.id INTO v_loc_id FROM public.inventory_locations il
    WHERE il.id = p_location_id AND il.branch_id = p_branch_id AND il.tenant_id = v_tenant AND il.is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002'; END IF;
  ELSE
    IF v_branch_kind = 'branch' THEN
      SELECT il.id INTO v_loc_id FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id AND il.tenant_id = v_tenant
        AND il.location_kind = 'kitchen' AND il.is_active = TRUE LIMIT 1;
    ELSE
      SELECT il.id INTO v_loc_id FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id AND il.tenant_id = v_tenant
        AND il.is_default_receive = TRUE AND il.is_active = TRUE LIMIT 1;
    END IF;
  END IF;

  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, location_id, created_by)
  VALUES (v_tenant, p_branch_id, v_loc_id, v_uid) RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity)
  SELECT v_tenant, v_session_id, sl.ingredient_id, sl.current_quantity
  FROM public.stock_levels sl 
  WHERE sl.tenant_id = v_tenant AND sl.branch_id = p_branch_id AND sl.location_id = v_loc_id;

  RETURN jsonb_build_object('id', v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_stocktake_session(p_branch_id bigint, p_location_id bigint) IS 'Create a stocktake session for a branch. If p_location_id is NULL, defaults to kitchen for branch sites, and default receive warehouse for others. Prevents duplicate stocktake lines by filtering by location_id.';


-- 2. Redefine start_stocktake
CREATE OR REPLACE FUNCTION public.start_stocktake(
  p_branch_id bigint, 
  p_location_id bigint DEFAULT NULL::bigint, 
  p_mode text DEFAULT 'daily'::text, 
  p_blind_mode boolean DEFAULT NULL::boolean, 
  p_auditor_id uuid DEFAULT NULL::uuid, 
  p_threshold_pct numeric DEFAULT NULL::numeric, 
  p_threshold_vnd numeric DEFAULT NULL::numeric
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE 
  v_uid UUID := auth.uid(); 
  v_tenant BIGINT; 
  v_blind BOOLEAN;
  v_session BIGINT; 
  v_is_unaud BOOLEAN := false; 
  v_rows INT := 0;
  v_loc_id BIGINT := p_location_id;
  v_branch_kind TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('daily','weekly','monthly','quarterly','spot') THEN RAISE EXCEPTION 'invalid mode' USING ERRCODE = '22023'; END IF;
  
  SELECT tenant_id, branch_kind INTO v_tenant, v_branch_kind FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;
  
  v_blind := COALESCE(p_blind_mode, CASE p_mode
    WHEN 'daily' THEN false WHEN 'weekly' THEN false
    WHEN 'monthly' THEN true WHEN 'quarterly' THEN true WHEN 'spot' THEN true END);
  IF p_mode IN ('monthly','quarterly') AND p_auditor_id IS NULL THEN v_is_unaud := true; END IF;

  IF v_loc_id IS NULL THEN
    IF v_branch_kind = 'branch' THEN
      SELECT il.id INTO v_loc_id FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id AND il.tenant_id = v_tenant
        AND il.location_kind = 'kitchen' AND il.is_active = TRUE LIMIT 1;
    ELSE
      SELECT il.id INTO v_loc_id FROM public.inventory_locations il
      WHERE il.branch_id = p_branch_id AND il.tenant_id = v_tenant
        AND il.is_default_receive = TRUE AND il.is_active = TRUE LIMIT 1;
    END IF;
  END IF;

  IF v_loc_id IS NULL THEN
    RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.stocktake_sessions (tenant_id, branch_id, location_id, status, started_at, created_by,
    mode, blind_mode, auditor_id, is_unaudited, variance_threshold_pct, variance_threshold_vnd,
    abc_snapshot_at, current_round)
  VALUES (v_tenant, p_branch_id, v_loc_id, 'in_progress', now(), v_uid, p_mode, v_blind,
    p_auditor_id, v_is_unaud, COALESCE(p_threshold_pct, 5.00), COALESCE(p_threshold_vnd, 200000), now(), 1)
  RETURNING id INTO v_session;

  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity, round_no, abc_class)
  SELECT v_tenant, v_session, sl.ingredient_id, COALESCE(sl.current_quantity, 0), 1,
    public.get_ingredient_abc_class(p_branch_id, sl.ingredient_id)
  FROM public.stock_levels sl JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  WHERE sl.branch_id = p_branch_id AND sl.location_id = v_loc_id AND ing.is_active = true;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('session_id', v_session, 'mode', p_mode, 'blind_mode', v_blind,
    'is_unaudited', v_is_unaud, 'seeded_lines', v_rows, 'abc_snapshot_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.start_stocktake(p_branch_id bigint, p_location_id bigint, p_mode text, p_blind_mode boolean, p_auditor_id uuid, p_threshold_pct numeric, p_threshold_vnd numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_stocktake(p_branch_id bigint, p_location_id bigint, p_mode text, p_blind_mode boolean, p_auditor_id uuid, p_threshold_pct numeric, p_threshold_vnd numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.start_stocktake(p_branch_id bigint, p_location_id bigint, p_mode text, p_blind_mode boolean, p_auditor_id uuid, p_threshold_pct numeric, p_threshold_vnd numeric) IS 'Start a stocktake session for a branch. If p_location_id is NULL, defaults to kitchen for branch sites, and default receive warehouse for others. Prevents duplicate stocktake lines by filtering by location_id.';
