CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid   := auth.uid();
  v_tenant          bigint := public.auth_tenant_id();
  v_grn             record;
  v_item            record;
  v_branch          record;
  v_old_q           numeric(15,3);
  v_old_wac         numeric(15,2);
  v_recv            numeric(15,3);
  v_recv_base       numeric(15,3);
  v_cost            numeric(15,2);
  v_money           numeric(15,2);
  v_cost_base       numeric(15,2);
  v_new_q           numeric(15,3);
  v_new_wac         numeric(15,2);
  v_location_id     bigint;
  v_all_fulfilled   boolean;
  v_po_status       text;
  v_review_pct      numeric(5,2);
  v_review_count    int := 0;
  v_created_po_id   bigint;
  v_po_id           bigint;
  v_po_display      text;
  v_auto_po_lines   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id
    AND b.tenant_id = v_tenant
    AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_operational' USING ERRCODE = '23514';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_default_receive_location_missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(qc.price_variance_review_pct, 15.0)
  INTO v_review_pct
  FROM public.inventory_qc_settings qc
  WHERE qc.tenant_id = v_tenant;
  IF NOT FOUND THEN
    v_review_pct := 15.0;
  END IF;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.price_variance_pct IS NOT NULL
       AND ABS(v_item.price_variance_pct) > v_review_pct THEN
      UPDATE public.grn_items
      SET requires_review = TRUE
      WHERE id = v_item.id;
      v_review_count := v_review_count + 1;
    END IF;

    v_recv := v_item.received_quantity - COALESCE(v_item.rejected_quantity, 0);

    IF v_item.quality_status = 'rejected' OR v_recv <= 0 THEN
      CONTINUE;
    END IF;

    v_recv_base := public.inv_to_base(v_item.ingredient_id, v_item.entry_unit_id, v_recv);
    v_cost      := v_item.unit_cost;
    v_money     := ROUND(v_recv * v_cost, 2);
    v_cost_base := CASE WHEN v_recv_base <> 0 THEN ROUND(v_money / v_recv_base, 2) ELSE v_cost END;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv_base,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost_base, v_location_id,
      v_item.entry_unit_id, v_recv
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv_base;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_money
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost_base;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost_base, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;
  END LOOP;

  IF v_grn.po_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0
  ) THEN
    v_po_display := public.next_po_display_id(v_tenant);

    INSERT INTO public.purchase_orders (
      tenant_id, branch_id, supplier_id, po_number, display_id, status, notes, created_by
    ) VALUES (
      v_tenant, v_grn.branch_id, v_grn.supplier_id, v_po_display, v_po_display, 'sent',
      NULLIF(btrim(v_grn.notes), ''), v_uid
    ) RETURNING id INTO v_created_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id, po_id, ingredient_id, quantity, entry_unit_id, unit_price_est, line_total
    )
    SELECT
      v_tenant,
      v_created_po_id,
      gi.ingredient_id,
      (gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::numeric(15,3),
      gi.entry_unit_id,
      gi.unit_cost,
      ROUND((gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) * gi.unit_cost, 2)
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    GET DIAGNOSTICS v_auto_po_lines = ROW_COUNT;

    UPDATE public.grn_items gi
    SET po_quantity = gi.received_quantity - COALESCE(gi.rejected_quantity, 0),
        po_unit_price = gi.unit_cost
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND gi.quality_status <> 'rejected'
      AND gi.received_quantity - COALESCE(gi.rejected_quantity, 0) > 0;

    PERFORM public.log_audit(
      'inventory.po.created_from_grn',
      'purchase_order',
      v_created_po_id,
      NULL,
      jsonb_build_object(
        'grn_id', p_grn_id,
        'lines', v_auto_po_lines,
        'branch_id', v_grn.branch_id
      )
    );
  END IF;

  v_po_id := COALESCE(v_grn.po_id, v_created_po_id);

  UPDATE public.goods_received_notes
  SET status = 'confirmed', po_id = v_po_id, updated_at = now()
  WHERE id = p_grn_id;

  IF v_po_id IS NOT NULL THEN
    PERFORM 1
    FROM public.purchase_orders
    WHERE id = v_po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id,
             SUM(public.inv_to_base(poi.ingredient_id, poi.entry_unit_id, poi.quantity))::numeric(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_po_id
        AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(public.inv_to_base(gi.ingredient_id, gi.entry_unit_id,
                   gi.received_quantity - COALESCE(gi.rejected_quantity, 0)))::numeric(15,3) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      WHERE g.po_id = v_po_id
        AND gi.tenant_id = v_tenant
      GROUP BY gi.ingredient_id
    )
    SELECT bool_and(COALESCE(r.qty, 0) >= o.qty * 0.95)
    INTO v_all_fulfilled
    FROM ordered o
    LEFT JOIN received r USING (ingredient_id)
    WHERE o.qty > 0;

    UPDATE public.purchase_orders po
    SET status = CASE
          WHEN COALESCE(v_all_fulfilled, TRUE) THEN 'received'
          WHEN EXISTS (
            SELECT 1 FROM public.grn_items gi2
            JOIN public.goods_received_notes g2 ON g2.id = gi2.grn_id
            WHERE g2.po_id = v_po_id
              AND g2.tenant_id = v_tenant
              AND gi2.short_delivery_action = 'accept_and_close'
          ) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received')
    RETURNING po.status INTO v_po_status;
  END IF;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_po_id,
    'po_status', v_po_status,
    'review_count', v_review_count,
    'auto_po_created', v_created_po_id IS NOT NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint) IS 'Atomic confirm GRN. Stock += (received_quantity - rejected_quantity). PO-less GRNs create a received PO for 3-way matching. Permission: procurement:grn_confirm.';
