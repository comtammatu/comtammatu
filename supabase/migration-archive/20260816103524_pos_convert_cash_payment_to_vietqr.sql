-- POS cashier: convert a completed cash payment to VietQR and stamp a
-- payment code so reprint/enqueue_receipt_print can emit the transfer QR.
-- Closed POS sessions recalculate expected cash the same way as
-- correct_payment_method. Reverse VietQR→cash stays on Finance.

CREATE OR REPLACE FUNCTION public.pos_convert_cash_payment_to_vietqr(
  p_order_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_order record;
  v_payment record;
  v_session record;
  v_bank text;
  v_account text;
  v_payment_code text;
  v_cash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant claim missing' USING ERRCODE = '28000';
  END IF;

  SELECT
    o.id,
    o.tenant_id,
    o.branch_id,
    o.status,
    o.payment_status,
    o.payment_method,
    o.payment_code,
    o.pos_session_id
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_order.branch_id, 'pos:confirm_payment') THEN
    RAISE EXCEPTION 'permission denied: pos:confirm_payment' USING ERRCODE = '42501';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_cancelled' USING ERRCODE = '22023';
  END IF;

  IF v_order.payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'order_not_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    p.id,
    p.tenant_id,
    p.branch_id,
    p.order_id,
    p.status,
    p.method,
    p.provider_ref
  INTO v_payment
  FROM public.payments p
  WHERE p.order_id = v_order.id
    AND p.tenant_id = v_tenant
    AND p.status = 'completed'
  ORDER BY p.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_completed' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.method = 'vietqr' THEN
    RAISE EXCEPTION 'method_unchanged: already vietqr' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.method IS DISTINCT FROM 'cash' THEN
    RAISE EXCEPTION 'method_not_cash: %', v_payment.method USING ERRCODE = '22023';
  END IF;

  SELECT value INTO v_bank
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id
    AND key = 'payment_vietqr_bank_code';
  SELECT value INTO v_account
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id
    AND key = 'payment_vietqr_account_no';

  IF NULLIF(btrim(COALESCE(v_bank, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(v_account, '')), '') IS NULL THEN
    RAISE EXCEPTION 'vietqr_not_configured' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.ensure_order_payment_code(
    v_order.tenant_id,
    v_order.branch_id,
    v_order.id
  );

  SELECT payment_code INTO v_payment_code
  FROM public.orders
  WHERE id = v_order.id;

  IF NULLIF(btrim(COALESCE(v_payment_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'payment_code_missing' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET
    method = 'vietqr',
    provider_ref = COALESCE(NULLIF(btrim(provider_ref), ''), v_payment_code),
    updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET
    payment_method = 'vietqr',
    updated_at = now()
  WHERE id = v_order.id;

  IF v_order.pos_session_id IS NOT NULL THEN
    SELECT ps.*
    INTO v_session
    FROM public.pos_sessions ps
    WHERE ps.id = v_order.pos_session_id
      AND ps.tenant_id = v_tenant
    FOR UPDATE;

    IF FOUND AND v_session.status = 'closed' THEN
      SELECT COALESCE(SUM(p.amount), 0)
      INTO v_cash_revenue
      FROM public.payments p
      JOIN public.orders o
        ON o.id = p.order_id
       AND o.tenant_id = p.tenant_id
      WHERE o.pos_session_id = v_session.id
        AND o.status <> 'cancelled'
        AND o.payment_status = 'paid'
        AND p.status = 'completed'
        AND p.method = 'cash';

      v_expected_cash := v_session.opening_cash + v_cash_revenue;
      v_cash_difference := v_session.closing_cash - v_expected_cash;

      UPDATE public.pos_sessions
      SET
        expected_cash = v_expected_cash,
        cash_difference = v_cash_difference,
        variance_approval_note = NULL,
        variance_approver_user_id = NULL,
        variance_resolution_type = NULL,
        variance_settlement_amount = NULL,
        variance_resolved_at = NULL,
        updated_at = now()
      WHERE id = v_session.id;
    END IF;
  END IF;

  PERFORM public.log_audit(
    'payment.method_correct',
    'payment',
    v_payment.id,
    jsonb_build_object(
      'method', v_payment.method,
      'order_payment_method', v_order.payment_method,
      'pos_session_id', v_order.pos_session_id
    ),
    jsonb_build_object(
      'method', 'vietqr',
      'order_payment_method', 'vietqr',
      'pos_session_id', v_order.pos_session_id,
      'reason', 'Đổi tiền mặt sang VietQR tại POS',
      'source', 'pos_completed_order'
    )
  );

  RETURN jsonb_build_object(
    'status', 'converted',
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'pos_session_id', v_order.pos_session_id,
    'payment_code', v_payment_code,
    'old_method', v_payment.method,
    'new_method', 'vietqr'
  );
END;
$$;

COMMENT ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint) IS
  'POS cashier conversion of a completed cash payment to VietQR. Stamps the order payment code onto provider_ref so receipt reprint can print the transfer QR, audits the change, and recalculates a closed POS session from completed cash payments.';

REVOKE ALL ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint) TO service_role;
