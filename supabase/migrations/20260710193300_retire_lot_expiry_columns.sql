-- Owner-confirmed D073 §5: retire lot/expiry tracking on grn_items and the
-- shelf-life field on ingredients (never populated by any live workflow).
-- Rewrites every writer/reader that touched these columns, then drops them.

BEGIN;

-- 1. create_expiry_writeoff — stop reading/echoing batch_number/expiry_date.
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
    SELECT gi.id, gi.grn_id, gi.entry_unit_id INTO v_grn
      FROM public.grn_items gi
      JOIN public.goods_received_notes g ON g.id = gi.grn_id AND g.tenant_id = gi.tenant_id
     WHERE gi.id = p_grn_item_id AND gi.tenant_id = v_tenant
       AND g.branch_id = p_branch_id AND gi.ingredient_id = p_ingredient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'grn_item_not_found' USING ERRCODE = '22023';
    END IF;
    v_entry_unit_id := v_grn.entry_unit_id;
    v_source_ref := v_source_ref || jsonb_build_object(
      'grn_item_id', v_grn.id, 'grn_id', v_grn.grn_id);
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

REVOKE ALL ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, bigint, text, text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, bigint, text, text[]) TO authenticated;
GRANT ALL ON FUNCTION public.create_expiry_writeoff(bigint, bigint, bigint, numeric, bigint, text, text[]) TO service_role;

