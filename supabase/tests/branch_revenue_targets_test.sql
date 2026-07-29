-- Structural contract for branch monthly Doanh thu thuần targets.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF to_regclass('public.branch_revenue_targets') IS NULL THEN
    RAISE EXCEPTION 'branch_revenue_targets table missing';
  END IF;

  IF to_regprocedure('public.list_branch_revenue_targets(date)') IS NULL
    OR to_regprocedure('public.upsert_branch_revenue_targets(date,jsonb)') IS NULL
    OR to_regprocedure('public.get_branch_revenue_target_progress(bigint,date)') IS NULL
    OR to_regprocedure('public.list_branch_revenue_target_progress(date)') IS NULL
  THEN
    RAISE EXCEPTION 'branch revenue target RPCs missing';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('public.get_branch_revenue_target_progress(bigint,date)')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%branch_manager%'
    OR v_definition NOT LIKE '%branch scope mismatch%'
    OR v_definition NOT LIKE '%discount_amount%'
  THEN
    RAISE EXCEPTION 'get_branch_revenue_target_progress missing BM scope or Doanh thu thuần formula';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('public.upsert_branch_revenue_targets(date,jsonb)')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%auth_is_owner%'
    OR v_definition LIKE '%branch_manager%'
  THEN
    RAISE EXCEPTION 'upsert_branch_revenue_targets must stay owner-only';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branch_revenue_targets'
      AND policyname = 'branch_revenue_targets_select'
  ) THEN
    RAISE EXCEPTION 'branch_revenue_targets_select policy missing';
  END IF;
END;
$$;

ROLLBACK;
