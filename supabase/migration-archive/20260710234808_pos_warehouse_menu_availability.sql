-- D078 follow-up: calculate menu sellable stock from the active branch warehouse.
-- No stock data moves in this migration.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  v_fn text;
  v_sql text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.compute_menu_item_stock_capacity(bigint, bigint, bigint)',
    'public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[])'
  ]
  LOOP
    BEGIN
      SELECT pg_get_functiondef(v_fn::regprocedure) INTO v_sql;
    EXCEPTION
      WHEN undefined_function THEN
        RAISE EXCEPTION 'pos_warehouse_availability_function_missing:%', v_fn
          USING ERRCODE = 'P0002';
    END;

    IF position('location_kind = ''kitchen''' IN v_sql) = 0 THEN
      RAISE EXCEPTION 'pos_warehouse_availability_kitchen_pattern_missing:%', v_fn
        USING ERRCODE = 'P0001';
    END IF;

    v_sql := replace(
      v_sql,
      'location_kind = ''kitchen''',
      'location_kind = ''warehouse'''
    );
    EXECUTE v_sql;

    SELECT pg_get_functiondef(v_fn::regprocedure) INTO v_sql;
    IF position('location_kind = ''kitchen''' IN v_sql) > 0
       OR position('location_kind = ''warehouse''' IN v_sql) = 0 THEN
      RAISE EXCEPTION 'pos_warehouse_availability_rewire_failed:%', v_fn
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.compute_menu_item_stock_capacity(bigint, bigint, bigint)
IS 'Sellable portions of a menu item from active branch warehouse stock after converting recipe entry_unit_id to the ingredient base unit. NULL means no recipe or missing unit conversion.';

COMMENT ON FUNCTION public.branch_menu_limit_availability(bigint, bigint, date, boolean, uuid[])
IS 'Stock availability reserves shared recipe ingredients from active branch warehouse stock; manual daily caps remain per menu item. Capacity NULL remains unlimited.';

COMMIT;
