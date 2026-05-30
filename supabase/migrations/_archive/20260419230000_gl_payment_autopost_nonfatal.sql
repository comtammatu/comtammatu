-- =============================================================
-- GL Phase 3.3 — Payment auto-post is operationally non-fatal
-- POS/KDS payment flows must not fail just because posting_rules,
-- chart_of_accounts, or fiscal periods are not fully configured.
-- Keep payment/order state committed; skip journal auto-post and
-- emit NOTICE so backoffice can reconcile later.
-- =============================================================

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
