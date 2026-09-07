\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_stock public.stock_levels%ROWTYPE;
  v_actor uuid;
  v_entry_unit bigint;
  v_account_id bigint;
  v_origin_id bigint;
  v_movement_id bigint;
  v_definition text;
  v_account_qty numeric;
  v_origin_qty numeric;
  v_account_value numeric;
  v_origin_value numeric;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS nsp
    ON nsp.oid = procedure.pronamespace
  WHERE nsp.nspname = 'private'
    AND procedure.proname = 'post_stock_movement_valuation';
  IF v_definition IS NULL
     OR v_definition !~ 'absorb_origin_allocation_residual' THEN
    RAISE EXCEPTION
      'ORIGIN ALLOCATION: poster must absorb rounding residual';
  END IF;
  IF to_regprocedure(
    'private.absorb_origin_allocation_residual(bigint,bigint,text,bigint,bigint,bigint,bigint,text,numeric,numeric)'
  ) IS NULL THEN
    RAISE EXCEPTION 'ORIGIN ALLOCATION: residual helper missing';
  END IF;

  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.current_quantity >= 0
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORIGIN ALLOCATION: seeded stock level is required';
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
    RAISE EXCEPTION 'ORIGIN ALLOCATION: seeded actor and base unit are required';
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
    33800,
    489535.26
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET status = 'active',
      cutoff_at = EXCLUDED.cutoff_at;

  UPDATE public.stock_levels
  SET current_quantity = 33800,
      avg_unit_cost = 14.48329179
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
    33800,
    489535.26
  )
  ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
  DO UPDATE SET quantity = 33800, book_value = 489535.26
  RETURNING id INTO v_account_id;

  DELETE FROM public.inventory_origin_balances
  WHERE valuation_account_id = v_account_id
    AND holder_kind = 'stock_pool';

  v_origin_id := private.create_inventory_cost_origin(
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'opening',
    (SELECT coalesce(pg_catalog.max(origin.source_id), 0)
       FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_stock.tenant_id) + 101,
    NULL,
    24362.980,
    460344.86,
    pg_catalog.now() - interval '1 day',
    'provisional'
  );
  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (
    v_stock.tenant_id, v_origin_id, 'stock_pool', v_account_id, 24362.980, 460344.86
  );

  v_origin_id := private.create_inventory_cost_origin(
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'stocktake_found',
    (SELECT coalesce(pg_catalog.max(origin.source_id), 0)
       FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_stock.tenant_id) + 102,
    NULL,
    3676.867,
    28009.65,
    pg_catalog.now() - interval '1 day',
    'provisional'
  );
  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (
    v_stock.tenant_id, v_origin_id, 'stock_pool', v_account_id, 3676.867, 28009.65
  );

  v_origin_id := private.create_inventory_cost_origin(
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'inventory_shortfall',
    (SELECT coalesce(pg_catalog.max(origin.source_id), 0)
       FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_stock.tenant_id) + 103,
    NULL,
    1402.850,
    1180.75,
    pg_catalog.now() - interval '1 day',
    'provisional'
  );
  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (
    v_stock.tenant_id, v_origin_id, 'stock_pool', v_account_id, 1402.850, 1180.75
  );

  v_origin_id := private.create_inventory_cost_origin(
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'transfer_shortfall',
    (SELECT coalesce(pg_catalog.max(origin.source_id), 0)
       FROM public.inventory_cost_origins AS origin
      WHERE origin.tenant_id = v_stock.tenant_id) + 104,
    NULL,
    4357.303,
    0,
    pg_catalog.now() - interval '1 day',
    'provisional'
  );
  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (
    v_stock.tenant_id, v_origin_id, 'stock_pool', v_account_id, 4357.303, 0.00
  );

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
    -600,
    v_entry_unit,
    -600,
    14.48,
    '__origin_allocation_residual_600__',
    v_actor
  )
  RETURNING id INTO v_movement_id;

  SELECT account.quantity, account.book_value
  INTO v_account_qty, v_account_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;

  SELECT
    coalesce(pg_catalog.sum(balance.quantity), 0),
    coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_origin_qty, v_origin_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.valuation_account_id = v_account_id
    AND balance.holder_kind = 'stock_pool';

  IF v_account_qty <> 33200 THEN
    RAISE EXCEPTION
      'ORIGIN ALLOCATION: expected remaining qty 33200, got %',
      v_account_qty;
  END IF;
  IF v_origin_qty <> v_account_qty OR v_origin_value <> v_account_value THEN
    RAISE EXCEPTION
      'ORIGIN ALLOCATION: account/origin postcondition failed % / % vs % / %',
      v_account_qty,
      v_account_value,
      v_origin_qty,
      v_origin_value;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_valuation_events AS event
    WHERE event.stock_movement_id = v_movement_id
      AND event.quantity_delta = -600
  ) THEN
    RAISE EXCEPTION 'ORIGIN ALLOCATION: consumption event missing';
  END IF;
END;
$$;

ROLLBACK;
