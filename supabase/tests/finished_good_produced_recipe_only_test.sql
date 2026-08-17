\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
  v_trigger_count integer;
  v_stock public.stock_levels%ROWTYPE;
  v_fg_id bigint;
  v_raw_id bigint;
  v_unit bigint;
  v_raised boolean := FALSE;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS nsp
    ON nsp.oid = procedure.pronamespace
  WHERE nsp.nspname = 'private'
    AND procedure.proname = 'assert_purchased_ingredient';
  IF v_definition IS NULL
     OR v_definition !~ 'finished_good_not_purchased' THEN
    RAISE EXCEPTION
      'FG RECIPE: assert_purchased_ingredient must reject finished_good';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.bulk_create_supplier_items(bigint,jsonb)'::pg_catalog.regprocedure;
  IF v_definition !~ 'finished_good_not_purchased' THEN
    RAISE EXCEPTION
      'FG RECIPE: bulk_create_supplier_items must reject finished_good';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgname IN (
    'trg_supplier_items_require_purchased',
    'trg_purchase_request_items_require_purchased',
    'trg_purchase_order_items_require_purchased',
    'trg_grn_items_require_purchased'
  )
    AND NOT trigger_row.tgisinternal;
  IF v_trigger_count <> 4 THEN
    RAISE EXCEPTION
      'FG RECIPE: expected 4 purchase-line triggers, got %',
      v_trigger_count;
  END IF;

  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.current_quantity > 0
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FG RECIPE: seeded stock level is required';
  END IF;

  SELECT unit.id
  INTO v_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_stock.tenant_id
  ORDER BY unit.id
  LIMIT 1;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    item_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_stock.tenant_id,
    '__fg_recipe_only_fg__',
    '__FG-RECIPE-' || v_stock.id::text,
    'finished_good',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_fg_id;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    item_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_stock.tenant_id,
    '__fg_recipe_only_raw__',
    '__FG-RAW-' || v_stock.id::text,
    'raw_material',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_raw_id;

  PERFORM private.assert_purchased_ingredient(
    v_stock.tenant_id,
    v_raw_id
  );

  BEGIN
    PERFORM private.assert_purchased_ingredient(
      v_stock.tenant_id,
      v_fg_id
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      IF SQLERRM LIKE '%finished_good_not_purchased%' THEN
        v_raised := TRUE;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION
      'FG RECIPE: finished_good must raise finished_good_not_purchased';
  END IF;
END;
$$;

ROLLBACK;
