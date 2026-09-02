BEGIN;

-- Wrap inventory RLS permission helpers as InitPlan scalar subqueries.
-- ALTER POLICY rewrites only USING / WITH CHECK; roles, command, and
-- PERMISSIVE/RESTRICTIVE stay unchanged. Permission keys are not edited.
-- tenant_id = auth_tenant_id() stays bare (wrapping it demotes Index Scan).

DO $mig$
DECLARE
  r record;
  v_new_qual text;
  v_new_wc text;
  v_set text[];
BEGIN
  FOR r IN
    SELECT
      pol.polname,
      cls.relname,
      pg_get_expr(pol.polqual, pol.polrelid) AS qual,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname IN (
        'purchase_requests',
        'purchase_request_items',
        'purchase_request_allocations',
        'purchase_orders',
        'purchase_order_items',
        'goods_received_notes',
        'grn_items',
        'stock_transfers',
        'stock_transfer_items',
        'stock_issues',
        'stock_issue_items',
        'stocktake_sessions',
        'stocktake_lines',
        'stocktake_conflicts',
        'stocktake_drafts',
        'production_runs',
        'stock_levels',
        'stock_movements',
        'inventory_locations',
        'inventory_count_slips',
        'inventory_count_slip_lines',
        'inventory_count_assignments',
        'supplier_items',
        'supplier_price_list',
        'supplier_credit_notes',
        'supplier_returns',
        'ingredients',
        'ingredient_units'
      )
  LOOP
    v_new_qual := r.qual;
    v_new_wc := r.with_check;

    IF v_new_qual IS NOT NULL THEN
      v_new_qual := replace(v_new_qual, 'has_permission_any(', 'HPANY(');
      v_new_qual := replace(v_new_qual, '(SELECT has_permission(', '(WRAPPED_HP(');
      v_new_qual := replace(v_new_qual, '( SELECT has_permission(', '(WRAPPED_HP(');
      v_new_qual := regexp_replace(
        v_new_qual,
        'has_permission\(([^()]*)\)',
        '(SELECT has_permission(\1))',
        'g'
      );
      v_new_qual := replace(v_new_qual, '(WRAPPED_HP(', '(SELECT has_permission(');
      v_new_qual := replace(v_new_qual, 'HPANY(', 'has_permission_any(');
      IF v_new_qual ~ 'has_permission_any\('
         AND v_new_qual !~ '\(\s*SELECT has_permission_any\(' THEN
        v_new_qual := regexp_replace(
          v_new_qual,
          'has_permission_any\(''[^'']*''(::text)?\)',
          '( SELECT \&)',
          'g'
        );
      END IF;
    END IF;

    IF v_new_wc IS NOT NULL THEN
      v_new_wc := replace(v_new_wc, 'has_permission_any(', 'HPANY(');
      v_new_wc := replace(v_new_wc, '(SELECT has_permission(', '(WRAPPED_HP(');
      v_new_wc := replace(v_new_wc, '( SELECT has_permission(', '(WRAPPED_HP(');
      v_new_wc := regexp_replace(
        v_new_wc,
        'has_permission\(([^()]*)\)',
        '(SELECT has_permission(\1))',
        'g'
      );
      v_new_wc := replace(v_new_wc, '(WRAPPED_HP(', '(SELECT has_permission(');
      v_new_wc := replace(v_new_wc, 'HPANY(', 'has_permission_any(');
      IF v_new_wc ~ 'has_permission_any\('
         AND v_new_wc !~ '\(\s*SELECT has_permission_any\(' THEN
        v_new_wc := regexp_replace(
          v_new_wc,
          'has_permission_any\(''[^'']*''(::text)?\)',
          '( SELECT \&)',
          'g'
        );
      END IF;
    END IF;

    IF v_new_qual IS NOT DISTINCT FROM r.qual
       AND v_new_wc IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;
    END IF;

    v_set := ARRAY[]::text[];
    IF v_new_qual IS NOT NULL THEN
      v_set := v_set || format('USING (%s)', v_new_qual);
    END IF;
    IF v_new_wc IS NOT NULL THEN
      v_set := v_set || format('WITH CHECK (%s)', v_new_wc);
    END IF;

    EXECUTE format(
      'ALTER POLICY %I ON public.%I %s',
      r.polname,
      r.relname,
      array_to_string(v_set, ' ')
    );
  END LOOP;
END
$mig$;

DO $assert$
DECLARE
  v_residual int;
BEGIN
  SELECT count(*) INTO v_residual
  FROM pg_policy pol
  JOIN pg_class cls ON cls.oid = pol.polrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname IN (
      'purchase_requests',
      'purchase_request_items',
      'purchase_request_allocations',
      'purchase_orders',
      'purchase_order_items',
      'goods_received_notes',
      'grn_items',
      'stock_transfers',
      'stock_transfer_items',
      'stock_issues',
      'stock_issue_items',
      'stocktake_sessions',
      'stocktake_lines',
      'stocktake_conflicts',
      'stocktake_drafts',
      'production_runs',
      'stock_levels',
      'stock_movements',
      'inventory_locations',
      'inventory_count_slips',
      'inventory_count_slip_lines',
      'inventory_count_assignments',
      'supplier_items',
      'supplier_price_list',
      'supplier_credit_notes',
      'supplier_returns',
      'ingredients',
      'ingredient_units'
    )
    AND (
      (
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        ~ 'has_permission\('
        AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        !~ '\(\s*SELECT has_permission\('
      )
      OR (
        coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        ~ 'has_permission_any\('
        AND coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || ' '
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
        !~ '\(\s*SELECT has_permission_any\('
      )
    );

  IF v_residual <> 0 THEN
    RAISE EXCEPTION
      'inventory InitPlan wrap incomplete: % policy(ies) still call a bare permission helper',
      v_residual;
  END IF;
END
$assert$;

COMMIT;
