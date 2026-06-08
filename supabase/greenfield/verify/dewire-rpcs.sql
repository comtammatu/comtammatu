-- ============FN complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric, p_provider_data jsonb, p_actor_id uuid)============
CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(p_payment_id bigint, p_expected_amount numeric DEFAULT NULL::numeric, p_provider_data jsonb DEFAULT NULL::jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(status text, payment_id bigint, order_id bigint, stock_consumed boolean, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment          RECORD;
  v_order            RECORD;
  v_line_subtotal    NUMERIC(15,2) := 0;
  v_recomputed_total NUMERIC(15,2) := 0;
  v_stock_status     TEXT := NULL;
  v_stock_detail     TEXT := NULL;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT, p_payment_id, NULL::BIGINT, FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  SELECT o.id, o.tenant_id, o.branch_id, o.tax_amount, o.service_charge,
         o.discount_amount, o.total_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = v_payment.tenant_id
    AND o.branch_id = v_payment.branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'order_not_found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(oi.quantity::NUMERIC * oi.unit_price), 0)::NUMERIC(15,2)
  INTO v_line_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.tenant_id = v_order.tenant_id
    AND oi.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(v_payment.amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND ABS(p_expected_amount - v_recomputed_total) > 1 THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch_recomputed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('expected=' || p_expected_amount || ' recomputed=' || v_recomputed_total)::TEXT;
    RETURN;
  END IF;

  -- "không trừ kho" (owner policy 2026-05-28): stock consumption removed.

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    TRUE,
    'stock=ok'::TEXT;
END;
$function$;


-- ============FN confirm_goods_receipt_note(p_grn_id bigint)============
CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             UUID   := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_item            RECORD;
  v_branch          RECORD;
  v_old_q           NUMERIC(15,3);
  v_old_wac         NUMERIC(15,2);
  v_recv            NUMERIC(15,3);
  v_cost            NUMERIC(15,2);
  v_new_q           NUMERIC(15,3);
  v_new_wac         NUMERIC(15,2);
  v_location_id     BIGINT;
  v_inventory_total NUMERIC(15,2) := 0;
  v_journal_id      BIGINT;
  v_lines           JSONB;
  v_all_fulfilled   BOOLEAN;
  v_po_status       TEXT;
  v_review_pct      NUMERIC(5,2);
  v_review_count    INT := 0;
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
    AND b.branch_kind IN ('central_warehouse', 'central_kitchen');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_procurement' USING ERRCODE = '23514';
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

    v_cost := v_item.unit_cost;

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
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_grn.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;

    v_inventory_total := v_inventory_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  -- GL posting removed (no GL in HKD lean).

  IF v_grn.po_id IS NOT NULL THEN
    PERFORM 1
    FROM public.purchase_orders
    WHERE id = v_grn.po_id AND tenant_id = v_tenant
    FOR UPDATE;

    WITH ordered AS (
      SELECT poi.ingredient_id, SUM(poi.quantity)::NUMERIC(15,3) AS qty
      FROM public.purchase_order_items poi
      WHERE poi.po_id = v_grn.po_id
        AND poi.tenant_id = v_tenant
      GROUP BY poi.ingredient_id
    ),
    received AS (
      SELECT gi.ingredient_id,
             SUM(gi.received_quantity - COALESCE(gi.rejected_quantity, 0))::NUMERIC(15,3) AS qty
      FROM public.grn_items gi
      JOIN public.goods_received_notes g
        ON g.id = gi.grn_id AND g.status = 'confirmed'
      WHERE g.po_id = v_grn.po_id
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
            WHERE g2.po_id = v_grn.po_id
              AND g2.tenant_id = v_tenant
              AND gi2.short_delivery_action = 'accept_and_close'
          ) THEN 'received'
          ELSE 'partially_received'
        END,
        updated_at = now()
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant
      AND po.status IN ('sent', 'partially_received')
    RETURNING po.status INTO v_po_status;
  END IF;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_grn.po_id,
    'po_status', v_po_status,
    'review_count', v_review_count
  );
END;
$function$;


-- ============FN confirm_payment_and_post(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint, p_provider_ref text)============
CREATE OR REPLACE FUNCTION public.confirm_payment_and_post(p_payment_id bigint, p_tenant_id bigint, p_branch_id bigint, p_provider_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid           UUID := auth.uid();
  v_payment       RECORD;
  v_order         RECORD;
  v_journal_id    BIGINT;
  v_cogs_amount   NUMERIC(15,2);
  v_lines         JSONB;
  v_tax_amount    NUMERIC(15,2);
  v_net_amount    NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.* INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
    AND p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending' USING ERRCODE = '22023';
  END IF;

  SELECT o.id, o.total_amount, o.tax_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET status = 'completed',
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      paid_at = now(),
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'paid',
      updated_at = now()
  WHERE id = v_payment.order_id
    AND tenant_id = p_tenant_id;

  -- GL posting (COGS/journal) removed — no GL in HKD lean.
  PERFORM public.finalize_paid_order(v_payment.order_id, v_uid);

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'completed'
  );
END;
$function$;


-- ============FN confirm_vietqr_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_amount numeric, p_created_by uuid)============
CREATE OR REPLACE FUNCTION public.confirm_vietqr_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_amount numeric, p_created_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order          RECORD;
  v_payment_id     BIGINT;
  v_existing_id    BIGINT;
  v_existing_status TEXT;
  v_idempotent     BOOLEAN := FALSE;
  v_journal_id     BIGINT;
  v_cogs_amount    NUMERIC(15,2);
  v_tax_amount     NUMERIC(15,2);
  v_net_amount     NUMERIC(15,2);
  v_lines          JSONB;
  v_receipt_res    JSONB;
  v_print_job_id   BIGINT;
  v_print_failed   BOOLEAN := FALSE;
  v_print_error    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id          = p_order_id
    AND tenant_id   = p_tenant_id
    AND branch_id   = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE order_id  = p_order_id
      AND tenant_id = p_tenant_id
      AND status    = 'completed'
    ORDER BY id DESC LIMIT 1;

    RETURN jsonb_build_object(
      'payment_id', v_payment_id,
      'idempotent', TRUE,
      'print',      jsonb_build_object('failed', FALSE)
    );
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  SELECT id, status
  INTO v_existing_id, v_existing_status
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id  = p_order_id
    AND status   <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id := v_existing_id;
    v_idempotent := TRUE;

  ELSIF v_existing_status = 'pending' THEN
    UPDATE public.payments
    SET method     = 'vietqr',
        amount     = p_amount,
        status     = 'completed',
        paid_at    = now(),
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_payment_id;

  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id,
      method, amount, status, paid_at, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id,
      'vietqr', p_amount, 'completed', now(), p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  IF NOT v_idempotent THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        payment_method = 'vietqr',
        updated_at     = now()
    WHERE id = p_order_id;

    v_tax_amount := COALESCE(v_order.tax_amount, 0);
    v_net_amount := p_amount - v_tax_amount;

    SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
    INTO v_cogs_amount
    FROM public.stock_movements sm
    WHERE sm.order_id  = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.type      = 'consumption';

    v_lines := '[]'::JSONB;

    IF v_net_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',       'SALE_BANK',
        'amount',          v_net_amount,
        'line_description','Doanh thu đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_tax_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',       'SALE_VAT_BANK',
        'amount',          v_tax_amount,
        'line_description','Thuế GTGT đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_cogs_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',       'SALE_COGS',
        'amount',          v_cogs_amount,
        'line_description','Giá vốn đơn hàng #' || p_order_id
      ));
    END IF;

    -- GL posting removed (no GL in HKD lean).
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  BEGIN
    v_receipt_res  := public.enqueue_receipt_print(p_order_id, NULL, NULL);
    v_print_job_id := (v_receipt_res ->> 'job_id')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_print_failed := TRUE;
    v_print_error  := SQLERRM;
    RAISE NOTICE '[confirm_vietqr_payment] receipt print failed for order %: %',
      p_order_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'idempotent', v_idempotent,
    'print', jsonb_build_object(
      'job_id', v_print_job_id,
      'failed', v_print_failed,
      'error',  v_print_error
    )
  );