-- 2. recreate_grn_at_receiving_site — stop copying expiry_date/batch_number
--    into the replacement grn_items rows.
CREATE OR REPLACE FUNCTION public.recreate_grn_at_receiving_site(
  p_grn_id bigint,
  p_target_branch_id bigint,
  p_target_location_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_numeric_15_3_max CONSTANT numeric := 999999999999.999;
  c_numeric_15_2_max CONSTANT numeric := 9999999999999.99;
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_old_grn record;
  v_target_location record;
  v_old_location_id bigint;
  v_new_grn_id bigint;
  v_new_po_id bigint;
  v_new_grn_number text;
  v_new_po_display text;
  v_line record;
  v_net_qty numeric;
  v_net_base numeric;
  v_cost_base numeric;
  v_old_current_qty numeric;
  v_target_current_qty numeric;
  v_target_wac numeric;
  v_next_wac numeric;
  v_old_po_auto boolean := false;
  v_auto_po_lines integer := 0;
  v_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason_required_min_10_chars' USING ERRCODE = '22023';
  END IF;

  SELECT g.* INTO v_old_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id
    AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed' USING ERRCODE = '22023';
  END IF;

  IF v_old_grn.branch_id = p_target_branch_id THEN
    RAISE EXCEPTION 'same_branch_use_location_amend' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(v_old_grn.branch_id, 'procurement:grn_amend') THEN
    RAISE EXCEPTION 'forbidden_source_branch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_target_branch_id, 'procurement:grn_amend')
     OR NOT public.has_permission(p_target_branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden_target_branch' USING ERRCODE = '42501';
  END IF;

  SELECT il.id, il.branch_id, il.location_kind
  INTO v_target_location
  FROM public.inventory_locations il
  WHERE il.id = p_target_location_id
    AND il.tenant_id = v_tenant
    AND il.branch_id = p_target_branch_id
    AND il.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_returns sr
    WHERE sr.tenant_id = v_tenant
      AND sr.grn_id = p_grn_id
      AND sr.status <> 'cancelled'
  )
  OR EXISTS (
    SELECT 1
    FROM public.supplier_return_items sri
    JOIN public.supplier_returns sr
      ON sr.id = sri.return_id
     AND sr.tenant_id = sri.tenant_id
    JOIN public.grn_items gi
      ON gi.id = sri.grn_item_id
     AND gi.tenant_id = sri.tenant_id
    WHERE sri.tenant_id = v_tenant
      AND gi.grn_id = p_grn_id
      AND sr.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'has_active_supplier_return' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_invoices si
    WHERE si.tenant_id = v_tenant
      AND si.grn_id = p_grn_id
      AND (
        COALESCE(si.payment_status, 'unpaid') <> 'unpaid'
        OR COALESCE(si.paid_amount, 0) > 0
        OR COALESCE(si.credit_applied_amount, 0) > 0
      )
  ) THEN
    RAISE EXCEPTION 'has_paid_invoice' USING ERRCODE = '23514';
  END IF;

  IF v_old_grn.po_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.audit_logs al
      WHERE al.tenant_id = v_tenant
        AND al.action = 'inventory.po.created_from_grn'
        AND al.entity_type = 'purchase_order'
        AND al.entity_id = v_old_grn.po_id
        AND al.new_data ->> 'grn_id' = p_grn_id::text
    ) INTO v_old_po_auto;

    IF NOT v_old_po_auto THEN
      RAISE EXCEPTION 'source_po_attached' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes g
      WHERE g.tenant_id = v_tenant
        AND g.po_id = v_old_grn.po_id
        AND g.id <> p_grn_id
        AND g.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'source_po_shared' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_old_grn.location_id IS NOT NULL THEN
    SELECT il.id INTO v_old_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_old_grn.location_id
      AND il.tenant_id = v_tenant
      AND il.branch_id = v_old_grn.branch_id
      AND il.is_active = TRUE;
  ELSE
    SELECT il.id INTO v_old_location_id
    FROM public.inventory_locations il
    WHERE il.tenant_id = v_tenant
      AND il.branch_id = v_old_grn.branch_id
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    ORDER BY il.sort_order NULLS LAST, il.id
    LIMIT 1;
  END IF;

  IF v_old_location_id IS NULL THEN
    RAISE EXCEPTION 'source_location_missing' USING ERRCODE = '23502';
  END IF;

  FOR v_line IN
    SELECT gi.*
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = p_grn_id
    ORDER BY gi.id
    FOR UPDATE
  LOOP
    v_net_qty := v_line.received_quantity - COALESCE(v_line.rejected_quantity, 0);
    v_net_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_net_qty);
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND((v_net_qty * v_line.unit_cost) / v_net_base, 2)
      ELSE v_line.unit_cost
    END;

    IF abs(v_net_base) > c_numeric_15_3_max
       OR abs(v_cost_base) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_levels (
      tenant_id, branch_id, ingredient_id, location_id, current_quantity
    ) VALUES (
      v_tenant, p_target_branch_id, v_line.ingredient_id, p_target_location_id, 0
    )
    ON CONFLICT ON CONSTRAINT stock_levels_ingredient_branch_location_tenant_key
    DO NOTHING;

    PERFORM 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.ingredient_id = v_line.ingredient_id
      AND (
        (sl.branch_id = v_old_grn.branch_id AND sl.location_id = v_old_location_id)
        OR (sl.branch_id = p_target_branch_id AND sl.location_id = p_target_location_id)
      )
    ORDER BY sl.branch_id, sl.location_id, sl.ingredient_id
    FOR UPDATE;

    SELECT sl.current_quantity
    INTO v_old_current_qty
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_old_grn.branch_id
      AND sl.location_id = v_old_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF COALESCE(v_old_current_qty, 0) < v_net_base THEN
      RAISE EXCEPTION 'insufficient_source_stock:%', v_line.ingredient_id USING ERRCODE = '23514';
    END IF;
  END LOOP;

  LOOP
    v_new_grn_number := v_old_grn.grn_number || '-COPY-' ||
      substr(md5(clock_timestamp()::text || random()::text), 1, 6);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.goods_received_notes g
      WHERE g.tenant_id = v_tenant
        AND g.grn_number = v_new_grn_number
    );
  END LOOP;

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, location_id, supplier_id, po_id, grn_number,
    received_date, received_by, status, notes, created_by
  ) VALUES (
    v_tenant, p_target_branch_id, p_target_location_id, v_old_grn.supplier_id,
    NULL, v_new_grn_number, v_old_grn.received_date, v_uid, 'confirmed',
    NULLIF(btrim(v_old_grn.notes), ''), v_uid
  )
  RETURNING id INTO v_new_grn_id;

  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id, po_quantity, received_quantity,
    entry_unit_id, unit_cost, total_cost, quality_status, rejected_quantity,
    rejection_reason, receiving_temperature,
    po_unit_price, price_override_note, price_override_photo_url,
    rejected_photo_url, requires_review, short_delivery_action
  )
  SELECT
    tenant_id, v_new_grn_id, ingredient_id, po_quantity, received_quantity,
    entry_unit_id, unit_cost, total_cost, quality_status, rejected_quantity,
    rejection_reason, receiving_temperature,
    po_unit_price, price_override_note, price_override_photo_url,
    rejected_photo_url, requires_review, short_delivery_action
  FROM public.grn_items
  WHERE tenant_id = v_tenant
    AND grn_id = p_grn_id
  ORDER BY id;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = v_new_grn_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
  ) THEN
    v_new_po_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
    ) VALUES (
      v_tenant, p_target_branch_id, v_old_grn.supplier_id, v_new_po_display,
      v_new_po_display, 'received', NULLIF(btrim(v_old_grn.notes), ''), v_uid
    )
    RETURNING id INTO v_new_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total
    )
    SELECT
      v_tenant,
      v_new_po_id,
      gi.ingredient_id,
      (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::numeric(15,3),
      gi.entry_unit_id,
      gi.unit_cost,
      ROUND((gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) * gi.unit_cost, 2)
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = v_new_grn_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    GET DIAGNOSTICS v_auto_po_lines = ROW_COUNT;

    UPDATE public.grn_items gi
    SET po_quantity = gi.received_quantity - COALESCE(gi.rejected_quantity, 0),
        po_unit_price = gi.unit_cost
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = v_new_grn_id
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    UPDATE public.goods_received_notes
    SET po_id = v_new_po_id, updated_at = now()
    WHERE id = v_new_grn_id
      AND tenant_id = v_tenant;

    PERFORM public.log_audit(
      'inventory.po.created_from_grn',
      'purchase_order',
      v_new_po_id,
      NULL,
      jsonb_build_object(
        'grn_id', v_new_grn_id,
        'lines', v_auto_po_lines,
        'branch_id', p_target_branch_id
      )
    );
  END IF;

  FOR v_line IN
    SELECT gi.*
    FROM public.grn_items gi
    WHERE gi.tenant_id = v_tenant
      AND gi.grn_id = p_grn_id
    ORDER BY gi.id
  LOOP
    v_net_qty := v_line.received_quantity - COALESCE(v_line.rejected_quantity, 0);
    v_net_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_net_qty);
    v_cost_base := CASE
      WHEN v_net_base <> 0 THEN ROUND((v_net_qty * v_line.unit_cost) / v_net_base, 2)
      ELSE v_line.unit_cost
    END;

    IF v_net_base <= 0 THEN
      CONTINUE;
    END IF;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_target_current_qty, v_target_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_target_branch_id
      AND sl.location_id = p_target_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    v_target_current_qty := COALESCE(v_target_current_qty, 0);

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_old_grn.branch_id, v_line.ingredient_id, 'grn_amend',
      -v_net_base,
      'GRN ' || v_old_grn.grn_number || ' recreated at ' || v_new_grn_number ||
        ': reverse source receipt - ' || trim(p_reason),
      v_uid, p_grn_id, v_cost_base, v_old_location_id,
      v_line.entry_unit_id, v_net_qty
    );

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, p_target_branch_id, v_line.ingredient_id, 'grn_receipt',
      v_net_base,
      'GRN ' || v_new_grn_number || ' recreated from ' || v_old_grn.grn_number ||
        ': target receipt - ' || trim(p_reason),
      v_uid, v_new_grn_id, v_cost_base, p_target_location_id,
      v_line.entry_unit_id, v_net_qty
    );

    v_next_wac := CASE
      WHEN v_target_current_qty + v_net_base > 0 THEN ROUND(
        ((v_target_current_qty * COALESCE(v_target_wac, 0)) + (v_net_base * v_cost_base))
        / (v_target_current_qty + v_net_base),
        2
      )
      ELSE v_cost_base
    END;

    IF abs(v_next_wac) > c_numeric_15_2_max THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_next_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = p_target_branch_id
      AND sl.location_id = p_target_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost_base,
        updated_at = now()
    WHERE i.tenant_id = v_tenant
      AND i.id = v_line.ingredient_id;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  IF v_old_po_auto THEN
    UPDATE public.purchase_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_old_grn.po_id
      AND tenant_id = v_tenant
      AND status IN ('sent', 'partially_received', 'received');
  END IF;

  UPDATE public.supplier_invoices
  SET grn_id = v_new_grn_id,
      po_id = v_new_po_id,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND grn_id = p_grn_id
    AND COALESCE(payment_status, 'unpaid') = 'unpaid'
    AND COALESCE(paid_amount, 0) = 0
    AND COALESCE(credit_applied_amount, 0) = 0;

  FOR v_invoice_id IN
    SELECT id
    FROM public.supplier_invoices
    WHERE tenant_id = v_tenant
      AND grn_id = v_new_grn_id
  LOOP
    PERFORM public.recompute_supplier_invoice_matching(v_invoice_id);
  END LOOP;

  PERFORM public.log_audit(
    'inventory.grn.recreated_receiving_site',
    'goods_received_note',
    p_grn_id,
    jsonb_build_object(
      'grn_id', p_grn_id,
      'grn_number', v_old_grn.grn_number,
      'branch_id', v_old_grn.branch_id,
      'location_id', v_old_location_id,
      'po_id', v_old_grn.po_id,
      'status', 'confirmed'
    ),
    jsonb_build_object(
      'new_grn_id', v_new_grn_id,
      'new_grn_number', v_new_grn_number,
      'branch_id', p_target_branch_id,
      'location_id', p_target_location_id,
      'po_id', v_new_po_id,
      'old_auto_po_cancelled', v_old_po_auto,
      'reason', trim(p_reason)
    )
  );

  PERFORM public.log_audit(
    'inventory.grn.recreated_from_source',
    'goods_received_note',
    v_new_grn_id,
    NULL,
    jsonb_build_object(
      'source_grn_id', p_grn_id,
      'source_grn_number', v_old_grn.grn_number,
      'reason', trim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'old_grn_id', p_grn_id,
    'old_grn_number', v_old_grn.grn_number,
    'new_grn_id', v_new_grn_id,
    'new_grn_number', v_new_grn_number,
    'new_po_id', v_new_po_id,
    'old_auto_po_cancelled', v_old_po_auto
  );
END;
$$;

COMMENT ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) IS 'Owner-level correction for a confirmed GRN received at the wrong branch/site. Reverses source stock, creates a confirmed replacement GRN at the target location, and preserves audit history.';

