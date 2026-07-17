-- P1: movement-based refund restore. When a paid+completed+KDS-ready order is
-- refunded/voided, post the EXACT inverse of its sale_consumption rows so the
-- ledger does not permanently over-deduct inventory by the refunded amount.
--
-- Strategy: Option A — mirror the existing sale_consumption rows of the order.
-- This is exact-by-construction (same ingredient/location/entry_unit/unit_cost/
-- magnitude), immune to recipe drift between sale and refund, and is the direct
-- inverse the ledger expects. The legacy restore_stock_for_order (Option B,
-- re-derive from recipes) was retired in 20260706100000 because it posted
-- phantom positive stock.
--
-- Implicit gate: if the order has no sale_consumption rows (flag was OFF at
-- sale time, or order was never paid+completed+KDS-ready), the reverse-lookup
-- yields zero rows and the restore is a no-op. No explicit flag check — restore
-- fires iff consumption actually happened, regardless of the flag's current
-- value (covers the sale-time-ON / refund-time-OFF edge).
--
-- Order: (1) add subtype + idempotency index, (2) declare the restore function,
-- (3) re-declare refund_paid_order and reverse_payment_and_post verbatim with
-- the restore hooked in.

SET search_path = '';
SET check_function_bodies = off;

-- ============================================================
-- 1. Extend movement_subtype CHECK with 'sale_consumption_restore'.
--    The type 'refund_restore' is already in stock_movements_type_check and in
--    the sign-vs-type CHECK (quantity_change >= 0) added by 20260708122000.
-- ============================================================
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_subtype_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_subtype_check
  CHECK (movement_subtype IS NULL
         OR movement_subtype IN (
              'storage_loss',
              'sale_consumption',
              'sale_consumption_restore',
              'cancelled_after_kds_ready',
              'writeoff',
              'other'
            ));

-- ============================================================
-- 2. Idempotency: separate partial unique index for restore rows. Do NOT widen
--    the existing idx_stock_movements_pos_outcome_idempotency — its predicate
--    matches the consumption subtypes only and widening it would break the
--    consumption function's ON CONFLICT clause.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_restore_idempotency
  ON public.stock_movements (tenant_id, order_id, movement_subtype, ingredient_id, location_id)
  WHERE order_id IS NOT NULL
    AND movement_subtype = 'sale_consumption_restore';

-- ============================================================
-- 3. post_pos_sale_refund_restore(p_order_id, p_actor_id)
--    Posts the exact inverse of an order's sale_consumption rows. Idempotent
--    via idx_stock_movements_pos_restore_idempotency. No explicit flag gate:
--    the reverse-lookup is the truth (no consumption rows -> no-op).
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_pos_sale_refund_restore(
  p_order_id bigint,
  p_actor_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor  uuid    := COALESCE(p_actor_id, auth.uid());
  v_order  record;
  v_count  int     := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT o.tenant_id, o.branch_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'restored', false, 'skipped', true, 'reason', 'order_not_found');
  END IF;

  -- Idempotency short-circuit: already restored.
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_order.tenant_id
      AND sm.order_id = p_order_id
      AND sm.movement_subtype = 'sale_consumption_restore'
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'restored', true, 'skipped', true, 'reason', 'already_restored');
  END IF;

  -- Exact inverse of the sale_consumption rows for this order. Each consumption
  -- row has quantity_change <= 0; the inverse is -orig.quantity_change (>= 0),
  -- satisfying the sign-vs-type CHECK on type='refund_restore'.
  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    type,
    movement_subtype,
    quantity_change,
    reason,
    created_by,
    order_id,
    unit_cost,
    location_id,
    entry_unit_id,
    entry_quantity
  )
  SELECT
    orig.tenant_id,
    orig.branch_id,
    orig.ingredient_id,
    'refund_restore',
    'sale_consumption_restore',
    -orig.quantity_change,
    'Refund restore for order ' || p_order_id::text,
    v_actor,
    orig.order_id,
    orig.unit_cost,
    orig.location_id,
    orig.entry_unit_id,
    orig.entry_quantity
  FROM public.stock_movements orig
  WHERE orig.tenant_id = v_order.tenant_id
    AND orig.order_id = p_order_id
    AND orig.type = 'consumption'
    AND orig.movement_subtype = 'sale_consumption'
  ON CONFLICT (tenant_id, order_id, movement_subtype, ingredient_id, location_id)
    WHERE order_id IS NOT NULL
      AND movement_subtype = 'sale_consumption_restore'
  DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'restored', v_count > 0,
    'movements_created', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_pos_sale_refund_restore(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_pos_sale_refund_restore(bigint, uuid) TO service_role;

-- ============================================================
-- 4. Hook into refund_paid_order: re-declared verbatim from
--    migration-archive/20260706100000 with ONE added line — after the KDS-tickets
--    cancel and before the audit, PERFORM the restore. Signature, guards,
--    invoice handling, money leg, and return shape are unchanged.
-- ============================================================
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
    IF v_invoice.status IN ('signing', 'submitted', 'issued')
       AND v_invoice.provider_ref IS NOT NULL
       AND v_invoice.issued_at IS NOT NULL
       AND (v_invoice.issued_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
             < date_trunc('month', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date THEN
      RAISE EXCEPTION 'cross_period_invoice' USING ERRCODE = 'P0001';
    END IF;

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

  UPDATE public.payments
  SET status = 'refunded', updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;

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

  -- Stock restore: post the inverse of this order's sale_consumption rows.
  -- No-op when no consumption was posted (flag was OFF at sale time).
  PERFORM public.post_pos_sale_refund_restore(p_order_id, v_actor);

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

REVOKE ALL ON FUNCTION public.refund_paid_order(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO authenticated, service_role;

-- ============================================================
-- 5. Hook into reverse_payment_and_post: re-declared verbatim from
--    migration-archive/20260706100000 with the hardcoded `v_stock_count := 0` replaced
--    by the restore result (captured into v_stock_count so the audit + return
--    payload report it truthfully). Signature, guards, and return shape are
--    unchanged.
-- ============================================================
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
  v_restore_result  jsonb;
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

  -- Stock restore: inverse of this order's sale_consumption rows.
  v_restore_result := public.post_pos_sale_refund_restore(v_refund.order_id, v_actor);
  IF v_restore_result ? 'movements_created' THEN
    v_stock_count := COALESCE((v_restore_result ->> 'movements_created')::int, 0);
  END IF;

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

REVOKE ALL ON FUNCTION public.reverse_payment_and_post(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment_and_post(bigint) TO authenticated, service_role;
