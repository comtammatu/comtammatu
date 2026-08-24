-- Finance startup-capital summary RPC:
-- get_finance_startup_capital_summary aggregates all-time capital+deposit
-- expenses (Chi phí ban đầu) and the capital slice (Thiết bị) per location
-- scope. The RPC takes no dates at all; rows are seeded with dates spread
-- across a decade to prove the period never changes the totals.

\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Seed isolated branches plus capital/deposit/operating expense rows across
-- NULL-branch, sales-branch, and non-sales-branch scopes, then capture the
-- RPC payloads and date-free recomputations for the assertions.
DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch1 bigint;
  v_branch2 bigint;
  v_kitchen bigint;
  v_exp_all numeric;
  v_exp_all_capital numeric;
  v_exp_company numeric;
  v_exp_company_capital numeric;
  v_exp_company_cnt bigint;
  v_exp_branches numeric;
  v_exp_branches_capital numeric;
  v_payload jsonb;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
  -- Reuse the seeded tenant owner fixture (same convention as the other
  -- finance RPC tests); the owner carries finance:view through the
  -- tenant_owner role binding.
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'FINANCE STARTUP CAPITAL: seeded owner fixture required';
  END IF;

  -- Two sales branches and one non-sales branch that only exist inside this
  -- transaction, so the branch-scope fixed numbers below stay exact even
  -- when the seeded tenant already carries capital/deposit rows elsewhere.
  -- Sales-branch codes must satisfy branches_code_format_chk
  -- (code ~ '^[A-Z]{2,4}$'); uniqueness is carried by the suffixed name.
  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__fscs_b1_' || v_suffix, 'FSA', 'branch', TRUE)
  RETURNING id INTO v_branch1;

  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__fscs_b2_' || v_suffix, 'FSB', 'branch', TRUE)
  RETURNING id INTO v_branch2;

  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__fscs_ck_' || v_suffix, 'FK1_' || v_suffix, 'central_kitchen', TRUE)
  RETURNING id INTO v_kitchen;

  -- Fixture dates intentionally span 2018..2027 (far outside any plausible
  -- reporting period): the RPC accepts no dates and totals must not move.
  -- Cash requires an active sales branch (expenses_cash_requires_branch plus
  -- assert_sales_branch), so company-scope and non-sales rows use transfer.
  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, subtotal,
    vat_breakdown, vat_amount, payment_method, paid_at, created_by, created_at
  ) VALUES
    (v_tenant, NULL, DATE '2019-03-15', 'capital', 5000000, 5000000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 5000000, 'vat_amount', 0)),
     0, 'transfer', statement_timestamp(), v_owner, statement_timestamp()),
    (v_tenant, NULL, DATE '2021-11-02', 'deposit', 4000000, 4000000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 4000000, 'vat_amount', 0)),
     0, 'transfer', statement_timestamp(), v_owner, statement_timestamp()),
    (v_tenant, v_branch1, DATE '2024-06-10', 'capital', 2500000, 2500000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 2500000, 'vat_amount', 0)),
     0, 'cash', statement_timestamp(), v_owner, statement_timestamp()),
    (v_tenant, v_branch1, DATE '2027-12-31', 'capital', 1000000, 1000000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 1000000, 'vat_amount', 0)),
     0, 'cash', statement_timestamp(), v_owner, statement_timestamp()),
    (v_tenant, v_branch1, DATE '2018-05-20', 'deposit', 700000, 700000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 700000, 'vat_amount', 0)),
     0, 'cash', statement_timestamp(), v_owner, statement_timestamp()),
    (v_tenant, v_branch2, DATE '2022-02-14', 'capital', 1200000, 1200000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 1200000, 'vat_amount', 0)),
     0, 'cash', statement_timestamp(), v_owner, statement_timestamp()),
    (v_tenant, v_kitchen, DATE '2023-01-05', 'deposit', 3000000, 3000000,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 3000000, 'vat_amount', 0)),
     0, 'transfer', statement_timestamp(), v_owner, statement_timestamp()),
    -- Operating category must never enter the startup totals.
    (v_tenant, NULL, DATE '2020-10-10', 'rent', 9999999, 9999999,
     jsonb_build_array(jsonb_build_object(
       'vat_rate', 0, 'taxable_amount', 9999999, 'vat_amount', 0)),
     0, 'transfer', statement_timestamp(), v_owner, statement_timestamp());

  -- Fake the owner JWT the way the other finance RPC tests do; the summary
  -- RPC is SECURITY DEFINER and resolves tenant + permissions from claims.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );

  PERFORM set_config('test.fscs_branch1', v_branch1::text, TRUE);
  PERFORM set_config('test.fscs_kitchen', v_kitchen::text, TRUE);

  -- Date-free recomputations (no expense_date predicate anywhere): the RPC
  -- payloads must equal these regardless of how far the row dates sit from
  -- any period boundary.
  SELECT
    COALESCE(SUM(expense.amount), 0),
    COALESCE(SUM(expense.amount)
      FILTER (WHERE expense.category = 'capital'), 0)
  INTO v_exp_all, v_exp_all_capital
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant
    AND expense.category IN ('capital', 'deposit');

  SELECT
    COALESCE(SUM(expense.amount), 0),
    COALESCE(SUM(expense.amount)
      FILTER (WHERE expense.category = 'capital'), 0),
    COUNT(*)
  INTO v_exp_company, v_exp_company_capital, v_exp_company_cnt
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant
    AND expense.category IN ('capital', 'deposit')
    AND expense.branch_id IS NULL;

  SELECT
    COALESCE(SUM(expense.amount), 0),
    COALESCE(SUM(expense.amount)
      FILTER (WHERE expense.category = 'capital'), 0)
  INTO v_exp_branches, v_exp_branches_capital
  FROM public.expenses expense
  WHERE expense.tenant_id = v_tenant
    AND expense.category IN ('capital', 'deposit')
    AND expense.branch_id IN (
      SELECT branch.id
      FROM public.branches branch
      WHERE branch.tenant_id = v_tenant
        AND branch.branch_kind = 'branch'
        AND COALESCE(branch.is_active, TRUE)
    );

  PERFORM set_config('test.fscs_exp_all', v_exp_all::text, TRUE);
  PERFORM set_config('test.fscs_exp_all_capital', v_exp_all_capital::text, TRUE);
  PERFORM set_config('test.fscs_exp_company', v_exp_company::text, TRUE);
  PERFORM set_config('test.fscs_exp_company_capital', v_exp_company_capital::text, TRUE);
  PERFORM set_config('test.fscs_exp_company_cnt', v_exp_company_cnt::text, TRUE);
  PERFORM set_config('test.fscs_exp_branches', v_exp_branches::text, TRUE);
  PERFORM set_config('test.fscs_exp_branches_capital', v_exp_branches_capital::text, TRUE);

  v_payload := public.get_finance_startup_capital_summary('all');
  PERFORM set_config('test.fscs_all', v_payload::text, TRUE);

  v_payload := public.get_finance_startup_capital_summary('company');
  PERFORM set_config('test.fscs_company', v_payload::text, TRUE);

  v_payload := public.get_finance_startup_capital_summary('branch', v_branch1);
  PERFORM set_config('test.fscs_b1', v_payload::text, TRUE);

  v_payload := public.get_finance_startup_capital_summary('branches');
  PERFORM set_config('test.fscs_branches', v_payload::text, TRUE);

  v_payload := public.get_finance_startup_capital_summary('branch', v_kitchen);
  PERFORM set_config('test.fscs_kitchen_payload', v_payload::text, TRUE);
