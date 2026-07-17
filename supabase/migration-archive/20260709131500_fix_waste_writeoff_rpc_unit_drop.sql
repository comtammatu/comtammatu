CREATE OR REPLACE FUNCTION public.create_expiry_writeoff(
  p_branch_id bigint,
  p_location_id bigint,
  p_ingredient_id bigint,
  p_quantity numeric,
  p_grn_item_id bigint DEFAULT NULL::bigint,
  p_note text DEFAULT NULL::text,
  p_photo_urls text[] DEFAULT ARRAY[]::text[]
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_loc RECORD; v_grn RECORD;
  v_shift_key text; v_issue_id bigint; v_issue_no text; v_approval text;
  v_seed_cost numeric(15, 2);
  v_source_ref jsonb := jsonb_build_object('kind', 'expiry');
  v_entry_unit_id bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be positive' USING ERRCODE = '22023'; END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501'; END IF;

  SELECT id, tenant_id, branch_id, is_active INTO v_loc
    FROM public.inventory_locations WHERE id = p_location_id;
  IF NOT FOUND OR NOT v_loc.is_active OR v_loc.tenant_id <> v_tenant OR v_loc.branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_grn_item_id IS NOT NULL THEN
    SELECT gi.id, gi.batch_number, gi.expiry_date, gi.grn_id, gi.entry_unit_id INTO v_grn
      FROM public.grn_items gi
      JOIN public.goods_received_notes g ON g.id = gi.grn_id AND g.tenant_id = gi.tenant_id
     WHERE gi.id = p_grn_item_id AND gi.tenant_id = v_tenant
       AND g.branch_id = p_branch_id AND gi.ingredient_id = p_ingredient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'grn_item_not_found' USING ERRCODE = '22023';
    END IF;
    v_entry_unit_id := v_grn.entry_unit_id;
    v_source_ref := v_source_ref || jsonb_build_object(
      'grn_item_id', v_grn.id, 'grn_id', v_grn.grn_id,
      'batch_number', v_grn.batch_number, 'expiry_date', v_grn.expiry_date);
  END IF;

  IF v_entry_unit_id IS NULL THEN
    SELECT iu.unit_id INTO v_entry_unit_id
      FROM public.ingredient_units iu
     WHERE iu.tenant_id = v_tenant
       AND iu.ingredient_id = p_ingredient_id
       AND iu.is_base = TRUE
       AND iu.is_active = TRUE
     LIMIT 1;
  END IF;
  IF v_entry_unit_id IS NULL THEN
    RAISE EXCEPTION 'entry_unit_required' USING ERRCODE = '22023';
  END IF;

  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_note,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, 'manual', v_source_ref)
  RETURNING id INTO v_issue_id;

  SELECT avg_unit_cost INTO v_seed_cost
    FROM public.stock_levels
   WHERE tenant_id = v_tenant AND branch_id = p_branch_id
     AND location_id = p_location_id AND ingredient_id = p_ingredient_id;

  INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost,
    reason_code, photo_urls, reason)
  VALUES (v_tenant, v_issue_id, p_ingredient_id, p_quantity, v_entry_unit_id,
    COALESCE(v_seed_cost, 0),
    'expired', COALESCE(p_photo_urls, ARRAY[]::text[]), p_note);

  SELECT approval_status INTO v_approval FROM public.stock_issues WHERE id = v_issue_id;
  IF v_approval = 'not_required' THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;

  RETURN jsonb_build_object(
    'issue_id', v_issue_id,
    'issue_number', v_issue_no,
    'requires_approval', v_approval = 'pending',
    'stock_decremented', v_approval = 'not_required'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_waste_entry(
  p_branch_id bigint,
  p_location_id bigint,
  p_items jsonb,
  p_source_type text DEFAULT 'manual'::text,
  p_source_ref jsonb DEFAULT NULL::jsonb,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid(); v_tenant BIGINT; v_location RECORD; v_shift_key TEXT; v_issue_id BIGINT;
  v_issue_no TEXT; v_item JSONB; v_photos TEXT[]; v_created INT := 0; v_needs_appr BOOLEAN := false;
  v_entry_unit_id BIGINT;
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
    v_entry_unit_id := NULLIF(v_item->>'entry_unit_id','')::BIGINT;
    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_required' USING ERRCODE = '22023';
    END IF;
    v_photos := CASE WHEN v_item ? 'photo_urls'
                     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'photo_urls'))
                     ELSE ARRAY[]::TEXT[] END;
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (
      v_tenant,
      v_issue_id,
      (v_item->>'ingredient_id')::BIGINT,
      (v_item->>'quantity')::NUMERIC,
      v_entry_unit_id,
      NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code',
      v_photos,
      v_item->>'note'
    );
    v_created := v_created + 1;
  END LOOP;
  SELECT bool_or(approval_required) INTO v_needs_appr FROM public.stock_issue_items WHERE issue_id = v_issue_id;
  IF NOT COALESCE(v_needs_appr, false) THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'shift_key', v_shift_key, 'items_created', v_created, 'requires_approval', COALESCE(v_needs_appr, false));
END; $$;
