-- Run against a non-production database with active migrations and dev seed.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
  v_result text;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.payments'::regclass
    AND conname = 'payments_method_check';

  IF v_definition IS NULL
    OR v_definition NOT LIKE '%cash%'
    OR v_definition NOT LIKE '%vietqr%'
    OR v_definition LIKE '%momo%'
  THEN
    RAISE EXCEPTION 'payments_method_check is not cash/VietQR-only: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_payment_method_check';

  IF v_definition IS NULL
    OR v_definition NOT LIKE '%cash%'
    OR v_definition NOT LIKE '%vietqr%'
    OR v_definition LIKE '%momo%'
  THEN
    RAISE EXCEPTION 'orders_payment_method_check is not cash/VietQR-only: %', v_definition;
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.webhook_events'::regclass
    AND conname = 'webhook_events_provider_check';

  IF v_definition IS NULL OR v_definition LIKE '%momo%' THEN
    RAISE EXCEPTION 'webhook_events_provider_check still admits MoMo: %', v_definition;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.system_settings
    WHERE key = 'payment_enable_momo'
  ) THEN
    RAISE EXCEPTION 'payment_enable_momo setting still exists';
  END IF;

  IF to_regprocedure('public.record_momo_pending_result(bigint,bigint,jsonb)') IS NOT NULL
    OR to_regprocedure('public.finalize_momo_successful_payment(bigint,bigint,jsonb)') IS NOT NULL
    OR to_regprocedure('public.finalize_momo_failed_payment(bigint,bigint,jsonb)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'MoMo settlement RPCs still exist';
  END IF;

  IF to_regprocedure(
    'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'create_remote_payment_intent is missing';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)'
  ))
  INTO v_definition;

  IF v_definition LIKE '%momo%'
    OR v_definition NOT LIKE '%p_method <> ''vietqr''%'
  THEN
    RAISE EXCEPTION 'remote payment intent is not VietQR-only';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.create_remote_payment_intent(bigint,bigint,bigint,text,numeric,uuid,text,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'create_remote_payment_intent ACL mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mv_daily_revenue'
      AND column_name = 'momo_revenue'
  ) THEN
    RAISE EXCEPTION 'mv_daily_revenue still exposes momo_revenue';
  END IF;

  SELECT pg_get_function_result(to_regprocedure(
    'public.get_revenue_kpis(bigint,date,date)'
  ))
  INTO v_result;
  IF v_result LIKE '%momo_revenue%' THEN
    RAISE EXCEPTION 'get_revenue_kpis still exposes momo_revenue';
  END IF;

  SELECT pg_get_function_result(to_regprocedure(
    'public.get_revenue_rollup(bigint,date,date,text)'
  ))
  INTO v_result;
  IF v_result LIKE '%momo_revenue%' THEN
    RAISE EXCEPTION 'get_revenue_rollup still exposes momo_revenue';
  END IF;
END;
$$;

ROLLBACK;
