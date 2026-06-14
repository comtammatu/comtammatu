-- D020: Retire the enterprise double-entry GL (TT 200 / VAS) from the HKD product.
--
-- Authored from LIVE prod function definitions (pg_get_functiondef on the prod
-- project) plus a prod-introspected object manifest. Each rewritten RPC was
-- validated by diffing against its live definition: only the GL legs were
-- stripped; every non-GL behavior (auth, locks, validations, status flips,
-- stock, audit, return shape) is preserved.
--
-- KEEP (intentionally untouched): accounting_periods + close_period_soft /
-- close_period_hard / reopen_period (operational month-close, per D013);
-- HĐĐT tax_invoices + reconcile_run_log; all order / payment / stock logic.
--
-- Owner-applies to prod (no dev/test target). After applying, run
-- `pnpm db:types` to regenerate database.types.ts, then typecheck/lint/build.
-- See docs/plan/decisions.md D020 and docs/worklog/d020-retire-enterprise-gl-draft.md.

BEGIN;

-- ----------------------------------------------------------------------------
-- (1) Business RPC rewrites — GL legs removed, all other behavior byte-for-byte.
--     CREATE OR REPLACE preserves EXECUTE grants (authenticated/service_role).
-- ----------------------------------------------------------------------------

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
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object(
    'payment_id',   v_payment_id,
    'status',       v_final_status,
    'idempotent',   v_skip_completion_side_effects
  );
END;
$function$;

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

  PERFORM public.finalize_paid_order(v_payment.order_id, v_uid);

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'completed'
  );
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.create_supplier_payment(p_tenant_id bigint, p_supplier_invoice_id bigint, p_amount numeric, p_payment_method text, p_reference_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid(); v_invoice RECORD; v_branch_id BIGINT;
  v_payment_id BIGINT; v_new_paid NUMERIC(15,2); v_new_status TEXT;
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

  RETURN jsonb_build_object('payment_id', v_payment_id, 'payment_status', v_new_status);
END;
$function$;

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
    AND b.branch_kind = 'branch';

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
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

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

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
  v_line         RECORD;
  v_recv         NUMERIC(15,3);
  v_note         TEXT;
  v_cost         NUMERIC(15,2);
  v_old_q        NUMERIC(15,3);
  v_old_wac      NUMERIC(15,2);
  v_new_q        NUMERIC(15,3);
  v_new_wac      NUMERIC(15,2);
  v_key          TEXT;
  v_to_loc          RECORD;
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

  IF v_tr.from_branch_id = v_tr.to_branch_id THEN
    RAISE EXCEPTION 'intra_branch_transfer_already_atomic' USING ERRCODE = '22023';
  END IF;

  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> v_tr.to_branch_id) THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_tr.to_branch_id, 'inventory:transfer_receive') THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  IF v_tr.to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = v_tr.to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> v_tr.to_branch_id THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
      AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::TEXT;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::NUMERIC;
          v_note := (p_items -> v_key) ->> 'note';
        ELSE
          v_recv := (p_items ->> v_key)::NUMERIC;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items
      SET quantity_received = 0,
          receive_note = v_note
      WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id
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
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv,
        receive_note = v_note
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant BIGINT := public.auth_tenant_id();
  v_order RECORD; v_item RECORD; v_recipe RECORD;
  v_raw_need_measure NUMERIC(15,3); v_raw_need_purchase NUMERIC(15,3);
  v_conversion_factor NUMERIC(18,6); v_output_cost NUMERIC(15,2);
  v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2);
  v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
  v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
  v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
  v_location_id BIGINT;
  v_shortages JSONB := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind INTO v_order
  FROM public.production_orders po JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id AND po.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_order.branch_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_must_be_operational' USING ERRCODE = '23514';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_order.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'production_location_missing:%', v_order.branch_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_order_items poi
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;
    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
      SELECT pr.ingredient_id, pr.quantity, pr.yield_factor,
             ing.purchase_to_measure_factor,
             COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id     = v_tenant
       AND sl.branch_id     = v_order.branch_id
       AND sl.location_id   = v_location_id
       AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := TRUE;
      v_conversion_factor := COALESCE(v_recipe.purchase_to_measure_factor, 1);
      IF v_conversion_factor <= 0 THEN
        RAISE EXCEPTION 'production_conversion_factor_invalid:%', v_recipe.ingredient_id USING ERRCODE = '22023';
      END IF;

      v_raw_need_measure := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_raw_need_purchase := ROUND((v_raw_need_measure / v_conversion_factor)::NUMERIC, 3);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(v_need_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase), TRUE);
      v_cost_map := jsonb_set(v_cost_map, ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0))), TRUE);
      v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;
    IF NOT v_has_recipe THEN
      RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
    END IF;
    IF v_output_cost < 0 THEN
      RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023';
    END IF;
    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2) ELSE 0 END
    WHERE id = v_item.id;
  END LOOP;

  WITH shortages AS (
    SELECT
      (need.ingredient_id)::BIGINT AS ingredient_id,
      ing.name AS ingredient_name,
      COALESCE(ing.purchase_unit, ing.unit) AS unit,
      ROUND((need.need_qty)::NUMERIC, 3) AS needed,
      ROUND(COALESCE(sl.current_quantity, 0)::NUMERIC, 3) AS on_hand,
      ROUND(((need.need_qty)::NUMERIC - COALESCE(sl.current_quantity, 0))::NUMERIC, 3) AS missing
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    JOIN public.ingredients ing ON ing.id = (need.ingredient_id)::BIGINT
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id     = v_tenant
     AND sl.branch_id     = v_order.branch_id
     AND sl.location_id   = v_location_id
     AND sl.ingredient_id = (need.ingredient_id)::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < (need.need_qty)::NUMERIC
    ORDER BY ((need.need_qty)::NUMERIC - COALESCE(sl.current_quantity, 0)) DESC
    LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::JSONB) INTO v_shortages FROM shortages s;

  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock_for_production'
      USING ERRCODE = 'P0001',
            DETAIL  = v_shortages::TEXT;
  END IF;

  FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_key::BIGINT;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id
    )
    VALUES (
      v_tenant, v_order.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
      'Production ' || v_order.production_number, v_uid, p_order_id,
      COALESCE(v_old_wac, 0), v_location_id
    );
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id AND poi.tenant_id = v_tenant
  LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost, location_id
    )
    VALUES (
      v_tenant, v_order.branch_id, v_item.finished_good_id, 'production_output', v_item.quantity,
      'Production ' || v_order.production_number, v_uid, p_order_id, v_cost_total, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total) / v_new_q;
    ELSE
      v_new_wac := v_cost_total;
    END IF;

    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id     = v_tenant
      AND sl.branch_id     = v_order.branch_id
      AND sl.location_id   = v_location_id
      AND sl.ingredient_id = v_item.finished_good_id;

    UPDATE public.ingredients SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id AND tenant_id = v_tenant;

  END LOOP;

  UPDATE public.production_orders SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_order_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed');
