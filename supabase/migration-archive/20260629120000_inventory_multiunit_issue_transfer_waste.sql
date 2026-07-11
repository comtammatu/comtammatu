-- Phase B3 (Issue / Transfer / Waste): let issue/transfer lines carry an entry
-- unit and convert to the ingredient base unit when posting stock movements and
-- when gating waste tiers. entry_unit_id NULL => quantities already in base
-- (back-compat with rows/callers predating this change). Stock is kept in base;
-- stock_movements.quantity_change stays base.

ALTER TABLE public.stock_issue_items
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_transfer_items
  ADD COLUMN entry_unit_id BIGINT REFERENCES public.units(id) ON DELETE RESTRICT;

-- ── confirm_stock_issue: convert each line qty to base before the stock check
--    and the decrementing movement; record entry unit + pre-conversion qty ──
CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_qty_base    NUMERIC(15,3);
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

  IF v_issue.issue_type = 'writeoff' AND v_issue.approval_status = 'pending' THEN
    RAISE EXCEPTION 'writeoff_pending_approval' USING ERRCODE = '42501';
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
    -- entered quantity is in v_item.entry_unit_id (NULL => already base).
    v_qty_base := public.inv_to_base(v_item.ingredient_id, v_item.entry_unit_id, v_item.quantity);

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

    IF v_sl_q < v_qty_base THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items
    SET unit_cost = v_wac
    WHERE id = v_item.id
      AND tenant_id = v_tenant;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, movement_subtype,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      v_subtype,
      -v_qty_base,
      v_wac,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id,
      v_issue.source_location_id,
      v_item.entry_unit_id,
      v_item.quantity
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
$function$;

-- ── stock_transfer_confirm_ship: convert each line qty to base before the
--    source-stock check and the transfer_out/transfer_in movements + dest WAC ──
CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_tenant      BIGINT := public.auth_tenant_id();
  v_role        TEXT := public.auth_role();
  v_tr          RECORD;
  v_line        RECORD;
  v_src_q       NUMERIC(15,3);
  v_src_wac     NUMERIC(15,2);
  v_is_intra    BOOLEAN;
  v_required    TEXT;
  v_from_loc    RECORD;
  v_to_loc      RECORD;
  v_dst_old_q   NUMERIC(15,3);
  v_dst_old_wac NUMERIC(15,2);
  v_dst_new_q   NUMERIC(15,3);
  v_dst_new_wac NUMERIC(15,2);
  v_qty_base    NUMERIC(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;

  v_is_intra := (v_tr.from_branch_id = v_tr.to_branch_id);
  v_required := CASE
    WHEN v_is_intra THEN 'inventory:transfer_create'
    ELSE 'inventory:transfer_ship'
  END;

  IF NOT public.has_permission(v_tr.from_branch_id, v_required) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'branch_manager' AND NOT v_is_intra THEN
    RAISE EXCEPTION 'branch_manager_inter_site_ship_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_tr.from_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id, location_kind, is_default_consumption
  INTO v_from_loc
  FROM public.inventory_locations
  WHERE id = v_tr.from_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_from_loc.branch_id <> v_tr.from_branch_id THEN
    RAISE EXCEPTION 'transfer_from_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_is_intra THEN
    IF v_tr.to_location_id IS NULL THEN
      RAISE EXCEPTION 'intra_branch_transfer_requires_to_location' USING ERRCODE = '23502';
    END IF;

    SELECT id, branch_id, location_kind, is_default_consumption
    INTO v_to_loc
    FROM public.inventory_locations
    WHERE id = v_tr.to_location_id
      AND tenant_id = v_tenant
      AND is_active = TRUE;

    IF NOT FOUND
       OR v_to_loc.branch_id <> v_tr.to_branch_id
       OR v_from_loc.location_kind <> 'warehouse'
       OR v_to_loc.location_kind <> 'kitchen' THEN
      RAISE EXCEPTION 'intra_branch_location_invalid' USING ERRCODE = '23514';
    END IF;

    IF v_to_loc.is_default_consumption IS DISTINCT FROM TRUE THEN
      RAISE WARNING 'default_consumption_location_not_marked:branch %, location %',
        v_tr.to_branch_id,
        v_tr.to_location_id;
    END IF;
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
      AND tenant_id = v_tenant
  LOOP
    -- entered quantity is in v_line.entry_unit_id (NULL => already base).
    v_qty_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_line.quantity);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_src_q, v_src_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.from_branch_id
      AND sl.location_id = v_tr.from_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR COALESCE(v_src_q, 0) < v_qty_base THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_line.ingredient_id USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_tr.from_branch_id, v_line.ingredient_id, 'transfer_out', -v_qty_base,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_src_wac,
      v_tr.from_location_id,
      v_line.entry_unit_id, v_line.quantity
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_src_wac
    WHERE id = v_line.id;

    IF v_is_intra THEN
      SELECT sl.current_quantity, sl.avg_unit_cost
      INTO v_dst_old_q, v_dst_old_wac
      FROM public.stock_levels sl
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = v_tr.to_branch_id
        AND sl.location_id = v_tr.to_location_id
        AND sl.ingredient_id = v_line.ingredient_id
      FOR UPDATE;

      IF NOT FOUND THEN
        v_dst_old_q := 0;
        v_dst_old_wac := NULL;
      END IF;

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, transfer_id, unit_cost, location_id,
        entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_qty_base,
        'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_src_wac,
        v_tr.to_location_id,
        v_line.entry_unit_id, v_line.quantity
      );

      v_dst_new_q := COALESCE(v_dst_old_q, 0) + v_qty_base;
      v_dst_new_wac := (
        COALESCE(v_dst_old_q, 0) * COALESCE(v_dst_old_wac, 0)
          + v_qty_base * COALESCE(v_src_wac, 0)
      ) / v_dst_new_q;

      UPDATE public.stock_levels sl
      SET avg_unit_cost = v_dst_new_wac,
          updated_at = now()
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = v_tr.to_branch_id
        AND sl.location_id = v_tr.to_location_id
        AND sl.ingredient_id = v_line.ingredient_id;

      UPDATE public.stock_transfer_items
      SET quantity_received = v_line.quantity
      WHERE id = v_line.id;
    END IF;
  END LOOP;

  IF v_is_intra THEN
    UPDATE public.stock_transfers
    SET status = 'received',
        shipped_at = now(),
        received_at = now(),
        receive_started_at = COALESCE(receive_started_at, now()),
        updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
  END IF;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'confirmed_ship');
