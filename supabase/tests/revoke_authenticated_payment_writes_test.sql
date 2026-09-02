-- Run against a non-production database after the payment-write forward.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure(
    'public.create_supplier_payment(bigint, bigint, numeric, text, text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'create_supplier_payment still exists';
  END IF;

  IF has_table_privilege('authenticated', 'public.payments', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated still has UPDATE on payments';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.payments', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on payments';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.confirm_cash_payment(bigint, numeric)'
  ))
  INTO v_definition;
  IF v_definition IS NULL OR v_definition NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'confirm_cash_payment is not SECURITY DEFINER';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.create_remote_payment_intent(bigint, bigint, bigint, text, numeric, uuid, text, jsonb)'
  ))
  INTO v_definition;
  IF v_definition IS NULL OR v_definition NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'create_remote_payment_intent is not SECURITY DEFINER';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.finalize_paid_order(bigint, uuid)'
  ))
  INTO v_definition;
  IF v_definition IS NULL OR v_definition NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'finalize_paid_order is not SECURITY DEFINER';
  END IF;
END;
$$;

ROLLBACK;