END;
$$;

SELECT plan(20);

-- (a) All scope: equals the date-free tenant-wide recomputation, proving
-- the decade-spread fixture dates have zero effect on the totals.
SELECT is(
  (current_setting('test.fscs_all')::jsonb ->> 'startup_total')::numeric,
  current_setting('test.fscs_exp_all')::numeric,
  'all scope: startup_total equals every capital+deposit row, dates ignored'
);

SELECT ok(
  (current_setting('test.fscs_all')::jsonb ->> 'startup_recorded')::boolean,
  'all scope: startup_recorded is true with fixture rows present'
);

SELECT is(
  (current_setting('test.fscs_all')::jsonb ->> 'equipment_total')::numeric,
  current_setting('test.fscs_exp_all_capital')::numeric,
  'all scope: equipment_total is the capital slice only'
);

SELECT ok(
  (current_setting('test.fscs_all')::jsonb ->> 'equipment_recorded')::boolean,
  'all scope: equipment_recorded is true with capital rows present'
);

SELECT ok(
  (current_setting('test.fscs_all')::jsonb ->> 'equipment_total')::numeric
    <= (current_setting('test.fscs_all')::jsonb ->> 'startup_total')::numeric,
  'all scope: equipment slice never exceeds the startup total'
);

-- (b) Company scope: NULL-branch rows only.
SELECT is(
  (current_setting('test.fscs_company')::jsonb ->> 'startup_total')::numeric,
  current_setting('test.fscs_exp_company')::numeric,
  'company scope: startup_total counts NULL-branch rows only'
);

