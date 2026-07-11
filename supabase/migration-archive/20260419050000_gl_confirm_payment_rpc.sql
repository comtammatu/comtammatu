-- =============================================================
-- GL Auto-Posting: Phase 1.6 — confirm_payment_and_post()
-- Atomic RPC for confirming VietQR/Momo payments.
-- Replaces 3 non-atomic DB calls in confirmPayment server action.
-- Wraps: update payment → update order → auto_post_journal
-- =============================================================

CREATE OR REPLACE FUNCTION public.confirm_payment_and_post(
  p_payment_id   BIGINT,
  p_tenant_id    BIGINT,
  p_branch_id    BIGINT,
  p_provider_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Lock and fetch payment
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

  -- Fetch order for tax breakdown
  SELECT o.id, o.total_amount, o.tax_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id AND o.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Update payment to completed
  UPDATE public.payments
  SET status = 'completed',
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      paid_at = now(),
      updated_at = now()
  WHERE id = p_payment_id;

  -- Update order payment status
  UPDATE public.orders
  SET payment_status = 'paid', updated_at = now()
  WHERE id = v_payment.order_id AND tenant_id = p_tenant_id;

  -- ═══ AUTO-POST GL JOURNAL ═══

  -- Separate VAT from revenue
  v_tax_amount := COALESCE(v_order.tax_amount, 0);
  v_net_amount := v_payment.amount - v_tax_amount;

  -- Calculate COGS from stock consumption movements
  SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
  INTO v_cogs_amount
  FROM public.stock_movements sm
  WHERE sm.order_id = v_payment.order_id
    AND sm.tenant_id = p_tenant_id
    AND sm.type = 'consumption';

  -- Build journal lines (bank payment for VietQR/Momo)
  v_lines := '[]'::JSONB;

  IF v_net_amount > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'SALE_BANK',
      'amount', v_net_amount,
      'line_description', 'Doanh thu đơn hàng #' || v_payment.order_id
    ));
  END IF;

  IF v_tax_amount > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'SALE_VAT_BANK',
      'amount', v_tax_amount,
      'line_description', 'Thuế GTGT đơn hàng #' || v_payment.order_id
    ));
  END IF;

  IF v_cogs_amount > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'rule_code', 'SALE_COGS',
      'amount', v_cogs_amount,
      'line_description', 'Giá vốn đơn hàng #' || v_payment.order_id
    ));
  END IF;

  v_journal_id := public.auto_post_journal(
    p_tenant_id,
    p_branch_id,
    'sale',
    v_payment.order_id,
    'Bán hàng đơn #' || v_payment.order_id || ' (' || v_payment.method || ')',
    v_lines,
    now(),
    v_uid
  );

  -- Link journal to payment
  IF v_journal_id IS NOT NULL THEN
    UPDATE public.payments
    SET journal_entry_id = v_journal_id
    WHERE id = p_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'status', 'completed',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_and_post(BIGINT, BIGINT, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_payment_and_post(BIGINT, BIGINT, BIGINT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_payment_and_post(BIGINT, BIGINT, BIGINT, TEXT) TO authenticated;
