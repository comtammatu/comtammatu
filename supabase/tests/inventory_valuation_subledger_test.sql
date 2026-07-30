\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT pg_catalog.array_agg(required.name ORDER BY required.name)
  INTO v_missing
  FROM (
    VALUES
      ('inventory_valuation_settings'),
      ('inventory_valuation_cutovers'),
      ('inventory_valuation_accounts'),
      ('inventory_cost_origins'),
      ('inventory_origin_balances'),
      ('inventory_valuation_events'),
      ('inventory_value_allocations')
  ) AS required(name)
  WHERE pg_catalog.to_regclass('public.' || required.name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'missing valuation tables: %', v_missing;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_movements'
      AND column_name = 'grn_item_id'
  ) THEN
    RAISE EXCEPTION 'stock_movements.grn_item_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'inventory_valuation_events'
      AND class.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'valuation event RLS is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_class AS class
      ON class.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'inventory_valuation_events'
      AND trigger.tgname = 'inventory_valuation_events_immutable'
      AND NOT trigger.tgisinternal
  ) THEN
    RAISE EXCEPTION 'valuation event immutability trigger is required';
  END IF;

  IF pg_catalog.has_table_privilege(
    'authenticated',
    'public.inventory_valuation_events',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.inventory_valuation_events',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.inventory_value_allocations',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'authenticated direct valuation DML must stay revoked';
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.confirm_supplier_invoice(bigint,uuid)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.get_supplier_invoice_valuation_summary(bigint)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.close_inventory_cost_period(integer,integer,text,uuid)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.get_inventory_valuation_period_value(date,date,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION 'valuation public RPC contract is incomplete';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.get_inventory_valuation_reconciliation(integer,integer,bigint)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.get_inventory_valuation_period_value(date,date,bigint)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anonymous valuation report execution must stay revoked';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'inventory_valuation_events_invoice_idx'
      AND indexdef ~ '\(source_invoice_id\)'
      AND indexdef !~ '\(tenant_id, source_invoice_id\)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'stock_movements_grn_item_idx'
      AND indexdef ~ '\(grn_item_id\)'
      AND indexdef !~ '\(tenant_id, grn_item_id\)'
  ) THEN
    RAISE EXCEPTION 'valuation foreign-key indexes must lead with their FK columns';
  END IF;
END;
$$;

DO $$
DECLARE
  v_precision integer;
  v_scale integer;
BEGIN
  SELECT numeric_precision, numeric_scale
  INTO v_precision, v_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'stock_levels'
    AND column_name = 'avg_unit_cost';

  IF v_precision < 24 OR v_scale < 8 THEN
    RAISE EXCEPTION
      'stock_levels.avg_unit_cost precision is %, scale is %',
      v_precision,
      v_scale;
  END IF;
END;
$$;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.post_stock_movement_valuation()'::pg_catalog.regprocedure;

  IF v_definition !~ 'v_quantity = v_account.quantity'
     OR v_definition !~ 'v_account.book_value'
     OR v_definition !~ 'inventory_valuation_allocation_drift' THEN
    RAISE EXCEPTION 'full-depletion residual contract is missing';
  END IF;
END;
$$;

ROLLBACK;
