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
  v_quantity numeric;
  v_book_value numeric;
  v_event_value numeric;
  v_allocated_value numeric;
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

  SELECT event.value_delta
  INTO v_event_value
  FROM public.inventory_valuation_events AS event
  WHERE event.stock_movement_id = v_first_movement;
  SELECT pg_catalog.sum(allocation.allocated_value)
  INTO v_allocated_value
  FROM public.inventory_value_allocations AS allocation
  JOIN public.inventory_valuation_events AS event
    ON event.id = allocation.valuation_event_id
  WHERE event.stock_movement_id = v_first_movement
    AND allocation.allocation_bucket = 'food_cost';
  IF v_event_value <> -4000000 OR v_allocated_value <> 4000000 THEN
    RAISE EXCEPTION
      'VALUATION FLOW: issue value/allocation mismatch % / %',
      v_event_value,
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
END;
$$;

ROLLBACK;