END;
$function$;

-- ── _post_writeoff_movements: writeoff decrement is posted here (called by
--    create_waste_entry tier0 and approve_waste tier2). Convert line qty to
--    base before the stock check and the decrementing movement ──
CREATE OR REPLACE FUNCTION public._post_writeoff_movements(p_issue_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid   := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_issue  RECORD;
  v_item   RECORD;
  v_loc    RECORD;
  v_sl_q   numeric(15, 3);
  v_wac    numeric(15, 2);
  v_qty_base numeric(15, 3);
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
    -- entered quantity is in v_item.entry_unit_id (NULL => already base).
    v_qty_base := public.inv_to_base(v_item.ingredient_id, v_item.entry_unit_id, v_item.quantity);

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
    IF v_sl_q < v_qty_base THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_issue_items SET unit_cost = v_wac
     WHERE id = v_item.id AND tenant_id = v_tenant;

    IF v_issue.approval_status <> 'approved' THEN
      PERFORM 1 FROM public.stock_issue_items
       WHERE id = v_item.id AND tenant_id = v_tenant AND approval_required = TRUE;
      IF FOUND THEN
        RAISE EXCEPTION 'writeoff_requires_approval_for_%', v_item.ingredient_id USING ERRCODE = '42501';
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, movement_subtype,
      quantity_change, unit_cost, reason, created_by, issue_id, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_issue.branch_id, v_item.ingredient_id, 'consumption', 'writeoff',
      -v_qty_base, v_wac, COALESCE(v_item.reason, v_issue.notes),
      v_uid, p_issue_id, v_issue.source_location_id,
      v_item.entry_unit_id, v_item.quantity
    );
  END LOOP;

  UPDATE public.stock_issues SET status = 'confirmed'
   WHERE id = p_issue_id AND tenant_id = v_tenant;
END;
$function$;

-- ── stock_issue_items_compute_waste_tier: gate the VND tiers on BASE qty so a
--    bulk entry unit cannot under-count value. unit_cost / avg_unit_cost are per
--    base, so value = base_qty * cost; qty_ratio compares base qty vs base
--    on-hand. Cross-row history sums re-base each contributing line because the
--    generated total_cost (= quantity * unit_cost) is in the line's entry unit ──
CREATE OR REPLACE FUNCTION public.stock_issue_items_compute_waste_tier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent RECORD; v_item_value NUMERIC(15,2); v_stock RECORD; v_qty_ratio NUMERIC(5,4);
  v_rolling_sum NUMERIC(15,2); v_shift_sum NUMERIC(15,2); v_branch_cap RECORD;
  v_branch_today NUMERIC(15,2); v_manual_review BOOLEAN; v_photo BOOLEAN := false;
  v_approve BOOLEAN := false; v_tier SMALLINT := 0;
  v_qty_base NUMERIC(15,3);
  v_risky_reasons CONSTANT TEXT[] := ARRAY['dropped','quality_fail','contaminated','found_missing','theft_suspected'];
  v_always_tier2 CONSTANT TEXT[] := ARRAY['found_missing','theft_suspected'];
  v_v1_thr CONSTANT NUMERIC := 150000; v_v2_thr CONSTANT NUMERIC := 500000;
  v_shift_cap CONSTANT NUMERIC := 1500000;
