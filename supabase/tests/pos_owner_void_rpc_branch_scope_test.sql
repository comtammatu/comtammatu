-- Contract checks for Owner branch bypass and waiter item-only mutation scope.
-- Runtime role probes belong on a verified Preview Branch after apply.

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
  ) = 0 OR position('''branch_staff''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: cancel_order keeps waiter out';
  END IF;
  IF position('branch scope required' IN v_def) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: cancel_order Owner null-branch bypass present';
  END IF;

  v_def := pg_get_functiondef('public.void_order_item(bigint,text)'::regprocedure);
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'', ''branch_staff'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: void_order_item admits branch_staff/waiter';
  END IF;
  IF position('public.has_permission(v_order.branch_id, ''pos:void_order'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: void_order_item keeps permission gate';
  END IF;

  v_def := pg_get_functiondef(
    'public.reduce_order_item_quantity(bigint,integer,text)'::regprocedure
  );
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'', ''branch_staff'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: reduce_order_item_quantity admits branch_staff/waiter';
  END IF;
  IF position('public.has_permission(v_order.branch_id, ''pos:void_order'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: reduce_order_item_quantity keeps permission gate';
  END IF;

  v_def := pg_get_functiondef(
    'public.edit_pending_order_item(bigint,bigint,text,numeric,jsonb,jsonb,text,integer)'::regprocedure
  );
  IF position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'', ''branch_staff'')'
    IN v_def
  ) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: edit_pending_order_item admits branch_staff/waiter';
  END IF;
  IF position('public.has_permission(v_order.branch_id, ''pos:void_order'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: edit_pending_order_item keeps permission gate';
  END IF;

  SELECT permission_keys
  INTO v_waiter_keys
  FROM public.role_templates
  WHERE position_code = 'waiter'
  LIMIT 1;

  IF v_waiter_keys IS NULL
     OR NOT v_waiter_keys @> ARRAY[
       'hr:request_leave',
       'orders:read',
       'orders:write',
       'pos:use',
       'pos:send_kitchen',
       'pos:print',
       'pos:reprint_receipt',
       'pos:confirm_payment',
       'pos:void_order'
     ]::text[] THEN
    RAISE EXCEPTION
      'TEST FAILED: waiter item-mutation POS grants missing, got %',
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
