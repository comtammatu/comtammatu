-- P0: LEAST/GREATEST are SQL special forms, not pg_catalog callables.
-- 20260810124500 reintroduced pg_catalog.least(...) into
-- private.post_stock_movement_valuation. That raises 42883
-- (undefined_function), which PostgREST surfaces as HTTP 404 on
-- complete_production_run and any other path that posts stock_movements.

DO $fix_least$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  IF v_def ~ 'pg_catalog\.least\(' THEN
    v_def := replace(v_def, 'pg_catalog.least(', 'least(');
    EXECUTE v_def;
  END IF;

  IF pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  ) ~ 'pg_catalog\.least\(' THEN
    RAISE EXCEPTION 'post_stock_movement_valuation still uses pg_catalog.least';
  END IF;
END
$fix_least$;
