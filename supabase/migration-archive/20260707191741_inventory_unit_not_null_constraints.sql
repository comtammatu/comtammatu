BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  v_table text;
  v_null_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'production_recipes',
    'production_runs',
    'stock_issue_items',
    'stock_transfer_items',
    'stocktake_lines',
    'stock_movements'
  ]
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE entry_unit_id IS NULL',
      v_table
    )
    INTO v_null_count;

    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'entry_unit_id_not_null_precheck_failed: %.entry_unit_id has % null rows',
        v_table,
        v_null_count
        USING ERRCODE = '23502';
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.production_recipes ALTER COLUMN entry_unit_id SET NOT NULL;
ALTER TABLE public.production_runs ALTER COLUMN entry_unit_id SET NOT NULL;
ALTER TABLE public.stock_issue_items ALTER COLUMN entry_unit_id SET NOT NULL;
ALTER TABLE public.stock_transfer_items ALTER COLUMN entry_unit_id SET NOT NULL;
ALTER TABLE public.stocktake_lines ALTER COLUMN entry_unit_id SET NOT NULL;
ALTER TABLE public.stock_movements ALTER COLUMN entry_unit_id SET NOT NULL;

COMMIT;
