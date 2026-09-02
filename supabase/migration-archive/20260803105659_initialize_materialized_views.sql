BEGIN;

DO $$
DECLARE
  v_view regclass;
BEGIN
  FOREACH v_view IN ARRAY ARRAY[
    'public.mv_daily_revenue'::regclass,
    'public.mv_food_cost'::regclass,
    'public.mv_inventory_stock_current'::regclass,
    'public.mv_inventory_value_ranking'::regclass
  ]
  LOOP
    IF NOT (SELECT relispopulated FROM pg_class WHERE oid = v_view) THEN
      EXECUTE format('REFRESH MATERIALIZED VIEW %s', v_view);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
