-- D1: unpaid orders may survive POS close. Cash collected after the next
-- session opens belongs to that till. Rebind membership on payment complete
-- and compute expected cash from the session paid_at window, not create-time
-- pos_session_id. Do not restate closed-session expected_cash.

CREATE OR REPLACE FUNCTION public.pos_session_cash_revenue(p_session_id bigint)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(SUM(payment.amount), 0)::numeric(15,2)
  FROM public.pos_sessions session
  JOIN public.payments payment
    ON payment.tenant_id = session.tenant_id
   AND payment.branch_id = session.branch_id
   AND payment.status = 'completed'
   AND payment.method = 'cash'
   AND payment.paid_at IS NOT NULL
   AND payment.paid_at >= session.opened_at
   AND payment.paid_at <= COALESCE(session.closed_at, now())
  WHERE session.id = p_session_id;
$$;

COMMENT ON FUNCTION public.pos_session_cash_revenue(bigint) IS
  'Completed cash payments whose paid_at falls in the session till window.';

REVOKE ALL ON FUNCTION public.pos_session_cash_revenue(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_session_cash_revenue(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_session_cash_revenue(bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.rebind_paid_order_to_open_pos_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders o
  SET
    pos_session_id = open_session.id,
    updated_at = now()
  FROM public.pos_sessions tagged
  JOIN public.pos_sessions open_session
    ON open_session.tenant_id = tagged.tenant_id
   AND open_session.branch_id = tagged.branch_id
   AND open_session.status = 'open'
  WHERE o.id = NEW.order_id
    AND o.tenant_id = NEW.tenant_id
    AND tagged.id = o.pos_session_id
    AND tagged.status = 'closed'
    AND open_session.id IS DISTINCT FROM o.pos_session_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_rebind_paid_order_to_open_pos_session
  ON public.payments;
CREATE TRIGGER trg_payments_rebind_paid_order_to_open_pos_session
  AFTER INSERT OR UPDATE OF status
  ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION private.rebind_paid_order_to_open_pos_session();

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id bigint,
  p_closing_cash numeric,
  p_note text DEFAULT NULL,
  p_variance_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
  v_paid_count integer;
  v_unpaid_count integer;
  v_cash_revenue numeric(15,2);
  v_noncash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
  v_threshold numeric(15,2);
  v_closed_by uuid;
  v_variance_trim text;
BEGIN
  IF p_closing_cash IS NULL OR p_closing_cash < 0 THEN
    RAISE EXCEPTION 'closing_cash_must_be_non_negative'
      USING ERRCODE = '22023';
  END IF;

  v_closed_by := auth.uid();
  IF v_closed_by IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT
    session.id,
    session.tenant_id,
    session.branch_id,
    session.opening_cash,
    session.opened_at,
    session.status
  INTO v_session
  FROM public.pos_sessions session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'session_already_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    count(DISTINCT orders.id) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.payments payment
        WHERE payment.tenant_id = orders.tenant_id
          AND payment.order_id = orders.id
          AND payment.status = 'completed'
          AND payment.paid_at IS NOT NULL
      )
    ),
    count(DISTINCT orders.id) FILTER (
      WHERE orders.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM public.payments payment
          WHERE payment.tenant_id = orders.tenant_id
            AND payment.order_id = orders.id
            AND payment.status = 'completed'
            AND payment.paid_at IS NOT NULL
        )
    )
  INTO v_paid_count, v_unpaid_count
  FROM public.orders orders
  WHERE orders.tenant_id = v_session.tenant_id
    AND orders.pos_session_id = p_session_id;

  v_cash_revenue := public.pos_session_cash_revenue(p_session_id);

  SELECT COALESCE(sum(payment.amount), 0)
  INTO v_noncash_revenue
  FROM public.payments payment
  WHERE payment.tenant_id = v_session.tenant_id
    AND payment.branch_id = v_session.branch_id
    AND payment.status = 'completed'
    AND payment.paid_at IS NOT NULL
    AND payment.method <> 'cash'
    AND payment.paid_at >= v_session.opened_at;

  v_expected_cash := v_session.opening_cash + v_cash_revenue;
  v_cash_difference := p_closing_cash - v_expected_cash;
  v_threshold := GREATEST(
    50000::numeric,
    round(v_expected_cash * 0.005, 2)
  );
  v_variance_trim := NULLIF(btrim(COALESCE(p_variance_note, '')), '');

  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note,
    variance_approval_note = v_variance_trim,
    variance_approver_user_id = NULL,
    variance_resolution_type = NULL,
    variance_settlement_amount = NULL,
    variance_resolved_at = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'opening_cash', v_session.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', v_expected_cash,
    'cash_revenue', v_cash_revenue,
    'noncash_revenue', v_noncash_revenue,
    'cash_difference', v_cash_difference,
    'variance_threshold', v_threshold,
    'variance_breached', abs(v_cash_difference) > v_threshold,
    'order_count', v_paid_count + v_unpaid_count,
    'paid_order_count', v_paid_count,
    'unpaid_order_count', v_unpaid_count,
    'opened_at', v_session.opened_at,
    'closed_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.close_pos_session(bigint, numeric, text, text) IS
  'Closes a POS session. expected_cash = opening + completed cash payments '
  'with paid_at in the till window. Unpaid orders may carry to the next '
  'session; cash collected after that open counts on the new till.';

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
      v_cash_revenue := public.pos_session_cash_revenue(v_session.id);
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
  'POS cashier conversion of a completed cash payment to VietQR. Stamps the order payment code onto provider_ref so receipt reprint can print the transfer QR, audits the change, and recalculates a closed POS session from the till-window cash helper.';

