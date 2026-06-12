BEGIN;

-- orders_payment_status_check allows only unpaid/pending/paid; refund truth
-- lives in payments.status + refunds + GL reversal, so the RPC must not write
-- orders.payment_status (a partial refund must not relabel the whole order).

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

  SELECT id, tenant_id, branch_id, amount, status, method,
         stock_consumed_status
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

  v_cr_account_code := CASE
    WHEN v_payment.method = 'cash' THEN '1111'
    ELSE '1121'
  END;

  SELECT id INTO v_dr_account_id
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND account_code = '5111'
  LIMIT 1;
  IF v_dr_account_id IS NULL THEN
    RAISE EXCEPTION 'chart_of_accounts: 5111 missing for tenant %',
      v_tenant USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_cr_account_id
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND account_code = v_cr_account_code
  LIMIT 1;
  IF v_cr_account_id IS NULL THEN
    RAISE EXCEPTION 'chart_of_accounts: % missing for tenant %',
      v_cr_account_code, v_tenant USING ERRCODE = 'P0002';
  END IF;

  v_entry_number := 'JE-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') ||
                    '-RFN' || lpad(p_refund_id::TEXT, 4, '0');

  INSERT INTO public.journal_entries
    (tenant_id, branch_id, entry_number, entry_date, description,
     reference_type, reference_id, status, posted_by, posted_at, created_by)
  VALUES
    (v_tenant, v_payment.branch_id, v_entry_number, now(),
     'Refund reversal journal for refund #' || p_refund_id::TEXT,
     'refund', p_refund_id, 'posted', v_actor, now(), v_actor)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines
    (tenant_id, journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_tenant, v_je_id, v_dr_account_id, v_refund.amount, 0,
     'Reverse revenue (refund #' || p_refund_id::TEXT || ')'),
    (v_tenant, v_je_id, v_cr_account_id, 0, v_refund.amount,
     'Reverse cash/bank (refund #' || p_refund_id::TEXT || ')');

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
      'journal_entry_id', v_je_id,
      'stock_movements_created', v_stock_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'refund_id', v_refund.id,
    'journal_entry_id', v_je_id,
    'stock_movements_created', v_stock_count,
    'payment_new_status', 'refunded'
  );
END;
$function$;

COMMENT ON FUNCTION public.reverse_payment_and_post(p_refund_id bigint) IS
  'Atomic refund reversal with branch-scoped orders:refund_approve permission. Locks refund/payment/order, posts GL reversal, restores stock ONLY when stock_consumed_status=''ok'' strictly (NULL = never consumed), flips payment and refund, and audits. orders.payment_status intentionally stays ''paid'' (CHECK allows unpaid/pending/paid only; partial refunds make an order-level refunded label wrong) — refund truth = payments.status + refunds + GL.';

COMMIT;