SELECT is(
  (current_setting('test.fscs_company')::jsonb ->> 'startup_recorded')::boolean,
  current_setting('test.fscs_exp_company_cnt')::bigint > 0,
  'company scope: startup_recorded mirrors whether NULL-branch rows exist'
);

SELECT is(
  (current_setting('test.fscs_company')::jsonb ->> 'equipment_total')::numeric,
  current_setting('test.fscs_exp_company_capital')::numeric,
  'company scope: equipment_total is the capital slice of NULL-branch rows'
);

-- (c) Branch scope: exactly the seeded branch rows; the fresh branch has no
-- pre-existing data, so the fixed numbers also prove NULL-branch rows are
-- excluded (they would otherwise push the totals above these values).
SELECT is(
  (current_setting('test.fscs_b1')::jsonb ->> 'startup_total')::numeric,
  4200000::numeric,
  'branch scope: startup_total is that branch only (NULL rows excluded)'
);

SELECT ok(
  (current_setting('test.fscs_b1')::jsonb ->> 'startup_recorded')::boolean,
  'branch scope: startup_recorded is true'
);

SELECT is(
  (current_setting('test.fscs_b1')::jsonb ->> 'equipment_total')::numeric,
  3500000::numeric,
  'branch scope: equipment_total is the capital slice of that branch only'
);

SELECT ok(
  (current_setting('test.fscs_b1')::jsonb ->> 'equipment_recorded')::boolean,
  'branch scope: equipment_recorded is true'
);

-- (d) Branches scope: every active sales branch (branch_kind = 'branch'),
-- including both fixture branches plus any seeded sales branches.
SELECT is(
  (current_setting('test.fscs_branches')::jsonb ->> 'startup_total')::numeric,
  current_setting('test.fscs_exp_branches')::numeric,
  'branches scope: startup_total equals all active sales-branch rows'
);

SELECT ok(
  (current_setting('test.fscs_branches')::jsonb ->> 'startup_recorded')::boolean,
  'branches scope: startup_recorded is true with fixture sales-branch rows'
);

SELECT is(
  (current_setting('test.fscs_branches')::jsonb ->> 'equipment_total')::numeric,
  current_setting('test.fscs_exp_branches_capital')::numeric,
  'branches scope: equipment_total is the capital slice of sales-branch rows'
);

SELECT ok(
  (current_setting('test.fscs_all')::jsonb ->> 'startup_total')::numeric
    - (current_setting('test.fscs_branches')::jsonb ->> 'startup_total')::numeric
    - (current_setting('test.fscs_company')::jsonb ->> 'startup_total')::numeric
    >= 3000000::numeric,
  'branches scope: the non-sales kitchen deposit stays out of the sales sum'
);

-- (e) Non-sales branch scope: its own deposit counts, but it is never
-- equipment (capital slice).
SELECT is(
  (current_setting('test.fscs_kitchen_payload')::jsonb ->> 'startup_total')::numeric,
  3000000::numeric,
  'non-sales branch scope: deposit row still counts for that branch'
);

SELECT ok(
  NOT (current_setting('test.fscs_kitchen_payload')::jsonb ->> 'equipment_recorded')::boolean,
  'non-sales branch scope: equipment_recorded is false without capital rows'
);

-- (f) Input validation stays fail-closed.
SELECT throws_ok(
  $$SELECT public.get_finance_startup_capital_summary('warehouse')$$,
  '22023',
  'invalid_location',
  'invalid location is rejected'
);

SELECT throws_ok(
  $$SELECT public.get_finance_startup_capital_summary('branch')$$,
  '22023',
  'invalid_branch',
  'branch scope without a branch id is rejected'
);

SELECT finish();

ROLLBACK;