END;
$function$;

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

  SELECT id, tenant_id, branch_id, amount, status, stock_consumed_status
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

  -- Lock kept for serialization against concurrent payment/cancel flows even
  -- though the order row is no longer mutated.
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

  -- Restore stock only when this payment actually consumed stock ('ok').
  -- NULL means stock was never consumed, so nothing is restored.
  IF v_payment.stock_consumed_status = 'ok' THEN
    BEGIN
      v_stock_count := public.restore_stock_for_order(v_refund.order_id, v_actor);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'restore_stock_for_order failed: %', SQLERRM;
    END;
  END IF;

  UPDATE public.payments
     SET status = 'refunded', updated_at = now()
   WHERE id = v_payment.id;

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
    jsonb_build_object(
      'status', 'approved',
      'stock_movements_created', v_stock_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'refund_id', v_refund.id,
    'stock_movements_created', v_stock_count,
    'payment_new_status', 'refunded'
  );
END;
$function$;

COMMENT ON FUNCTION public.reverse_payment_and_post(p_refund_id bigint) IS
  'Atomic refund reversal with branch-scoped orders:refund_approve permission. Locks refund/payment/order, restores stock ONLY when stock_consumed_status=''ok'' strictly (NULL = never consumed), flips payment and refund, and audits. orders.payment_status intentionally stays ''paid'' (CHECK allows unpaid/pending/paid only; partial refunds make an order-level refunded label wrong) — refund truth = payments.status + refunds.';

-- get_finance_dashboard_summary: return-shape change (drop journal_draft_count /
-- journal_posted_count). RETURNS TABLE signature changes, so REPLACE is illegal;
-- DROP + CREATE, then re-GRANT (DROP loses the EXECUTE grants).
DROP FUNCTION IF EXISTS public.get_finance_dashboard_summary(date, date, bigint);

