BEGIN;

SET search_path TO '';

CREATE OR REPLACE FUNCTION public.amend_grn_line(
  p_grn_id bigint,
  p_line_id bigint,
  p_received_quantity numeric,
  p_unit_cost numeric,
  p_reason text,
  p_rejected_quantity numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_numeric_15_3_max CONSTANT NUMERIC := 999999999999.999;
  c_numeric_15_2_max CONSTANT NUMERIC := 9999999999999.99;
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_line            RECORD;
  v_old_qty         NUMERIC;
  v_old_rej         NUMERIC;
  v_old_cost        NUMERIC;
  v_old_net         NUMERIC;
  v_old_net_base    NUMERIC;
  v_new_qty         NUMERIC;
  v_new_rej         NUMERIC;
  v_new_cost        NUMERIC;
  v_new_cost_base   NUMERIC;
  v_new_net         NUMERIC;
  v_new_net_base    NUMERIC;
  v_delta_qty       NUMERIC;
  v_delta_base      NUMERIC;
  v_delta_value     NUMERIC;
  v_new_total_cost  NUMERIC;
  v_current_qty     NUMERIC;
  v_current_wac     NUMERIC;
  v_next_wac        NUMERIC;
  v_active_returns  INT;
  v_paid_invoices   INT;
  v_location_id     BIGINT;
  v_invoice_id      BIGINT;
  v_po_status       TEXT;
  v_all_fulfilled   BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required_min_5_chars' USING ERRCODE = '22023';
  END IF;

  IF p_received_quantity IS NULL OR p_received_quantity < 0
     OR p_received_quantity > c_numeric_15_3_max
     OR p_unit_cost IS NULL OR p_unit_cost < 0
     OR p_unit_cost > c_numeric_15_2_max
     OR (p_rejected_quantity IS NOT NULL AND (
       p_rejected_quantity < 0 OR p_rejected_quantity > c_numeric_15_3_max
     )) THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  v_new_qty := p_received_quantity;
  v_new_cost := p_unit_cost;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_amend') THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF v_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed_use_upsert' USING ERRCODE = '22023';
  END IF;

  SELECT gi.* INTO v_line
  FROM public.grn_items gi
  WHERE gi.id = p_line_id
    AND gi.grn_id = p_grn_id
    AND gi.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_line_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_old_qty := v_line.received_quantity;
  v_old_rej := COALESCE(v_line.rejected_quantity, 0);
  v_old_cost := v_line.unit_cost;
  v_old_net := v_old_qty - v_old_rej;

  v_new_rej := COALESCE(p_rejected_quantity, v_old_rej);

  IF v_new_rej < 0 OR v_new_rej > v_new_qty THEN
    RAISE EXCEPTION 'rejected_exceeds_received' USING ERRCODE = '22023';
  END IF;

  v_new_net := v_new_qty - v_new_rej;
  v_old_net_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_old_net);
  v_new_net_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_new_net);
  v_new_cost_base := CASE
    WHEN v_new_net_base <> 0 THEN ROUND((v_new_net * v_new_cost) / v_new_net_base, 2)
    ELSE v_new_cost
  END;
  v_new_total_cost := ROUND(v_new_qty * v_new_cost, 2);

  IF v_new_net_base < 0
     OR abs(v_new_net_base) > c_numeric_15_3_max
     OR abs(v_new_cost_base) > c_numeric_15_2_max
     OR abs(v_new_total_cost) > c_numeric_15_2_max THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_active_returns
  FROM public.supplier_return_items sri
  JOIN public.supplier_returns sr ON sr.id = sri.return_id
  WHERE sri.tenant_id = v_tenant
    AND sri.grn_item_id = p_line_id
    AND sr.status NOT IN ('cancelled');

  IF v_active_returns > 0 THEN
    RAISE EXCEPTION 'has_active_supplier_return' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO v_paid_invoices
  FROM public.supplier_invoices si
  WHERE si.tenant_id = v_tenant
    AND si.grn_id = p_grn_id
    AND COALESCE(si.payment_status, 'unpaid') <> 'unpaid';

  IF v_paid_invoices > 0 THEN
    RAISE EXCEPTION 'has_paid_invoice' USING ERRCODE = '23514';
  END IF;

  v_delta_qty := v_new_net - v_old_net;
  v_delta_base := v_new_net_base - v_old_net_base;
  v_delta_value := (v_new_net * v_new_cost) - (v_old_net * v_old_cost);

  IF abs(v_delta_base) > c_numeric_15_3_max
     OR abs(v_delta_qty) > c_numeric_15_3_max THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF v_grn.location_id IS NOT NULL THEN
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.id = v_grn.location_id
      AND il.branch_id = v_grn.branch_id
      AND il.tenant_id = v_tenant
      AND il.is_active = TRUE
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'grn_receive_location_invalid' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_grn.branch_id
      AND il.tenant_id = v_tenant
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    ORDER BY il.sort_order NULLS LAST, il.id
    LIMIT 1;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'grn_receive_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT current_quantity, avg_unit_cost
  INTO v_current_qty, v_current_wac
  FROM public.stock_levels
  WHERE tenant_id = v_tenant
    AND branch_id = v_grn.branch_id
    AND location_id = v_location_id
    AND ingredient_id = v_line.ingredient_id
  FOR UPDATE;

  v_current_qty := COALESCE(v_current_qty, 0);

  IF v_current_qty + v_delta_base < 0 THEN
    RAISE EXCEPTION 'negative_stock' USING ERRCODE = '23514';
  END IF;

  IF abs(v_current_qty + v_delta_base) > c_numeric_15_3_max THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF v_delta_base <> 0 THEN
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_grn.branch_id, v_line.ingredient_id, 'grn_amend',
      v_delta_base,
      'GRN ' || v_grn.grn_number || ' amend (line ' || p_line_id || '): '
        || v_old_qty || '/' || v_old_rej || ' -> ' || v_new_qty || '/' || v_new_rej
        || ' @ ' || v_old_cost || ' -> ' || v_new_cost
        || ' - ' || trim(p_reason),
      v_uid, p_grn_id, v_new_cost_base, v_location_id,
      v_line.entry_unit_id, ABS(v_delta_qty)
    );

    IF v_delta_base > 0 THEN
      v_next_wac := CASE
        WHEN v_current_qty + v_delta_base > 0 THEN ROUND(
          ((v_current_qty * COALESCE(v_current_wac, 0)) + (v_delta_base * v_new_cost_base))
          / (v_current_qty + v_delta_base),
          2
        )
        ELSE v_new_cost_base
      END;

      IF abs(v_next_wac) > c_numeric_15_2_max THEN
        RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
      END IF;

      UPDATE public.stock_levels
      SET avg_unit_cost = v_next_wac,
          updated_at = now()
      WHERE tenant_id = v_tenant
        AND branch_id = v_grn.branch_id
        AND location_id = v_location_id
        AND ingredient_id = v_line.ingredient_id;
    END IF;
  END IF;

  UPDATE public.grn_items
  SET received_quantity = v_new_qty,
      rejected_quantity = v_new_rej,
      unit_cost = v_new_cost,
      total_cost = v_new_total_cost
  WHERE id = p_line_id AND tenant_id = v_tenant;

  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1 FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id,
             SUM(public.inv_to_base(poi.ingredient_id, poi.entry_unit_id, poi.quantity)) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(public.inv_to_base(gi.ingredient_id, gi.entry_unit_id,
                   gi.received_quantity - COALESCE(gi.rejected_quantity, 0))) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      WHERE g.po_id = v_grn.po_id AND gi.tenant_id = v_tenant
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
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received', 'received')
    RETURNING po.status INTO v_po_status;
  END IF;

  FOR v_invoice_id IN
    SELECT id FROM public.supplier_invoices
    WHERE tenant_id = v_tenant AND grn_id = p_grn_id
  LOOP
    PERFORM public.recompute_supplier_invoice_matching(v_invoice_id);
  END LOOP;

  RETURN jsonb_build_object(
    'grn_id',      p_grn_id,
    'line_id',     p_line_id,
    'old_qty',     v_old_qty,
    'old_rejected', v_old_rej,
    'new_qty',     v_new_qty,
    'new_rejected', v_new_rej,
    'old_cost',    v_old_cost,
    'new_cost',    v_new_cost,
    'delta_qty',   v_delta_qty,
    'delta_base',  v_delta_base,
    'delta_value', v_delta_value,
    'location_id', v_location_id,
    'po_id',       v_grn.po_id,
    'po_status',   v_po_status
  );
END;
$$;

COMMENT ON FUNCTION public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  numeric
) IS 'Owner-only post-confirm GRN line amendment. Delta posts to the GRN receipt location and is converted from entry unit to ingredient base before posting stock_movements.';

REVOKE ALL ON FUNCTION public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  numeric
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.amend_grn_line(
  bigint,
  bigint,
  numeric,
  numeric,
  text,
  numeric
) TO service_role;

COMMIT;
