\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regclass('public.holiday_surcharge_policies') IS NULL THEN
    RAISE EXCEPTION 'holiday_surcharge_policies table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'holiday_surcharge_policies'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'holiday_surcharge_policies RLS missing';
  END IF;

  IF has_table_privilege(
    'authenticated',
    'public.holiday_surcharge_policies',
    'SELECT'
  ) OR has_table_privilege(
    'authenticated',
    'public.holiday_surcharge_policies',
    'INSERT'
  ) OR has_table_privilege(
    'authenticated',
    'public.holiday_surcharge_policies',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION 'authenticated must use holiday surcharge RPCs';
  END IF;

  IF to_regprocedure('public.get_holiday_surcharge_policies()') IS NULL
    OR to_regprocedure(
      'public.upsert_holiday_surcharge_policy(bigint,text,bigint,text,numeric,timestamp with time zone,timestamp with time zone,boolean)'
    ) IS NULL
    OR to_regprocedure(
      'public.set_holiday_surcharge_policy_active(bigint,boolean)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'holiday surcharge policy RPCs missing';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_holiday_surcharge_policies()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.upsert_holiday_surcharge_policy(bigint,text,bigint,text,numeric,timestamp with time zone,timestamp with time zone,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'holiday surcharge RPC execute grants missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'holiday_surcharge_source'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'holiday_surcharge_policy_name'
  ) THEN
    RAISE EXCEPTION 'order holiday surcharge snapshot columns missing';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('private.validate_holiday_surcharge_policy()')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%pg_advisory_xact_lock%'
    OR v_definition NOT LIKE '%IS NOT DISTINCT FROM NEW.branch_id%'
    OR v_definition NOT LIKE '%tstzrange%'
    OR v_definition NOT LIKE '%holiday_surcharge_policy_overlap%'
  THEN
    RAISE EXCEPTION 'holiday surcharge overlap invariant missing';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('public.pos_normalize_order_discount_totals()')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%ORDER BY (p.branch_id IS NOT NULL) DESC%'
    OR v_definition NOT LIKE '%holiday_surcharge_policy_name%'
    OR v_definition NOT LIKE '%v_surcharge_base * NEW.holiday_surcharge_value / 100%'
    OR v_definition NOT LIKE '%holiday_surcharge_source IN (''none'', ''waived'')%'
  THEN
    RAISE EXCEPTION 'automatic holiday surcharge snapshot or formula missing';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('public.set_order_service_charge(bigint,numeric,text)')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%holiday_surcharge_source%'
    OR v_definition NOT LIKE '%WHEN v_amount = 0 THEN ''waived''%'
    OR v_definition NOT LIKE '%ELSE ''manual''%'
    OR v_definition NOT LIKE '%service_charge_payment_pending%'
  THEN
    RAISE EXCEPTION 'manual holiday surcharge override contract missing';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure(
      'public.prevent_order_amount_mutation_after_payment_code_exposed()'
    )
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%holiday_surcharge_policy_id%'
    OR v_definition NOT LIKE '%holiday_surcharge_policy_name%'
  THEN
    RAISE EXCEPTION 'payment-code lock does not cover surcharge snapshot';
  END IF;
END;
$$;

ROLLBACK;