CREATE FUNCTION public.get_finance_dashboard_summary(p_start_date date, p_end_date date, p_branch_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(invoice_attention_count bigint, invoice_issued_count bigint, invoice_not_required_count bigint, failed_webhook_count bigint)
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
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_failed_webhooks
    ) AS failed_webhook_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_finance_dashboard_summary(date, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_dashboard_summary(date, date, bigint) TO service_role;

-- ----------------------------------------------------------------------------
-- (2) Drop GL-only functions flagged "drop" (payroll/manual-journal/reconcile/
--     statement/seed). Done before the carrier-column and table drops they read.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_payroll_journal(p_payroll_period_id bigint);
DROP FUNCTION IF EXISTS public.create_manual_journal_entry(p_entry_date date, p_description text, p_lines jsonb, p_reference_type text, p_reference_id bigint, p_branch_id bigint);
DROP FUNCTION IF EXISTS public.post_manual_journal_entry(p_entry_id bigint);
DROP FUNCTION IF EXISTS public.next_manual_journal_entry_number(p_tenant_id bigint, p_entry_date date);
DROP FUNCTION IF EXISTS public.void_manual_journal_entry(p_entry_id bigint, p_reason text);
DROP FUNCTION IF EXISTS public.close_fiscal_period(p_tenant_id bigint, p_year integer, p_month integer, p_notes text);
DROP FUNCTION IF EXISTS public.validate_journal_balance(p_entry_id bigint);
DROP FUNCTION IF EXISTS public.ensure_journal_write_permission(p_branch_id bigint);
DROP FUNCTION IF EXISTS public.seed_chart_of_accounts(p_tenant_id bigint);
DROP FUNCTION IF EXISTS public.fn_generate_b01_dn(p_tenant_id bigint, p_as_of_date date);
DROP FUNCTION IF EXISTS public.fn_generate_b02_dn(p_tenant_id bigint, p_start_date date, p_end_date date);
DROP FUNCTION IF EXISTS public.fn_generate_b03_dn(p_tenant_id bigint, p_start_date date, p_end_date date);
DROP FUNCTION IF EXISTS public.fn_eval_account_expr(p_tenant_id bigint, p_start_date date, p_end_date date, p_expr jsonb);
DROP FUNCTION IF EXISTS public.fn_generate_form_01_gtgt(p_tenant_id bigint, p_year integer, p_month integer);
DROP FUNCTION IF EXISTS public.fn_reconcile_period(p_tenant_id bigint, p_start_date date, p_end_date date, p_branch_id bigint);
DROP FUNCTION IF EXISTS public.fn_reconcile_drilldown(p_tenant_id bigint, p_start_date date, p_end_date date, p_category text, p_side text, p_branch_id bigint, p_limit integer);
DROP FUNCTION IF EXISTS public.fn_reconcile_sales_by_day(p_branch_id bigint, p_start_date date, p_end_date date);
DROP FUNCTION IF EXISTS public.gl_reconciliation(p_tenant_id bigint, p_year integer, p_month integer);
DROP FUNCTION IF EXISTS public.auto_post_journal(p_tenant_id bigint, p_branch_id bigint, p_reference_type text, p_reference_id bigint, p_description text, p_lines jsonb, p_entry_date timestamp with time zone, p_posted_by uuid);

-- ----------------------------------------------------------------------------
-- (3) Drop the 7 journal_entry_id carrier columns. Dropping the column drops its
--     *_journal_entry_id_fkey FK automatically. payroll_periods TABLE is kept.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments             DROP COLUMN journal_entry_id;
ALTER TABLE public.goods_received_notes DROP COLUMN journal_entry_id;
ALTER TABLE public.supplier_invoices    DROP COLUMN journal_entry_id;
ALTER TABLE public.stock_transfers      DROP COLUMN journal_entry_id;
ALTER TABLE public.production_orders    DROP COLUMN journal_entry_id;
ALTER TABLE public.supplier_payments    DROP COLUMN journal_entry_id;
ALTER TABLE public.payroll_periods      DROP COLUMN journal_entry_id;

-- ----------------------------------------------------------------------------
-- (4) Drop GL guard triggers.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_journal_entries_no_delete_posted ON public.journal_entries;
DROP TRIGGER IF EXISTS trg_journal_entries_period_guard      ON public.journal_entries;

-- ----------------------------------------------------------------------------
-- (5) Drop GL guard-trigger functions (after their triggers).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.guard_journal_entry_no_delete_posted();
DROP FUNCTION IF EXISTS public.guard_journal_entry_period();

-- ----------------------------------------------------------------------------
-- (6) Drop the 6 GL tables. journal_entry_lines first (children of both
--     journal_entries and chart_of_accounts), then journal_entries (self-FK
--     void_journal_entry_id drops with table), then chart_of_accounts (self-FK
--     parent_id drops with table), then the standalone GL tables. The four
--     trg_*_updated_at triggers drop with their tables; update_updated_at() is
--     shared by 49 triggers and is NOT dropped. No external FK remains after
--     step (3), so no CASCADE is needed.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.journal_entry_lines;
DROP TABLE IF EXISTS public.journal_entries;
DROP TABLE IF EXISTS public.posting_rules;
DROP TABLE IF EXISTS public.chart_of_accounts;
DROP TABLE IF EXISTS public.fiscal_periods;
DROP TABLE IF EXISTS public.vas_report_lines;

COMMIT;
