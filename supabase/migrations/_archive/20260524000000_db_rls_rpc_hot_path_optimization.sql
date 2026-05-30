-- =============================================================
-- DB/RLS/RPC hot-path optimization
--
-- Scope:
-- 1) Add composite indexes for POS, KDS, refunds, and payment webhooks.
-- 2) Make payment completion persist stock_consumed_status for refund safety.
-- 3) Re-scope refund RPC permission checks to the payment/refund branch.
--
-- RLS policy shape is intentionally unchanged: 20260425080352 already split
-- dual permissive policies and wrapped auth.uid() hot calls.
-- =============================================================

-- -----------------------------------------------------------------
-- 1. Query hot-path indexes
-- -----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_orders_pos_active_branch_created_id
  ON public.orders (tenant_id, branch_id, created_at DESC, id DESC)
  WHERE payment_status <> 'paid'
    AND status IN ('new', 'confirmed', 'preparing', 'ready', 'served');

CREATE INDEX IF NOT EXISTS idx_orders_pos_active_table_created
  ON public.orders (tenant_id, branch_id, table_id, created_at DESC)
  WHERE table_id IS NOT NULL
    AND payment_status <> 'paid'
    AND status IN ('new', 'confirmed', 'preparing', 'ready', 'served');

CREATE INDEX IF NOT EXISTS idx_orders_pos_archived_created_id
  ON public.orders (tenant_id, branch_id, created_at DESC, id DESC)
  WHERE payment_status = 'paid'
     OR status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_orders_pos_archived_session_created_id
  ON public.orders (tenant_id, branch_id, pos_session_id, created_at DESC, id DESC)
  WHERE payment_status = 'paid'
     OR status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_payments_provider_ref_lookup
  ON public.payments (tenant_id, method, provider_ref, status)
  WHERE provider_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_completed_paid_at
  ON public.payments (tenant_id, branch_id, paid_at DESC)
  WHERE status = 'completed'
    AND paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kds_tickets_board_live
  ON public.kds_tickets (tenant_id, branch_id, status, created_at ASC)
  WHERE status IN ('pending', 'preparing', 'ready');

CREATE INDEX IF NOT EXISTS idx_kds_stations_active_position
  ON public.kds_stations (tenant_id, branch_id, is_active, position);

