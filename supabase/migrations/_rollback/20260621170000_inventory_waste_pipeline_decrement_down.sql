DROP FUNCTION IF EXISTS public.create_expiry_writeoff(bigint, bigint, bigint, numeric, text, bigint, text, text[]);

-- Restore the original (non-decrementing) create_waste_entry.
CREATE OR REPLACE FUNCTION public.create_waste_entry(
  p_branch_id bigint, p_location_id bigint, p_items jsonb,
  p_source_type text DEFAULT 'manual'::text, p_source_ref jsonb DEFAULT NULL::jsonb,
  p_notes text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid UUID := auth.uid(); v_tenant BIGINT; v_location RECORD; v_shift_key TEXT; v_issue_id BIGINT;
  v_issue_no TEXT; v_item JSONB; v_photos TEXT[]; v_created INT := 0; v_needs_appr BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;
  SELECT tenant_id, branch_id INTO v_location FROM public.inventory_locations WHERE id = p_location_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'location_scope_mismatch' USING ERRCODE = '42501'; END IF;
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
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (v_tenant, v_issue_id, (v_item->>'ingredient_id')::BIGINT, (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'kg'), NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code', v_photos, v_item->>'note');
    v_created := v_created + 1;
  END LOOP;
  SELECT bool_or(approval_required) INTO v_needs_appr FROM public.stock_issue_items WHERE issue_id = v_issue_id;
  IF NOT v_needs_appr THEN UPDATE public.stock_issues SET status = 'confirmed' WHERE id = v_issue_id; END IF;
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'shift_key', v_shift_key, 'items_created', v_created, 'requires_approval', COALESCE(v_needs_appr, false));
END; $$;

-- Restore the original (non-decrementing) approve_waste.
CREATE OR REPLACE FUNCTION public.approve_waste(p_issue_id bigint, p_decision text, p_note text DEFAULT NULL::text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE v_uid UUID := auth.uid(); v_issue RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'decision must be approved or rejected' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_issue FROM public.stock_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue not found' USING ERRCODE = 'P0002'; END IF;
  IF v_issue.issue_type <> 'writeoff' THEN RAISE EXCEPTION 'issue is not a writeoff' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_permission(v_issue.branch_id, 'inventory:waste_approve') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_issue.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'issue is not pending approval (status=%)', v_issue.approval_status USING ERRCODE = '22023';
  END IF;
  IF v_issue.created_by = v_uid AND NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'self-approval forbidden: approver cannot be the creator' USING ERRCODE = '42501';
  END IF;
  UPDATE public.stock_issues SET approval_status = p_decision, approved_by = v_uid, approved_at = now(),
    status = CASE WHEN p_decision = 'approved' THEN 'confirmed' ELSE 'cancelled' END,
    notes = COALESCE(notes, '') || CASE WHEN p_note IS NOT NULL
      THEN E'\n[' || p_decision || ' by ' || v_uid::TEXT || '] ' || p_note ELSE '' END
  WHERE id = p_issue_id;
END; $$;

DROP FUNCTION IF EXISTS public._post_writeoff_movements(bigint);

-- Restore confirm_stock_issue without the writeoff-pending-approval guard.
CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id bigint)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid         UUID   := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_issue       RECORD;
  v_item        RECORD;
  v_branch_kind TEXT;
  v_subtype     TEXT;
  v_sl_q        NUMERIC(15,3);
  v_wac         NUMERIC(15,2);
  v_source_loc  RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_issue
  FROM public.stock_issues
  WHERE id = p_issue_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_issue.branch_id, 'inventory:write') THEN
    RAISE EXCEPTION 'forbidden_inventory_write' USING ERRCODE = '42501';
  END IF;

  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id
  INTO v_source_loc
  FROM public.inventory_locations
  WHERE id = v_issue.source_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_source_loc.branch_id <> v_issue.branch_id THEN
    RAISE EXCEPTION 'issue_source_location_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT b.branch_kind INTO v_branch_kind
  FROM public.branches b
  WHERE b.id = v_issue.branch_id
    AND b.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_subtype := CASE
    WHEN v_issue.issue_type = 'consumption'
      THEN 'sale_consumption'
    WHEN v_issue.issue_type = 'writeoff'
      THEN 'writeoff'
    WHEN v_issue.issue_type = 'other'
      THEN 'other'
    ELSE NULL
  END;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
    WHERE issue_id = p_issue_id
      AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_sl_q, v_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_issue.branch_id
      AND sl.location_id = v_issue.source_location_id
      AND sl.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    IF v_sl_q < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items
    SET unit_cost = v_wac
    WHERE id = v_item.id
      AND tenant_id = v_tenant;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, movement_subtype,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      v_subtype,
      -v_item.quantity,
      v_wac,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'ok', true,
    'issue_id', p_issue_id,
    'movement_subtype', v_subtype
  );
END;
$$;
