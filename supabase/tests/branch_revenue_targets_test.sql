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

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'branch_revenue_targets'
      AND column_name = 'reward_tiers'
      AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'branch_revenue_targets.reward_tiers missing';
  END IF;

  IF to_regprocedure('public.list_branch_revenue_targets(date)') IS NULL
    OR to_regprocedure('public.upsert_branch_revenue_targets(date,jsonb)') IS NULL
    OR to_regprocedure('public.list_branch_revenue_target_reward_tiers(date)') IS NULL
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
    OR v_definition NOT LIKE '%reward_tiers%'
  THEN
    RAISE EXCEPTION 'upsert_branch_revenue_targets must stay owner-only and persist reward tiers';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('private.branch_revenue_targets_enforce_branch_kind()')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%fixed_amount%'
    OR v_definition NOT LIKE '%revenue_percent%'
    OR v_definition NOT LIKE '%threshold_pct%'
    OR v_definition NOT LIKE '%jsonb_array_length(NEW.reward_tiers) > 10%'
  THEN
    RAISE EXCEPTION 'branch target trigger missing reward tier validation';
  END IF;

  IF has_column_privilege(
    'authenticated',
    'public.branch_revenue_targets',
    'reward_tiers',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated must not read reward_tiers directly';
  END IF;

  SELECT pg_get_functiondef(
    to_regprocedure('public.list_branch_revenue_target_reward_tiers(date)')
  )
  INTO v_definition;

  IF v_definition NOT LIKE '%auth_is_owner%'
    OR v_definition LIKE '%branch_manager%'
  THEN
    RAISE EXCEPTION 'reward tier list must stay owner-only';
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
