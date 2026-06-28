-- POS refund / void-after-paid (Phase 1).
--
-- DRAFT FOR OWNER REVIEW. The accountant must confirm the cross-period rule
-- (see the cross_period_invoice block below) before this is relied on for tax.
-- This reverses decision D023 in a limited way; the superseding decision is D049
-- in docs/plan/decisions.md. Owner applies this to PROD manually, then runs
-- `pnpm db:types`. Not auto-executed and not applied by any agent.
--
-- Reuses the existing refund subsystem (refunds) and the existing HĐĐT cancel
-- capability by inlining the tax_invoices flip (manager gate is the authority;
-- does NOT call transition_tax_invoice_state, which requires owner-only
-- settings:tenant).
--
-- DANGER: the inline tax_invoices flip below changes LOCAL state only. The
-- Viettel/CQT provider cancel cannot run inside a Postgres transaction. The
-- RPC returns invoice_action='cancel_issued' so the Phase-2 voidPaidOrder
-- Server Action can call invoiceProvider.cancelInvoice AFTER commit. If the
-- HĐĐT is not cancelled at the provider, it stays live at the CQT. Do NOT call
-- this RPC from any path that does not bridge the provider cancel.
--
-- Adversarial-review fixes applied (cross-period ICT boundary + lodged-state
-- coverage, daily-limit slot leak suppression, direct staff_permissions
-- backfill, zero-total audit/entity correctness). See per-block comments.

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
--    idempotently (re-run safe) so future apply_template_to_user grants pick it up.
--    role_templates is snapshot-only: appending here does NOT auto-grant live
--    users (has_permission reads staff_permissions, not role_templates). Existing
--    active branch_managers are backfilled directly in step 5 below (owner
--    auto-bypasses has_permission, so owner needs no grant).
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

  -- Money leg: a refund row + stock restore only when there is money to return
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

    -- D016: POS does not consume stock, so this is normally a no-op.
    IF v_payment.stock_consumed_status = 'ok' THEN
      PERFORM public.restore_stock_for_order(p_order_id, v_actor);
    END IF;
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

REVOKE ALL ON FUNCTION public.refund_paid_order(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_paid_order(bigint, text) TO service_role;

-- 5. Backfill the new key to existing active branch_manager users. role_templates
--    is snapshot-only (has_permission reads staff_permissions), so the step-2
--    template append does NOT grant live users. Owner auto-bypasses has_permission
--    and is excluded. Idempotent; mirrors 20260628081816_count_slip_drop_submit_perm.sql.
INSERT INTO public.staff_permissions
  (user_id, tenant_id, branch_id, permission_key, granted_at, valid_from)
SELECT pr.id, pr.tenant_id, pr.branch_id, 'pos:void_paid_order', now(), now()
FROM public.profiles pr
JOIN public.positions po ON po.id = pr.position_id AND po.tenant_id = pr.tenant_id
WHERE pr.is_active
  AND po.code = 'branch_manager'
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    WHERE sp.user_id = pr.id
      AND sp.permission_key = 'pos:void_paid_order'
      AND sp.branch_id IS NOT DISTINCT FROM pr.branch_id
  );
