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
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_line            RECORD;
  v_old_qty         NUMERIC(15,3);
  v_old_rej         NUMERIC(15,3);
  v_old_cost        NUMERIC(15,2);
  v_old_net         NUMERIC(15,3);
  v_old_net_base    NUMERIC(15,3);
  v_new_qty         NUMERIC(15,3) := p_received_quantity;
  v_new_rej         NUMERIC(15,3);
  v_new_cost        NUMERIC(15,2) := p_unit_cost;
  v_new_cost_base   NUMERIC(15,2);
  v_new_net         NUMERIC(15,3);
  v_new_net_base    NUMERIC(15,3);
  v_delta_qty       NUMERIC(15,3);
  v_delta_base      NUMERIC(15,3);
  v_delta_value     NUMERIC(15,2);
  v_current_qty     NUMERIC(15,3);
  v_current_wac     NUMERIC(15,2);
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
     OR p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

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

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

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
      UPDATE public.stock_levels
      SET avg_unit_cost = CASE
            WHEN current_quantity > 0 THEN ROUND(
              ((v_current_qty * COALESCE(v_current_wac, 0)) + (v_delta_base * v_new_cost_base))
              / current_quantity,
              2
            )
            ELSE v_new_cost_base
          END,
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
      total_cost = ROUND(v_new_qty * v_new_cost, 2)
  WHERE id = p_line_id AND tenant_id = v_tenant;

  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1 FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id, SUM(poi.quantity)::NUMERIC(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::NUMERIC(15,3) AS qty
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
) IS 'Owner-only post-confirm GRN line amendment. Delta is converted from entry unit to ingredient base before posting stock_movements.';

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.type = 'grn_amend'
      AND sm.grn_id IS NOT NULL
      AND (sm.entry_unit_id IS NULL OR sm.entry_quantity IS NULL)
  ) THEN
    RAISE EXCEPTION 'grn_amend_backfill_requires_manual_review' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    JOIN public.grn_items gi
      ON gi.tenant_id = sm.tenant_id
     AND gi.grn_id = sm.grn_id
     AND gi.ingredient_id = sm.ingredient_id
    LEFT JOIN public.ingredient_units iu
      ON iu.tenant_id = gi.tenant_id
     AND iu.ingredient_id = gi.ingredient_id
     AND iu.unit_id = COALESCE(sm.entry_unit_id, gi.entry_unit_id)
     AND iu.is_active = TRUE
    WHERE sm.type = 'grn_receipt'
      AND sm.grn_id IS NOT NULL
      AND COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) > 0
      AND COALESCE(sm.entry_unit_id, gi.entry_unit_id) IS NOT NULL
      AND iu.id IS NULL
  ) THEN
    RAISE EXCEPTION 'grn_entry_unit_backfill_missing_conversion' USING ERRCODE = '23503';
  END IF;
END$$;

WITH targets AS (
  SELECT
    sm.id AS movement_id,
    sm.tenant_id,
    sm.branch_id,
    sm.location_id,
    sm.ingredient_id,
    sm.quantity_change AS old_quantity_change,
    sm.unit_cost AS old_unit_cost,
    COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::NUMERIC(15,3) AS entry_quantity,
    COALESCE(sm.entry_unit_id, gi.entry_unit_id) AS entry_unit_id,
    ROUND(
      (
        COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
        * COALESCE(iu.to_base_factor, 1)
      )::NUMERIC,
      3
    )::NUMERIC(15,3) AS expected_base,
    CASE
      WHEN ROUND(
        (
          COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
          * COALESCE(iu.to_base_factor, 1)
        )::NUMERIC,
        3
      ) <> 0
        THEN ROUND(
          (
            COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
            * gi.unit_cost
          )
          / ROUND(
            (
              COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
              * COALESCE(iu.to_base_factor, 1)
            )::NUMERIC,
            3
          ),
          2
        )
      ELSE gi.unit_cost
    END::NUMERIC(15,2) AS expected_unit_cost
  FROM public.stock_movements sm
  JOIN public.grn_items gi
    ON gi.tenant_id = sm.tenant_id
   AND gi.grn_id = sm.grn_id
   AND gi.ingredient_id = sm.ingredient_id
  LEFT JOIN public.ingredient_units iu
    ON iu.tenant_id = gi.tenant_id
   AND iu.ingredient_id = gi.ingredient_id
   AND iu.unit_id = COALESCE(sm.entry_unit_id, gi.entry_unit_id)
   AND iu.is_active = TRUE
  WHERE sm.type = 'grn_receipt'
    AND sm.grn_id IS NOT NULL
    AND COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0)) > 0
    AND ABS(
      ABS(sm.quantity_change)
      - ROUND(
          (
            COALESCE(sm.entry_quantity, gi.received_quantity - COALESCE(gi.rejected_quantity, 0))
            * COALESCE(iu.to_base_factor, 1)
          )::NUMERIC,
          3
        )
    ) > 0.0005
),
updated_movements AS (
  UPDATE public.stock_movements sm
  SET quantity_change = CASE
        WHEN targets.old_quantity_change < 0 THEN -targets.expected_base
        ELSE targets.expected_base
      END,
      unit_cost = targets.expected_unit_cost,
      entry_unit_id = targets.entry_unit_id,
      entry_quantity = targets.entry_quantity
  FROM targets
  WHERE sm.id = targets.movement_id
  RETURNING
    sm.tenant_id,
    sm.branch_id,
    sm.location_id,
    sm.ingredient_id,
    CASE
      WHEN targets.old_quantity_change < 0 THEN -targets.expected_base
      ELSE targets.expected_base
    END - targets.old_quantity_change AS delta
),
level_deltas AS (
  SELECT
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    SUM(delta)::NUMERIC(15,3) AS delta
  FROM updated_movements
  WHERE ABS(delta) > 0.0005
  GROUP BY tenant_id, branch_id, location_id, ingredient_id
)
UPDATE public.stock_levels sl
SET current_quantity = sl.current_quantity + agg.delta,
    avg_unit_cost = CASE
      WHEN sl.current_quantity + agg.delta > 0 THEN ROUND(
        (sl.current_quantity * COALESCE(sl.avg_unit_cost, 0))
        / (sl.current_quantity + agg.delta),
        2
      )
      ELSE sl.avg_unit_cost
    END,
    updated_at = now()
FROM level_deltas agg
WHERE sl.tenant_id = agg.tenant_id
  AND sl.branch_id IS NOT DISTINCT FROM agg.branch_id
  AND sl.location_id = agg.location_id
  AND sl.ingredient_id = agg.ingredient_id;
