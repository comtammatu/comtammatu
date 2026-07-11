-- Phase B3 fix: create_waste_entry must persist stock_issue_items.entry_unit_id
-- from p_items so the waste-tier trigger (fires on this INSERT) and
-- _post_writeoff_movements both convert via inv_to_base. Without this the entry
-- unit is dropped and non-base waste quantities are mis-tiered / mis-decremented.
CREATE OR REPLACE FUNCTION public.create_waste_entry(p_branch_id bigint, p_location_id bigint, p_items jsonb, p_source_type text DEFAULT 'manual'::text, p_source_ref jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid(); v_tenant BIGINT; v_location RECORD; v_shift_key TEXT; v_issue_id BIGINT;
  v_issue_no TEXT; v_item JSONB; v_photos TEXT[]; v_created INT := 0; v_needs_appr BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;
  SELECT tenant_id, branch_id INTO v_location FROM public.inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_location.tenant_id <> v_tenant OR v_location.branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::TEXT, 1, 4);
  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_notes,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, COALESCE(p_source_type, 'manual'), p_source_ref)
  RETURNING id INTO v_issue_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_photos := CASE WHEN v_item ? 'photo_urls'
                     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'photo_urls'))
                     ELSE ARRAY[]::TEXT[] END;
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, entry_unit_id, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (v_tenant, v_issue_id, (v_item->>'ingredient_id')::BIGINT, (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'kg'), NULLIF(v_item->>'entry_unit_id','')::BIGINT, NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code', v_photos, v_item->>'note');
    v_created := v_created + 1;
  END LOOP;
  SELECT bool_or(approval_required) INTO v_needs_appr FROM public.stock_issue_items WHERE issue_id = v_issue_id;
  IF NOT COALESCE(v_needs_appr, false) THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'shift_key', v_shift_key, 'items_created', v_created, 'requires_approval', COALESCE(v_needs_appr, false));
END; $function$;