REVOKE ALL ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.recreate_grn_at_receiving_site(
  bigint,
  bigint,
  bigint,
  text
) TO service_role;

-- 3. upsert_ingredient_catalog — drop p_shelf_life_days from the signature.
DROP FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, integer, jsonb);

CREATE FUNCTION public.upsert_ingredient_catalog(p_ingredient_id bigint, p_name text, p_sku text, p_category_id bigint, p_unit_cost numeric, p_item_kind text, p_storage_type text, p_min_stock_level numeric, p_max_stock_level numeric, p_reorder_point numeric, p_units jsonb) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant       bigint := public.auth_tenant_id();
  v_id           bigint := p_ingredient_id;
  v_base         jsonb;
  v_base_unit_id bigint;
  v_cat_name   text;
BEGIN
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_units IS NULL OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'at least one unit required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) e
    WHERE NOT coalesce((e->>'is_base')::boolean, false)
      AND nullif(e->>'anchor_unit_id', '') IS NULL
      AND coalesce((e->>'to_base_factor')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'unit factor must be positive' USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(p_units) e WHERE (e->>'is_base')::boolean) <> 1 THEN
    RAISE EXCEPTION 'exactly one base unit required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_units) e
    LEFT JOIN public.units u
      ON u.id = (e->>'unit_id')::bigint
     AND u.tenant_id = v_tenant
     AND u.is_active
    WHERE u.id IS NULL
  ) THEN
    RAISE EXCEPTION 'unit not found' USING ERRCODE = '23503';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT name INTO v_cat_name
    FROM public.ingredient_categories
    WHERE id = p_category_id
      AND tenant_id = v_tenant
      AND is_active;

    IF v_cat_name IS NULL THEN
      RAISE EXCEPTION 'category not found' USING ERRCODE = '23503';
    END IF;
  END IF;

  v_base := (SELECT e FROM jsonb_array_elements(p_units) e WHERE (e->>'is_base')::boolean LIMIT 1);
  v_base_unit_id := (v_base->>'unit_id')::bigint;

  IF v_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category,
      unit_cost, item_kind, storage_type,
      min_stock_level, max_stock_level, reorder_point
    ) VALUES (
      v_tenant, p_name, p_sku, p_category_id, v_cat_name,
      p_unit_cost, coalesce(p_item_kind, 'raw_material'), coalesce(p_storage_type, 'ambient'),
      coalesce(p_min_stock_level, 0), p_max_stock_level, p_reorder_point
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.ingredients SET
      name = p_name, sku = p_sku, category_id = p_category_id, category = v_cat_name,
      unit_cost = p_unit_cost,
      item_kind = coalesce(p_item_kind, item_kind), storage_type = coalesce(p_storage_type, storage_type),
      min_stock_level = coalesce(p_min_stock_level, 0), max_stock_level = p_max_stock_level,
      reorder_point = p_reorder_point, updated_at = now()
    WHERE id = v_id AND tenant_id = v_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_ingredient_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.stock_movements sm
       WHERE sm.tenant_id = v_tenant
         AND sm.ingredient_id = v_id
     )
  THEN
    IF EXISTS (
      SELECT 1
      FROM public.ingredient_units iu
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = v_id
        AND iu.is_base
        AND iu.unit_id IS DISTINCT FROM v_base_unit_id
    ) THEN
      RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_tenant
        AND sm.ingredient_id = v_id
        AND sm.entry_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_units) e
          WHERE (e->>'unit_id')::bigint = sm.entry_unit_id
        )
    ) THEN
      RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.ingredient_units iu
      JOIN (
        SELECT DISTINCT sm.entry_unit_id
        FROM public.stock_movements sm
        WHERE sm.tenant_id = v_tenant
          AND sm.ingredient_id = v_id
          AND sm.entry_unit_id IS NOT NULL
      ) used ON used.entry_unit_id = iu.unit_id
      JOIN LATERAL (
        SELECT e
        FROM jsonb_array_elements(p_units) e
        WHERE (e->>'unit_id')::bigint = iu.unit_id
        LIMIT 1
      ) incoming ON TRUE
      WHERE iu.tenant_id = v_tenant
        AND iu.ingredient_id = v_id
        AND abs(
          iu.to_base_factor
          - public.inv_catalog_unit_to_base(v_base_unit_id, incoming.e, p_units)
        ) > 0.000000001
    ) THEN
      RAISE EXCEPTION 'inventory_unit_ladder_locked_by_stock_movements' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.production_recipes pr
    WHERE pr.tenant_id = v_tenant
      AND pr.ingredient_id = v_id
      AND pr.entry_unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_units) e
        WHERE (e->>'unit_id')::bigint = pr.entry_unit_id
      )
  ) THEN
    RAISE EXCEPTION 'ingredient_unit_in_use_by_production_recipe' USING ERRCODE = '23503';
  END IF;

  UPDATE public.ingredient_units
  SET is_base = false
  WHERE tenant_id = v_tenant
    AND ingredient_id = v_id
    AND is_base
    AND unit_id IS DISTINCT FROM v_base_unit_id;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    anchor_unit_id, anchor_factor, sort_order
  )
  SELECT v_tenant, v_id, (e->>'unit_id')::bigint,
         public.inv_catalog_unit_to_base(v_base_unit_id, e, p_units),
         (e->>'is_base')::boolean,
         nullif(e->>'anchor_unit_id', '')::bigint,
         nullif(e->>'anchor_factor', '')::numeric,
         coalesce((e->>'sort_order')::int, 0)
  FROM jsonb_array_elements(p_units) e
  ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key
  DO UPDATE SET
    to_base_factor = EXCLUDED.to_base_factor,
    is_base = EXCLUDED.is_base,
    anchor_unit_id = EXCLUDED.anchor_unit_id,
    anchor_factor = EXCLUDED.anchor_factor,
    sort_order = EXCLUDED.sort_order,
    is_active = true;

  DELETE FROM public.ingredient_units iu
  WHERE iu.tenant_id = v_tenant
    AND iu.ingredient_id = v_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_units) e
      WHERE (e->>'unit_id')::bigint = iu.unit_id
    );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, jsonb) TO service_role;
