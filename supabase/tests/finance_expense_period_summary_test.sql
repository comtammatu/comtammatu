-- Period expense KPI must sum the whole period, not the first 100 list rows.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_non_owner uuid;
  v_tenant_id bigint;
  v_branch_id bigint;
  v_proc oid;
  v_summary jsonb;
  v_rejected boolean;
  v_i integer;
  v_marker text := 'expense_period_summary_' || gen_random_uuid()::text;
BEGIN
  SELECT profile.id, profile.tenant_id
  INTO v_owner, v_tenant_id
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND COALESCE(profile.is_active, true)
  ORDER BY profile.id
  LIMIT 1;

  SELECT profile.id
  INTO v_non_owner
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant_id
    AND position.code IN ('cashier', 'chef')
    AND COALESCE(profile.is_active, true)
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id
  INTO v_branch_id
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant_id
    AND branch.branch_kind = 'branch'
  ORDER BY branch.id
  LIMIT 1;

  IF v_owner IS NULL
    OR v_non_owner IS NULL
    OR v_tenant_id IS NULL
    OR v_branch_id IS NULL
  THEN
    RAISE EXCEPTION 'expense_period_summary_seed_missing';
  END IF;

  v_proc := to_regprocedure(
    'public.get_finance_expense_period_summary(text, date, date, bigint)'
  );

  IF v_proc IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc function_row
      WHERE function_row.oid = v_proc
        AND function_row.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(function_row.proconfig) AS cfg
          WHERE cfg LIKE 'search_path%'
        )
    )
    OR has_function_privilege('anon', v_proc, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_proc, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'get_finance_expense_period_summary_acl_invalid';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  FOR v_i IN 1..101 LOOP
    INSERT INTO public.expenses (
      tenant_id,
      branch_id,
      expense_date,
      category,
      amount,
      subtotal,
      vat_breakdown,
      vat_amount,
      payment_method,
      paid_at,
      note,
      created_by
    ) VALUES (
      v_tenant_id,
      v_branch_id,
      DATE '2026-08-01',
      'utilities',
      1.00,
      1.00,
      jsonb_build_array(jsonb_build_object(
        'vat_rate', 0, 'taxable_amount', 1.00, 'vat_amount', 0
      )),
      0,
      'cash',
      timestamptz '2026-08-01 10:00:00+07',
      v_marker,
      v_owner
    );
  END LOOP;

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    expense_date,
    category,
    amount,
    subtotal,
    vat_breakdown,
    vat_amount,
    payment_method,
    paid_at,
    note,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    DATE '2026-08-02',
    'rent',
    50.00,
    50.00,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0, 'taxable_amount', 50.00, 'vat_amount', 0
    )),
    0,
    'unpaid',
    NULL,
    v_marker,
    v_owner
  );

  INSERT INTO public.expenses (
    tenant_id,
    branch_id,
    expense_date,
    category,
    amount,
    subtotal,
    vat_breakdown,
    vat_amount,
    payment_method,
    paid_at,
    note,
    created_by
  ) VALUES (
    v_tenant_id,
    v_branch_id,
    DATE '2026-08-02',
    'capital',
    200.00,
    200.00,
    jsonb_build_array(jsonb_build_object(
      'vat_rate', 0, 'taxable_amount', 200.00, 'vat_amount', 0
    )),
    0,
    'unpaid',
    NULL,
    v_marker,
    v_owner
  );

  v_summary := public.get_finance_expense_period_summary(
    'branch',
    DATE '2026-08-01',
    DATE '2026-08-31',
    v_branch_id
  );

  IF v_summary->>'operating_total' <> '151.00'
    OR (v_summary->>'operating_count')::integer <> 102
    OR (v_summary->>'operating_recorded')::boolean IS NOT TRUE
    OR v_summary->>'needs_action_total' <> '250.00'
    OR (v_summary->>'needs_action_count')::integer <> 2
  THEN
    RAISE EXCEPTION 'expense_period_summary_wrong_totals %', v_summary;
  END IF;

  v_summary := public.get_finance_expense_period_summary(
    'company',
    DATE '2026-08-01',
    DATE '2026-08-31',
    NULL
  );

  IF v_summary->>'operating_total' <> '0'
    AND v_summary->>'operating_total' <> '0.00'
  THEN
    RAISE EXCEPTION 'expense_period_summary_company_not_empty %', v_summary;
  END IF;

  IF (v_summary->>'operating_count')::integer <> 0
    OR (v_summary->>'needs_action_count')::integer <> 0
  THEN
    RAISE EXCEPTION 'expense_period_summary_company_counts %', v_summary;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );

  v_rejected := false;
  BEGIN
    PERFORM public.get_finance_expense_period_summary(
      'all',
      DATE '2026-08-01',
      DATE '2026-08-31',
      NULL
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := SQLERRM = 'forbidden';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'expense_period_summary_non_finance_not_rejected';
  END IF;
END;
$$;

ROLLBACK;
