-- Static contract checks for Owner void/edit RPC auth + waiter separation.
-- Runtime role probes belong on a Preview Branch after apply.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_def text;
  v_waiter_keys text[];
  v_cashier_keys text[];
BEGIN
  v_def := pg_get_functiondef('public.cancel_order(bigint,text)'::regprocedure);
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: cancel_order allows owner';
  END IF;

  v_def := pg_get_functiondef('public.void_order_item(bigint,text)'::regprocedure);
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: void_order_item allows owner';
  END IF;

  v_def := pg_get_functiondef(
    'public.reduce_order_item_quantity(bigint,integer,text)'::regprocedure
  );
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: reduce_order_item_quantity allows owner';
  END IF;

  v_def := pg_get_functiondef(
    'public.edit_pending_order_item(bigint,bigint,text,numeric,jsonb,jsonb,text,integer)'::regprocedure
  );
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: edit_pending_order_item allows owner';
  END IF;

  v_def := pg_get_functiondef('public.cancel_order(bigint,text)'::regprocedure);
  IF position('branch scope required' IN v_def) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: cancel_order Owner null-branch bypass present';
  END IF;

  v_def := pg_get_functiondef('public.void_order_item(bigint,text)'::regprocedure);
  IF position('''branch_staff''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: void_order_item does not admit branch_staff/waiter';
  END IF;

  SELECT permission_keys
  INTO v_waiter_keys
  FROM public.role_templates
  WHERE position_code = 'waiter'
  LIMIT 1;

  IF v_waiter_keys IS DISTINCT FROM ARRAY['hr:request_leave']::text[] THEN
    RAISE EXCEPTION
      'TEST FAILED: waiter template stays leave-only (no POS money keys), got %',
      v_waiter_keys;
  END IF;

  SELECT permission_keys
  INTO v_cashier_keys
  FROM public.role_templates
  WHERE position_code = 'cashier'
  LIMIT 1;

  IF v_cashier_keys IS NULL
     OR NOT v_cashier_keys @> ARRAY[
       'pos:use', 'pos:confirm_payment', 'pos:void_order'
     ]::text[] THEN
    RAISE EXCEPTION
      'TEST FAILED: cashier template keeps POS money keys, got %',
      v_cashier_keys;
  END IF;
END;
$$;

ROLLBACK;
