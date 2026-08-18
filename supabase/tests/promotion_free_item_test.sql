-- Catalog + helper math for free_item (staff-picked units already on the order).

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_apply oid := to_regprocedure(
    'public.apply_free_item_selection(bigint, bigint, text, jsonb)'
  );
  v_upsert oid := to_regprocedure(
    'public.upsert_promotion(bigint, text, text, text, text, numeric, numeric, numeric, boolean, timestamptz, timestamptz, jsonb, text[], integer, integer, bigint[], jsonb, text, integer, boolean, boolean, integer)'
  );
  v_candidates jsonb;
  v_auto jsonb;
  v_amount numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'promotions'
      AND column_name = 'free_item_qty'
  ) THEN
    RAISE EXCEPTION 'promotions_free_item_qty_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.promotions'::regclass
      AND conname = 'promotions_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%free_item%'
  ) THEN
    RAISE EXCEPTION 'promotions_kind_check_missing_free_item';
  END IF;

  IF v_apply IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc function_row
      WHERE function_row.oid = v_apply
        AND function_row.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(function_row.proconfig) AS cfg
          WHERE cfg LIKE 'search_path%public%'
        )
    )
    OR has_function_privilege('anon', v_apply, 'EXECUTE')
    OR NOT has_function_privilege('authenticated', v_apply, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'apply_free_item_selection_acl_invalid';
  END IF;

  IF v_upsert IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc function_row
      WHERE function_row.oid = v_upsert
        AND function_row.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(function_row.proconfig) AS cfg
          WHERE cfg LIKE 'search_path%public%'
        )
    )
    OR has_function_privilege('anon', v_upsert, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'upsert_promotion_free_item_acl_invalid';
  END IF;

  v_candidates := jsonb_build_array(
    jsonb_build_object(
      'order_item_id', 1,
      'side_item_id', 10,
      'name', 'Coca',
      'unit_price', 20000,
      'max_units', 2,
      'parent_name', 'Coca'
    ),
    jsonb_build_object(
      'order_item_id', 2,
      'side_item_id', 11,
      'name', 'Nuoc suoi',
      'unit_price', 10000,
      'max_units', 1,
      'parent_name', 'Nuoc suoi'
    )
  );

  IF public.promotion_free_item_capacity(v_candidates) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'free_item_capacity_invalid';
  END IF;
  IF public.promotion_free_item_needs_manual_selection(v_candidates) IS NOT TRUE THEN
    RAISE EXCEPTION 'free_item_needs_manual_invalid';
  END IF;

  v_auto := public.promotion_free_item_auto_selections(v_candidates, 1);
  IF v_auto IS DISTINCT FROM jsonb_build_array(
    jsonb_build_object('order_item_id', 2, 'side_item_id', 11, 'units', 1)
  ) THEN
    RAISE EXCEPTION 'free_item_auto_cheapest_invalid: %', v_auto;
  END IF;

  v_amount := public.promotion_free_item_amount(
    v_candidates,
    jsonb_build_array(
      jsonb_build_object('order_item_id', 1, 'side_item_id', 10, 'units', 1)
    )
  );
  IF v_amount IS DISTINCT FROM 20000 THEN
    RAISE EXCEPTION 'free_item_amount_invalid: %', v_amount;
  END IF;

  IF public.promotion_free_item_needs_manual_selection(
    jsonb_build_array(v_candidates -> 0)
  ) IS NOT FALSE THEN
    RAISE EXCEPTION 'free_item_single_line_should_auto';
  END IF;
END;
$$;

ROLLBACK;
