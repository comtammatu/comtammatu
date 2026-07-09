BEGIN;

SET search_path TO '';

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
    rejection_reason, expiry_date, batch_number, receiving_temperature,
    po_unit_price, price_override_note, price_override_photo_url,
    rejected_photo_url, requires_review, short_delivery_action
  )
  SELECT
    tenant_id, v_new_grn_id, ingredient_id, po_quantity, received_quantity,
    entry_unit_id, unit_cost, total_cost, quality_status, rejected_quantity,
    rejection_reason, expiry_date, batch_number, receiving_temperature,
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

COMMIT;
