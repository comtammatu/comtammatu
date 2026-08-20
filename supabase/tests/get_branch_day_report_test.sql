-- Contract checks for get_branch_day_report (branch Daily Summary).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.get_branch_day_report(bigint, date)') IS NULL THEN
    RAISE EXCEPTION 'get_branch_day_report_missing';
  END IF;

  SELECT pg_get_functiondef('public.get_branch_day_report(bigint, date)'::regprocedure)
  INTO v_definition;

  IF position('settings:branch' IN v_definition) = 0
     OR position('finance:view' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'get_branch_day_report_missing_permission_gate';
  END IF;

  IF position('branch_business_day_bounds' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'get_branch_day_report_cutoff_drift';
  END IF;

  IF position('food_cost_coverage' IN v_definition) = 0
     OR position('operating_result' IN v_definition) = 0
     OR position('top_items' IN v_definition) = 0
     OR position('side_revenue' IN v_definition) = 0
     OR position('side_item_id' IN v_definition) = 0
     OR position('expense_date' IN v_definition) = 0
     OR position('transfer_in' IN v_definition) = 0
     OR position('subtotal - order_facts.discount_amount' IN v_definition) = 0
     OR position('v_gross_profit := NULL' IN v_definition) = 0
     OR v_definition !~ 'v_paid_orders[[:space:]]+FROM order_facts' THEN
    RAISE EXCEPTION 'get_branch_day_report_payload_drift';
  END IF;

  IF position('interval ''7 hours''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'get_branch_day_report_calendar_midnight_window';
  END IF;

  IF v_definition LIKE '%GRANT%finance:view%branch_manager%' THEN
    RAISE EXCEPTION 'get_branch_day_report_must_not_grant_finance_view';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.get_branch_day_report(bigint, date)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.get_branch_day_report(bigint, date)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'get_branch_day_report_grant_drift';
  END IF;
END;
$$;

ROLLBACK;
