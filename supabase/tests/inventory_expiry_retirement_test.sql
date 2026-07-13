\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_function_result text;
  v_kind_comment text;
  v_low_stock_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND (
        (c.table_name = 'ingredients' AND c.column_name = 'shelf_life_days')
        OR (
          c.table_name = 'grn_items'
          AND c.column_name IN ('batch_number', 'expiry_date')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Retired inventory expiry columns still exist';
  END IF;

  IF to_regprocedure(
       'public.upsert_ingredient_catalog(bigint,text,text,bigint,numeric,text,text,numeric,numeric,numeric,integer,jsonb)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.upsert_ingredient_catalog(bigint,text,text,bigint,numeric,text,text,numeric,numeric,numeric,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'Ingredient catalog RPC signature retirement is incomplete';
  END IF;

  SELECT pg_get_function_result('public.scan_inventory_alerts()'::regprocedure)
  INTO v_function_result;
  IF v_function_result LIKE '%expiry_count%'
     OR v_function_result NOT LIKE '%low_stock_count%' THEN
    RAISE EXCEPTION 'Inventory alert RPC still exposes expiry output: %',
      v_function_result;
  END IF;

  SELECT col_description(c.oid, a.attnum)
  INTO v_kind_comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'notifications'
    AND a.attname = 'kind'
    AND NOT a.attisdropped;
  IF v_kind_comment IS NULL OR v_kind_comment ILIKE '%expiry%' THEN
    RAISE EXCEPTION 'Notification kind comment still advertises expiry: %',
      v_kind_comment;
  END IF;

  IF has_function_privilege(
       'anon',
       'public.scan_inventory_alerts()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.scan_inventory_alerts()',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.scan_inventory_alerts()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Inventory alert RPC grants are unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_matviews v
    WHERE v.schemaname = 'public'
      AND v.matviewname = 'mv_inventory_stock_current'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_matviews v
    WHERE v.schemaname = 'public'
      AND v.matviewname = 'mv_inventory_value_ranking'
  ) THEN
    RAISE EXCEPTION 'Inventory materialized views were not rebuilt';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT alert.low_stock_count
  INTO v_low_stock_count
  FROM public.scan_inventory_alerts() alert;
  IF v_low_stock_count IS NULL THEN
    RAISE EXCEPTION 'Inventory alert RPC returned no result';
  END IF;
END;
$$;

DO $$
DECLARE
  v_tenant_id bigint;
  v_owner_id uuid;
  v_unit_id bigint;
  v_unit_code text := 'expiry_retirement_unit_' || txid_current()::text;
BEGIN
  SELECT t.id, owner_profile.id
  INTO v_tenant_id, v_owner_id
  FROM public.tenants t
  CROSS JOIN LATERAL (
    SELECT pr.id
    FROM public.profiles pr
    JOIN public.positions pos ON pos.id = pr.position_id
    WHERE pr.tenant_id = t.id
      AND coalesce(pr.is_active, true)
      AND pos.code = 'owner'
    ORDER BY pr.id
    LIMIT 1
  ) owner_profile
  ORDER BY t.id
  LIMIT 1;

  IF v_tenant_id IS NULL OR v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Inventory expiry retirement test requires an active owner profile';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant_id, v_unit_code, v_unit_code)
  RETURNING id INTO v_unit_id;

  PERFORM set_config('test.inventory_expiry_tenant_id', v_tenant_id::text, true);
  PERFORM set_config('test.inventory_expiry_unit_id', v_unit_id::text, true);
  PERFORM set_config('test.inventory_expiry_unit_code', v_unit_code, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_id,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant_id)
    )::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant_id bigint := current_setting('test.inventory_expiry_tenant_id')::bigint;
  v_unit_id bigint := current_setting('test.inventory_expiry_unit_id')::bigint;
  v_unit_code text := current_setting('test.inventory_expiry_unit_code');
  v_suffix text := txid_current()::text;
  v_upsert_name text := '__expiry_retirement_upsert_' || v_suffix;
  v_bulk_name text := '__expiry_retirement_bulk_' || v_suffix;
  v_units jsonb;
  v_ingredient_id bigint;
  v_updated_ingredient_id bigint;
  v_ingredient_unit_id_before bigint;
  v_ingredient_unit_id_after bigint;
  v_unit_cost numeric;
  v_bulk_result jsonb;
  v_bulk_unit_count bigint;
BEGIN
  v_units := jsonb_build_array(
    jsonb_build_object(
      'unit_id', v_unit_id,
      'to_base_factor', 1,
      'is_base', true,
      'anchor_unit_id', NULL,
      'anchor_factor', NULL,
      'sort_order', 0
    )
  );

  v_ingredient_id := public.upsert_ingredient_catalog(
    NULL::bigint,
    v_upsert_name,
    NULL::text,
    NULL::bigint,
    1000::numeric,
    'raw_material',
    'ambient',
    0::numeric,
    NULL::numeric,
    NULL::numeric,
    v_units
  );

  SELECT ingredient_unit.id
  INTO STRICT v_ingredient_unit_id_before
  FROM public.ingredient_units ingredient_unit
  WHERE ingredient_unit.tenant_id = v_tenant_id
    AND ingredient_unit.ingredient_id = v_ingredient_id
    AND ingredient_unit.unit_id = v_unit_id;

  v_updated_ingredient_id := public.upsert_ingredient_catalog(
    v_ingredient_id,
    v_upsert_name,
    NULL::text,
    NULL::bigint,
    1250::numeric,
    'raw_material',
    'ambient',
    0::numeric,
    NULL::numeric,
    NULL::numeric,
    v_units
  );

  SELECT ingredient.unit_cost, ingredient_unit.id
  INTO STRICT v_unit_cost, v_ingredient_unit_id_after
  FROM public.ingredients ingredient
  JOIN public.ingredient_units ingredient_unit
    ON ingredient_unit.tenant_id = ingredient.tenant_id
   AND ingredient_unit.ingredient_id = ingredient.id
   AND ingredient_unit.unit_id = v_unit_id
  WHERE ingredient.tenant_id = v_tenant_id
    AND ingredient.id = v_ingredient_id;

  IF v_updated_ingredient_id IS DISTINCT FROM v_ingredient_id
     OR v_unit_cost IS DISTINCT FROM 1250::numeric
     OR v_ingredient_unit_id_after IS DISTINCT FROM v_ingredient_unit_id_before THEN
    RAISE EXCEPTION
      '11-argument ingredient upsert did not preserve ingredient_units identity';
  END IF;

  v_bulk_result := public.bulk_import_ingredients(
    jsonb_build_array(
      jsonb_build_object(
        'name', v_bulk_name,
        'sku', NULL,
        'unit', v_unit_code,
        'category', NULL,
        'item_kind', 'raw_material',
        'unit_cost', 1500,
        'min_stock_level', 0,
        'max_stock_level', NULL,
        'reorder_point', NULL,
        'storage_type', 'ambient'
      )
    )
  );

  IF (v_bulk_result->>'inserted')::integer IS DISTINCT FROM 1
     OR (v_bulk_result->>'updated')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Bulk ingredient import returned an unexpected result: %', v_bulk_result;
  END IF;

  SELECT count(*)
  INTO v_bulk_unit_count
  FROM public.ingredients ingredient
  JOIN public.ingredient_units ingredient_unit
    ON ingredient_unit.tenant_id = ingredient.tenant_id
   AND ingredient_unit.ingredient_id = ingredient.id
  WHERE ingredient.tenant_id = v_tenant_id
    AND ingredient.name = v_bulk_name
    AND ingredient_unit.unit_id = v_unit_id
    AND ingredient_unit.is_base;

  IF v_bulk_unit_count <> 1 THEN
    RAISE EXCEPTION 'Bulk ingredient import did not create its base ingredient unit';
  END IF;
END;
$$;

RESET ROLE;

ROLLBACK;
