-- Static contract checks for Owner void/edit RPC auth + waiter separation.
-- Runtime role probes belong on a Preview Branch after apply.

BEGIN;

SELECT plan(8);

SELECT ok(
  position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    in pg_get_functiondef('public.cancel_order(bigint,text)'::regprocedure)
  ) > 0,
  'cancel_order allows owner'
);

SELECT ok(
  position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    in pg_get_functiondef('public.void_order_item(bigint,text)'::regprocedure)
  ) > 0,
  'void_order_item allows owner'
);

SELECT ok(
  position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    in pg_get_functiondef(
      'public.reduce_order_item_quantity(bigint,integer,text)'::regprocedure
    )
  ) > 0,
  'reduce_order_item_quantity allows owner'
);

SELECT ok(
  position(
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')'
    in pg_get_functiondef(
      'public.edit_pending_order_item(bigint,bigint,text,numeric,jsonb,jsonb,text,integer)'::regprocedure
    )
  ) > 0,
  'edit_pending_order_item allows owner'
);

SELECT ok(
  position(
    'branch scope required'
    in pg_get_functiondef('public.cancel_order(bigint,text)'::regprocedure)
  ) > 0,
  'cancel_order Owner null-branch bypass present'
);

SELECT ok(
  position(
    '''branch_staff'''
    in pg_get_functiondef('public.void_order_item(bigint,text)'::regprocedure)
  ) = 0,
  'void_order_item does not admit branch_staff/waiter'
);

SELECT ok(
  (
    SELECT permission_keys = ARRAY['hr:request_leave']::text[]
    FROM public.role_templates
    WHERE position_code = 'waiter'
    LIMIT 1
  ),
  'waiter template stays leave-only (no POS money keys)'
);

SELECT ok(
  (
    SELECT permission_keys @> ARRAY['pos:use', 'pos:confirm_payment', 'pos:void_order']::text[]
    FROM public.role_templates
    WHERE position_code = 'cashier'
    LIMIT 1
  ),
  'cashier template keeps POS money keys'
);

SELECT * FROM finish();
ROLLBACK;
