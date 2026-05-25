-- =========================================================================
-- POS payments: make manual VietQR confirm use the same fail-hard payment
-- completion contract as cash and MoMo webhook completion.
--
-- Before this patch, confirm_vietqr_payment marked the order/payment paid and
-- the web Server Action attempted stock consumption afterwards as a fail-soft
-- side effect. That could leave a paid order with no stock movement. The RPC
-- now keeps/creates the payment as pending, delegates completion to
-- complete_payment_and_consume_stock(...), and only posts GL / receipt after
-- stock + amount recompute pass.
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
  v_order           RECORD;
  v_payment_id      BIGINT;
  v_existing_id     BIGINT;
  v_existing_status TEXT;
  v_idempotent      BOOLEAN := FALSE;
  v_complete_res    RECORD;
  v_journal_id      BIGINT;
  v_cogs_amount     NUMERIC(15,2);
  v_tax_amount      NUMERIC(15,2);
  v_net_amount      NUMERIC(15,2);
  v_lines           JSONB;
  v_receipt_res     JSONB;
  v_print_job_id    BIGINT;
  v_print_failed    BOOLEAN := FALSE;
  v_print_error     TEXT;
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
      AND branch_id = p_branch_id
      AND status    = 'completed'
    ORDER BY id DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'status',     'already_completed',
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
       SET method        = 'vietqr',
           amount        = p_amount,
           status        = 'pending',
           paid_at       = NULL,
           provider_ref  = NULL,
           provider_data = NULL,
           updated_at    = now()
     WHERE id = v_existing_id
     RETURNING id INTO v_payment_id;

  ELSE
    INSERT INTO public.payments (
      tenant_id, branch_id, order_id,
      method, amount, status, created_by
    ) VALUES (
      p_tenant_id, p_branch_id, p_order_id,
      'vietqr', p_amount, 'pending', p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  IF NOT v_idempotent THEN
    UPDATE public.orders
       SET payment_method = 'vietqr',
           updated_at     = now()
     WHERE id = p_order_id;

    SELECT * INTO v_complete_res
    FROM public.complete_payment_and_consume_stock(
      v_payment_id,
      p_amount,
      jsonb_build_object(
        'method', 'vietqr',
        'confirmed_by', p_created_by,
        'confirmed_at', now()
      ),
      p_created_by
    );

    IF v_complete_res.status = 'stock_failed' THEN
      RETURN jsonb_build_object(
        'status',      'stock_failed',
        'payment_id',  v_payment_id,
        'idempotent',  FALSE,
        'error_code',  'stock_consumption_failed',
        'detail',      v_complete_res.detail,
        'print',       jsonb_build_object('failed', FALSE)
      );
    END IF;

    IF v_complete_res.status = 'amount_mismatch_recomputed' THEN
      RETURN jsonb_build_object(
        'status',      'amount_mismatch_recomputed',
        'payment_id',  v_payment_id,
        'idempotent',  FALSE,
        'error_code',  'amount_mismatch_recomputed',
        'detail',      v_complete_res.detail,
        'print',       jsonb_build_object('failed', FALSE)
      );
    END IF;

    IF v_complete_res.status IS NULL
       OR v_complete_res.status NOT IN ('completed', 'already_completed') THEN
      RAISE EXCEPTION 'payment completion failed: % (detail: %)',
        v_complete_res.status, v_complete_res.detail
        USING ERRCODE = 'P0001';
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
    'status',     CASE WHEN v_idempotent THEN 'already_completed' ELSE 'completed' END,
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
  'Atomic cashier-confirm for VietQR bank transfer. Reuses the active payment '
  'slot, delegates amount recompute + stock fail-hard to '
  'complete_payment_and_consume_stock, then posts GL and enqueues receipt '
  'failsoft. Gated by pos:confirm_payment.';
