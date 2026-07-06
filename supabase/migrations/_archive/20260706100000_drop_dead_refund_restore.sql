-- D064-tail (A): remove the dead refund stock-restore path. No writer has set
-- payments.stock_consumed_status = 'ok' since D016 (2026-05); restoring stock
-- on a refund of a pre-D016 order would post phantom positive stock into the
-- post-2026-07-03 warehouse ledger.

CREATE OR REPLACE FUNCTION public.refund_paid_order(p_order_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor          uuid   := auth.uid();
  v_tenant         bigint := public.auth_tenant_id();
  v_order          record;
  v_payment        record;
  v_invoice        record;
  v_refund_id      bigint;
  v_in_summary     boolean := false;
  v_invoice_action text   := 'none';
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason_too_short' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_order.branch_id, 'pos:void_paid_order') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_already_cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, branch_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_tenant
    AND status = 'completed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_completed_payment' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_tenant
    AND status = 'completed'
    AND id <> v_payment.id;
  IF FOUND THEN
    RAISE EXCEPTION 'multiple_payments' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.amount > 0 THEN
    PERFORM 1
    FROM public.refunds
    WHERE payment_id = v_payment.id
      AND status IN ('pending', 'approved');
    IF FOUND THEN
      RAISE EXCEPTION 'already_refunded' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- HĐĐT: block daily_summary (B2C summary correction is accountant-only on portal).
  SELECT EXISTS (
    SELECT 1
    FROM public.tax_invoice_orders tio
    JOIN public.tax_invoices ti ON ti.id = tio.tax_invoice_id
    WHERE tio.order_id = p_order_id
      AND ti.invoice_kind = 'daily_summary'
      AND ti.status NOT IN ('cancelled', 'replaced')
  )
  INTO v_in_summary;
  IF v_in_summary THEN
    RAISE EXCEPTION 'order_in_daily_summary' USING ERRCODE = 'P0001';
  END IF;

  -- Classify the active per_order invoice (draft/signing/submitted/issued).
  SELECT id, status, provider_ref, provider, issued_at
  INTO v_invoice
  FROM public.tax_invoices
  WHERE order_id = p_order_id
    AND tenant_id = v_tenant
    AND invoice_kind = 'per_order'
    AND status IN ('draft', 'signing', 'submitted', 'issued')
  ORDER BY id DESC
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    -- Cross-period guard: a lodged invoice (already sent to the provider/CQT)
    -- from a prior tax period is assumed to belong to an already-declared period
    -- and must NOT be cancelled at POS; route to the accountant.
    --
    -- Lodged = status IN ('signing','submitted','issued') AND provider_ref IS
    -- NOT NULL. Earlier this fired only for status='issued', so a prior-period
    -- invoice still in signing/submitted (already dispatched, awaiting the CQT)
    -- fell through to the unconditional cancel below. All three lodged states are
    -- now covered.
    --
    -- The month boundary is evaluated in Asia/Ho_Chi_Minh (ICT), matching every
    -- other date boundary in baseline.sql. The prod session TZ is UTC, so a raw
    -- date_trunc('month', now()) is 7h off the ICT month edge. date_trunc on the
    -- ICT calendar month is a CONSERVATIVE proxy — the accountant must confirm
    -- the real declaration cutoff. The exact period-close hard-block is a
    -- separate deferred item.
    IF v_invoice.status IN ('signing', 'submitted', 'issued')
       AND v_invoice.provider_ref IS NOT NULL
       AND v_invoice.issued_at IS NOT NULL
       AND (v_invoice.issued_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
             < date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date THEN
      RAISE EXCEPTION 'cross_period_invoice' USING ERRCODE = 'P0001';
    END IF;

    -- DANGER: LOCAL state flip only. For an issued invoice this does NOT cancel
    -- the HĐĐT at Viettel/CQT — the provider cancel cannot run in this
    -- transaction. invoice_action='cancel_issued' is returned so the Phase-2
    -- voidPaidOrder Server Action calls invoiceProvider.cancelInvoice after
    -- commit. If that bridge is skipped the invoice stays live at the CQT.
    UPDATE public.tax_invoices
    SET status = 'cancelled',
        cancelled_at = now(),
        provider_data = COALESCE(provider_data, '{}'::jsonb)
          || jsonb_build_object(
               'cancelled',
               jsonb_build_object('cancel_reason', p_reason, 'source', 'pos_void_paid_order')
             ),
        updated_at = now()
    WHERE id = v_invoice.id;

    INSERT INTO public.tax_invoice_events
      (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
    VALUES (
      v_invoice.id, v_tenant, v_invoice.status, 'cancelled', v_actor,
      jsonb_build_object('cancel_reason', p_reason, 'source', 'pos_void_paid_order'),
      p_reason
    );

    v_invoice_action := CASE
      WHEN v_invoice.status = 'issued' THEN 'cancel_issued'
      ELSE 'cancel_predispatch'
    END;
  END IF;

  -- Money leg: a refund row only when there is money to return
  -- (refunds_amount_check requires amount > 0; zero-total comp / staff meals have none).
  IF v_payment.amount > 0 THEN
    INSERT INTO public.refunds
      (tenant_id, branch_id, payment_id, order_id, amount, reason,
       status, created_by, approved_by, approved_at, tax_invoice_id)
    VALUES (
      v_tenant, v_payment.branch_id, v_payment.id, p_order_id, v_payment.amount, p_reason,
      'approved', v_actor, v_actor, now(), v_invoice.id
    )
    RETURNING id INTO v_refund_id;
  END IF;

  -- Always flip the payment, including a zero-total comp, so a voided order never
  -- leaves a 'completed' payment on a 'cancelled' order (the reconciliation oracle
  -- flags that as a desync). A zero-total void has no refund row by design.
  UPDATE public.payments
  SET status = 'refunded', updated_at = now()
  WHERE id = v_payment.id;

  -- Order: cancel to drop from board + revenue. payment_status stays 'paid' (D020).
  --
  -- The status->'cancelled' update fires trg_orders_normalize_discount_totals
  -- (pos_normalize_order_discount_totals), which on a cancelled order resets the
  -- discount fields and sets total_amount = GREATEST(0, service_charge). This is
  -- the SAME behavior every other cancel path triggers and is ACCEPTED here:
  -- every revenue/report consumer filters status <> 'cancelled' (and
  -- get_daily_revenue also requires payments.status = 'completed', which this RPC
  -- has flipped to 'refunded'), so the rewritten total is never read for money.
  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;

  -- Cancelling order_items fires trg_decrement_branch_menu_daily_limit, which
  -- rolls back sold_today. For a paid + already-consumed order that slot is spent
  -- — freeing it would let a sold-out item be re-sold. Suppress the decrement via
  -- the same session GUC split_order uses for its quota-neutral clone insert
  -- (decrement_branch_menu_daily_limit itself has no skip guard, so we gate the
  -- enforce/decrement pair through comtammatu.skip_quota_enforcement). This mirrors
  -- the deliberately-gated stock restore: a post-paid void does NOT free quota.
  PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
  UPDATE public.order_items
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id
    AND status <> 'cancelled';
  PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id
    AND status NOT IN ('cancelled', 'served');

  -- Audit against the ORDER entity (stable for both money and zero-total comp
  -- voids); the refund id (NULL for a comp void) goes in the payload. Never write
  -- an order PK under entity_type='refund'.
  PERFORM public.log_audit(
    'refund.pos_void_after_paid',
    'order',
    p_order_id,
    NULL,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'order_id', p_order_id,
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'method', v_payment.method,
      'invoice_id', v_invoice.id,
      'invoice_action', v_invoice_action,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'refunded',
    'refund_id', v_refund_id,
    'amount', v_payment.amount,
    'method', v_payment.method,
    'invoice_id', v_invoice.id,
    'invoice_action', v_invoice_action,
    'invoice_provider_ref', v_invoice.provider_ref,
    'invoice_provider', v_invoice.provider
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_payment_and_post(p_refund_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  SELECT id, tenant_id, branch_id, amount, status
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
$$;

COMMENT ON FUNCTION public.reverse_payment_and_post(p_refund_id bigint) IS 'Atomic refund reversal with branch-scoped orders:refund_approve permission. Locks refund/payment/order, flips payment and refund, and audits. orders.payment_status intentionally stays ''paid'' (CHECK allows unpaid/pending/paid only; partial refunds make an order-level refunded label wrong) — refund truth = payments.status + refunds.';

DROP FUNCTION public.restore_stock_for_order(bigint, uuid);

COMMENT ON COLUMN public.payments.stock_consumed_status IS 'Historical only: no writer since D016 (2026-05-28 stock leg removal), no reader since D064-tail (A) (this migration removed the reverse_payment_and_post and refund_paid_order restore branches). Retained for audit of pre-2026-05 rows.';
