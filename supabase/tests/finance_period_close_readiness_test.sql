-- Finance period-close readiness RPC:
-- get_finance_period_close_readiness is the read-only close-readiness health
-- check (Chốt sổ Sức khoẻ tài chính). It reports blockers and warnings for a
-- month without ever touching accounting_periods: a clean branch month closes
-- (can_close), revenue without operating expenses, an inactive valuation
-- cutover, and negative stock each raise their blocker, and invalid months
-- are rejected.

\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Seed one clean sales branch and one revenue-without-opex sales branch in a
-- past month, activate the valuation cutover, capture the branch-scoped RPC
-- payloads (clean / missing opex / inactive cutover / negative stock), then
-- restore the cutover so the fixture stays isolated inside this transaction.
DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_accountant uuid;
  v_branch1 bigint;
  v_branch2 bigint;
  v_location1 bigint;
  v_ingredient bigint;
  v_order1 bigint;
  v_order2 bigint;
  v_period_start date;
  v_year integer;
  v_month integer;
  v_paid_ts timestamptz;
  v_payload jsonb;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
  -- Reuse the seeded tenant owner fixture (same convention as the other
  -- finance RPC tests); the owner carries finance:view and
  -- inventory:valuation_read through the tenant_owner role binding.
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
    RAISE EXCEPTION 'FINANCE CLOSE READINESS: seeded owner fixture required';
  END IF;

  SELECT ingredient.id
  INTO v_ingredient
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
  ORDER BY ingredient.id
  LIMIT 1;

  IF v_ingredient IS NULL THEN
    RAISE EXCEPTION 'FINANCE CLOSE READINESS: seeded ingredient fixture required';
  END IF;

  -- Two active sales branches that only exist inside this transaction.
  -- branches_code_format_chk: sales-branch codes must be 2-4 letters;
  -- uniqueness rides on the suffixed name.
  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__fpcr_b1_' || v_suffix, 'FPA', 'branch', TRUE)
  RETURNING id INTO v_branch1;

  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__fpcr_b2_' || v_suffix, 'FPB', 'branch', TRUE)
  RETURNING id INTO v_branch2;

  -- The branch insert trigger provisions a default warehouse location; fall
  -- back to an explicit insert if the trigger is absent in this chain.
  SELECT location.id
  INTO v_location1
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch1
    AND location.location_kind = 'warehouse'
  ORDER BY location.id
  LIMIT 1;
  IF v_location1 IS NULL THEN
    INSERT INTO public.inventory_locations (tenant_id, branch_id, code, name)
    VALUES (v_tenant, v_branch1, '__fpcr_l1_' || v_suffix, 'FPCR store 1')
    RETURNING id INTO v_location1;
  END IF;

  -- Fixed past month (the previous full calendar month in ICT, the same zone
  -- the RPC uses) so the payment/expense timestamps are deterministic
  -- relative to the period boundaries.
  v_period_start := date_trunc(
    'month',
    (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  )::date - 31;
  v_period_start := date_trunc('month', v_period_start)::date;
  v_year := extract(YEAR FROM v_period_start)::integer;
  v_month := extract(MONTH FROM v_period_start)::integer;
  v_paid_ts := (v_period_start + 5)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- Both branches earn completed revenue inside the month; payments require
  -- an order, so each branch gets one minimal paid order.
  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, status, subtotal,
    total_amount, created_by, created_at, payment_method, payment_status,
    cash_received, cash_change
  ) VALUES (
    v_tenant, v_branch1, 'FPCR1 ' || v_suffix, 'takeaway', 'completed', 100000,
    100000, v_owner, v_paid_ts, 'cash', 'paid', 100000, 0
  )
  RETURNING id INTO v_order1;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, paid_at,
    created_by, created_at
  ) VALUES (
    v_tenant, v_branch1, v_order1, 'cash', 100000, 'completed', v_paid_ts,
    v_owner, v_paid_ts
  );

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, order_type, status, subtotal,
    total_amount, created_by, created_at, payment_method, payment_status,
    cash_received, cash_change
  ) VALUES (
    v_tenant, v_branch2, 'FPCR2 ' || v_suffix, 'takeaway', 'completed', 90000,
    90000, v_owner, v_paid_ts, 'cash', 'paid', 90000, 0
  )
  RETURNING id INTO v_order2;

  INSERT INTO public.payments (
    tenant_id, branch_id, order_id, method, amount, status, paid_at,
    created_by, created_at
  ) VALUES (
    v_tenant, v_branch2, v_order2, 'cash', 90000, 'completed', v_paid_ts,
    v_owner, v_paid_ts
  );

  -- Branch 1 only: one paid operating expense inside the month, so its
  -- revenue is backed by recorded Chi vận hành (clean month). Cash paid and
  -- settled keeps it out of the needs-action queue.
  INSERT INTO public.expenses (
    tenant_id, branch_id, expense_date, category, amount, subtotal,
    vat_breakdown, vat_amount, payment_method, paid_at, created_by, created_at
  ) VALUES (
    v_tenant, v_branch1, v_period_start + 3, 'rent', 500000, 500000,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0, 'taxable_amount', 500000, 'vat_amount', 0)),
    0, 'cash', v_paid_ts, v_owner, v_paid_ts
  );

  -- No valuation accounts and no stock rows exist for the fresh branches, so
  -- the branch-scoped reconciliation is trivially clean while the cutover is
  -- active (FULL JOIN of two empty sides yields zero mismatches).
  INSERT INTO public.inventory_valuation_cutovers (
    tenant_id, status, cutoff_at, activated_at
  )
  VALUES (v_tenant, 'active', v_paid_ts, v_paid_ts)
  ON CONFLICT (tenant_id) DO UPDATE
  SET status = 'active', activated_at = v_paid_ts;

  -- Fake the owner JWT the way the other finance RPC tests do; the readiness
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

  PERFORM set_config('test.fpcr_year', v_year::text, TRUE);
  PERFORM set_config('test.fpcr_month', v_month::text, TRUE);
  PERFORM set_config('test.fpcr_branch2', v_branch2::text, TRUE);

  -- (a) Clean month, branch scope.
  v_payload := public.get_finance_period_close_readiness(
    v_year, v_month, v_branch1);
  PERFORM set_config('test.fpcr_clean', v_payload::text, TRUE);

  -- (b) Revenue without any operating expense in the month.
  v_payload := public.get_finance_period_close_readiness(
    v_year, v_month, v_branch2);
  PERFORM set_config('test.fpcr_no_opex', v_payload::text, TRUE);

  -- (c) Inactive valuation cutover.
  UPDATE public.inventory_valuation_cutovers
  SET status = 'inactive'
  WHERE tenant_id = v_tenant;

  v_payload := public.get_finance_period_close_readiness(
    v_year, v_month, v_branch1);
  PERFORM set_config('test.fpcr_cutover_off', v_payload::text, TRUE);

  -- (d) Negative on-hand stock (allowed since ADR 0026 post-and-flag). The
  -- stock row without a valuation account also makes the reconciliation
  -- diverge; the assertions below only require the negative_stock blocker.
  UPDATE public.inventory_valuation_cutovers
  SET status = 'active', activated_at = v_paid_ts
  WHERE tenant_id = v_tenant;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id, current_quantity
  ) VALUES (v_tenant, v_branch1, v_location1, v_ingredient, -5);

  v_payload := public.get_finance_period_close_readiness(
    v_year, v_month, v_branch1);
  PERFORM set_config('test.fpcr_negative', v_payload::text, TRUE);

  -- (e) Degraded accountant path: the seeded accountant holds finance:view
  -- but NOT inventory:valuation_read, so with the cutover active the
  -- reconciliation check must downgrade to a warning instead of aborting
  -- the health check with 42501. Impersonation mirrors the owner fixture
  -- above (claims-only; the RPC is SECURITY DEFINER).
  SELECT profile.id
  INTO v_accountant
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND position.code = 'accountant'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  IF v_accountant IS NULL THEN
    RAISE EXCEPTION 'FINANCE CLOSE READINESS: seeded accountant fixture required';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_accountant::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_accountant::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );

  v_payload := public.get_finance_period_close_readiness(
    v_year, v_month, v_branch1);
  PERFORM set_config('test.fpcr_accountant', v_payload::text, TRUE);

  -- Restore the owner claims so the validation scenarios below keep running
  -- on the original fixture.
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
END;
$$;

