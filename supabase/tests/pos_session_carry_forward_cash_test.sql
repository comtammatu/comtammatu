-- Run against a non-production database after all active migrations.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f supabase/tests/pos_session_carry_forward_cash_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_close text;
  v_convert text;
  v_correct text;
  v_complete text;
  v_rebind text;
  v_tenant bigint;
  v_branch bigint;
  v_profile uuid;
  v_session_a bigint;
  v_session_b bigint;
  v_order bigint;
  v_payment bigint;
  v_open_at timestamptz := now() - interval '2 hours';
  v_close_at timestamptz := now() - interval '1 hour';
  v_pay_at timestamptz := now() - interval '30 minutes';
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.close_pos_session(bigint, numeric, text, text)'
  ))
  INTO v_close;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.pos_convert_cash_payment_to_vietqr(bigint)'
  ))
  INTO v_convert;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.correct_payment_method(bigint, text, text)'
  ))
  INTO v_correct;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.complete_payment_and_consume_stock(bigint, numeric, jsonb, uuid)'
  ))
  INTO v_complete;
  SELECT pg_get_functiondef(to_regprocedure(
    'private.rebind_paid_order_to_open_pos_session()'
  ))
  INTO v_rebind;

  IF to_regprocedure('public.pos_session_cash_revenue(bigint)') IS NULL THEN
    RAISE EXCEPTION 'pos_session_cash_revenue helper is missing';
  END IF;

  IF v_close NOT LIKE '%public.pos_session_cash_revenue(p_session_id)%' THEN
    RAISE EXCEPTION 'close_pos_session must use till-window cash helper';
  END IF;
  IF v_close LIKE '%orders.pos_session_id = p_session_id%payment.method = ''cash''%' THEN
    RAISE EXCEPTION 'close_pos_session still sums cash by create-time session';
  END IF;

  IF v_convert NOT LIKE '%public.pos_session_cash_revenue(v_session.id)%' THEN
    RAISE EXCEPTION 'pos_convert must recalc closed sessions from till window';
  END IF;
  IF v_correct NOT LIKE '%public.pos_session_cash_revenue(v_session.id)%' THEN
    RAISE EXCEPTION 'correct_payment_method must recalc from till window';
  END IF;

  IF v_rebind IS NULL
     OR v_rebind NOT LIKE '%tagged.status = ''closed''%'
     OR v_rebind NOT LIKE '%open_session.status = ''open''%'
  THEN
    RAISE EXCEPTION 'rebind trigger function missing D1 membership move';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.payments'::regclass
      AND tgname = 'trg_payments_rebind_paid_order_to_open_pos_session'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'rebind trigger is missing on payments';
  END IF;

  IF v_complete LIKE '%pos_session_id = open_session.id%' THEN
    RAISE EXCEPTION
      'complete_payment must not duplicate rebind; trigger owns D1 move';
  END IF;

  SELECT b.tenant_id, b.id
  INTO v_tenant, v_branch
  FROM public.branches b
  WHERE b.is_active = true
    AND b.branch_kind = 'branch'
  ORDER BY b.id
  LIMIT 1;

  SELECT p.id
  INTO v_profile
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
  ORDER BY p.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'seed tenant/branch/profile missing';
  END IF;

  UPDATE public.pos_sessions
  SET
    status = 'closed',
    closed_at = COALESCE(closed_at, now()),
    closed_by = COALESCE(closed_by, v_profile)
  WHERE tenant_id = v_tenant
    AND branch_id = v_branch
    AND status = 'open';

  INSERT INTO public.pos_sessions (
    tenant_id, branch_id, opened_by, closed_by,
    opened_at, closed_at, opening_cash, closing_cash,
    expected_cash, cash_difference, status
  ) VALUES (
    v_tenant, v_branch, v_profile, v_profile,
    v_open_at, v_close_at, 100000, 100000,
    100000, 0, 'closed'
  )
  RETURNING id INTO v_session_a;

  INSERT INTO public.pos_sessions (
    tenant_id, branch_id, opened_by, opened_at, opening_cash, status
  ) VALUES (
    v_tenant, v_branch, v_profile, v_close_at + interval '1 minute', 100000, 'open'
  )
  RETURNING id INTO v_session_b;

  INSERT INTO public.orders (
    tenant_id, branch_id, created_by, pos_session_id,
    order_number, order_type, status, payment_status,
    subtotal, total_amount
  ) VALUES (
    v_tenant, v_branch, v_profile, v_session_a,
    'CF-' || replace(gen_random_uuid()::text, '-', ''),
    'dine_in', 'served', 'unpaid',
    498000, 498000
  )
  RETURNING id INTO v_order;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_order, 'cash', 498000, 'pending', v_profile
  )
  RETURNING id INTO v_payment;

  UPDATE public.payments
  SET
    status = 'completed',
    paid_at = v_pay_at,
    updated_at = now()
  WHERE id = v_payment;

  UPDATE public.orders
  SET payment_status = 'paid', payment_method = 'cash'
  WHERE id = v_order;

  IF (
    SELECT pos_session_id FROM public.orders WHERE id = v_order
  ) IS DISTINCT FROM v_session_b THEN
    RAISE EXCEPTION 'paid leftover order must rebind to the open session';
  END IF;

  IF public.pos_session_cash_revenue(v_session_a) <> 0 THEN
    RAISE EXCEPTION
      'closed creating session must not keep leftover cash after paid_at';
  END IF;

  IF public.pos_session_cash_revenue(v_session_b) <> 498000 THEN
    RAISE EXCEPTION
      'open till must include leftover cash paid after it opened, got %',
      public.pos_session_cash_revenue(v_session_b);
  END IF;
END;
$$;

ROLLBACK;
