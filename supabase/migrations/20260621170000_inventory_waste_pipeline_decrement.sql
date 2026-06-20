-- Make the waste pipeline actually decrement stock.
--
-- Bug: create_waste_entry (tier0) and approve_waste (tier2 approved) flipped a
-- writeoff stock_issue straight to status='confirmed' but NEVER posted the
-- stock_movements rows, so confirmed waste never reduced stock_levels. Only
-- confirm_stock_issue posts the movement, and it was never called for writeoffs.
--
-- Fix: one internal helper posts the decrementing movements + confirms, reusing
-- confirm_stock_issue's exact WAC/guard logic. create_waste_entry, approve_waste,
-- and the new create_expiry_writeoff all route through it. The helper has NO
-- permission check — each caller already enforces its own (writeoff / waste_approve)
-- and it is REVOKEd from PUBLIC so only the SECURITY DEFINER callers (running as
-- owner) can invoke it.

CREATE OR REPLACE FUNCTION public._post_writeoff_movements(p_issue_id bigint)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid    uuid   := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue  RECORD;
  v_item   RECORD;
  v_loc    RECORD;
  v_sl_q   numeric(15, 3);
  v_wac    numeric(15, 2);
BEGIN
  SELECT * INTO v_issue
    FROM public.stock_issues
   WHERE id = p_issue_id AND tenant_id = v_tenant
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_issue.issue_type <> 'writeoff' THEN
    RAISE EXCEPTION 'not_a_writeoff' USING ERRCODE = '22023';
  END IF;
  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_issue.source_location_id IS NULL THEN
    RAISE EXCEPTION 'issue_source_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id INTO v_loc
    FROM public.inventory_locations
   WHERE id = v_issue.source_location_id AND tenant_id = v_tenant AND is_active = TRUE;
  IF NOT FOUND OR v_loc.branch_id <> v_issue.branch_id THEN
    RAISE EXCEPTION 'issue_source_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
     WHERE issue_id = p_issue_id AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_sl_q, v_wac
      FROM public.stock_levels sl
     WHERE sl.tenant_id = v_tenant
       AND sl.branch_id = v_issue.branch_id
       AND sl.location_id = v_issue.source_location_id
       AND sl.ingredient_id = v_item.ingredient_id
     FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_item.ingredient_id USING ERRCODE = '22023';
    END IF;
    IF v_sl_q < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items SET unit_cost = v_wac
     WHERE id = v_item.id AND tenant_id = v_tenant;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, movement_subtype,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id
    ) VALUES (
      v_tenant, v_issue.branch_id, v_item.ingredient_id, 'consumption', 'writeoff',
      -v_item.quantity, v_wac, COALESCE(v_item.reason, v_issue.notes),
      v_uid, p_issue_id, v_issue.source_location_id
    );
  END LOOP;

  UPDATE public.stock_issues SET status = 'confirmed'
   WHERE id = p_issue_id AND tenant_id = v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public._post_writeoff_movements(bigint) FROM PUBLIC;

-- create_waste_entry: post movements on the tier0 (no-approval) confirm path.
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
    INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, unit_cost,
      reason_code, photo_urls, reason)
    VALUES (v_tenant, v_issue_id, (v_item->>'ingredient_id')::BIGINT, (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'kg'), NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code', v_photos, v_item->>'note');
    v_created := v_created + 1;
  END LOOP;
  SELECT bool_or(approval_required) INTO v_needs_appr FROM public.stock_issue_items WHERE issue_id = v_issue_id;
  -- Tier0 (no approval): post the decrementing movements + confirm. Tier2 stays
  -- draft/pending for approve_waste.
  IF NOT COALESCE(v_needs_appr, false) THEN
    PERFORM public._post_writeoff_movements(v_issue_id);
  END IF;
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'shift_key', v_shift_key, 'items_created', v_created, 'requires_approval', COALESCE(v_needs_appr, false));
END; $$;

