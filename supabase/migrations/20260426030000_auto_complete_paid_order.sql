-- =============================================================
-- Auto-complete order when payment confirmed (Option D)
--
-- Problem: after "Xác thực thanh toán", orders.status stayed at
-- new/confirmed/preparing/ready/served while payment_status='paid'.
-- The "Hoàn tất và trả bàn" UI button was hidden unless
-- status='served', so cashier often couldn't close the order;
-- table stayed 'occupied', bill sheet stayed open.
--
-- Fix: introduce finalize_paid_order(order_id, actor_id) helper and
-- call it from all 3 payment RPCs after payment_status='paid'. The
-- helper sets orders.status='completed' — trigger
-- trg_release_table_on_order_status (20260406110000_p1_fixes.sql)
-- then auto-releases the table.
--
-- Business semantics: "completed" means "paid + closed from POS
-- view". It does NOT mean "kitchen done". Helper intentionally
-- leaves order_items and kds_tickets untouched so:
--   - Chef continues cooking via KDS even after payment.
--   - Pay-first-cook-after (takeaway pre-pay, rushed customers)
--     is a valid flow.
-- Reporting: revenue uses payments.status; fulfillment uses
-- order_items.status / kds_tickets.status — these were already
-- decoupled in the schema.
--
-- Idempotency: finalize_paid_order guards status IN
-- ('completed','cancelled') and returns silently. Safe to call
-- multiple times (webhook retries, double-click).
-- =============================================================

-- ─── 1. finalize_paid_order helper ───────────────────────────────