END;
$function$;


-- ============FN create_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_method text, p_amount numeric, p_created_by uuid, p_provider_ref text, p_status text)============
CREATE OR REPLACE FUNCTION public.create_payment(p_tenant_id bigint, p_branch_id bigint, p_order_id bigint, p_method text, p_amount numeric, p_created_by uuid, p_provider_ref text DEFAULT NULL::text, p_status text DEFAULT 'pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order                        RECORD;
  v_payment_id                   BIGINT;
  v_existing_payment_id          BIGINT;
  v_existing_status              TEXT;
  v_existing_method              TEXT;
  v_effective_method             TEXT;
  v_final_status                 TEXT;
  v_journal_id                   BIGINT;
  v_cogs_amount                  NUMERIC(15,2);
  v_revenue_rule                 TEXT;
  v_vat_rule                     TEXT;
  v_lines                        JSONB;
  v_tax_amount                   NUMERIC(15,2);
  v_net_amount                   NUMERIC(15,2);
  v_skip_completion_side_effects BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_method NOT IN ('cash', 'momo') THEN
    RAISE EXCEPTION 'invalid payment method: %. VietQR uses confirm_vietqr_payment.',
      p_method USING ERRCODE = '22023';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id        = p_order_id
    AND tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %', v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  v_final_status := CASE
    WHEN p_method = 'cash' THEN 'completed'
    ELSE COALESCE(p_status, 'pending')
  END;
  v_effective_method := p_method;

  SELECT id, status, method
  INTO v_existing_payment_id, v_existing_status, v_existing_method
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND order_id  = p_order_id
    AND status   <> 'failed'
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    v_payment_id                   := v_existing_payment_id;
    v_final_status                 := 'completed';
    v_effective_method             := v_existing_method;
    v_skip_completion_side_effects := TRUE;
  ELSIF v_existing_status = 'pending' THEN
    UPDATE public.payments
    SET method       = p_method,
        amount       = p_amount,
        status       = v_final_status,
        provider_ref = p_provider_ref,
        provider_data = NULL,
        paid_at      = CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
        updated_at   = now()
    WHERE id = v_existing_payment_id
    RETURNING id INTO v_payment_id;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status
      USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id,
      method, amount, status, provider_ref, paid_at, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id,
      p_method, p_amount, v_final_status,
      p_provider_ref,
      CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
      p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = v_effective_method,
      payment_status = CASE
        WHEN v_final_status = 'completed' THEN 'paid'
        ELSE payment_status
      END,
      updated_at     = now()
  WHERE id = p_order_id;

  IF v_final_status = 'completed' AND NOT v_skip_completion_side_effects THEN
    IF p_method = 'cash' THEN
      v_revenue_rule := 'SALE_CASH';
      v_vat_rule     := 'SALE_VAT_CASH';
    ELSE
      v_revenue_rule := 'SALE_BANK';
      v_vat_rule     := 'SALE_VAT_BANK';
    END IF;

    v_tax_amount := COALESCE(v_order.tax_amount, 0);
    v_net_amount := p_amount - v_tax_amount;

    SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
    INTO v_cogs_amount
    FROM public.stock_movements sm
    WHERE sm.order_id  = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.type      = 'consumption';

    v_lines := '[]'::JSONB;

    IF v_net_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',        v_revenue_rule,
        'amount',           v_net_amount,
        'line_description', 'Doanh thu đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_tax_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',        v_vat_rule,
        'amount',           v_tax_amount,
        'line_description', 'Thuế GTGT đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_cogs_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code',        'SALE_COGS',
        'amount',           v_cogs_amount,
        'line_description', 'Giá vốn đơn hàng #' || p_order_id
      ));
    END IF;

    -- GL posting removed (no GL in HKD lean).
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object(
    'payment_id',   v_payment_id,
    'status',       v_final_status,
    'idempotent',   v_skip_completion_side_effects
  );
