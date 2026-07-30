\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_stock public.stock_levels%ROWTYPE;
  v_account_id bigint;
  v_origin_id bigint;
  v_balance_id bigint;
  v_issue_event_id bigint;
  v_reprice_event_id bigint;
  v_inventory_delta numeric;
  v_food_cost_delta numeric;
  v_total_delta numeric;
  v_book_value numeric;
BEGIN
  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE VALUATION: seeded stock level is required';
  END IF;

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
    60,
    6000000
  )
  ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
  DO UPDATE SET quantity = 60, book_value = 6000000
  RETURNING id INTO v_account_id;

  INSERT INTO public.inventory_cost_origins (
    tenant_id,
    ingredient_id,
    source_kind,
    source_id,
    original_quantity,
    provisional_value,
    cost_status,
    effective_at
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'grn_receipt',
    -v_stock.id,
    100,
    10000000,
    'provisional',
    pg_catalog.now()
  )
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
    60,
    6000000
  )
  RETURNING id INTO v_balance_id;

  INSERT INTO public.inventory_valuation_events (
    tenant_id,
    ingredient_id,
    event_type,
    terminal_bucket,
    quantity_delta,
    value_delta,
    effective_at,
    posting_year,
    posting_month,
    idempotency_key
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'issue',
    'food_cost',
    -40,
    -4000000,
    pg_catalog.now(),
    extract(YEAR FROM pg_catalog.now())::integer,
    extract(MONTH FROM pg_catalog.now())::integer,
    pg_catalog.gen_random_uuid()
  )
  RETURNING id INTO v_issue_event_id;

  INSERT INTO public.inventory_value_allocations (
    tenant_id,
    valuation_event_id,
    source_origin_id,
    allocation_bucket,
    allocated_quantity,
    allocated_value,
    allocation_fraction
  )
  VALUES (
    v_stock.tenant_id,
    v_issue_event_id,
    v_origin_id,
    'food_cost',
    40,
    4000000,
    0.4
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
    idempotency_key
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.ingredient_id,
    'invoice_reprice',
    0,
    1000000,
    pg_catalog.now(),
    extract(YEAR FROM pg_catalog.now())::integer,
    extract(MONTH FROM pg_catalog.now())::integer,
    pg_catalog.gen_random_uuid()
  )
  RETURNING id INTO v_reprice_event_id;

  PERFORM private.propagate_inventory_origin_reprice(
    v_stock.tenant_id,
    v_reprice_event_id,
    v_origin_id,
    1000000
  );

  SELECT coalesce(pg_catalog.sum(allocation.allocated_value), 0)
  INTO v_inventory_delta
  FROM public.inventory_value_allocations AS allocation
  WHERE allocation.valuation_event_id = v_reprice_event_id
    AND allocation.allocation_bucket = 'inventory';
  SELECT coalesce(pg_catalog.sum(allocation.allocated_value), 0)
  INTO v_food_cost_delta
  FROM public.inventory_value_allocations AS allocation
  WHERE allocation.valuation_event_id = v_reprice_event_id
    AND allocation.allocation_bucket = 'food_cost';
  SELECT coalesce(pg_catalog.sum(allocation.allocated_value), 0)
  INTO v_total_delta
  FROM public.inventory_value_allocations AS allocation
  WHERE allocation.valuation_event_id = v_reprice_event_id;
  SELECT account.book_value
  INTO v_book_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;

  IF v_inventory_delta <> 600000
     OR v_food_cost_delta <> 400000
     OR v_total_delta <> 1000000
     OR v_book_value <> 6600000 THEN
    RAISE EXCEPTION
      'INVOICE VALUATION: expected 600000/400000/1000000/6600000, got %/%/%/%',
      v_inventory_delta,
      v_food_cost_delta,
      v_total_delta,
      v_book_value;
  END IF;
END;
$$;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.settle_supplier_invoice_valuation(bigint,uuid)'::pg_catalog.regprocedure;

  IF v_definition !~ 'legacy_purchase_price_variance'
     OR v_definition !~ 'allocated_document_discount'
     OR v_definition !~ 'settled_current_period'
     OR v_definition !~ 'inv_to_base_for_tenant' THEN
    RAISE EXCEPTION 'INVOICE VALUATION: settlement contract is incomplete';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.post_supplier_credit_valuation()'::pg_catalog.regprocedure;
  IF v_definition !~ 'credit_reprice'
     OR v_definition !~ 'supplier_return'
     OR v_definition !~ 'propagate_inventory_origin_reprice'
     OR v_definition !~ 'v_net_inventory_credit'
     OR v_definition !~ 'v_invoice_inventory_basis / v_invoice.total_amount'
  THEN
    RAISE EXCEPTION 'INVOICE VALUATION: supplier credit contract is incomplete';
  END IF;
END;
$$;

ROLLBACK;
