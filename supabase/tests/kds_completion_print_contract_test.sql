-- =============================================================
-- Regression test: kitchen paper is queued by KDS completion, not POS send
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kds_completion_print_contract_test.sql
--   supabase db query --linked --file supabase/tests/kds_completion_print_contract_test.sql
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_trigger_count INTEGER;
  v_complete_def TEXT;
  v_helper_def TEXT;
  v_compat_def TEXT;
  v_route_def TEXT;
  v_retired_trigger_function REGPROCEDURE;
BEGIN
  SELECT COUNT(*)
    INTO v_trigger_count
  FROM pg_trigger
  WHERE tgname = 'trg_auto_enqueue_kitchen_print_from_ticket'
    AND tgrelid = 'public.kds_tickets'::regclass
    AND NOT tgisinternal;

  IF v_trigger_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: KDS ticket creation trigger still auto-enqueues kitchen print';
  END IF;

  SELECT pg_get_functiondef('public.complete_kds_tickets(bigint,bigint[])'::regprocedure)
    INTO v_complete_def;
  SELECT pg_get_functiondef('private.enqueue_kitchen_completion_print_internal(bigint,bigint[],uuid)'::regprocedure)
    INTO v_helper_def;
  SELECT pg_get_functiondef('public.enqueue_kitchen_print(bigint)'::regprocedure)
    INTO v_compat_def;
  SELECT pg_get_functiondef('public.route_order_to_kds(bigint)'::regprocedure)
    INTO v_route_def;
  SELECT to_regprocedure('public.auto_enqueue_kitchen_print_from_ticket()')
    INTO v_retired_trigger_function;

  IF v_retired_trigger_function IS NOT NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: retired KDS ticket auto-print trigger function still exists';
  END IF;

  IF v_complete_def NOT ILIKE '%enqueue_kitchen_completion_print_internal%' THEN
    RAISE EXCEPTION
      'TEST FAILED: complete_kds_tickets does not queue completion-scoped print jobs';
  END IF;

  IF v_complete_def NOT ILIKE '%kt.status IN (''pending'', ''preparing'')%' THEN
    RAISE EXCEPTION
      'TEST FAILED: complete_kds_tickets print set is not based on active-ticket transitions';
  END IF;

  IF v_helper_def NOT ILIKE '%WHERE kt.id = ANY(v_ticket_ids)%'
     OR v_helper_def NOT ILIKE '%sent_to_kitchen_at IS NULL%' THEN
    RAISE EXCEPTION
      'TEST FAILED: completion print helper is not scoped to unsent completed ticket ids';
  END IF;

  IF v_helper_def NOT ILIKE '%:kds-complete:printer:%'
     OR v_helper_def NOT ILIKE '%:tickets:%' THEN
    RAISE EXCEPTION
      'TEST FAILED: completion print idempotency is not ticket-scoped';
  END IF;

  IF v_compat_def NOT ILIKE '%deferred_to%'
     OR v_compat_def NOT ILIKE '%kds_completion%' THEN
    RAISE EXCEPTION
      'TEST FAILED: POS-era enqueue_kitchen_print is not a KDS-completion compatibility wrapper';
  END IF;

  IF v_route_def NOT ILIKE '%non-kds-dispatch%'
     OR v_route_def NOT ILIKE '%v_station_id IS NULL AND v_has_printer_route%'
     OR v_route_def NOT ILIKE '%printer_menu_categories%'
     OR v_route_def NOT ILIKE '%pmc_any%'
     OR v_route_def NOT ILIKE '%kds_station_categories%' THEN
    RAISE EXCEPTION
      'TEST FAILED: printer-only categories are not dispatched separately from KDS completion';
  END IF;

  IF v_route_def ILIKE '%category_type = ''drink''%'
     OR v_route_def ILIKE '%mc.type = ''drink''%'
     OR v_route_def ILIKE '%mc.type <> ''drink''%'
     OR v_route_def ILIKE '%v_fallback_station_id%' THEN
    RAISE EXCEPTION
      'TEST FAILED: route_order_to_kds still uses category-type hardcode or fallback station routing';
  END IF;

  RAISE NOTICE
    'TEST PASSED: KDS completion owns kitchen print queueing';
END;
$$;

ROLLBACK;
