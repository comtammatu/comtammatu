-- Finance cockpit inventory-change identity:
-- get_finance_operating_cockpit must report inventory_change as
-- closing - opening per location scope (branch and all), mark the term
-- included while the valuation cutover is active, and blank it out
-- (never silently keep it) once the cutover is inactive.

\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- Seed two isolated sales branches with distinct opening vs closing
-- valuation values inside a past test period, activate the cutover, and
-- capture the RPC payloads (active + inactive cutover) for the assertions.
DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch1 bigint;
  v_branch2 bigint;
  v_location1 bigint;
  v_location2 bigint;
  v_ingredient bigint;
  v_account1 bigint;
  v_account2 bigint;
  v_origin1 bigint;
  v_origin2 bigint;
  v_balance1 bigint;
  v_balance2 bigint;
  v_event bigint;
  v_start date;
  v_end date;
  v_open_ts timestamptz;
  v_period_ts timestamptz;
  v_payload jsonb;
  v_all_change numeric;
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
    RAISE EXCEPTION 'FINANCE COCKPIT: seeded owner fixture required';
  END IF;

  SELECT ingredient.id
  INTO v_ingredient
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
  ORDER BY ingredient.id
  LIMIT 1;

  IF v_ingredient IS NULL THEN
    RAISE EXCEPTION 'FINANCE COCKPIT: seeded ingredient fixture required';
  END IF;

  -- Two active sales branches that only exist inside this transaction.
  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  -- branches_code_format_chk: sales-branch codes must be 2-4 letters; uniqueness rides on the suffixed name.
  VALUES (v_tenant, '__fcic_b1_' || v_suffix, 'FCA', 'branch', TRUE)
  RETURNING id INTO v_branch1;

  INSERT INTO public.branches (tenant_id, name, code, branch_kind, is_active)
  VALUES (v_tenant, '__fcic_b2_' || v_suffix, 'FCB', 'branch', TRUE)
  RETURNING id INTO v_branch2;

  -- The branch insert trigger provisions default warehouse locations; fall
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
    VALUES (v_tenant, v_branch1, '__fcic_l1_' || v_suffix, 'FCIC store 1')
    RETURNING id INTO v_location1;
  END IF;

  SELECT location.id
  INTO v_location2
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch2
    AND location.location_kind = 'warehouse'
  ORDER BY location.id
  LIMIT 1;
  IF v_location2 IS NULL THEN
    INSERT INTO public.inventory_locations (tenant_id, branch_id, code, name)
    VALUES (v_tenant, v_branch2, '__fcic_l2_' || v_suffix, 'FCIC store 2')
    RETURNING id INTO v_location2;
  END IF;

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id, branch_id, location_id, ingredient_id, quantity, book_value
  ) VALUES (v_tenant, v_branch1, v_location1, v_ingredient, 100, 1250000)
  RETURNING id INTO v_account1;

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id, branch_id, location_id, ingredient_id, quantity, book_value
  ) VALUES (v_tenant, v_branch2, v_location2, v_ingredient, 100, 550000)
  RETURNING id INTO v_account2;

  INSERT INTO public.inventory_cost_origins (
    tenant_id, ingredient_id, source_kind, source_id,
    original_quantity, provisional_value, cost_status, effective_at
  ) VALUES (v_tenant, v_ingredient, 'opening', -v_branch1, 100, 1250000, 'provisional', pg_catalog.now())
  RETURNING id INTO v_origin1;

  INSERT INTO public.inventory_cost_origins (
    tenant_id, ingredient_id, source_kind, source_id,
    original_quantity, provisional_value, cost_status, effective_at
  ) VALUES (v_tenant, v_ingredient, 'opening', -v_branch2, 100, 550000, 'provisional', pg_catalog.now())
  RETURNING id INTO v_origin2;

  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (v_tenant, v_origin1, 'stock_pool', v_account1, 100, 1250000)
  RETURNING id INTO v_balance1;

  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (v_tenant, v_origin2, 'stock_pool', v_account2, 100, 550000)
  RETURNING id INTO v_balance2;

  -- Fixed past period so the seeding timestamps are deterministic relative
  -- to the period boundaries (ICT, same zone the RPC uses).
  v_start := (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 20;
  v_end := v_start + 2;
  v_open_ts := (v_start - 5)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_period_ts := (v_start + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- Branch 1: opening value 1000000 before the period, +250000 inside it.
  INSERT INTO public.inventory_valuation_events (
    tenant_id, ingredient_id, event_type, quantity_delta, value_delta,
    effective_at, posting_year, posting_month, idempotency_key
  ) VALUES (
    v_tenant, v_ingredient, 'opening', 0, 1000000,
    v_open_ts,
    extract(YEAR FROM v_open_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    extract(MONTH FROM v_open_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    pg_catalog.gen_random_uuid()
  )
  RETURNING id INTO v_event;

  INSERT INTO public.inventory_value_allocations (
    tenant_id, valuation_event_id, source_origin_id, to_balance_id,
    allocation_bucket, allocated_quantity, allocated_value
  ) VALUES (v_tenant, v_event, v_origin1, v_balance1, 'inventory', 10, 1000000);

  INSERT INTO public.inventory_valuation_events (
    tenant_id, ingredient_id, event_type, quantity_delta, value_delta,
    effective_at, posting_year, posting_month, idempotency_key
  ) VALUES (
    v_tenant, v_ingredient, 'receipt', 0, 250000,
    v_period_ts,
    extract(YEAR FROM v_period_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    extract(MONTH FROM v_period_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    pg_catalog.gen_random_uuid()
  )
  RETURNING id INTO v_event;

  INSERT INTO public.inventory_value_allocations (
    tenant_id, valuation_event_id, source_origin_id, to_balance_id,
    allocation_bucket, allocated_quantity, allocated_value
  ) VALUES (v_tenant, v_event, v_origin1, v_balance1, 'inventory', 10, 250000);

  -- Branch 2: opening value 700000 before the period, -150000 inside it
  -- (a withdrawal from the branch pool), so its change is negative and the
  -- two branches stay distinguishable in the company-wide sum.
  INSERT INTO public.inventory_valuation_events (
    tenant_id, ingredient_id, event_type, quantity_delta, value_delta,
    effective_at, posting_year, posting_month, idempotency_key
  ) VALUES (
    v_tenant, v_ingredient, 'opening', 0, 700000,
    v_open_ts,
    extract(YEAR FROM v_open_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    extract(MONTH FROM v_open_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    pg_catalog.gen_random_uuid()
  )
  RETURNING id INTO v_event;

  INSERT INTO public.inventory_value_allocations (
    tenant_id, valuation_event_id, source_origin_id, to_balance_id,
    allocation_bucket, allocated_quantity, allocated_value
  ) VALUES (v_tenant, v_event, v_origin2, v_balance2, 'inventory', 10, 700000);

  INSERT INTO public.inventory_valuation_events (
    tenant_id, ingredient_id, event_type, quantity_delta, value_delta,
    effective_at, posting_year, posting_month, idempotency_key
  ) VALUES (
    v_tenant, v_ingredient, 'issue', 0, -150000,
    v_period_ts,
    extract(YEAR FROM v_period_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    extract(MONTH FROM v_period_ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer,
    pg_catalog.gen_random_uuid()
  )
  RETURNING id INTO v_event;

  INSERT INTO public.inventory_value_allocations (
    tenant_id, valuation_event_id, source_origin_id, from_balance_id,
    allocation_bucket, allocated_quantity, allocated_value
  ) VALUES (v_tenant, v_event, v_origin2, v_balance2, 'food_cost', 10, 150000);

  INSERT INTO public.inventory_valuation_cutovers (
    tenant_id, status, cutoff_at, activated_at
  )
  VALUES (v_tenant, 'active', v_open_ts, v_open_ts)
  ON CONFLICT (tenant_id) DO UPDATE
  SET status = 'active', activated_at = v_open_ts;

  -- Fake the owner JWT the way the other finance RPC tests do; the cockpit
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

  PERFORM set_config('test.fcic_tenant', v_tenant::text, TRUE);
  PERFORM set_config('test.fcic_branch1', v_branch1::text, TRUE);
  PERFORM set_config('test.fcic_branch2', v_branch2::text, TRUE);
  PERFORM set_config('test.fcic_start', v_start::text, TRUE);
  PERFORM set_config('test.fcic_end', v_end::text, TRUE);

  v_payload := public.get_finance_operating_cockpit('branch', v_start, v_end, v_branch1);
  PERFORM set_config('test.fcic_b1_active', v_payload::text, TRUE);

  v_payload := public.get_finance_operating_cockpit('branch', v_start, v_end, v_branch2);
  PERFORM set_config('test.fcic_b2_active', v_payload::text, TRUE);

  v_payload := public.get_finance_operating_cockpit('all', v_start, v_end);
  PERFORM set_config('test.fcic_all_active', v_payload::text, TRUE);

  -- Tenant-wide expected change recomputed from the seeded fixtures only,
  -- mirroring get_inventory_valuation_period_value's allocation impact
  -- semantics (to-balance adds, from-balance subtracts). The recomputed
  -- total must equal the sum of the two fixture branch changes before the
  -- RPC's all-scope figure is compared against that sum.
  SELECT COALESCE(SUM(
    CASE
      WHEN allocation.to_balance_id IS NOT NULL THEN allocation.allocated_value
      WHEN allocation.from_balance_id IS NOT NULL THEN -allocation.allocated_value
      ELSE 0
    END
  ), 0)
  INTO v_all_change
  FROM public.inventory_value_allocations allocation
  JOIN public.inventory_valuation_events event
    ON event.id = allocation.valuation_event_id
   AND event.tenant_id = allocation.tenant_id
  WHERE allocation.tenant_id = v_tenant
    AND (allocation.to_balance_id IN (v_balance1, v_balance2)
         OR allocation.from_balance_id IN (v_balance1, v_balance2))
    AND event.effective_at >= v_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    AND event.effective_at < (v_end + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  PERFORM set_config('test.fcic_all_expected', v_all_change::text, TRUE);

  UPDATE public.inventory_valuation_cutovers
  SET status = 'inactive'
  WHERE tenant_id = v_tenant;

  v_payload := public.get_finance_operating_cockpit('branch', v_start, v_end, v_branch1);
  PERFORM set_config('test.fcic_b1_inactive', v_payload::text, TRUE);

  v_payload := public.get_finance_operating_cockpit('all', v_start, v_end);
  PERFORM set_config('test.fcic_all_inactive', v_payload::text, TRUE);
END;
$$;

SELECT plan(21);

-- (a) Branch scope while the cutover is active: the identity must hold as
-- numbers, the seeded values must actually differ, and the term is included.
SELECT is(
  (current_setting('test.fcic_b1_active')::jsonb ->> 'inventory_change')::numeric,
  (current_setting('test.fcic_b1_active')::jsonb ->> 'inventory_closing')::numeric
    - (current_setting('test.fcic_b1_active')::jsonb ->> 'inventory_opening')::numeric,
  'branch scope: inventory_change equals closing minus opening'
);

SELECT is(
  (current_setting('test.fcic_b1_active')::jsonb ->> 'inventory_change')::numeric,
  250000::numeric,
  'branch 1: seeded period produces a non-zero change'
);

SELECT ok(
  (current_setting('test.fcic_b1_active')::jsonb ->> 'inventory_change_included')::boolean,
  'branch scope: inventory_change_included is true while cutover active'
);

SELECT ok(
  (current_setting('test.fcic_b1_active')::jsonb ->> 'valuation_active')::boolean,
  'branch scope: valuation_active is true while cutover active'
);

SELECT ok(
  current_setting('test.fcic_b1_active')::jsonb ? 'operating_expense_total',
  'branch scope: operating_expense_total key present'
);

SELECT ok(
  current_setting('test.fcic_b1_active')::jsonb ? 'operating_expense_recorded',
  'branch scope: operating_expense_recorded key present'
);

SELECT is(
  (current_setting('test.fcic_b2_active')::jsonb ->> 'inventory_change')::numeric,
  (-150000)::numeric,
  'branch 2: seeded period produces a distinct negative change'
);

-- (b) Company-wide scope sums both branches' changes. First prove the
-- tenant-wide fixture recomputation matches the two branch changes, then
-- compare the RPC's all-scope figure against that recomputed total.
SELECT is(
  current_setting('test.fcic_all_expected')::numeric,
  (current_setting('test.fcic_b1_active')::jsonb ->> 'inventory_change')::numeric
    + (current_setting('test.fcic_b2_active')::jsonb ->> 'inventory_change')::numeric,
  'all scope: tenant-wide fixture recomputation equals the sum of both branch changes'
);

SELECT is(
  (current_setting('test.fcic_all_active')::jsonb ->> 'inventory_change')::numeric,
  current_setting('test.fcic_all_expected')::numeric,
  'all scope: inventory_change equals the tenant-wide fixture recomputation'
);

SELECT ok(
  current_setting('test.fcic_all_active')::jsonb ? 'operating_expense_total',
  'all scope: operating_expense_total key present'
);

SELECT ok(
  current_setting('test.fcic_all_active')::jsonb ? 'operating_expense_recorded',
  'all scope: operating_expense_recorded key present'
);

-- (c) Once the cutover is inactive the term is excluded and blanked out.
SELECT ok(
  NOT (current_setting('test.fcic_b1_inactive')::jsonb ->> 'inventory_change_included')::boolean,
  'inactive cutover: inventory_change_included is false'
);

SELECT ok(
  NOT (current_setting('test.fcic_b1_inactive')::jsonb ->> 'valuation_active')::boolean,
  'inactive cutover: valuation_active is false'
);

SELECT is(
  (current_setting('test.fcic_b1_inactive')::jsonb ->> 'inventory_change')::numeric,
  0::numeric,
  'inactive cutover: inventory_change is zero'
);

SELECT is(
  (current_setting('test.fcic_b1_inactive')::jsonb ->> 'inventory_opening')::numeric,
  0::numeric,
  'inactive cutover: inventory_opening is zero'
);

SELECT is(
  (current_setting('test.fcic_b1_inactive')::jsonb ->> 'inventory_closing')::numeric,
  0::numeric,
  'inactive cutover: inventory_closing is zero'
);

SELECT ok(
  current_setting('test.fcic_b1_inactive')::jsonb ? 'operating_expense_total',
  'inactive cutover: operating_expense_total key present'
);

SELECT ok(
  current_setting('test.fcic_b1_inactive')::jsonb ? 'operating_expense_recorded',
  'inactive cutover: operating_expense_recorded key present'
);

SELECT is(
  (current_setting('test.fcic_all_inactive')::jsonb ->> 'inventory_change')::numeric,
  0::numeric,
  'inactive cutover: all-scope inventory_change is zero'
);

SELECT ok(
  current_setting('test.fcic_all_inactive')::jsonb ? 'operating_expense_total',
  'inactive cutover all scope: operating_expense_total key present'
);

SELECT ok(
  current_setting('test.fcic_all_inactive')::jsonb ? 'operating_expense_recorded',
  'inactive cutover all scope: operating_expense_recorded key present'
);

SELECT finish();

ROLLBACK;
