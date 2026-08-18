-- Staff-picked free_item qty: always pick; NULL campaign qty = up to bill capacity.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_candidates jsonb;
  v_one jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.promotions'::regclass
      AND conname = 'promotions_kind_fields_check'
      AND pg_get_constraintdef(oid) LIKE '%free_item_qty IS NULL OR free_item_qty >= 1%'
  ) THEN
    RAISE EXCEPTION 'promotions_kind_fields_free_item_qty_optional_missing';
  END IF;

  v_candidates := jsonb_build_array(
    jsonb_build_object(
      'order_item_id', 1,
      'side_item_id', 17,
      'name', 'Tra tac',
      'unit_price', 20000,
      'max_units', 2,
      'parent_name', 'Tra tac'
    ),
    jsonb_build_object(
      'order_item_id', 2,
      'side_item_id', 10,
      'name', 'Rau ma',
      'unit_price', 20000,
      'max_units', 1,
      'parent_name', 'Rau ma'
    )
  );

  IF public.promotion_free_item_needs_manual_selection(v_candidates) IS NOT TRUE THEN
    RAISE EXCEPTION 'free_item_multi_should_pick';
  END IF;

  v_one := jsonb_build_array(v_candidates -> 0);
  IF public.promotion_free_item_needs_manual_selection(v_one) IS NOT TRUE THEN
    RAISE EXCEPTION 'free_item_single_line_should_pick';
  END IF;

  IF public.promotion_free_item_amount(
    v_one,
    jsonb_build_array(
      jsonb_build_object('order_item_id', 1, 'side_item_id', 17, 'units', 2)
    )
  ) IS DISTINCT FROM 40000 THEN
    RAISE EXCEPTION 'free_item_two_units_same_line_invalid';
  END IF;
END;
$$;

ROLLBACK;