SELECT plan(17);

-- (a) Clean month: reconciled, opex recorded, no negative stock -> advisory
-- green light; the period row does not exist yet, so the status stays open.
SELECT ok(
  (current_setting('test.fpcr_clean')::jsonb ->> 'can_close')::boolean,
  'clean month: can_close is true'
);

SELECT is(
  (current_setting('test.fpcr_clean')::jsonb ->> 'blocker_count')::integer,
  0,
  'clean month: blocker_count is zero'
);

SELECT is(
  current_setting('test.fpcr_clean')::jsonb ->> 'period_status',
  'open',
  'clean month: period_status is open without an accounting_periods row'
);

SELECT ok(
  (current_setting('test.fpcr_clean')::jsonb ->> 'valuation_active')::boolean,
  'clean month: valuation_active is true while the cutover is active'
);

-- (b) Revenue without operating expenses: the branch id rides in the blocker.
SELECT ok(
  NOT (current_setting('test.fpcr_no_opex')::jsonb ->> 'can_close')::boolean,
  'missing opex: can_close is false'
);

SELECT ok(
  current_setting('test.fpcr_no_opex')::jsonb -> 'blockers'
    @> '[{"code": "operating_expense_missing"}]'::jsonb,
  'missing opex: blockers carry operating_expense_missing'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      current_setting('test.fpcr_no_opex')::jsonb -> 'blockers'
    ) AS blocker
    WHERE blocker ->> 'code' = 'operating_expense_missing'
      AND blocker -> 'branches'
        @> to_jsonb(current_setting('test.fpcr_branch2')::bigint)
  ),
  'missing opex: the blocker names the revenue branch without opex'
);