REVOKE ALL ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_convert_cash_payment_to_vietqr(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.correct_payment_method(
  p_payment_id bigint,
  p_new_method text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_payment record;
  v_order record;
  v_session record;
  v_cash_revenue numeric(15,2);
  v_expected_cash numeric(15,2);
  v_cash_difference numeric(15,2);
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_new_method IS NULL OR p_new_method NOT IN ('cash', 'vietqr') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL
    OR length(trim(p_reason)) < 1
    OR length(p_reason) > 500
  THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;

  SELECT
    payment.id,
    payment.tenant_id,
    payment.branch_id,
    payment.order_id,
    payment.status,
    payment.method
  INTO v_payment
  FROM public.payments payment
  WHERE payment.id = p_payment_id
    AND payment.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.auth_is_owner(v_actor) OR public.has_position('accountant'))
    OR NOT public.has_permission_any('finance:view')
  THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed' USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.method = p_new_method THEN
    RAISE EXCEPTION 'payment_method_unchanged' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    orders.id,
    orders.pos_session_id,
    orders.payment_method
  INTO v_order
  FROM public.orders orders
  WHERE orders.id = v_payment.order_id
    AND orders.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET method = p_new_method, updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET payment_method = p_new_method, updated_at = now()
  WHERE id = v_order.id;

  IF v_order.pos_session_id IS NOT NULL THEN
    SELECT session.*
    INTO v_session
    FROM public.pos_sessions session
    WHERE session.id = v_order.pos_session_id
      AND session.tenant_id = v_tenant
    FOR UPDATE;

    IF FOUND AND v_session.status = 'closed' THEN
      v_cash_revenue := public.pos_session_cash_revenue(v_session.id);
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
      'method', p_new_method,
      'order_payment_method', p_new_method,
      'pos_session_id', v_order.pos_session_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'corrected',
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'pos_session_id', v_order.pos_session_id,
    'old_method', v_payment.method,
    'new_method', p_new_method
  );
END;
$$;

COMMENT ON FUNCTION public.correct_payment_method(bigint, text, text) IS
  'Owner/Accountant payment-method correction. Recalculates a closed POS session from the till-window cash helper.';

REVOKE ALL ON FUNCTION public.correct_payment_method(bigint, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.correct_payment_method(bigint, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.correct_payment_method(bigint, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_payment_method(bigint, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.close_pos_session(bigint, numeric, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_pos_session(bigint, numeric, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.close_pos_session(bigint, numeric, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_pos_session(bigint, numeric, text, text)
  TO service_role;

-- Target table `orders` cannot appear in JOIN ON (42P01); select leftover
-- rows in a subquery, then assign the open session.
UPDATE public.orders AS o
SET
  pos_session_id = src.open_id,
  updated_at = now()
FROM (
  SELECT DISTINCT
    leftover.id AS order_id,
    open_session.id AS open_id
  FROM public.orders AS leftover
  JOIN public.pos_sessions AS tagged
    ON tagged.id = leftover.pos_session_id
   AND tagged.status = 'closed'
  JOIN public.pos_sessions AS open_session
    ON open_session.tenant_id = tagged.tenant_id
   AND open_session.branch_id = tagged.branch_id
   AND open_session.status = 'open'
   AND open_session.id IS DISTINCT FROM leftover.pos_session_id
  JOIN public.payments AS payment
    ON payment.order_id = leftover.id
   AND payment.tenant_id = leftover.tenant_id
   AND payment.status = 'completed'
   AND payment.paid_at IS NOT NULL
   AND payment.paid_at >= open_session.opened_at
  WHERE leftover.payment_status = 'paid'
) AS src
WHERE o.id = src.order_id;