-- approve_waste: post movements when a tier2 writeoff is approved.
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
  -- 4-eye principle: creator cannot approve own waste (unless has admin break-glass)
  IF v_issue.created_by = v_uid AND NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'self-approval forbidden: approver cannot be the creator' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.stock_issues
       SET approval_status = 'approved', approved_by = v_uid, approved_at = now(),
           notes = COALESCE(notes, '') || CASE WHEN p_note IS NOT NULL
             THEN E'\n[approved by ' || v_uid::TEXT || '] ' || p_note ELSE '' END
     WHERE id = p_issue_id;
    -- Posts the decrementing movements and sets status='confirmed'.
    PERFORM public._post_writeoff_movements(p_issue_id);
  ELSE
    UPDATE public.stock_issues
       SET approval_status = 'rejected', approved_by = v_uid, approved_at = now(), status = 'cancelled',
           notes = COALESCE(notes, '') || CASE WHEN p_note IS NOT NULL
             THEN E'\n[rejected by ' || v_uid::TEXT || '] ' || p_note ELSE '' END
     WHERE id = p_issue_id;
  END IF;
END; $$;

-- create_expiry_writeoff: route expiry write-offs through the waste pipeline
-- (tier/photo/approval) instead of a raw adjustStock that bypassed all controls.
CREATE OR REPLACE FUNCTION public.create_expiry_writeoff(
  p_branch_id bigint, p_location_id bigint, p_ingredient_id bigint,
  p_quantity numeric, p_unit text, p_grn_item_id bigint DEFAULT NULL,
  p_note text DEFAULT NULL, p_photo_urls text[] DEFAULT ARRAY[]::text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_loc RECORD; v_grn RECORD;
  v_shift_key text; v_issue_id bigint; v_issue_no text; v_approval text;
  v_source_ref jsonb := jsonb_build_object('kind', 'expiry');
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
    SELECT gi.id, gi.batch_number, gi.expiry_date, gi.grn_id INTO v_grn
      FROM public.grn_items gi
      JOIN public.goods_received_notes g ON g.id = gi.grn_id AND g.tenant_id = gi.tenant_id
     WHERE gi.id = p_grn_item_id AND gi.tenant_id = v_tenant
       AND g.branch_id = p_branch_id AND gi.ingredient_id = p_ingredient_id;
    IF FOUND THEN
      v_source_ref := v_source_ref || jsonb_build_object(
        'grn_item_id', v_grn.id, 'grn_id', v_grn.grn_id,
        'batch_number', v_grn.batch_number, 'expiry_date', v_grn.expiry_date);
    END IF;
  END IF;

  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  INSERT INTO public.stock_issues (tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status, shift_key, source_type, source_ref)
  VALUES (v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_note,
    now(), v_uid, p_location_id, 'not_required', v_shift_key, 'manual', v_source_ref)
  RETURNING id INTO v_issue_id;

  -- BEFORE-INSERT trigger computes tier/photo_required/approval_required and
  -- enforces the photo gate (raises 22023 if a photo is required but missing).
  INSERT INTO public.stock_issue_items (tenant_id, issue_id, ingredient_id, quantity, unit, unit_cost,
    reason_code, photo_urls, reason)
  VALUES (v_tenant, v_issue_id, p_ingredient_id, p_quantity, COALESCE(p_unit, 'kg'), NULL,
    'expired', COALESCE(p_photo_urls, ARRAY[]::text[]), p_note);

  SELECT approval_status INTO v_approval FROM public.stock_issues WHERE id = v_issue_id;
  IF v_approval = 'pending' THEN
    RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
      'requires_approval', true, 'stock_decremented', false);
  END IF;

  PERFORM public._post_writeoff_movements(v_issue_id);
  RETURN jsonb_build_object('issue_id', v_issue_id, 'issue_number', v_issue_no,
    'requires_approval', false, 'stock_decremented', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, text, bigint, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, text, bigint, text, text[]) TO authenticated;
