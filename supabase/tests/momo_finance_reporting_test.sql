\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_result text;
  v_safe_search_path_count integer;
BEGIN
  SELECT pg_catalog.pg_get_function_result(
    'public.get_daily_revenue(bigint,date,date)'::regprocedure
  ) INTO v_result;
  IF v_result NOT LIKE '%momo_revenue numeric%' THEN
    RAISE EXCEPTION 'get_daily_revenue_momo_result_missing';
  END IF;

  SELECT pg_catalog.pg_get_function_result(
    'public.get_revenue_kpis(bigint,date,date)'::regprocedure
  ) INTO v_result;
  IF v_result NOT LIKE '%momo_revenue numeric%' THEN
    RAISE EXCEPTION 'get_revenue_kpis_momo_result_missing';
  END IF;

  SELECT pg_catalog.pg_get_function_result(
    'public.get_revenue_rollup(bigint,date,date,text)'::regprocedure
  ) INTO v_result;
  IF v_result NOT LIKE '%momo_revenue numeric%' THEN
    RAISE EXCEPTION 'get_revenue_rollup_momo_result_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = 'public.mv_daily_revenue'::regclass
      AND attribute.attname = 'momo_revenue'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION 'mv_daily_revenue_momo_column_missing';
  END IF;

  IF pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.get_revenue_by_cashier(bigint,date,date)'::regprocedure
    ),
    'sp.method IN (''vietqr'', ''momo'')'
  ) = 0 THEN
    RAISE EXCEPTION 'cashier_momo_revenue_filter_missing';
  END IF;

  SELECT count(*) INTO v_safe_search_path_count
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'get_daily_revenue',
      'get_revenue_kpis',
      'get_revenue_rollup',
      'get_revenue_by_cashier'
    )
    AND procedure.proconfig @> ARRAY['search_path=""']::text[];

  IF v_safe_search_path_count IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'momo_finance_reporting_search_path_invalid';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.get_daily_revenue(bigint,date,date)',
    'EXECUTE'
  )
    OR has_function_privilege(
      'anon',
      'public.get_revenue_kpis(bigint,date,date)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.get_revenue_rollup(bigint,date,date,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.get_revenue_by_cashier(bigint,date,date)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.get_daily_revenue(bigint,date,date)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.get_revenue_kpis(bigint,date,date)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.get_revenue_rollup(bigint,date,date,text)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.get_revenue_by_cashier(bigint,date,date)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'momo_finance_reporting_acl_invalid';
  END IF;
END;
$$;

CREATE TEMP TABLE momo_finance_ctx (
  tenant_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  owner_id uuid NOT NULL,
  cash_order_id bigint,
  vietqr_order_id bigint,
  momo_order_id bigint
);

INSERT INTO momo_finance_ctx (tenant_id, branch_id, owner_id)
SELECT
  tenant.id,
  branch.id,
  profile.id
FROM public.tenants tenant
JOIN public.branches branch
  ON branch.tenant_id = tenant.id
JOIN public.profiles profile
  ON profile.tenant_id = tenant.id
JOIN public.positions position
  ON position.id = profile.position_id
 AND position.tenant_id = tenant.id
WHERE tenant.slug = 'comtammatu'
  AND position.code = 'owner'
  AND COALESCE(profile.is_active, true)
  AND COALESCE(branch.is_active, true)
ORDER BY branch.id, profile.id
LIMIT 1;

GRANT SELECT ON momo_finance_ctx TO authenticated;

DO $$
DECLARE
  v_ctx momo_finance_ctx%ROWTYPE;
BEGIN
  SELECT * INTO v_ctx FROM momo_finance_ctx;
  IF v_ctx.tenant_id IS NULL
    OR v_ctx.branch_id IS NULL
    OR v_ctx.owner_id IS NULL
  THEN
    RAISE EXCEPTION 'momo_finance_reporting_seed_context_missing';
  END IF;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    subtotal,
    total_amount,
    payment_method,
    payment_status,
    status,
    created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    'MFR-CASH-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    10000,
    10000,
    'cash',
    'paid',
    'completed',
    v_ctx.owner_id
  ) RETURNING id INTO v_ctx.cash_order_id;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    subtotal,
    total_amount,
    payment_method,
    payment_status,
    status,
    created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    'MFR-VIETQR-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    20000,
    20000,
    'vietqr',
    'paid',
    'completed',
    v_ctx.owner_id
  ) RETURNING id INTO v_ctx.vietqr_order_id;

  INSERT INTO public.orders (
    tenant_id,
    branch_id,
    order_number,
    order_type,
    subtotal,
    total_amount,
    payment_method,
    payment_status,
    status,
    created_by
  ) VALUES (
    v_ctx.tenant_id,
    v_ctx.branch_id,
    'MFR-MOMO-' || replace(gen_random_uuid()::text, '-', ''),
    'takeaway',
    30000,
    30000,
    'momo',
    'paid',
    'completed',
    v_ctx.owner_id
  ) RETURNING id INTO v_ctx.momo_order_id;

  UPDATE momo_finance_ctx
  SET cash_order_id = v_ctx.cash_order_id,
      vietqr_order_id = v_ctx.vietqr_order_id,
      momo_order_id = v_ctx.momo_order_id;

  INSERT INTO public.payments (
    tenant_id,
    branch_id,
    order_id,
    method,
    amount,
    status,
    provider_ref,
    provider_data,
    paid_at,
    created_by
  ) VALUES
    (
      v_ctx.tenant_id,
      v_ctx.branch_id,
      v_ctx.cash_order_id,
      'cash',
      10000,
      'completed',
      NULL,
      '{"source":"momo_finance_test"}'::jsonb,
      '2099-01-15 05:00:00+07'::timestamptz,
      v_ctx.owner_id
    ),
    (
      v_ctx.tenant_id,
      v_ctx.branch_id,
      v_ctx.vietqr_order_id,
      'vietqr',
      20000,
      'completed',
      'MFR-VIETQR',
      '{"source":"momo_finance_test"}'::jsonb,
      '2099-01-15 05:01:00+07'::timestamptz,
      v_ctx.owner_id
    ),
    (
      v_ctx.tenant_id,
      v_ctx.branch_id,
      v_ctx.momo_order_id,
      'momo',
      30000,
      'completed',
      'MFR-MOMO',
      '{"source":"momo_finance_test"}'::jsonb,
      '2099-01-15 05:02:00+07'::timestamptz,
      v_ctx.owner_id
    );