END;
$function$;


-- ============FN create_supplier_payment(p_tenant_id bigint, p_supplier_invoice_id bigint, p_amount numeric, p_payment_method text, p_reference_note text)============
CREATE OR REPLACE FUNCTION public.create_supplier_payment(p_tenant_id bigint, p_supplier_invoice_id bigint, p_amount numeric, p_payment_method text, p_reference_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid(); v_invoice RECORD; v_branch_id BIGINT;
  v_payment_id BIGINT; v_new_paid NUMERIC(15,2); v_new_status TEXT;
  v_journal_id BIGINT; v_rule_code TEXT; v_lines JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission_any('finance:ap_pay') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501'; END IF;
  IF p_payment_method NOT IN ('cash','bank_transfer') THEN RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023'; END IF;

  SELECT si.* INTO v_invoice FROM public.supplier_invoices si
   WHERE si.id = p_supplier_invoice_id AND si.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_invoice.payment_status = 'paid' THEN RAISE EXCEPTION 'invoice_already_paid' USING ERRCODE = 'P0001'; END IF;

  v_new_paid := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  IF v_new_paid > v_invoice.total_amount THEN RAISE EXCEPTION 'payment_exceeds_invoice_total' USING ERRCODE = '22023'; END IF;
  v_new_status := CASE WHEN v_new_paid >= v_invoice.total_amount THEN 'paid' ELSE 'partial' END;

  SELECT branch_id INTO v_branch_id FROM public.goods_received_notes WHERE id = v_invoice.grn_id;
  IF v_branch_id IS NULL THEN
    SELECT branch_id INTO v_branch_id FROM public.purchase_orders WHERE id = v_invoice.po_id;
  END IF;

  INSERT INTO public.supplier_payments (tenant_id, supplier_invoice_id, payment_method, amount, payment_date, reference_note, created_by)
  VALUES (p_tenant_id, p_supplier_invoice_id, p_payment_method, p_amount, now(), p_reference_note, v_uid)
  RETURNING id INTO v_payment_id;

  UPDATE public.supplier_invoices
     SET payment_status = v_new_status, paid_amount = v_new_paid,
         paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END, updated_at = now()
   WHERE id = p_supplier_invoice_id;

  -- GL posting removed (no GL in HKD lean). Công-nợ tracked via supplier_invoices.paid_amount.
  RETURN jsonb_build_object('payment_id', v_payment_id, 'payment_status', v_new_status);
END;
$function$;


-- ============FN get_finance_dashboard_summary(p_start_date date, p_end_date date, p_branch_id bigint)============
CREATE OR REPLACE FUNCTION public.get_finance_dashboard_summary(p_start_date date, p_end_date date, p_branch_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(invoice_attention_count bigint, invoice_issued_count bigint, invoice_not_required_count bigint, journal_draft_count bigint, journal_posted_count bigint, failed_webhook_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = p_branch_id
        AND b.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'branch not found' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH scoped_tax_invoices AS MATERIALIZED (
    SELECT ti.*
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant
      AND (
        (p_branch_id IS NOT NULL AND ti.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR ti.branch_id = ANY(v_branch_ids)
          )
        )
      )
  ),
  scoped_failed_webhooks AS MATERIALIZED (
    SELECT we.id
    FROM public.webhook_events we
    LEFT JOIN public.payments p
      ON p.id = we.payment_id
     AND p.tenant_id = we.tenant_id
    WHERE we.tenant_id = v_tenant
      AND we.processing_status = 'failed'
      AND we.created_at >= v_start_utc
      AND we.created_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND p.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR p.branch_id = ANY(v_branch_ids)
          )
        )
      )
  )
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status IN ('draft', 'signing', 'submitted')
    ) AS invoice_attention_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'issued'
        AND ti.issued_at >= v_start_utc
        AND ti.issued_at < v_end_utc
    ) AS invoice_issued_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'not_required'
        AND ti.created_at >= v_start_utc
        AND ti.created_at < v_end_utc
    ) AS invoice_not_required_count,
    0::BIGINT AS journal_draft_count,
    0::BIGINT AS journal_posted_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_failed_webhooks
    ) AS failed_webhook_count;
