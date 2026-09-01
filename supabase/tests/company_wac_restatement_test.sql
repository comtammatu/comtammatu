\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
  v_constraint text;
  v_stock public.stock_levels%ROWTYPE;
  v_other public.stock_levels%ROWTYPE;
  v_actor uuid;
  v_entry_unit bigint;
  v_origin_id bigint;
  v_other_origin_id bigint;
  v_account_id bigint;
  v_other_account_id bigint;
  v_balance_id bigint;
  v_movement_id bigint;
  v_unit numeric;
  v_wac_a numeric;
  v_wac_b numeric;
  v_receipt_value numeric;
  v_fg_id bigint;
  v_fg_unit bigint;
  v_loc_a bigint;
  v_loc_b bigint;
  v_branch_a bigint;
  v_branch_b bigint;
  v_fg_origin_a bigint;
  v_fg_origin_b bigint;
  v_fg_account_a bigint;
  v_fg_account_b bigint;
  v_fg_origin_value numeric(20,2);
  v_fg_account_value numeric(20,2);
  v_fg_equalize_value numeric(20,2);
  v_fg_allocated_value numeric(20,2);
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO v_constraint
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conname = 'inventory_valuation_events_event_type_check'
    AND constraint_row.conrelid =
      'public.inventory_valuation_events'::pg_catalog.regclass;
  IF v_constraint !~ 'company_wac_equalize'
     OR v_constraint !~ 'provisional_reprice' THEN
    RAISE EXCEPTION 'COMPANY WAC: event_type check missing restatement types';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.apply_latest_supplier_price_to_grn_line()'::pg_catalog.regprocedure;
  IF v_definition !~ 'grn_receipt'
     OR v_definition ~ 'NEW.unit_cost := 0' THEN
    RAISE EXCEPTION 'COMPANY WAC: GRN must persist operator unit_cost';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.post_stock_movement_valuation()'::pg_catalog.regprocedure;
  IF v_definition !~ 'ingredient_provisional_unit_cost'
     OR v_definition !~ 'project_company_wac'
     OR v_definition !~ 'require_ingredient_cost_for_issue' THEN
    RAISE EXCEPTION 'COMPANY WAC: poster missing provisional/company WAC patches';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS nsp
    ON nsp.oid = procedure.pronamespace
  WHERE nsp.nspname = 'private'
    AND procedure.proname = 'execute_confirm_production_run';
  IF v_definition IS NULL
     OR v_definition ~ 'v_raw_need_purchase \* COALESCE\(v_recipe.raw_unit_cost'
     OR v_definition !~ 'require_ingredient_cost_for_issue' THEN
    RAISE EXCEPTION 'COMPANY WAC: production must cost consumed WAC, not recipe snapshot';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::pg_catalog.regprocedure;
  IF v_definition !~ 'company_wac'
     OR v_definition ~ 'v_cost_rung := ''location_wac''' THEN
    RAISE EXCEPTION 'COMPANY WAC: POS ladder must start at company WAC';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.repair_company_wac_valuation(uuid,boolean)'::pg_catalog.regprocedure;
  IF v_definition !~ 'auth_is_owner'
     OR v_definition ~ 'UPDATE public.stock_movements' THEN
    RAISE EXCEPTION 'COMPANY WAC: repair must be owner-only and append-only';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS nsp
    ON nsp.oid = procedure.pronamespace
  WHERE nsp.nspname = 'private'
    AND procedure.proname = 'ingredient_provisional_unit_cost';
  IF v_definition !~ 'v_kind = ''finished_good'''
     OR v_definition !~ 'source_kind = ''production_output''' THEN
    RAISE EXCEPTION 'COMPANY WAC: FG provisional must skip GRN';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.execute_stock_transfer_receive(bigint,jsonb)'::pg_catalog.regprocedure;
  IF v_definition ~ 'avg_unit_cost = v_new_wac' THEN
    RAISE EXCEPTION 'COMPANY WAC: transfer receive must not overwrite site WAC';
  END IF;

  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.current_quantity > 0
  ORDER BY stock.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY WAC: seeded stock level is required';
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
    RAISE EXCEPTION 'COMPANY WAC: seeded actor and base unit are required';
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
    'grn_receipt',
    -v_stock.id,
    10,
    1000000,
    10,
    1000000,
    'finalized',
    pg_catalog.now() + interval '1 day'
  )
  ON CONFLICT (tenant_id, source_kind, source_id)
  DO UPDATE SET
    original_quantity = 10,
    provisional_value = 1000000,
    finalized_quantity = 10,
    finalized_value = 1000000,
    cost_status = 'finalized',
    effective_at = EXCLUDED.effective_at
  RETURNING id INTO v_origin_id;

  v_unit := private.ingredient_provisional_unit_cost(
    v_stock.tenant_id,
    v_stock.ingredient_id
  );
  IF v_unit IS NULL OR v_unit <> 100000 THEN
    RAISE EXCEPTION
      'COMPANY WAC: expected last invoice unit 100000, got %',
      v_unit;
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
    10,
    1000000
  )
  ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
  DO UPDATE SET quantity = 10, book_value = 1000000
  RETURNING id INTO v_account_id;

  UPDATE public.inventory_origin_balances
  SET quantity = 0,
      book_value = 0
  WHERE tenant_id = v_stock.tenant_id
    AND valuation_account_id = v_account_id
    AND holder_kind = 'stock_pool';

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
    10,
    1000000
  )
  ON CONFLICT (
    tenant_id,
    origin_id,
    valuation_account_id
  ) WHERE holder_kind = 'stock_pool'
  DO UPDATE SET quantity = 10, book_value = 1000000
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
    unit_cost,
    reason,
    created_by
  )
  VALUES (
    v_stock.tenant_id,
    v_stock.branch_id,
    v_stock.location_id,
    v_stock.ingredient_id,
    'grn_receipt',
    2,
    v_entry_unit,
    2,
    0,
    '__company_wac_pending_grn__',
    v_actor
  )
  RETURNING id INTO v_movement_id;

  SELECT event.value_delta
  INTO v_receipt_value
  FROM public.inventory_valuation_events AS event
  WHERE event.stock_movement_id = v_movement_id
    AND event.event_type = 'receipt';
  IF v_receipt_value <> 200000 THEN
    RAISE EXCEPTION
      'COMPANY WAC: pending GRN must book last-invoice provisional, got %',
      v_receipt_value;
  END IF;

  SELECT stock.avg_unit_cost
  INTO v_wac_a
  FROM public.stock_levels AS stock
  WHERE stock.id = v_stock.id;
  IF v_wac_a IS NULL OR v_wac_a = 0 THEN
    RAISE EXCEPTION 'COMPANY WAC: pending GRN collapsed WAC to %', v_wac_a;
  END IF;

  SELECT stock.*
  INTO v_other
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_stock.tenant_id
    AND stock.ingredient_id = v_stock.ingredient_id
    AND stock.id <> v_stock.id
    AND stock.location_id IS DISTINCT FROM v_stock.location_id
  ORDER BY stock.id
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.inventory_valuation_accounts (
      tenant_id,
      branch_id,
      location_id,
      ingredient_id,
      quantity,
      book_value
    )
    VALUES (
      v_other.tenant_id,
      v_other.branch_id,
      v_other.location_id,
      v_other.ingredient_id,
      5,
      100000
    )
    ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
    DO UPDATE SET quantity = 5, book_value = 100000
    RETURNING id INTO v_other_account_id;

    UPDATE public.inventory_origin_balances
    SET quantity = 0,
        book_value = 0
    WHERE tenant_id = v_other.tenant_id
      AND valuation_account_id = v_other_account_id
      AND holder_kind = 'stock_pool';

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
      v_other.tenant_id,
      v_other.ingredient_id,
      'opening',
      -1000000000 - v_other.id,
      5,
      100000,
      5,
      100000,
      'finalized',
      pg_catalog.now()
    )
    ON CONFLICT (tenant_id, source_kind, source_id)
    DO UPDATE SET
      original_quantity = 5,
      provisional_value = 100000,
      finalized_quantity = 5,
      finalized_value = 100000,
      cost_status = 'finalized'
    RETURNING id INTO v_other_origin_id;

    INSERT INTO public.inventory_origin_balances (
      tenant_id,
      origin_id,
      holder_kind,
      valuation_account_id,
      quantity,
      book_value
    )
    VALUES (
      v_other.tenant_id,
      v_other_origin_id,
      'stock_pool',
      v_other_account_id,
      5,
      100000
    )
    ON CONFLICT (
      tenant_id,
      origin_id,
      valuation_account_id
    ) WHERE holder_kind = 'stock_pool'
    DO UPDATE SET quantity = 5, book_value = 100000;

    PERFORM private.project_company_wac(
      v_stock.tenant_id,
      v_stock.ingredient_id
    );

    SELECT stock.avg_unit_cost
    INTO v_wac_a
    FROM public.stock_levels AS stock
    WHERE stock.id = v_stock.id;
    SELECT stock.avg_unit_cost
    INTO v_wac_b
    FROM public.stock_levels AS stock
    WHERE stock.id = v_other.id;
    IF v_wac_a IS DISTINCT FROM v_wac_b THEN
      RAISE EXCEPTION
        'COMPANY WAC: site WAC diverged after equalize % vs %',
        v_wac_a,
        v_wac_b;
    END IF;
  END IF;

  SELECT unit.id
  INTO v_fg_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_stock.tenant_id
  ORDER BY unit.id
  LIMIT 1;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    item_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_stock.tenant_id,
    '__company_wac_fg__',
    '__CWAC-FG-' || v_stock.id::text,
    'finished_good',
    TRUE,
    v_fg_unit,
    v_fg_unit,
    v_fg_unit
  )
  RETURNING id INTO v_fg_id;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (v_stock.tenant_id, v_fg_id, v_fg_unit, 1, TRUE, TRUE);

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
    v_fg_id,
    'grn_receipt',
    -1000000000 - v_fg_id,
    10,
    10000,
    10,
    10000,
    'finalized',
    pg_catalog.now() + interval '2 days'
  )
  RETURNING id INTO v_fg_origin_a;

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
    v_fg_id,
    'production_output',
    -2000000000 - v_fg_id,
    2,
    282946,
    2,
    282946,
    'finalized',
    pg_catalog.now()
  )
  RETURNING id INTO v_fg_origin_b;

  v_unit := private.ingredient_provisional_unit_cost(
    v_stock.tenant_id,
    v_fg_id
  );
  IF v_unit IS NULL OR v_unit <> 141473 THEN
    RAISE EXCEPTION
      'COMPANY WAC: FG provisional must skip GRN, expected 141473 got %',
      v_unit;
  END IF;

  SELECT loc.id, loc.branch_id
  INTO v_loc_a, v_branch_a
  FROM public.inventory_locations AS loc
  WHERE loc.tenant_id = v_stock.tenant_id
    AND loc.is_active
    AND EXISTS (
      SELECT 1
      FROM public.stock_levels AS stock
      WHERE stock.location_id = loc.id
    )
  ORDER BY loc.id
  LIMIT 1;

  SELECT loc.id, loc.branch_id
  INTO v_loc_b, v_branch_b
  FROM public.inventory_locations AS loc
  WHERE loc.tenant_id = v_stock.tenant_id
    AND loc.is_active
    AND loc.id <> v_loc_a
    AND EXISTS (
      SELECT 1
      FROM public.stock_levels AS stock
      WHERE stock.location_id = loc.id
    )
  ORDER BY loc.id
  LIMIT 1;

  IF v_loc_a IS NULL OR v_loc_b IS NULL THEN
    RAISE EXCEPTION 'COMPANY WAC: two active locations are required for FG equalize';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id,
    current_quantity, avg_unit_cost
  )
  VALUES
    (v_stock.tenant_id, v_branch_a, v_loc_a, v_fg_id, 10, 141473),
    (v_stock.tenant_id, v_branch_b, v_loc_b, v_fg_id, 5, 13825);

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id, branch_id, location_id, ingredient_id, quantity, book_value
  )
  VALUES (v_stock.tenant_id, v_branch_a, v_loc_a, v_fg_id, 10, 1414730)
  RETURNING id INTO v_fg_account_a;

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id, branch_id, location_id, ingredient_id, quantity, book_value
  )
  VALUES (v_stock.tenant_id, v_branch_b, v_loc_b, v_fg_id, 5, 69125)
  RETURNING id INTO v_fg_account_b;

  -- The zero-value balance reproduces the negative-WAC clamp that previously
  -- left account value lower than the sum of its source-origin balances.
  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id,
    quantity, book_value
  )
  VALUES
    (
      v_stock.tenant_id, v_fg_origin_a, 'stock_pool',
      v_fg_account_a, 4, 0
    ),
    (
      v_stock.tenant_id, v_fg_origin_b, 'stock_pool',
      v_fg_account_a, 6, 1414730
    ),
    (
      v_stock.tenant_id, v_fg_origin_a, 'stock_pool',
      v_fg_account_b, 5, 69125
    );

  PERFORM private.project_company_wac(v_stock.tenant_id, v_fg_id);

  SELECT account.book_value, coalesce(sum(balance.book_value), 0)
  INTO v_fg_account_value, v_fg_origin_value
  FROM public.inventory_valuation_accounts AS account
  LEFT JOIN public.inventory_origin_balances AS balance
    ON balance.tenant_id = account.tenant_id
   AND balance.valuation_account_id = account.id
   AND balance.holder_kind = 'stock_pool'
  WHERE account.id = v_fg_account_a
  GROUP BY account.book_value;

  IF v_fg_account_value IS DISTINCT FROM v_fg_origin_value THEN
    RAISE EXCEPTION
      'COMPANY WAC: account/origin value diverged after clamp % vs %',
      v_fg_account_value,
      v_fg_origin_value;
  END IF;

  SELECT
    event.value_delta,
    (
      SELECT coalesce(sum(allocation.allocated_value), 0)
      FROM public.inventory_value_allocations AS allocation
      WHERE allocation.tenant_id = event.tenant_id
        AND allocation.valuation_event_id = event.id
    )
  INTO v_fg_equalize_value, v_fg_allocated_value
  FROM public.inventory_valuation_events AS event
  WHERE event.from_account_id = v_fg_account_a
    AND event.event_type = 'company_wac_equalize'
  ORDER BY event.id DESC
  LIMIT 1;

  IF abs(v_fg_equalize_value) IS DISTINCT FROM v_fg_allocated_value THEN
    RAISE EXCEPTION
      'COMPANY WAC: allocation audit does not match actual delta % vs %',
      abs(v_fg_equalize_value),
      v_fg_allocated_value;
  END IF;

  SELECT stock.avg_unit_cost
  INTO v_wac_a
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_stock.tenant_id
    AND stock.ingredient_id = v_fg_id
    AND stock.location_id = v_loc_a;

  SELECT stock.avg_unit_cost
  INTO v_wac_b
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_stock.tenant_id
    AND stock.ingredient_id = v_fg_id
    AND stock.location_id = v_loc_b;

  IF v_wac_a IS DISTINCT FROM v_wac_b THEN
    RAISE EXCEPTION
      'COMPANY WAC: FG site WAC diverged after equalize % vs %',
      v_wac_a,
      v_wac_b;
  END IF;
END;
$$;

ROLLBACK;