-- (c) Inactive cutover: valuation_inactive blocks the close.
SELECT ok(
  NOT (current_setting('test.fpcr_cutover_off')::jsonb ->> 'can_close')::boolean,
  'inactive cutover: can_close is false'
);

SELECT ok(
  current_setting('test.fpcr_cutover_off')::jsonb -> 'blockers'
    @> '[{"code": "valuation_inactive"}]'::jsonb,
  'inactive cutover: blockers carry valuation_inactive'
);

SELECT ok(
  NOT (current_setting('test.fpcr_cutover_off')::jsonb ->> 'valuation_active')::boolean,
  'inactive cutover: valuation_active is false'
);

-- (d) Negative on-hand stock blocks the close.
SELECT ok(
  NOT (current_setting('test.fpcr_negative')::jsonb ->> 'can_close')::boolean,
  'negative stock: can_close is false'
);

SELECT ok(
  current_setting('test.fpcr_negative')::jsonb -> 'blockers'
    @> '[{"code": "negative_stock"}]'::jsonb,
  'negative stock: blockers carry negative_stock'
);

-- (e) Degraded accountant path: finance:view without inventory:valuation_read
-- completes the health check; the reconciliation signal is downgraded.
SELECT ok(
  current_setting('test.fpcr_accountant')::jsonb ? 'can_close',
  'accountant degraded path: the RPC completes without a 42501 abort'
);

SELECT ok(
  current_setting('test.fpcr_accountant')::jsonb -> 'warnings'
    @> '[{"code": "valuation_reconciliation_unreadable"}]'::jsonb,
  'accountant degraded path: warnings carry valuation_reconciliation_unreadable'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      current_setting('test.fpcr_accountant')::jsonb -> 'blockers'
    ) AS blocker
    WHERE blocker ->> 'code' = 'valuation_not_reconciled'
  ),
  'accountant degraded path: blockers stay free of valuation_not_reconciled'
);

-- (f) Input validation stays fail-closed.
SELECT throws_ok(
  format(
    'SELECT public.get_finance_period_close_readiness(%s, 13)',
    current_setting('test.fpcr_year')
  ),
  '22023',
  'invalid_period',
  'month 13 is rejected'
);

SELECT throws_ok(
  format(
    'SELECT public.get_finance_period_close_readiness(1999, %s)',
    current_setting('test.fpcr_month')
  ),
  '22023',
  'invalid_period',
  'year before 2000 is rejected'
);

SELECT finish();

ROLLBACK;
