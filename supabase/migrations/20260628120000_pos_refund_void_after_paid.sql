-- POS refund / void-after-paid (Phase 1).
--
-- DRAFT FOR OWNER REVIEW. The accountant must confirm the Q3 cross-period rule
-- (see the cross_period_invoice block below) before this is relied on for tax.
-- This reverses decision D023 in a limited way; the superseding decision is D049
-- in docs/plan/decisions.md. Owner applies this to PROD manually, then runs
-- `pnpm db:types`. Not auto-executed and not applied by any agent.
--
-- Reuses the existing refund subsystem (refunds) and the existing HĐĐT cancel
-- capability by inlining the tax_invoices flip (Q4: manager gate is the authority;
-- does NOT call transition_tax_invoice_state, which requires owner-only
-- settings:tenant).

-- 1. Permission key catalog. permission_keys requires module + scope (NOT NULL);
--    this is a branch-scoped POS permission, mirroring every other pos: key.
INSERT INTO public.permission_keys (key, module, description, scope)
VALUES (
  'pos:void_paid_order',
  'pos',
  'Huỷ đơn đã thanh toán tại POS (hoàn tiền + huỷ HĐĐT); manager-gated',
  'branch'
)
ON CONFLICT (key) DO NOTHING;

-- 2. Grant pos:void_paid_order to owner + branch_manager role_templates.
--    role_templates.permission_keys is a text[] seeded per position_code; append
--    idempotently (re-run safe) so owner re-grant via apply_template_to_user picks
--    it up. Per-user backfill (apply_template_to_user) is still required for
--    existing managers — appending here does NOT auto-grant live users.
UPDATE public.role_templates
SET permission_keys = array_append(permission_keys, 'pos:void_paid_order'),
    updated_at = now()
WHERE position_code IN ('owner', 'branch_manager')
  AND NOT ('pos:void_paid_order' = ANY (permission_keys));

-- 3. Link a refund to the per_order HĐĐT it reverses (NULL = no active invoice).
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS tax_invoice_id bigint REFERENCES public.tax_invoices(id);

COMMENT ON COLUMN public.refunds.tax_invoice_id IS
  'Per-order HĐĐT reversed by this refund (set by refund_paid_order). NULL when the order had no active invoice.';

-- 4. POS-facing atomic refund RPC. Manager-gated, reason 20..500, branch+tenant scoped.
CREATE OR REPLACE FUNCTION public.refund_paid_order(p_order_id bigint, p_reason text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
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

  SELECT id, branch_id, amount, status, method, stock_consumed_status
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
    -- Q3 cross-period guard: an issued invoice from a prior month is assumed to
    -- belong to an already-declared tax period and must NOT be cancelled at POS;
    -- route to the accountant. date_trunc('month', now()) is a CONSERVATIVE proxy
    -- — the accountant must confirm the real declaration cutoff. The exact
    -- period-close hard-block is a separate deferred item.
    IF v_invoice.status = 'issued'
       AND v_invoice.issued_at IS NOT NULL
       AND v_invoice.issued_at < date_trunc('month', now()) THEN
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

  -- Money leg: skip for zero-total comp / staff meals.
  IF v_payment.amount > 0 THEN
    INSERT INTO public.refunds
      (tenant_id, branch_id, payment_id, order_id, amount, reason,
       status, created_by, approved_by, approved_at, tax_invoice_id)
    VALUES (
      v_tenant, v_payment.branch_id, v_payment.id, p_order_id, v_payment.amount, p_reason,
      'approved', v_actor, v_actor, now(), v_invoice.id
    )
    RETURNING id INTO v_refund_id;

    -- D016: POS does not consume stock, so this is normally a no-op.
    IF v_payment.stock_consumed_status = 'ok' THEN
      PERFORM public.restore_stock_for_order(p_order_id, v_actor);
    END IF;

    UPDATE public.payments
    SET status = 'refunded', updated_at = now()
    WHERE id = v_payment.id;
  END IF;

  -- Order: cancel to drop from board + revenue. payment_status stays 'paid' (D020).
  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;
  UPDATE public.order_items
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id
    AND status <> 'cancelled';
  UPDATE public.kds_tickets
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = p_order_id
    AND status NOT IN ('cancelled', 'served');

  PERFORM public.log_audit(
    'refund.pos_void_after_paid',
    'refund',
    COALESCE(v_refund_id, p_order_id),
    NULL,
    jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.refund_paid_order(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO service_role;