GRANT ALL ON FUNCTION public.upsert_ingredient_catalog(bigint, text, text, bigint, numeric, text, text, numeric, numeric, numeric, jsonb) TO authenticated;

-- 4. bulk_import_ingredients — drop shelf_life_days from the import pipeline.
CREATE OR REPLACE FUNCTION public.bulk_import_ingredients(p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_inserted integer := 0;
  v_updated integer := 0;
BEGIN
  IF NOT public.has_permission_any('inventory:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'rows_must_be_non_empty_array' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS pg_temp.bulk_import_ingredient_rows;
  DROP TABLE IF EXISTS pg_temp.bulk_import_ingredient_upserted;

  CREATE TEMP TABLE pg_temp.bulk_import_ingredient_rows ON COMMIT DROP AS
  SELECT
    raw.ordinality::integer AS row_no,
    btrim(raw.value->>'name') AS name,
    nullif(btrim(coalesce(raw.value->>'sku', '')), '') AS sku,
    btrim(raw.value->>'unit') AS unit,
    nullif(btrim(coalesce(raw.value->>'category', '')), '') AS category,
    coalesce(nullif(btrim(coalesce(raw.value->>'item_kind', '')), ''), 'raw_material') AS item_kind,
    (raw.value->>'unit_cost')::numeric AS unit_cost,
    coalesce((raw.value->>'min_stock_level')::numeric, 0) AS min_stock_level,
    (raw.value->>'max_stock_level')::numeric AS max_stock_level,
    (raw.value->>'reorder_point')::numeric AS reorder_point,
    coalesce(nullif(btrim(coalesce(raw.value->>'storage_type', '')), ''), 'ambient') AS storage_type
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS raw(value, ordinality);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows
    WHERE coalesce(name, '') = ''
       OR coalesce(unit, '') = ''
  ) THEN
    RAISE EXCEPTION 'invalid_import_row' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows
    GROUP BY name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_import_name' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.units (tenant_id, code, name, is_active)
  SELECT DISTINCT v_tenant, unit, unit, true
  FROM pg_temp.bulk_import_ingredient_rows
  WHERE coalesce(unit, '') <> ''
  ON CONFLICT ON CONSTRAINT units_code_tenant_key DO NOTHING;

  INSERT INTO public.ingredient_categories (tenant_id, name)
  SELECT DISTINCT v_tenant, category
  FROM pg_temp.bulk_import_ingredient_rows
  WHERE category IS NOT NULL
  ON CONFLICT ON CONSTRAINT ingredient_categories_name_tenant_key DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.units base_units
      ON base_units.tenant_id = v_tenant
     AND base_units.code = rows.unit
     AND base_units.is_active
    WHERE base_units.id IS NULL
  ) THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.ingredient_categories categories
      ON categories.tenant_id = v_tenant
     AND categories.name = rows.category
     AND categories.is_active
    WHERE rows.category IS NOT NULL
      AND categories.id IS NULL
  ) THEN
    RAISE EXCEPTION 'category_not_found' USING ERRCODE = '23503';
  END IF;

  CREATE TEMP TABLE pg_temp.bulk_import_ingredient_upserted ON COMMIT DROP AS
  WITH existing AS (
    SELECT ingredients.name
    FROM public.ingredients
    JOIN pg_temp.bulk_import_ingredient_rows rows
      ON rows.name = ingredients.name
    WHERE ingredients.tenant_id = v_tenant
  ),
  upserted AS (
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category,
      unit_cost, item_kind, storage_type,
      min_stock_level, max_stock_level, reorder_point
    )
    SELECT
      v_tenant,
      rows.name,
      rows.sku,
      categories.id,
      categories.name,
      rows.unit_cost,
      rows.item_kind,
      rows.storage_type,
      rows.min_stock_level,
      rows.max_stock_level,
      rows.reorder_point
    FROM pg_temp.bulk_import_ingredient_rows rows
    LEFT JOIN public.ingredient_categories categories
      ON categories.tenant_id = v_tenant
     AND categories.name = rows.category
     AND categories.is_active
    ON CONFLICT ON CONSTRAINT ingredients_name_tenant_id_key
    DO UPDATE SET
      sku = EXCLUDED.sku,
      category_id = EXCLUDED.category_id,
      category = EXCLUDED.category,
      unit_cost = EXCLUDED.unit_cost,
      item_kind = EXCLUDED.item_kind,
      storage_type = EXCLUDED.storage_type,
      min_stock_level = EXCLUDED.min_stock_level,
      max_stock_level = EXCLUDED.max_stock_level,
      reorder_point = EXCLUDED.reorder_point,
      updated_at = now()
    RETURNING id, name
  )
  SELECT upserted.id, upserted.name, existing.name IS NOT NULL AS existed
  FROM upserted
  LEFT JOIN existing ON existing.name = upserted.name;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.bulk_import_ingredient_upserted upserted
    JOIN pg_temp.bulk_import_ingredient_rows rows
      ON rows.name = upserted.name
    JOIN public.units import_units
      ON import_units.tenant_id = v_tenant
     AND import_units.code = rows.unit
     AND import_units.is_active
    JOIN public.ingredient_units existing_base
      ON existing_base.tenant_id = v_tenant
     AND existing_base.ingredient_id = upserted.id
     AND existing_base.is_base
    WHERE upserted.existed
      AND existing_base.unit_id IS DISTINCT FROM import_units.id
  ) THEN
    RAISE EXCEPTION 'bulk_import_base_unit_change_forbidden' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, sort_order
  )
  SELECT
    v_tenant,
    upserted.id,
    base_units.id,
    1::numeric,
    true,
    0
  FROM pg_temp.bulk_import_ingredient_rows rows
  JOIN pg_temp.bulk_import_ingredient_upserted upserted
    ON upserted.name = rows.name
  JOIN public.units base_units
    ON base_units.tenant_id = v_tenant
   AND base_units.code = rows.unit
   AND base_units.is_active
  ON CONFLICT ON CONSTRAINT ingredient_units_ing_unit_key
  DO UPDATE SET
    to_base_factor = 1,
    is_base = true,
    sort_order = EXCLUDED.sort_order,
    is_active = true;

  SELECT
    count(*) FILTER (WHERE NOT existed),
    count(*) FILTER (WHERE existed)
  INTO v_inserted, v_updated
  FROM pg_temp.bulk_import_ingredient_upserted;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_ingredients(p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bulk_import_ingredients(p_rows jsonb) TO service_role;
GRANT ALL ON FUNCTION public.bulk_import_ingredients(p_rows jsonb) TO authenticated;

-- 5. scan_inventory_alerts — expiry tracking is retired; keep stock_low only.
--    Also fixes a stale ingredient unit reference (the dropped column was
--    dropped by 20260707002300_inventory_unit_system_phase_c.sql).
CREATE OR REPLACE FUNCTION public.scan_inventory_alerts() RETURNS TABLE(low_stock_count bigint, expiry_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_low BIGINT := 0;
  v_exp BIGINT := 0;
  v_today TEXT := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
BEGIN
  -- Low-stock alerts
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta,
      expires_at
    )
    SELECT
      sl.tenant_id,
      sl.branch_id,
      ARRAY['branch_manager', 'owner']::TEXT[],
      'inventory.stock_low',
      'warning',
      format('Tồn kho thấp: %s', ing.name),
      format('Còn %s (ngưỡng đặt lại %s)',
        trim(trailing '.0' from sl.current_quantity::text),
        trim(trailing '.0' from ing.reorder_point::text)),
      'ingredient',
      ing.id,
      format('/inventory/stock?ingredient=%s&branch=%s', ing.id, sl.branch_id),
      format('stock_low:ingredient:%s:branch:%s:%s', ing.id, sl.branch_id, v_today),
      jsonb_build_object(
        'current_quantity', sl.current_quantity,
        'reorder_point', ing.reorder_point,
        'branch_id', sl.branch_id
      ),
      (now() + interval '7 days')
    FROM public.stock_levels sl
    JOIN public.ingredients ing
      ON ing.id = sl.ingredient_id AND ing.tenant_id = sl.tenant_id
    WHERE ing.reorder_point IS NOT NULL
      AND ing.reorder_point > 0
      AND sl.current_quantity <= ing.reorder_point
      AND ing.is_active = true
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM inserted;

  v_exp := 0;

  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < now();

  RETURN QUERY SELECT v_low, v_exp;
END;
$$;

COMMENT ON FUNCTION public.scan_inventory_alerts() IS 'Emit inventory.stock_low notifications (idempotent per day via dedup_key). Wire to pg_cron.';

REVOKE ALL ON FUNCTION public.scan_inventory_alerts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.scan_inventory_alerts() TO service_role;

-- 6. Drop the now-unused expiry index ahead of the column drop.
DROP INDEX IF EXISTS public.idx_grn_items_expiry;

-- mv_inventory_stock_current selects ingredients.shelf_life_days; rebuild it
-- without that column before the column drop below.
DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_value_ranking;
DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_stock_current;

CREATE MATERIALIZED VIEW public.mv_inventory_stock_current AS
 SELECT sl.tenant_id,
    sl.branch_id,
    sl.location_id,
    il.name AS location_name,
    il.location_kind,
    sl.ingredient_id,
    ing.name AS ingredient_name,
    ing.category AS ingredient_category,
    ing.is_active AS ingredient_is_active,
    ing.item_kind,
    sl.current_quantity,
    sl.avg_unit_cost,
    ((sl.current_quantity * COALESCE(sl.avg_unit_cost, (0)::numeric)))::numeric(15,2) AS stock_value,
    ing.reorder_point,
    ing.min_stock_level,
    ing.max_stock_level,
    sl.updated_at,
    sl.last_counted_at
   FROM ((public.stock_levels sl
     JOIN public.inventory_locations il ON ((il.id = sl.location_id)))
     JOIN public.ingredients ing ON ((ing.id = sl.ingredient_id)))
  WHERE ((il.is_active = true) AND (ing.is_active = true))
  WITH NO DATA;

COMMENT ON MATERIALIZED VIEW public.mv_inventory_stock_current IS 'Per-location stock snapshot. RLS-NOT-APPLIED-ON-MV → direct access REVOKED, use wrapper RPCs.';

CREATE UNIQUE INDEX uq_mv_inv_stock_current ON public.mv_inventory_stock_current USING btree (tenant_id, branch_id, location_id, ingredient_id);
CREATE INDEX idx_mv_inv_stock_alerts ON public.mv_inventory_stock_current USING btree (branch_id, location_id) WHERE (reorder_point IS NOT NULL);

GRANT ALL ON TABLE public.mv_inventory_stock_current TO service_role;

CREATE MATERIALIZED VIEW public.mv_inventory_value_ranking AS
SELECT
  tenant_id,
  branch_id,
  ingredient_id,
  SUM(stock_value) AS total_value
FROM public.mv_inventory_stock_current
GROUP BY tenant_id, branch_id, ingredient_id
WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_inv_value_ranking
  ON public.mv_inventory_value_ranking (tenant_id, branch_id, ingredient_id);

REVOKE ALL ON public.mv_inventory_value_ranking FROM authenticated, anon;
GRANT ALL ON TABLE public.mv_inventory_value_ranking TO service_role;

REFRESH MATERIALIZED VIEW public.mv_inventory_stock_current;
REFRESH MATERIALIZED VIEW public.mv_inventory_value_ranking;

CREATE MATERIALIZED VIEW public.mv_inventory_value_ranking AS
 SELECT tenant_id,
    branch_id,
    ingredient_id,
    sum(stock_value) AS total_value
   FROM public.mv_inventory_stock_current
  GROUP BY tenant_id, branch_id, ingredient_id
  WITH NO DATA;

CREATE UNIQUE INDEX uq_mv_inv_value_ranking ON public.mv_inventory_value_ranking USING btree (tenant_id, branch_id, ingredient_id);
GRANT ALL ON TABLE public.mv_inventory_value_ranking TO service_role;
REFRESH MATERIALIZED VIEW public.mv_inventory_value_ranking;

-- 7. Drop the retired columns.
ALTER TABLE public.grn_items
  DROP COLUMN IF EXISTS batch_number,
  DROP COLUMN IF EXISTS expiry_date;

ALTER TABLE public.ingredients DROP COLUMN IF EXISTS shelf_life_days;

COMMIT;