END;
$$;

REFRESH MATERIALIZED VIEW public.mv_daily_revenue;

DO $$
DECLARE
  v_ctx momo_finance_ctx%ROWTYPE;
  v_row record;
BEGIN
  SELECT * INTO v_ctx FROM momo_finance_ctx;

  SELECT * INTO v_row
  FROM public.mv_daily_revenue revenue
  WHERE revenue.tenant_id = v_ctx.tenant_id
    AND revenue.branch_id = v_ctx.branch_id
    AND revenue.date = DATE '2099-01-15';

  IF v_row.total_revenue IS DISTINCT FROM 60000::numeric
    OR v_row.cash_revenue IS DISTINCT FROM 10000::numeric
    OR v_row.vietqr_revenue IS DISTINCT FROM 20000::numeric
    OR v_row.momo_revenue IS DISTINCT FROM 30000::numeric
  THEN
    RAISE EXCEPTION 'mv_daily_revenue_momo_totals_invalid';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_ctx.owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_ctx.owner_id::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_ctx.tenant_id)
    )::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ctx momo_finance_ctx%ROWTYPE;
  v_row record;
BEGIN
  SELECT * INTO v_ctx FROM momo_finance_ctx;

  SELECT * INTO v_row
  FROM public.get_daily_revenue(
    v_ctx.branch_id,
    DATE '2099-01-15',
    DATE '2099-01-15'
  );

  IF v_row.total_revenue IS DISTINCT FROM 60000::numeric
    OR v_row.cash_revenue IS DISTINCT FROM 10000::numeric
    OR v_row.vietqr_revenue IS DISTINCT FROM 20000::numeric
    OR v_row.momo_revenue IS DISTINCT FROM 30000::numeric
  THEN
    RAISE EXCEPTION 'get_daily_revenue_momo_totals_invalid';
  END IF;

  SELECT * INTO v_row
  FROM public.get_revenue_kpis(
    v_ctx.branch_id,
    DATE '2099-01-15',
    DATE '2099-01-15'
  );

  IF v_row.cash_revenue IS DISTINCT FROM 10000::numeric
    OR v_row.vietqr_revenue IS DISTINCT FROM 20000::numeric
    OR v_row.momo_revenue IS DISTINCT FROM 30000::numeric
  THEN
    RAISE EXCEPTION 'get_revenue_kpis_momo_totals_invalid';
  END IF;

  SELECT * INTO v_row
  FROM public.get_revenue_rollup(
    v_ctx.branch_id,
    DATE '2099-01-15',
    DATE '2099-01-15',
    'day'
  );

  IF v_row.total_revenue IS DISTINCT FROM 60000::numeric
    OR v_row.cash_revenue IS DISTINCT FROM 10000::numeric
    OR v_row.vietqr_revenue IS DISTINCT FROM 20000::numeric
    OR v_row.momo_revenue IS DISTINCT FROM 30000::numeric
  THEN
    RAISE EXCEPTION 'get_revenue_rollup_momo_totals_invalid';
  END IF;

  SELECT * INTO v_row
  FROM public.get_revenue_by_cashier(
    v_ctx.branch_id,
    DATE '2099-01-15',
    DATE '2099-01-15'
  )
  WHERE cashier_id = v_ctx.owner_id;

  IF v_row.cash_revenue IS DISTINCT FROM 10000::numeric
    OR v_row.qr_revenue IS DISTINCT FROM 50000::numeric
  THEN
    RAISE EXCEPTION 'get_revenue_by_cashier_momo_totals_invalid';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