BEGIN
  SELECT tenant_id, branch_id, source_location_id, created_by, issue_type, shift_key, issued_at
    INTO v_parent FROM public.stock_issues WHERE id = NEW.issue_id;
  IF NOT FOUND OR v_parent.issue_type <> 'writeoff' THEN RETURN NEW; END IF;

  -- entered quantity is in NEW.entry_unit_id (NULL => already base).
  v_qty_base := public.inv_to_base(NEW.ingredient_id, NEW.entry_unit_id, NEW.quantity);

  IF NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    v_item_value := v_qty_base * NEW.unit_cost;
  ELSE
    SELECT current_quantity, avg_unit_cost INTO v_stock FROM public.stock_levels
    WHERE branch_id = v_parent.branch_id AND ingredient_id = NEW.ingredient_id
      AND (v_parent.source_location_id IS NULL OR location_id = v_parent.source_location_id)
    ORDER BY location_id NULLS LAST LIMIT 1;
    v_item_value := COALESCE(v_qty_base * v_stock.avg_unit_cost, 0);
  END IF;

  SELECT current_quantity INTO v_stock FROM public.stock_levels
  WHERE branch_id = v_parent.branch_id AND ingredient_id = NEW.ingredient_id
    AND (v_parent.source_location_id IS NULL OR location_id = v_parent.source_location_id)
  ORDER BY location_id NULLS LAST LIMIT 1;
  IF v_stock.current_quantity IS NOT NULL AND v_stock.current_quantity > 0 THEN
    v_qty_ratio := LEAST(v_qty_base / v_stock.current_quantity, 9.9999)::NUMERIC(5,4);
  ELSE v_qty_ratio := NULL; END IF;

  SELECT COALESCE(SUM(public.inv_to_base(sii.ingredient_id, sii.entry_unit_id, sii.quantity) * sii.unit_cost), 0) INTO v_rolling_sum
  FROM public.stock_issue_items sii JOIN public.stock_issues si ON si.id = sii.issue_id
  WHERE si.issue_type = 'writeoff' AND si.created_by = v_parent.created_by
    AND si.branch_id = v_parent.branch_id AND sii.ingredient_id = NEW.ingredient_id
    AND si.created_at > now() - INTERVAL '15 minutes' AND sii.id <> COALESCE(NEW.id, -1);

  IF v_parent.shift_key IS NOT NULL THEN
    SELECT COALESCE(SUM(public.inv_to_base(sii.ingredient_id, sii.entry_unit_id, sii.quantity) * sii.unit_cost), 0) INTO v_shift_sum
    FROM public.stock_issue_items sii JOIN public.stock_issues si ON si.id = sii.issue_id
    WHERE si.issue_type = 'writeoff' AND si.created_by = v_parent.created_by
      AND si.branch_id = v_parent.branch_id AND si.shift_key = v_parent.shift_key
      AND sii.id <> COALESCE(NEW.id, -1);
  ELSE v_shift_sum := 0; END IF;

  SELECT cap_vnd, avg_revenue_7d INTO v_branch_cap FROM public.branch_daily_waste_cap WHERE branch_id = v_parent.branch_id;
  SELECT COALESCE(SUM(public.inv_to_base(sii.ingredient_id, sii.entry_unit_id, sii.quantity) * sii.unit_cost), 0) INTO v_branch_today
  FROM public.stock_issue_items sii JOIN public.stock_issues si ON si.id = sii.issue_id
  WHERE si.issue_type = 'writeoff' AND si.branch_id = v_parent.branch_id
    AND si.issued_at >= date_trunc('day', now() AT TIME ZONE COALESCE(
        (SELECT timezone FROM public.branches WHERE id = v_parent.branch_id), 'Asia/Ho_Chi_Minh'))
    AND sii.id <> COALESCE(NEW.id, -1);

  v_manual_review := public.inventory_requires_manual_review(NEW.ingredient_id);

  v_photo := v_item_value >= v_v1_thr
          OR (v_qty_ratio IS NOT NULL AND v_qty_ratio >= 0.5)
          OR (NEW.reason_code IS NOT NULL AND NEW.reason_code = ANY(v_risky_reasons))
          OR (v_rolling_sum + v_item_value) >= v_v1_thr;

  v_approve := v_item_value >= v_v2_thr
            OR (v_shift_sum + v_item_value) >= v_shift_cap
            OR (NEW.reason_code IS NOT NULL AND NEW.reason_code = ANY(v_always_tier2))
            OR (v_branch_cap.cap_vnd IS NOT NULL AND (v_branch_today + v_item_value) > v_branch_cap.cap_vnd)
            OR v_manual_review;

  IF v_approve THEN v_tier := 2;
  ELSIF v_photo THEN v_tier := 1;
  ELSE v_tier := 0; END IF;

  NEW.waste_tier := v_tier; NEW.photo_required := v_photo; NEW.approval_required := v_approve;
  NEW.qty_ratio := v_qty_ratio; NEW.rolling_15min_sum := v_rolling_sum;

  IF v_photo AND COALESCE(array_length(NEW.photo_urls, 1), 0) = 0
     AND NOT public.has_permission(v_parent.branch_id, 'inventory:waste_bypass_photo') THEN
    RAISE EXCEPTION 'waste photo required for tier >= 1 (reason=%, value=%, qty_ratio=%)',
      NEW.reason_code, v_item_value, v_qty_ratio USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;