CREATE OR REPLACE FUNCTION public.finalize_paid_order(
  p_order_id  BIGINT,
  p_actor_id  UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order  RECORD;
  v_actor  UUID := COALESCE(p_actor_id, auth.uid());
BEGIN
  SELECT o.id, o.tenant_id, o.status
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Idempotent: skip if already terminal.
  IF v_order.status IN ('completed', 'cancelled') THEN
    RETURN;
  END IF;

  UPDATE public.orders
  SET status     = 'completed',
      updated_at = now()
  WHERE id = p_order_id;

  -- Audit row. Skip if actor unknown (service_role with no auth.uid)
  -- rather than fail the whole transaction — payment completion is
  -- more critical than history entry.
  IF v_actor IS NOT NULL THEN
    INSERT INTO public.order_status_history (
      tenant_id, order_id, from_status, to_status, changed_by, note
    )
    VALUES (
      v_order.tenant_id,
      p_order_id,
      v_order.status,
      'completed',
      v_actor,
      'auto_complete_on_payment'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_paid_order(BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_order(BIGINT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order(BIGINT, UUID) TO service_role;

COMMENT ON FUNCTION public.finalize_paid_order(BIGINT, UUID) IS
  'Helper: marks order as completed after payment confirmed. Idempotent. '
  'Does NOT force order_items/kds_tickets — chef continues via KDS flow '
  'even after order completed (pay-first-cook-after is a valid F&B case). '
  'Table release fires via trg_release_table_on_order_status trigger.';


-- ─── 2. create_payment — call helper after cash auto-post ─────────
--
-- Preserves body from 20260419230000_gl_payment_autopost_nonfatal.sql
-- Only change: PERFORM finalize_paid_order at end of cash branch.

CREATE OR REPLACE FUNCTION public.create_payment(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_order_id BIGINT,
  p_method TEXT,
  p_amount NUMERIC(15,2),
  p_created_by UUID,
  p_provider_ref TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order         RECORD;
  v_payment_id    BIGINT;
  v_final_status  TEXT;
  v_journal_id    BIGINT;
  v_cogs_amount   NUMERIC(15,2);
  v_revenue_rule  TEXT;
  v_vat_rule      TEXT;
  v_lines         JSONB;
  v_tax_amount    NUMERIC(15,2);
  v_net_amount    NUMERIC(15,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_method NOT IN ('cash', 'vietqr', 'momo') THEN
    RAISE EXCEPTION 'invalid payment method: %', p_method USING ERRCODE = '22023';
  END IF;

  SELECT id, total_amount, tax_amount, payment_status, branch_id, tenant_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
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

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    provider_ref,
    paid_at,
    created_by
  ) VALUES (
    p_tenant_id,
    p_branch_id,
    p_order_id,
    p_method,
    p_amount,
    v_final_status,
    p_provider_ref,
    CASE WHEN v_final_status = 'completed' THEN now() ELSE NULL END,
    p_created_by
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.orders
  SET payment_method = p_method,
      payment_status = CASE
        WHEN v_final_status = 'completed' THEN 'paid'
        ELSE 'pending'
      END,
      updated_at = now()
  WHERE id = p_order_id;

  IF v_final_status = 'completed' THEN
    IF p_method = 'cash' THEN
      v_revenue_rule := 'SALE_CASH';
      v_vat_rule := 'SALE_VAT_CASH';
    ELSE
      v_revenue_rule := 'SALE_BANK';
      v_vat_rule := 'SALE_VAT_BANK';
    END IF;

    v_tax_amount := COALESCE(v_order.tax_amount, 0);
    v_net_amount := p_amount - v_tax_amount;

    SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
    INTO v_cogs_amount
    FROM public.stock_movements sm
    WHERE sm.order_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.type = 'consumption';

    v_lines := '[]'::JSONB;

    IF v_net_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code', v_revenue_rule,
        'amount', v_net_amount,
        'line_description', 'Doanh thu đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_tax_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code', v_vat_rule,
        'amount', v_tax_amount,
        'line_description', 'Thuế GTGT đơn hàng #' || p_order_id
      ));
    END IF;

    IF v_cogs_amount > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'rule_code', 'SALE_COGS',
        'amount', v_cogs_amount,
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
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[create_payment] auto_post_journal skipped for order %: %',
          p_order_id,
          SQLERRM;
        v_journal_id := NULL;
    END;

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.payments
      SET journal_entry_id = v_journal_id
      WHERE id = v_payment_id;
    END IF;

    -- Auto-complete order so POS bill sheet can close + table release.
    PERFORM public.finalize_paid_order(p_order_id, p_created_by);
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status', v_final_status,
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_payment(BIGINT, BIGINT, BIGINT, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated;


-- ─── 3. confirm_payment_and_post — call helper after GL post ─────
--
-- Preserves body from 20260419230000_gl_payment_autopost_nonfatal.sql
-- Only change: PERFORM finalize_paid_order before RETURN.

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

  SELECT o.id, o.total_amount, o.tax_amount
  INTO v_order
  FROM public.orders o
  WHERE o.id = v_payment.order_id
    AND o.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET status = 'completed',
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      paid_at = now(),
      updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.orders
  SET payment_status = 'paid',
      updated_at = now()
  WHERE id = v_payment.order_id
    AND tenant_id = p_tenant_id;

  v_tax_amount := COALESCE(v_order.tax_amount, 0);
  v_net_amount := v_payment.amount - v_tax_amount;

  SELECT COALESCE(SUM(ABS(sm.quantity_change) * sm.unit_cost), 0)
  INTO v_cogs_amount
  FROM public.stock_movements sm
  WHERE sm.order_id = v_payment.order_id
    AND sm.tenant_id = p_tenant_id
    AND sm.type = 'consumption';

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

  BEGIN
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
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[confirm_payment_and_post] auto_post_journal skipped for order %: %',
        v_payment.order_id,
        SQLERRM;
      v_journal_id := NULL;
  END;

  IF v_journal_id IS NOT NULL THEN
    UPDATE public.payments
    SET journal_entry_id = v_journal_id
    WHERE id = p_payment_id;
  END IF;

  -- Auto-complete order so POS bill sheet can close + table release.
  PERFORM public.finalize_paid_order(v_payment.order_id, v_uid);

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


-- ─── 4. complete_payment_and_consume_stock — call helper after stock ─
--
-- Preserves body from 20260423070000_complete_payment_and_consume_stock.sql
-- Only change: PERFORM finalize_paid_order after stock consumption.

CREATE OR REPLACE FUNCTION public.complete_payment_and_consume_stock(
  p_payment_id        BIGINT,
  p_expected_amount   NUMERIC(15,2) DEFAULT NULL,
  p_provider_data     JSONB          DEFAULT NULL,
  p_actor_id          UUID           DEFAULT NULL
)
RETURNS TABLE (
  status            TEXT,
  payment_id        BIGINT,
  order_id          BIGINT,
  stock_consumed    BOOLEAN,
  detail            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment       RECORD;
  v_stock_result  TEXT;
BEGIN
  SELECT p.id, p.order_id, p.tenant_id, p.branch_id, p.amount, p.status
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'not_found'::TEXT,
      p_payment_id,
      NULL::BIGINT,
      FALSE,
      ('payment ' || p_payment_id || ' does not exist')::TEXT;
    RETURN;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT
      'already_completed'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
      'payment was previously completed; no-op'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN QUERY SELECT
      'failed'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
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
      'amount_mismatch'::TEXT,
      v_payment.id,
      v_payment.order_id,
      FALSE,
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
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'consume_stock_failed: %', SQLERRM;
  END;

  -- Auto-complete order so POS bill sheet can close + table release.
  PERFORM public.finalize_paid_order(v_payment.order_id, p_actor_id);

  RETURN QUERY SELECT
    'completed'::TEXT,
    v_payment.id,
    v_payment.order_id,
    TRUE,
    ('stock=' || v_stock_result)::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID) IS
  'Webhook-safe atomic: flip payment→completed, order→paid, consume stock, auto-complete order (via finalize_paid_order). Idempotent via status=pending guard. Raises on stock failure so transaction rolls back.';
