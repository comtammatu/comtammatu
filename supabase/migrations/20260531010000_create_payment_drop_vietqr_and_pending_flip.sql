-- =========================================================================
-- ALTER create_payment: drop vietqr method + remove orders.payment_status
-- pending flip.
--
-- Root cause (PAYMENT-PENDING-NO-LONGER-BLOCKS-EDITS):
--   create_payment was called immediately when a cashier tapped VietQR/MoMo,
--   setting orders.payment_status='pending'. This blocked split/merge/edit
--   operations even though no money had moved yet.
--
-- Changes:
--   1. Reject p_method='vietqr' — VietQR now uses confirm_vietqr_payment RPC
--      directly (atomic create+confirm in one shot, client-side QR).
--   2. Remove the ELSE 'pending' branch in the orders UPDATE — payment_status
--      is only touched when the payment is completed (='paid'). MoMo pending
--      payments no longer push the order into 'pending' state.
--
-- Data migration (deploy-time):
--   Any legacy VietQR pending payment rows from the old flow are cancelled.
--   Affected orders are reset to payment_status='unpaid', payment_method=NULL
--   so split/merge/edit are unblocked immediately after deploy.
--   MoMo pending rows are intentionally left alone — IPN webhooks still
--   expect them and the manual "Hủy QR" path still works.
-- =========================================================================

-- ─── 1. Data migration: clean up legacy VietQR pending rows ──────────────

UPDATE public.payments
SET status     = 'failed',
    updated_at = now()
WHERE status = 'pending'
  AND method = 'vietqr';

-- Reset orders whose payment_method was set to vietqr but now have no
-- active payment row (just cleaned up above). Guard: skip if a MoMo
-- pending row exists on the same order (concurrent method — shouldn't
-- happen, but defensive).
UPDATE public.orders
SET payment_status = 'unpaid',
    payment_method = NULL,
    updated_at     = now()
WHERE payment_method = 'vietqr'
  AND payment_status <> 'paid'
  AND id NOT IN (
    SELECT order_id
    FROM public.payments
    WHERE status = 'pending'
      AND method = 'momo'
  );

-- ─── 2. ALTER create_payment ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id   BIGINT,
  p_branch_id   BIGINT,
  p_order_id    BIGINT,
  p_method      TEXT,
  p_amount      NUMERIC(15,2),
  p_created_by  UUID,
  p_provider_ref TEXT DEFAULT NULL,
  p_status      TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- VietQR is handled by confirm_vietqr_payment (client-side QR, atomic confirm).
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

  -- Only set payment_method; do NOT flip payment_status to 'pending'.
  -- orders.payment_status moves from 'unpaid' → 'paid' only when the
  -- payment is confirmed (completed). This unblocks split/merge/edit
  -- operations while a MoMo QR is being shown to the customer.
  UPDATE public.orders
  SET payment_method = v_effective_method,
      payment_status = CASE
        WHEN v_final_status = 'completed' THEN 'paid'
        ELSE payment_status  -- leave unchanged (stays 'unpaid')
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

    BEGIN
      v_journal_id := public.auto_post_journal(
        p_tenant_id,
        p_branch_id,
        'sale',
        p_order_id,
        'Bán hàng đơn #' || p_order_id || ' (' || p_method || ')',
        v_lines,
        now(),
        p_created_by
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[create_payment] auto_post_journal skipped for order %: %',
        p_order_id, SQLERRM;
      v_journal_id := NULL;
    END;

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.payments
      SET journal_entry_id = v_journal_id
      WHERE id = v_payment_id;
    END IF;

    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object(
    'payment_id',   v_payment_id,
    'status',       v_final_status,
    'journal_entry_id', v_journal_id,
    'idempotent',   v_skip_completion_side_effects
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) IS
  'Atomic POS payment creation for cash and MoMo only. VietQR is handled by '
  'confirm_vietqr_payment. No longer sets orders.payment_status=''pending'' — '
  'the order stays ''unpaid'' until payment is confirmed (completed). This '
  'unblocks split/merge/edit while a MoMo QR is pending.';
