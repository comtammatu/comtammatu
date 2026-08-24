\set ON_ERROR_STOP on

BEGIN;

-- ADR 0044: production_output must create a production_output origin,
-- drain the run holder balances, and keep account totals coherent.
DO $$
DECLARE
  v_stock public.stock_levels%ROWTYPE;
  v_actor uuid;
  v_entry_unit bigint;
  v_account_id bigint;
  v_origin_id bigint;
  v_balance_id bigint;
  v_run_id bigint;
  v_consume_movement bigint;
  v_output_movement bigint;
  v_output_origin bigint;
  v_quantity numeric;
  v_book_value numeric;
  v_unit_cost numeric;
BEGIN
  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.current_quantity >= 0
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION LINEAGE: seeded stock level is required';
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
    RAISE EXCEPTION 'PRODUCTION LINEAGE: seeded actor and base unit are required';
  END IF;

  UPDATE public.stock_levels
  SET current_quantity = 100,
      avg_unit_cost = 100000
  WHERE id = v_stock.id;

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
    100,
    10000000
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET status = 'active',
      cutoff_at = EXCLUDED.cutoff_at;

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
    100,
    10000000
  )
  ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
  DO UPDATE SET quantity = 100, book_value = 10000000
  RETURNING id INTO v_account_id;

  INSERT INTO public.inventory_cost_origins (
    tenant_id,
    ingredient_id,
    source_kind,
    source_id,
    original_quantity,
    provisional_value,
    finalized_quantity,
    finalized_value,
    cost_status,
    effective_at
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'opening',
    v_stock.id,
    100,
    10000000,
    100,
    10000000,
    'finalized',
    pg_catalog.now() - interval '1 day'
  )
  ON CONFLICT (tenant_id, source_kind, source_id)
  DO UPDATE SET original_quantity = 100, provisional_value = 10000000
  RETURNING id INTO v_origin_id;

  INSERT INTO public.inventory_origin_balances (
    tenant_id,
    origin_id,
    holder_kind,
    valuation_account_id,
    quantity,
    book_value
  )
  VALUES (
    v_stock.tenant_id,
    v_origin_id,
    'stock_pool',
    v_account_id,
    100,
    10000000
  )
  ON CONFLICT (
    tenant_id,
    origin_id,
    valuation_account_id
  ) WHERE holder_kind = 'stock_pool'
  DO UPDATE SET quantity = 100, book_value = 10000000
  RETURNING id INTO v_balance_id;

  INSERT INTO public.production_runs (
    tenant_id,
    production_number,
    branch_id,
    finished_good_id,
    planned_quantity,
    entry_unit_id,
    status,
    target_branch_id,
    source_location_id,
    target_location_id,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    '__production_lineage_test__',
    v_stock.branch_id,
    v_stock.ingredient_id,
    8,
    v_entry_unit,
    'completed',
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.location_id,
    v_actor
  )
  RETURNING id INTO v_run_id;

  -- Consume 40 base units into the run holder.
  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    type,
    quantity_change,
    entry_unit_id,
    entry_quantity,
    unit_cost,
    production_run_id,
    reason,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    'production_consumption',
    -40,
    v_entry_unit,
    -40,
    100000,
    v_run_id,
    '__production_lineage_consume__',
    v_actor
  )
  RETURNING id INTO v_consume_movement;

  SELECT account.quantity, account.book_value
  INTO v_quantity, v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;
  IF v_quantity <> 60 OR v_book_value <> 6000000 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: consume expected 60 / 6000000, got % / %',
      v_quantity,
      v_book_value;
  END IF;

  SELECT
    coalesce(pg_catalog.sum(balance.quantity), 0),
    coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_quantity, v_book_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_stock.tenant_id
    AND balance.holder_kind = 'production_run'
    AND balance.holder_id = v_run_id;
  IF v_quantity <> 40 OR v_book_value <> 4000000 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: run holder expected 40 / 4000000, got % / %',
      v_quantity,
      v_book_value;
  END IF;

  -- Output 8 finished portions; value must come from the run holder.
  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    type,
    quantity_change,
    entry_unit_id,
    entry_quantity,
    unit_cost,
    production_run_id,
    reason,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    'production_output',
    8,
    v_entry_unit,
    8,
    500000,
    v_run_id,
    '__production_lineage_output__',
    v_actor
  )
  RETURNING id INTO v_output_movement;

  SELECT account.quantity, account.book_value
  INTO v_quantity, v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;
  IF v_quantity <> 68 OR v_book_value <> 10000000 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: output expected 68 / 10000000, got % / %',
      v_quantity,
      v_book_value;
  END IF;

  SELECT origin.id
  INTO v_output_origin
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_stock.tenant_id
    AND origin.ingredient_id = v_stock.ingredient_id
    AND origin.source_kind = 'production_output'
    AND origin.source_id = v_output_movement;
  IF v_output_origin IS NULL THEN
    RAISE EXCEPTION 'PRODUCTION LINEAGE: production_output origin missing';
  END IF;

  SELECT origin.provisional_value / origin.original_quantity
  INTO v_unit_cost
  FROM public.inventory_cost_origins AS origin
  WHERE origin.id = v_output_origin;
  IF v_unit_cost <> 500000 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: output unit cost expected 500000, got %',
      v_unit_cost;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_events AS event
    WHERE event.stock_movement_id = v_output_movement
      AND event.event_type <> 'production_output'
  ) THEN
    RAISE EXCEPTION 'PRODUCTION LINEAGE: output event type misclassified';
  END IF;

  SELECT coalesce(pg_catalog.sum(balance.quantity), 0),
         coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_quantity, v_book_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_stock.tenant_id
    AND balance.holder_kind = 'production_run'
    AND balance.holder_id = v_run_id;
  IF v_quantity <> 0 OR v_book_value <> 0 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: run holder not drained, residual % / %',
      v_quantity,
      v_book_value;
  END IF;

  SELECT coalesce(pg_catalog.sum(allocation.allocated_value), 0)
  INTO v_book_value
  FROM public.inventory_value_allocations AS allocation
  JOIN public.inventory_valuation_events AS event
    ON event.id = allocation.valuation_event_id
  WHERE event.stock_movement_id = v_output_movement
    AND allocation.allocation_bucket = 'production_inventory'
    AND allocation.derived_origin_id = v_output_origin;
  IF v_book_value <> 4000000 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: lineage allocation expected 4000000, got %',
      v_book_value;
  END IF;

  -- Finished-good provisional cost must read the new origin.
  UPDATE public.ingredients
  SET item_kind = 'finished_good'
  WHERE tenant_id = v_stock.tenant_id
    AND id = v_stock.ingredient_id;

  v_unit_cost := private.ingredient_provisional_unit_cost(
    v_stock.tenant_id,
    v_stock.ingredient_id
  );
  IF v_unit_cost IS DISTINCT FROM 500000 THEN
    RAISE EXCEPTION
      'PRODUCTION LINEAGE: provisional unit cost expected 500000, got %',
      v_unit_cost;
  END IF;
END;
$$;

ROLLBACK;
