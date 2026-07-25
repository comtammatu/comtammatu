-- Run against a non-production database after all active migrations.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f supabase/tests/order_kds_payment_revenue_operational_truth_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_definition text;
  v_result text;
BEGIN
  IF to_regclass('public.kds_ticket_events') IS NULL THEN
    RAISE EXCEPTION 'kds_ticket_events is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_kds_ticket_events_immutable'
      AND tgrelid = 'public.kds_ticket_events'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'KDS immutable trigger is missing';
  END IF;

  IF has_table_privilege(
      'authenticated',
      'public.kds_ticket_events',
      'INSERT'
    )
    OR has_table_privilege(
      'authenticated',
      'public.kds_ticket_events',
      'UPDATE'
    )
    OR has_table_privilege(
      'authenticated',
      'public.kds_ticket_events',
      'DELETE'
    )
  THEN
    RAISE EXCEPTION 'authenticated can mutate KDS evidence directly';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname =
        'bank_transaction_reconciliation_matches_payment_key'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname =
        'bank_transaction_reconciliation_matches_bank_payment_key'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'canonical SePay one-to-one indexes are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_payments_order_active'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%status <> ''failed''%'
  ) THEN
    RAISE EXCEPTION
      'one-active-payment invariant required by daily drill is missing';
  END IF;

  IF to_regprocedure(
    'public.get_kds_ticket_history(bigint,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,bigint,bigint,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'get_kds_ticket_history signature is missing';
  END IF;

  IF NOT has_function_privilege(
      'authenticated',
      'public.get_kds_ticket_history(bigint,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,bigint,bigint,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.get_kds_ticket_history(bigint,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,bigint,bigint,text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'KDS history execute privileges are incorrect';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_order_operational_trace(bigint)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%item_summary%'
    OR v_definition NOT ILIKE '%legacy_current_main_dish_quantity%'
    OR v_definition NOT ILIKE '%tax_invoice_orders%'
  THEN
    RAISE EXCEPTION 'order operational trace is incomplete';
  END IF;

  SELECT pg_get_functiondef(
    'private.enqueue_kitchen_completion_print_internal(bigint,bigint[],uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT ILIKE '%ticket_ids%'
    OR v_definition NOT ILIKE '%order_item_ids%'
    OR v_definition NOT ILIKE '%printer_menu_categories route_any%'
    OR v_definition NOT ILIKE '%candidate.role%'
  THEN
    RAISE EXCEPTION
      'kitchen print evidence or default-printer fallback is incomplete';
  END IF;

  SELECT pg_get_function_result(
    'public.get_orders_for_day_v2(bigint,date)'::regprocedure
  ) INTO v_result;
  IF v_result NOT ILIKE '%kds_legacy_completed_item_quantity%'
    OR v_result NOT ILIKE '%legacy_current_main_dish_quantity%'
    OR v_result NOT ILIKE '%order_payment_state_mismatch%'
  THEN
    RAISE EXCEPTION 'Finance day drill result contract is incomplete';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_orders_for_day_v2(bigint,date)'::regprocedure
  ) INTO v_definition;
  IF v_definition ILIKE '%orders.payment_status = ''paid''%'
    OR v_definition NOT ILIKE '%candidate.status = ''completed''%'
    OR v_definition NOT ILIKE '%candidate.paid_at IS NOT NULL%'
    OR v_definition NOT ILIKE '%audit.entity_type = ''webhook_event''%'
  THEN
    RAISE EXCEPTION 'Finance day drill does not use payment authority';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_pos_session_report(bigint)'::regprocedure
  ) INTO v_definition;
  IF v_definition ILIKE '%orders.payment_status = ''paid''%'
    OR v_definition NOT ILIKE '%late_payment_count%'
    OR v_definition NOT ILIKE '%kds_legacy_completed_item_quantity%'
    OR v_definition NOT ILIKE '%audit.entity_type = ''webhook_event''%'
  THEN
    RAISE EXCEPTION 'POS session operational contract is incomplete';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_revenue_rollup(bigint,date,date,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition ILIKE '%orders.payment_status = ''paid''%'
    OR v_definition NOT ILIKE '%payment.status = ''completed''%'
    OR v_definition NOT ILIKE '%payment.paid_at%'
  THEN
    RAISE EXCEPTION 'Revenue rollup does not use payment authority';
  END IF;

  RAISE NOTICE
    'TEST PASSED: order, KDS, print, SePay, POS and Finance contracts align';
END;
$$;

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_owner_id uuid;
  v_ticket_id bigint := 900000000000000 + txid_current();
  v_order_id bigint := 900000000100000 + txid_current();
  v_item_id bigint := 900000000200000 + txid_current();
  v_test_id text := gen_random_uuid()::text;
  v_event_id bigint;
  v_event_count integer;
  v_immutable boolean := false;
BEGIN
  SELECT branch.tenant_id, branch.id, profile.id
  INTO v_tenant_id, v_branch_id, v_owner_id
  FROM public.branches branch
  JOIN public.profiles profile
    ON profile.tenant_id = branch.tenant_id
   AND COALESCE(profile.is_active, true)
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
   AND position.code = 'owner'
  WHERE branch.is_active
  ORDER BY branch.id, profile.id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'dev seed owner and branch are required';
  END IF;

  INSERT INTO public.kds_ticket_events (
    tenant_id,
    branch_id,
    order_id,
    ticket_id,
    order_item_id,
    station_id,
    event_type,
    from_status,
    to_status,
    actor_id,
    item_snapshot,
    context,
    occurred_at
  ) VALUES
    (
      v_tenant_id,
      v_branch_id,
      v_order_id,
      v_ticket_id,
      v_item_id,
      v_branch_id,
      'completed',
      'preparing',
      'ready',
      v_owner_id,
      jsonb_build_object('item_name', 'KDS invariant', 'quantity', 2),
      jsonb_build_object('test_id', v_test_id),
      (current_date - 1 + time '10:00')
        AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_order_id,
      v_ticket_id,
      v_item_id,
      v_branch_id,
      'recalled',
      'ready',
      'preparing',
      v_owner_id,
      jsonb_build_object('item_name', 'KDS invariant', 'quantity', 2),
      jsonb_build_object('test_id', v_test_id),
      (current_date + time '09:00')
        AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ),
    (
      v_tenant_id,
      v_branch_id,
      v_order_id,
      v_ticket_id,
      v_item_id,
      v_branch_id,
      'completed',
      'preparing',
      'ready',
      v_owner_id,
      jsonb_build_object('item_name', 'KDS invariant', 'quantity', 2),
      jsonb_build_object('test_id', v_test_id),
      (current_date + time '09:05')
        AT TIME ZONE 'Asia/Ho_Chi_Minh'
    );

  SELECT max(event.id)
  INTO v_event_id
  FROM public.kds_ticket_events event
  WHERE event.context->>'test_id' = v_test_id;

  BEGIN
    UPDATE public.kds_ticket_events
    SET context = context || '{"mutated":true}'::jsonb
    WHERE id = v_event_id;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_immutable := true;
  END;

  IF NOT v_immutable THEN
    RAISE EXCEPTION 'KDS event evidence was mutable';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub',
    v_owner_id::text,
    true
  );
  PERFORM set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub',
      v_owner_id,
      'role',
      'authenticated'
    )::text,
    true
  );

  SELECT count(*)::integer
  INTO v_event_count
  FROM public.get_kds_ticket_history(
    v_branch_id,
    (current_date - 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
    (current_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
    100,
    NULL,
    NULL,
    NULL,
    NULL
  ) history
  WHERE history.context->>'test_id' = v_test_id;

  IF v_event_count <> 3 THEN
    RAISE EXCEPTION
      'KDS complete-recall-complete history did not survive across days';
  END IF;

  SELECT count(*)::integer
  INTO v_event_count
  FROM public.get_kds_ticket_history(
    v_branch_id,
    (current_date - 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
    (current_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
    100,
    NULL,
    NULL,
    NULL,
    'recalled'
  ) history
  WHERE history.context->>'test_id' = v_test_id;

  IF v_event_count <> 1 OR EXISTS (
    SELECT 1
    FROM public.kds_tickets ticket
    WHERE ticket.id = v_ticket_id
  ) THEN
    RAISE EXCEPTION
      'KDS history depends on a live ticket or ignores event filtering';
  END IF;
END;
$$;

ROLLBACK;
