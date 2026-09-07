\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_stock public.stock_levels%ROWTYPE;
  v_actor uuid;
  v_entry_unit bigint;
  v_account_id bigint;
  v_origin_id bigint;
  v_balance_id bigint;
  v_movement_id bigint;
  v_unit_cost numeric;
  v_event_value numeric;
  v_origin_value numeric;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS nsp
    ON nsp.oid = procedure.pronamespace
  WHERE nsp.nspname = 'private'
    AND procedure.proname = 'price_stocktake_gain_movement';
  IF v_definition IS NULL
     OR v_definition !~ 'count_adjustment'
     OR v_definition !~ 'adjustment'
     OR v_definition !~ 'stocktake_gain_unit_cost_missing' THEN
    RAISE EXCEPTION
      'STOCKTAKE SURPLUS: pricer must price count surplus at company WAC';
  END IF;

  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.current_quantity >= 0
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STOCKTAKE SURPLUS: seeded stock level is required';
  END IF;

  SELECT profile.id
  INTO v_actor
  FROM public.profiles AS profile
  WHERE profile.tenant_id = v_stock.tenant_id
  ORDER BY profile.created_at, profile.id
  LIMIT 1;
  SELECT ingredient_unit.unit_id
  INTO v_entry_unit
  FROM public.ingredient_units AS ingredient_unit
  WHERE ingredient_unit.tenant_id = v_stock.tenant_id
    AND ingredient_unit.ingredient_id = v_stock.ingredient_id
    AND ingredient_unit.is_base
    AND ingredient_unit.is_active
  ORDER BY ingredient_unit.id
  LIMIT 1;
  IF v_actor IS NULL OR v_entry_unit IS NULL THEN
    RAISE EXCEPTION 'STOCKTAKE SURPLUS: seeded actor and base unit are required';
  END IF;

  INSERT INTO public.inventory_valuation_cutovers (
    tenant_id,
    status,
    cutoff_at,
    prepared_at,
    opening_quantity,
    opening_value
  )
  VALUES (
    v_stock.tenant_id,
    'active',
    pg_catalog.now() - interval '1 day',
    pg_catalog.now() - interval '1 day',
    10,
    1000000
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET status = 'active',
      cutoff_at = EXCLUDED.cutoff_at;

  UPDATE public.stock_levels
  SET current_quantity = 10,
      avg_unit_cost = 100000
  WHERE id = v_stock.id;

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    quantity,
    book_value
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    10,
    1000000
  )
  ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
  DO UPDATE SET quantity = 10, book_value = 1000000
  RETURNING id INTO v_account_id;

  DELETE FROM public.inventory_origin_balances
  WHERE valuation_account_id = v_account_id
    AND holder_kind = 'stock_pool';

  v_origin_id := private.create_inventory_cost_origin(
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'grn_receipt',
    (SELECT coalesce(pg_catalog.max(origin.source_id), 0)
       FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_stock.tenant_id) + 201,
    NULL,
    10,
    1000000,
    pg_catalog.now() - interval '1 day',
    'provisional'
  );
  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (
    v_stock.tenant_id, v_origin_id, 'stock_pool', v_account_id, 10, 1000000
  )
  RETURNING id INTO v_balance_id;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    type,
    quantity_change,
    entry_unit_id,
    entry_quantity,
    reason,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    'adjustment',
    5,
    v_entry_unit,
    5,
    '__stocktake_surplus_adjustment_5__',
    v_actor
  )
  RETURNING id, unit_cost INTO v_movement_id, v_unit_cost;

  SELECT event.value_delta
  INTO v_event_value
  FROM public.inventory_valuation_events AS event
  WHERE event.stock_movement_id = v_movement_id
    AND event.event_type = 'stocktake_gain';

  IF v_unit_cost IS NULL OR v_unit_cost <= 0 OR v_event_value IS NULL
     OR v_event_value <= 0 THEN
    RAISE EXCEPTION
      'STOCKTAKE SURPLUS: adjustment must inherit company WAC, got unit/value % / %',
      v_unit_cost,
      v_event_value;
  END IF;

  SELECT coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_origin_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.valuation_account_id = v_account_id
    AND balance.holder_kind = 'stock_pool';

  IF v_origin_value IS DISTINCT FROM (
    SELECT account.book_value
    FROM public.inventory_valuation_accounts AS account
    WHERE account.id = v_account_id
  ) THEN
    RAISE EXCEPTION 'STOCKTAKE SURPLUS: account/origin postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.valuation_account_id = v_account_id
      AND balance.holder_kind = 'stock_pool'
      AND balance.quantity > 0
      AND balance.book_value = 0
      AND origin.source_kind = 'stocktake_found'
  ) THEN
    RAISE EXCEPTION 'STOCKTAKE SURPLUS: found lot remained unpriced';
  END IF;
END;
$$;

ROLLBACK;
