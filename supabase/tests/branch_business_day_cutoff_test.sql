-- Contract drift checks for branch business-day 04:00 cut-off + ADR 0024 retire.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.branch_business_day_bounds(bigint, date)') IS NULL THEN
    RAISE EXCEPTION 'branch_business_day_bounds_missing';
  END IF;
  IF to_regprocedure('public.branch_business_date(bigint, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'branch_business_date_missing';
  END IF;

  SELECT pg_get_functiondef('public.branch_business_day_bounds(bigint, date)'::regprocedure)
  INTO v_definition;
  IF position('04:00:00' IN v_definition) = 0
     OR position('Asia/Ho_Chi_Minh' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'branch_business_day_bounds_contract_drift';
  END IF;

  SELECT pg_get_functiondef('public.branch_business_date(bigint, timestamptz)'::regprocedure)
  INTO v_definition;
  IF position('EXTRACT(HOUR FROM v_local)' IN v_definition) = 0
     OR position('< 4' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'branch_business_date_contract_drift';
  END IF;

  SELECT pg_get_functiondef('public.get_branch_day_summary(bigint, date)'::regprocedure)
  INTO v_definition;
  IF position('branch_business_day_bounds' IN v_definition) = 0
     OR position('interval ''7 hours''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'get_branch_day_summary_cutoff_drift';
  END IF;

  SELECT pg_get_functiondef('public.close_branch_day(bigint, date, jsonb, text)'::regprocedure)
  INTO v_definition;
  IF position('branch_day_close_retired' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'close_branch_day_not_retired';
  END IF;
END;
$$;

ROLLBACK;
