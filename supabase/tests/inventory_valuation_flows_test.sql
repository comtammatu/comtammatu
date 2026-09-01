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
  v_first_movement bigint;
  v_second_movement bigint;
  v_stocktake_movement bigint;
  v_first_reprice_event bigint;
  v_second_reprice_event bigint;
  v_quantity numeric;
  v_book_value numeric;
  v_event_value numeric;
  v_allocated_value numeric;
  v_terminal_bucket text;
  v_movement_unit_cost numeric;
  v_reconciliation_value numeric;
  v_rounding_value numeric;
BEGIN
  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.current_quantity >= 0
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VALUATION FLOW: seeded stock level is required';
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
    RAISE EXCEPTION 'VALUATION FLOW: seeded actor and base unit are required';
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

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    type,
    movement_subtype,
    quantity_change,
    entry_unit_id,
    entry_quantity,
    unit_cost,
    reason,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    'consumption',
    'sale_consumption',
    -40,
    v_entry_unit,
    -40,
    100000,
    '__valuation_flow_40pct__',
    v_actor
  )
  RETURNING id INTO v_first_movement;

  SELECT account.quantity, account.book_value
  INTO v_quantity, v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;
  IF v_quantity <> 60 OR v_book_value <> 6000000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: expected 60 / 6000000, got % / %',
      v_quantity,
      v_book_value;
  END IF;

  SELECT event.value_delta, event.terminal_bucket
  INTO v_event_value, v_terminal_bucket
  FROM public.inventory_valuation_events AS event
  WHERE event.stock_movement_id = v_first_movement;
  SELECT pg_catalog.sum(allocation.allocated_value)
  INTO v_allocated_value
  FROM public.inventory_value_allocations AS allocation
  JOIN public.inventory_valuation_events AS event
    ON event.id = allocation.valuation_event_id
  WHERE event.stock_movement_id = v_first_movement
    AND allocation.allocation_bucket = 'food_cost';
  IF v_event_value <> -4000000
     OR v_terminal_bucket <> 'food_cost'
     OR v_allocated_value <> 4000000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: issue value/bucket/allocation mismatch % / % / %',
      v_event_value,
      v_terminal_bucket,
      v_allocated_value;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    WHERE event.stock_movement_id = v_first_movement
      AND allocation.allocation_bucket = 'food_cost'
      AND allocation.from_balance_id IS DISTINCT FROM v_balance_id
  ) THEN
    RAISE EXCEPTION 'VALUATION FLOW: sale allocation source balance missing';
  END IF;

  INSERT INTO public.inventory_valuation_events (
    tenant_id,
    ingredient_id,
    event_type,
    quantity_delta,
    value_delta,
    effective_at,
    posting_year,
    posting_month,
    idempotency_key,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'provisional_reprice',
    0,
    100000,
    pg_catalog.now(),
    extract(YEAR FROM pg_catalog.now())::integer,
    extract(MONTH FROM pg_catalog.now())::integer,
    pg_catalog.md5('__valuation_flow_reprice_first__')::uuid,
    v_actor
  )
  RETURNING id INTO v_first_reprice_event;

  PERFORM private.propagate_inventory_origin_reprice(
    v_stock.tenant_id,
    v_first_reprice_event,
    v_origin_id,
    100000
  );

  INSERT INTO public.inventory_valuation_events (
    tenant_id,
    ingredient_id,
    event_type,
    quantity_delta,
    value_delta,
    effective_at,
    posting_year,
    posting_month,
    idempotency_key,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'provisional_reprice',
    0,
    100000,
    pg_catalog.now(),
    extract(YEAR FROM pg_catalog.now())::integer,
    extract(MONTH FROM pg_catalog.now())::integer,
    pg_catalog.md5('__valuation_flow_reprice_second__')::uuid,
    v_actor
  )
  RETURNING id INTO v_second_reprice_event;

  PERFORM private.propagate_inventory_origin_reprice(
    v_stock.tenant_id,
    v_second_reprice_event,
    v_origin_id,
    100000
  );

  SELECT
    pg_catalog.sum(allocation.allocated_quantity),
    pg_catalog.sum(allocation.allocated_value)
  INTO v_quantity, v_allocated_value
  FROM public.inventory_value_allocations AS allocation
  WHERE allocation.tenant_id = v_stock.tenant_id
    AND allocation.valuation_event_id = v_second_reprice_event
    AND allocation.allocation_bucket = 'food_cost'
    AND allocation.from_balance_id = v_balance_id;

  IF v_quantity <> 40 OR v_allocated_value <> 40000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: repeated reprice duplicated terminal allocation % / %',
      v_quantity,
      v_allocated_value;
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    type,
    movement_subtype,
    quantity_change,
    entry_unit_id,
    entry_quantity,
    unit_cost,
    reason,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    'consumption',
    'sale_consumption',
    -60,
    v_entry_unit,
    -60,
    100000,
    '__valuation_flow_deplete__',
    v_actor
  )
  RETURNING id INTO v_second_movement;

  SELECT account.quantity, account.book_value
  INTO v_quantity, v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;
  IF v_quantity <> 0 OR v_book_value <> 0 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: full depletion left residual % / %',
      v_quantity,
      v_book_value;
  END IF;

  SELECT balance.quantity, balance.book_value
  INTO v_quantity, v_book_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.id = v_balance_id;
  IF v_quantity <> 0 OR v_book_value <> 0 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: origin full depletion left residual % / %',
      v_quantity,
      v_book_value;
  END IF;

  UPDATE public.inventory_origin_balances
  SET book_value = 100
  WHERE id = v_balance_id;

  PERFORM private.reconcile_inventory_valuation_account_to_stock(
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    pg_catalog.now(),
    NULL,
    '__valuation_flow_value_only__',
    v_actor
  );

  SELECT account.book_value
  INTO v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;

  SELECT event.value_delta
  INTO v_rounding_value
  FROM public.inventory_valuation_events AS event
  WHERE event.tenant_id = v_stock.tenant_id
    AND event.event_type = 'rounding'
    AND event.metadata->>'idempotency_seed' = '__valuation_flow_value_only__';

  IF v_book_value <> 100 OR v_rounding_value <> 100 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: account/origin value repair expected 100 / 100, got % / %',
      v_book_value,
      v_rounding_value;
  END IF;

  -- Reproduce the production defect: stock quantity and valuation quantity
  -- already disagree before a full-count adjustment. The completed count must
  -- make the valuation account follow physical stock instead of preserving the
  -- old gap.
  UPDATE public.inventory_valuation_accounts
  SET quantity = 12,
      book_value = 1200000
  WHERE id = v_account_id;
  UPDATE public.inventory_origin_balances
  SET quantity = 12,
      book_value = 1200000
  WHERE id = v_balance_id;

  -- A positive stocktake adjustment without an explicit unit cost must use
  -- the authoritative provisional/company WAC instead of creating zero-value
  -- on-hand inventory.
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
    'count_adjustment',
    5,
    v_entry_unit,
    5,
    '__valuation_flow_stocktake_gain__',
    v_actor
  )
  RETURNING id, unit_cost
  INTO v_stocktake_movement, v_movement_unit_cost;

  SELECT event.value_delta
  INTO v_event_value
  FROM public.inventory_valuation_events AS event
  WHERE event.stock_movement_id = v_stocktake_movement
    AND event.event_type = 'stocktake_gain';

  IF v_movement_unit_cost <> 100000 OR v_event_value <> 500000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: stocktake gain expected unit/value 100000 / 500000, got % / %',
      v_movement_unit_cost,
      v_event_value;
  END IF;

  SELECT account.quantity, account.book_value
  INTO v_quantity, v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;

  IF v_quantity <> 5 OR v_book_value <> 500000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: stocktake reconciliation expected 5 / 500000, got % / %',
      v_quantity,
      v_book_value;
  END IF;

  SELECT event.value_delta
  INTO v_reconciliation_value
  FROM public.inventory_valuation_events AS event
  WHERE event.stock_movement_id = v_stocktake_movement
    AND event.event_type = 'stocktake_reconciliation';

  IF v_reconciliation_value <> -1200000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: stocktake reconciliation expected -1200000, got %',
      v_reconciliation_value;
  END IF;

  SELECT
    pg_catalog.sum(balance.quantity),
    pg_catalog.sum(balance.book_value)
  INTO v_quantity, v_book_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_stock.tenant_id
    AND balance.valuation_account_id = v_account_id
    AND balance.holder_kind = 'stock_pool';

  IF v_quantity <> 5 OR v_book_value <> 500000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: reconciled origins expected 5 / 500000, got % / %',
      v_quantity,
      v_book_value;
  END IF;
END;
$$;

ROLLBACK;
