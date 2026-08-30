-- Regression test: public Pickup Broadcast is payload-free and statement-level.
-- Safe to run repeatedly; this test inspects the applied catalog only.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_function_definition text;
  v_trigger_count integer;
  v_row_trigger_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.broadcast_pickup_invalidation()'::regprocedure
  ) INTO v_function_definition;

  IF v_function_definition NOT ILIKE '%SECURITY DEFINER%'
     OR v_function_definition NOT ILIKE '%SET search_path TO %'
     OR v_function_definition NOT ILIKE '%realtime.send%'
     OR v_function_definition NOT ILIKE '%''{}''::jsonb%'
     OR v_function_definition NOT ILIKE '%''invalidate''%'
     OR v_function_definition NOT ILIKE '%''pickup:''%'
     OR v_function_definition NOT ILIKE '%false%' THEN
    RAISE EXCEPTION
      'TEST FAILED: Pickup Broadcast function is missing its payload-free public contract';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.broadcast_pickup_invalidation()',
       'EXECUTE'
     )
     OR has_function_privilege(
          'authenticated',
          'public.broadcast_pickup_invalidation()',
          'EXECUTE'
        )
     OR NOT has_function_privilege(
              'service_role',
              'public.broadcast_pickup_invalidation()',
              'EXECUTE'
            ) THEN
    RAISE EXCEPTION
      'TEST FAILED: Pickup Broadcast trigger function grants are widened or incomplete';
  END IF;

  SELECT count(*)
    INTO v_trigger_count
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgrelid IN (
      'public.kds_tickets'::regclass,
      'public.orders'::regclass,
      'public.order_items'::regclass,
      'public.kitchen_send_batches'::regclass,
      'public.tables'::regclass
    )
    AND trigger_row.tgname IN (
      'trg_kds_tickets_broadcast_pickup_insert',
      'trg_kds_tickets_broadcast_pickup_update',
      'trg_kds_tickets_broadcast_pickup_delete',
      'trg_orders_broadcast_pickup_update',
      'trg_order_items_broadcast_pickup_update',
      'trg_kitchen_send_batches_broadcast_pickup_update',
      'trg_tables_broadcast_pickup_update'
    )
    AND trigger_row.tgenabled <> 'D';

  IF v_trigger_count <> 7 THEN
    RAISE EXCEPTION
      'TEST FAILED: expected seven enabled Pickup Broadcast triggers, found %',
      v_trigger_count;
  END IF;

  SELECT count(*)
    INTO v_row_trigger_count
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgrelid IN (
      'public.kds_tickets'::regclass,
      'public.orders'::regclass,
      'public.order_items'::regclass,
      'public.kitchen_send_batches'::regclass,
      'public.tables'::regclass
    )
    AND trigger_row.tgname LIKE '%broadcast_pickup%'
    AND (trigger_row.tgtype & 1) = 1;

  IF v_row_trigger_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: Pickup Broadcast must not emit once per changed row';
  END IF;
END;
$$;

ROLLBACK;