END;
$function$;


-- ============FN reverse_payment_and_post(p_refund_id bigint)============
CREATE OR REPLACE FUNCTION public.reverse_payment_and_post(p_refund_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_refund          RECORD;
  v_payment         RECORD;
  v_order           RECORD;
  v_actor           UUID := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_je_id           BIGINT;
  v_dr_account_id   BIGINT;
  v_cr_account_id   BIGINT;
  v_cr_account_code TEXT;
  v_entry_number    TEXT;
  v_stock_count     INT := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, payment_id, order_id, amount, status
  INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund % not found', p_refund_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_refund.branch_id, 'orders:refund_approve') THEN
    RAISE EXCEPTION 'permission denied: orders:refund_approve required'
      USING ERRCODE = '42501';
  END IF;

  IF v_refund.status = 'approved' THEN
    RETURN jsonb_build_object(
      'status', 'already_approved',
      'refund_id', v_refund.id
    );
  END IF;
  IF v_refund.status <> 'pending' THEN
    RAISE EXCEPTION 'refund cannot transition from % to approved', v_refund.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = v_refund.payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', v_refund.payment_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment status=% - refund requires completed',
      v_payment.status USING ERRCODE = 'P0001';
  END IF;
  IF v_refund.amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund amount % exceeds payment amount %',
      v_refund.amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  SELECT id, tenant_id, branch_id, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = v_refund.order_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', v_refund.order_id
      USING ERRCODE = 'P0002';
  END IF;

  -- GL reversal + stock restore removed (no GL, no trừ kho in HKD lean).

  UPDATE public.payments
     SET status = 'refunded', updated_at = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'refunded', updated_at = now()
   WHERE id = v_order.id;

  UPDATE public.refunds
     SET status      = 'approved',
         approved_by = v_actor,
         approved_at = now(),
         updated_at  = now()
   WHERE id = v_refund.id;

  PERFORM public.log_audit(
    'refund.approve',
    'refund',
    v_refund.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'refund_id', v_refund.id,
    'payment_new_status', 'refunded',
    'order_new_status', 'refunded'
  );
END;
$function$;


-- ============FN transition_order_status(p_order_id bigint, p_new_status text, p_expected_status text, p_note text)============
CREATE OR REPLACE FUNCTION public.transition_order_status(p_order_id bigint, p_new_status text, p_expected_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_order RECORD;
BEGIN
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, table_id, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  IF v_order.status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %', v_order.status, p_expected_status, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (p_expected_status = 'new' AND p_new_status = 'confirmed')
    OR (p_expected_status = 'served' AND p_new_status = 'completed')
    OR (p_expected_status NOT IN ('completed') AND p_new_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %', p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_actor_tenant, p_order_id, v_order.status, p_new_status, v_actor_id, p_note
  );

  IF p_new_status = 'cancelled' THEN
    UPDATE public.order_items
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = p_order_id
      AND status NOT IN ('served', 'cancelled');
  END IF;

  -- consume_stock removed (không trừ kho).

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_order.status,
    'new_status', p_new_status
  );
END;
$function$;


