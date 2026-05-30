-- Finish disabling default_consumption as runtime selection input.
-- POS consumption now chooses an active kitchen by sort_order/id only.

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef('public.consume_stock_for_order(bigint)'::regprocedure)
    INTO v_sql;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id',
    'ORDER BY il.sort_order NULLS LAST, il.id'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'disable_default_consumption_ordering_missed:consume_stock_for_order';
  END IF;

  EXECUTE v_sql;
END $$;

DO $$
DECLARE
  v_sql    TEXT;
  v_before TEXT;
BEGIN
  SELECT pg_get_functiondef('public.consume_stock_for_order_service(bigint,uuid)'::regprocedure)
    INTO v_sql;

  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'ORDER BY il.is_default_consumption DESC, il.sort_order NULLS LAST, il.id',
    'ORDER BY il.sort_order NULLS LAST, il.id'
  );

  IF v_sql = v_before THEN
    RAISE EXCEPTION 'disable_default_consumption_ordering_missed:consume_stock_for_order_service';
  END IF;

  EXECUTE v_sql;
END $$;
