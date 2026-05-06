-- =========================================================================
-- confirm_vietqr_payment — atomic cashier-confirm for VietQR bank transfer.
--
-- Design rationale:
--   VietQR is a static URL format — no external provider session is created
--   when the cashier selects the method. The QR is generated client-side.
--   Only when the cashier confirms ("Đã thanh toán") does a payment row
--   get created. This atomic RPC mirrors confirm_cash_payment but for the
--   bank transfer path:
--     - Validates amount === orders.total_amount (exact, not >=)
--     - Upserts payment as completed (method='vietqr')
--     - Updates order: payment_status='paid', payment_method='vietqr'
--     - Posts GL journal: SALE_BANK + SALE_VAT_BANK + SALE_COGS
--     - Calls finalize_paid_order (auto-complete, table release)
--     - Enqueues receipt failsoft (HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN)
--
-- Stock consumption is done by the server action caller (failsoft, same
-- as confirmPayment e-wallet path).
--
-- Permission: pos:confirm_payment (cashier / branch_manager+).
--   Waiters have pos:use + pos:print but NOT pos:confirm_payment —
--   they can show the QR but cannot close the till.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.confirm_vietqr_payment(
  p_tenant_id  BIGINT,
  p_branch_id  BIGINT,
  p_order_id   BIGINT,
  p_amount     NUMERIC(15,2),
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Lock order row to prevent concurrent confirms
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

  -- Idempotency: order already paid (concurrent cashier on another terminal)
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

  -- Exact amount match — cashier confirms at the total printed on QR.
  -- If items were added after customer scanned, cashier must use a new order
  -- for the extra items (business SOP per owner decision Q1).
  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount, p_amount
      USING ERRCODE = '22023';
  END IF;

  -- Lock any existing non-failed payment row for this order
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
    -- Concurrent confirm — return idempotently
    v_payment_id := v_existing_id;
    v_idempotent := TRUE;

  ELSIF v_existing_status = 'pending' THEN
    -- Legacy pending row (pre-deploy VietQR or method-switched MoMo).
    -- Upgrade in-place to completed with method='vietqr'.
    UPDATE public.payments
    SET method     = 'vietqr',
        amount     = p_amount,
        status     = 'completed',
        paid_at    = now(),
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_payment_id;

  ELSE
    -- Normal path: no existing active row
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
    -- Mark order paid
    UPDATE public.orders
    SET payment_status = 'paid',
        payment_method = 'vietqr',
        updated_at     = now()
    WHERE id = p_order_id;

    -- GL journal: SALE_BANK + SALE_VAT_BANK + SALE_COGS
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

    BEGIN
      v_journal_id := public.auto_post_journal(
        p_tenant_id,
        p_branch_id,
        'sale',
        p_order_id,
        'Bán hàng đơn #' || p_order_id || ' (vietqr)',
        v_lines,
        now(),
        p_created_by
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[confirm_vietqr_payment] auto_post_journal skipped for order %: %',
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

  -- Enqueue receipt — failsoft per HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN.
  -- Money has already settled; printer failure must NOT roll back payment.
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
$$;

REVOKE ALL ON FUNCTION public.confirm_vietqr_payment(BIGINT, BIGINT, BIGINT, NUMERIC, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_vietqr_payment(BIGINT, BIGINT, BIGINT, NUMERIC, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_vietqr_payment(BIGINT, BIGINT, BIGINT, NUMERIC, UUID) TO authenticated;

COMMENT ON FUNCTION public.confirm_vietqr_payment(BIGINT, BIGINT, BIGINT, NUMERIC, UUID) IS
  'Atomic cashier-confirm for VietQR bank transfer. No payment row is created '
  'until the cashier taps "Đã thanh toán" — QR is generated client-side. '
  'Upserts payment as completed, posts GL (SALE_BANK), finalizes order, and '
  'enqueues receipt failsoft. Gated by pos:confirm_payment.';
