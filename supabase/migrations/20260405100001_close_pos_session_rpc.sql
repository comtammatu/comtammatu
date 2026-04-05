-- =============================================================
-- M2-S5: close_pos_session RPC — close cashier session with cash reconciliation
-- =============================================================

CREATE OR REPLACE FUNCTION public.close_pos_session(
  p_session_id BIGINT,
  p_closed_by UUID,
  p_closing_cash NUMERIC(15,2),
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_session RECORD;
  v_expected_cash NUMERIC(15,2);
  v_cash_difference NUMERIC(15,2);
  v_order_count INT;
BEGIN
  -- Lock and fetch the session
  SELECT id, tenant_id, branch_id, opening_cash, opened_at, status
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Session is already closed' USING ERRCODE = 'P0001';
  END IF;

  -- Calculate expected cash: opening_cash + total revenue from non-cancelled orders
  SELECT
    COUNT(*),
    COALESCE(SUM(total_amount), 0)
  INTO v_order_count, v_expected_cash
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND status NOT IN ('cancelled');

  v_expected_cash := v_session.opening_cash + v_expected_cash;
  v_cash_difference := p_closing_cash - v_expected_cash;

  -- Close the session
  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = p_closed_by,
    closing_cash = p_closing_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    note = p_note
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'opening_cash', v_session.opening_cash,
    'closing_cash', p_closing_cash,
    'expected_cash', v_expected_cash,
    'cash_difference', v_cash_difference,
    'order_count', v_order_count,
    'opened_at', v_session.opened_at,
    'closed_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_pos_session(BIGINT, UUID, NUMERIC, TEXT) TO authenticated;
