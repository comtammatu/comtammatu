\set ON_ERROR_STOP on

BEGIN;

-- Retired revoke-locked bulk PO RPCs were dropped (zero app callers).
DO $$
DECLARE
  v_signatures constant text[] := ARRAY[
    'public.create_purchase_orders_from_request(bigint,jsonb)',
    'public.save_purchase_orders_from_request(bigint,jsonb,boolean,uuid)',
    'public.save_purchase_order(bigint,date,text,jsonb,boolean)',
    'public.approve_purchase_order(bigint)',
    'public.create_purchase_order_from_grn(bigint)'
  ];
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    IF to_regprocedure(v_signature) IS NOT NULL THEN
      RAISE EXCEPTION 'PURCHASE ORDER RPC: retired function still present: %', v_signature;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