CREATE INDEX IF NOT EXISTS idx_refunds_tenant_branch_created
  ON public.refunds (tenant_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refunds_tenant_status_created
  ON public.refunds (tenant_id, status, created_at DESC);

-- -----------------------------------------------------------------
-- 2. Persist payment stock consumption outcome
-- -----------------------------------------------------------------

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_stock_consumed_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_stock_consumed_status_check
    CHECK (
      stock_consumed_status IS NULL
      OR stock_consumed_status IN ('ok', 'out_of_stock', 'recipe_missing', 'internal_error')
    );

CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(
  p_payment_id BIGINT,
  p_expected_amount NUMERIC DEFAULT NULL::NUMERIC,
  p_provider_data JSONB DEFAULT NULL::JSONB,
  p_actor_id UUID DEFAULT NULL::UUID
)
RETURNS TABLE(
  status TEXT,
  payment_id BIGINT,
  order_id BIGINT,
  stock_consumed BOOLEAN,
  detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_payment       RECORD;
  v_stock_result  TEXT := 'skipped';
  v_stock_status  TEXT := NULL;
  v_stock_ok      BOOLEAN := FALSE;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT, p_payment_id, NULL::BIGINT, FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('payment status=' || v_payment.status || ' cannot transition to completed')::TEXT;
    RETURN;
  END IF;

  IF p_expected_amount IS NOT NULL AND v_payment.amount <> p_expected_amount THEN
    UPDATE public.payments
       SET status = 'failed',
           provider_data = COALESCE(p_provider_data, provider_data),
           updated_at = now()
     WHERE id = v_payment.id;

    RETURN QUERY SELECT
      'amount_mismatch'::TEXT, v_payment.id, v_payment.order_id, FALSE,
      ('stored=' || v_payment.amount || ' expected=' || p_expected_amount)::TEXT;
    RETURN;
  END IF;

  UPDATE public.payments
     SET status        = 'completed',
         paid_at       = COALESCE(paid_at, now()),
         provider_data = COALESCE(p_provider_data, provider_data),
         updated_at    = now()
   WHERE id = v_payment.id;

  UPDATE public.orders
     SET payment_status = 'paid',
         updated_at     = now()
   WHERE id = v_payment.order_id
     AND tenant_id = v_payment.tenant_id;

  BEGIN
    PERFORM public.consume_stock_for_order_service(v_payment.order_id, p_actor_id);
    v_stock_result := 'ok';
    v_stock_status := 'ok';
    v_stock_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_stock_result := 'consume_stock_failed: ' || SQLERRM;
    v_stock_ok := FALSE;
    v_stock_status := CASE
      WHEN lower(SQLERRM) LIKE '%out_of_stock%' OR lower(SQLERRM) LIKE '%insufficient%' THEN 'out_of_stock'
      WHEN lower(SQLERRM) LIKE '%recipe%' THEN 'recipe_missing'
      ELSE 'internal_error'
    END;
    RAISE WARNING '[complete_payment_and_consume_stock] stock consumption skipped for payment %, order %: %',
      v_payment.id, v_payment.order_id, SQLERRM;
  END;

  UPDATE public.payments
     SET stock_consumed_status = v_stock_status,
         updated_at = now()
   WHERE id = v_payment.id;

  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    v_stock_ok,
    ('stock=' || v_stock_result)::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) IS
  'Marks payment/order as paid, finalizes the order, and persists stock_consumed_status for refund/reconciliation. Stock consumption remains fail-soft.';

-- -----------------------------------------------------------------
-- 3. Branch-scoped refund RPC gates
-- -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_refund(
  p_payment_id  BIGINT,
  p_amount      NUMERIC,
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor     UUID   := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_payment   RECORD;
  v_refund_id BIGINT;
  v_already   NUMERIC(15,2) := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason exceeds 500 chars' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, branch_id, order_id, amount, status, method
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_payment.branch_id, 'orders:refund') THEN
    RAISE EXCEPTION 'permission denied: orders:refund required'
      USING ERRCODE = '42501';
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed: status=%', v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_already
  FROM public.refunds
  WHERE payment_id = v_payment.id
    AND status IN ('pending', 'approved');

  IF v_already + p_amount > v_payment.amount THEN
    RAISE EXCEPTION 'refund_exceeds_remaining: already=%, requested=%, payment=%',
      v_already, p_amount, v_payment.amount USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.refunds
    (tenant_id, branch_id, payment_id, order_id, amount, reason, status, created_by)
  VALUES
    (v_payment.tenant_id, v_payment.branch_id, v_payment.id, v_payment.order_id,
     p_amount, p_reason, 'pending', v_actor)
  RETURNING id INTO v_refund_id;

  PERFORM public.log_audit(
    'refund.create',
    'refund',
    v_refund_id,
    NULL,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'order_id',   v_payment.order_id,
      'amount',     p_amount,
      'method',     v_payment.method
    )
  );

  RETURN jsonb_build_object(
    'status',    'created',
    'refund_id', v_refund_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_refund(BIGINT, NUMERIC, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_refund(BIGINT, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_refund(BIGINT, NUMERIC, TEXT) IS
  'Creates pending refunds with branch-scoped orders:refund permission, completed-payment precondition, cumulative refund cap, and audit logging.';

CREATE OR REPLACE FUNCTION public.reverse_payment_and_post(
  p_refund_id  BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
         COALESCE(stock_consumed_status, 'ok') AS stock_consumed_status
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

  UPDATE public.orders
     SET payment_status = 'refunded', updated_at = now()
   WHERE id = v_order.id;

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
    'payment_new_status', 'refunded',
    'order_new_status', 'refunded'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_payment_and_post(BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reverse_payment_and_post(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.reverse_payment_and_post(BIGINT) IS
  'Atomic refund reversal with branch-scoped orders:refund_approve permission. Locks refund/payment/order, posts GL reversal, restores stock when stock_consumed_status=ok, flips payment/order/refund, and audits.';
