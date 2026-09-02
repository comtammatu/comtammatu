-- Run against a non-production database after Wave 5 forwards.
\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.purchase_request_allocations') IS NOT NULL
     OR to_regclass('public.purchase_request_items') IS NOT NULL
     OR to_regclass('public.purchase_requests') IS NOT NULL
     OR to_regclass('public.stock_request_items') IS NOT NULL
     OR to_regclass('public.stock_requests') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WAVE5: request tables still exist';
  END IF;

  IF to_regprocedure('public.cancel_purchase_request(bigint, text)') IS NOT NULL
     OR to_regprocedure('public.close_purchase_request(bigint, text)') IS NOT NULL
     OR to_regprocedure('public.cancel_stock_request(bigint, text)') IS NOT NULL
     OR to_regprocedure('public.close_stock_request(bigint, text)') IS NOT NULL
     OR to_regprocedure(
       'public.save_purchase_demand(bigint, bigint, date, text, jsonb, boolean, uuid)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.save_stock_request(bigint, bigint, timestamp with time zone, text, jsonb, boolean, uuid)'
     ) IS NOT NULL
  THEN
    RAISE EXCEPTION 'WAVE5: request RPCs still exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_orders'
      AND column_name = 'purchase_request_id'
  ) THEN
    RAISE EXCEPTION 'WAVE5: purchase_orders.purchase_request_id was dropped';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_purchase_request_tenant_fkey'
  ) THEN
    RAISE EXCEPTION 'WAVE5: purchase_request FK still exists';
  END IF;
END;
$$;

ROLLBACK;
