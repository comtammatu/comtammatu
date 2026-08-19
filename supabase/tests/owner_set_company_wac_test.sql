\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
  v_tenant bigint;
  v_owner uuid;
  v_non_owner uuid;
  v_branch bigint;
  v_location bigint;
  v_base_unit bigint;
  v_pack_unit bigint;
  v_ingredient bigint;
  v_fg bigint;
  v_leftover bigint;
  v_origin_id bigint;
  v_account_id bigint;
  v_result jsonb;
  v_qty_before numeric;
  v_qty_after numeric;
  v_movements_before integer;
  v_movements_after integer;
  v_wac numeric;
  v_book numeric;
  v_catalog numeric;
  v_grn_cost numeric;
  v_rejected boolean;
  v_event public.inventory_valuation_events%ROWTYPE;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_key uuid := pg_catalog.gen_random_uuid();
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.owner_set_company_wac(bigint,numeric,text,uuid)'::pg_catalog.regprocedure;
  IF v_definition IS NULL
     OR v_definition !~ 'auth_is_owner'
     OR v_definition !~ 'quantity_delta'
     OR v_definition !~ 'private.project_company_wac'
     OR v_definition !~ 'private.propagate_inventory_origin_reprice'
     OR v_definition !~ 'finished_good_wac_overwrite_forbidden'
     OR v_definition !~ 'raw_material'
     OR v_definition ~ 'confirm_goods_receipt_note'
     OR v_definition ~ 'UPDATE public.stock_movements'
     OR v_definition ~ 'UPDATE public.grn_items'
     OR v_definition ~ 'invoice_reprice'
     OR v_definition ~ 'ingredients.unit_cost =' THEN
    RAISE EXCEPTION
      'ISS-06: owner_set_company_wac must be owner-only append-only Giá vốn restatement';
  END IF;

  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT profile.id
  INTO v_non_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND position.code <> 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id, location.id
  INTO v_branch, v_location
  FROM public.branches AS branch
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.inventory_locations AS candidate
    WHERE candidate.tenant_id = branch.tenant_id
      AND candidate.branch_id = branch.id
      AND candidate.is_active
      AND candidate.location_kind = 'warehouse'
    ORDER BY candidate.id
    LIMIT 1
  ) AS location ON TRUE
  WHERE branch.tenant_id = v_tenant
    AND branch.is_active
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
  ORDER BY branch.id
  LIMIT 1;

  IF v_owner IS NULL
     OR v_non_owner IS NULL
     OR v_branch IS NULL
     OR v_location IS NULL THEN
    RAISE EXCEPTION 'ISS-06: owner/non-owner/branch/location required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES
    (v_tenant, '__iss06_hop_' || v_suffix, 'Hộp'),
    (v_tenant, '__iss06_thung_' || v_suffix, 'Thùng');
  SELECT unit.id INTO v_base_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_tenant AND unit.code = '__iss06_hop_' || v_suffix;
  SELECT unit.id INTO v_pack_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_tenant AND unit.code = '__iss06_thung_' || v_suffix;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active, unit_cost,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__iss06_nl__',
    '__iss06_nl_' || v_suffix,
    'raw_material',
    TRUE,
    999,
    v_pack_unit,
    v_base_unit,
    v_base_unit
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    is_active, sort_order, anchor_unit_id
  ) VALUES
    (v_tenant, v_ingredient, v_base_unit, 1, TRUE, TRUE, 0, NULL),
    (v_tenant, v_ingredient, v_pack_unit, 24, FALSE, TRUE, 1, v_base_unit);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_ingredient, v_location, 10, 0);

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id, branch_id, location_id, ingredient_id, quantity, book_value
  ) VALUES (v_tenant, v_branch, v_location, v_ingredient, 10, 0)
  RETURNING id INTO v_account_id;

  INSERT INTO public.inventory_cost_origins (
    tenant_id, ingredient_id, source_kind, source_id,
    original_quantity, provisional_value, cost_status, effective_at
  ) VALUES (
    v_tenant, v_ingredient, 'opening', -v_ingredient,
    10, 0, 'provisional', pg_catalog.now()
  )
  RETURNING id INTO v_origin_id;

  INSERT INTO public.inventory_origin_balances (
    tenant_id, origin_id, holder_kind, valuation_account_id, quantity, book_value
  ) VALUES (v_tenant, v_origin_id, 'stock_pool', v_account_id, 10, 0);

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__iss06_fg__',
    '__iss06_fg_' || v_suffix,
    'finished_good',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  )
  RETURNING id INTO v_fg;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  ) VALUES (v_tenant, v_fg, v_base_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__iss06_left__',
    '__iss06_lf_' || v_suffix,
    'raw_material',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  )
  RETURNING id INTO v_leftover;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  ) VALUES (v_tenant, v_leftover, v_base_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_leftover, v_location, 4, 0);

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_set_company_wac(
      v_ingredient,
      0,
      'Chuỗi kiểm thử ISS-06 từ chối giá vốn bằng 0.',
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation OR invalid_parameter_value OR others THEN
      IF SQLERRM LIKE '%company_wac_invalid%' THEN
        v_rejected := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-06: unit_cost 0 must be rejected';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_set_company_wac(
      v_ingredient,
      15000,
      'ngắn',
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation OR others THEN
      IF SQLERRM LIKE '%reason_required%' THEN
        v_rejected := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-06: short reason must be rejected';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_set_company_wac(
      v_fg,
      15000,
      'Chuỗi kiểm thử ISS-06 từ chối thành phẩm.',
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation OR others THEN
      IF SQLERRM LIKE '%finished_good_wac_overwrite_forbidden%' THEN
        v_rejected := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-06: finished good must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'branch_manager',
        'position_code', 'branch_manager'
      )
    )::text,
    TRUE
  );

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_set_company_wac(
      v_ingredient,
      15000,
      'Chuỗi kiểm thử ISS-06 từ chối không phải Chủ sở hữu.',
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN insufficient_privilege OR others THEN
      IF SQLERRM LIKE '%forbidden_owner_only%' THEN
        v_rejected := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-06: non-owner must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );

  SELECT stock.current_quantity
  INTO v_qty_before
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.ingredient_id = v_ingredient
    AND stock.location_id = v_location;

  SELECT pg_catalog.count(*)
  INTO v_movements_before
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.ingredient_id = v_ingredient;

  SELECT coalesce(pg_catalog.sum(item.unit_cost), 0)
  INTO v_grn_cost
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.ingredient_id = v_ingredient;

  v_result := public.owner_set_company_wac(
    v_ingredient,
    15000,
    'Chuỗi kiểm thử ISS-06 ghi Giá vốn tồn đầu kỳ.',
    v_key
  );

  IF (v_result ->> 'quantity_delta')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ISS-06: quantity_delta must be 0, got %',
      v_result ->> 'quantity_delta';
  END IF;
  IF (v_result ->> 'on_hand_quantity')::numeric IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'ISS-06: on-hand qty must stay 10, got %',
      v_result ->> 'on_hand_quantity';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.inventory_valuation_events AS event
  WHERE event.id = (v_result ->> 'event_id')::bigint
    AND event.tenant_id = v_tenant;
  IF v_event.event_type IS DISTINCT FROM 'provisional_reprice'
     OR v_event.quantity_delta IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ISS-06: provisional_reprice with quantity_delta 0';
  END IF;

  SELECT stock.current_quantity, stock.avg_unit_cost
  INTO v_qty_after, v_wac
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.ingredient_id = v_ingredient
    AND stock.location_id = v_location;
  IF v_qty_after IS DISTINCT FROM v_qty_before THEN
    RAISE EXCEPTION 'ISS-06: stock qty must be unchanged';
  END IF;
  IF v_wac IS DISTINCT FROM 15000 THEN
    RAISE EXCEPTION 'ISS-06: company WAC must update to 15000, got %', v_wac;
  END IF;

  SELECT account.book_value, account.quantity
  INTO v_book, v_qty_after
  FROM public.inventory_valuation_accounts AS account
  WHERE account.id = v_account_id;
  IF v_qty_after IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'ISS-06: account qty must stay 10';
  END IF;
  IF v_book IS DISTINCT FROM 150000 THEN
    RAISE EXCEPTION 'ISS-06: book_value must equal qty × new WAC (150000), got %',
      v_book;
  END IF;

  SELECT ingredient.unit_cost
  INTO v_catalog
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = v_ingredient;
  IF v_catalog IS DISTINCT FROM 999 THEN
    RAISE EXCEPTION 'ISS-06: catalog Giá tham chiếu must stay unchanged';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_movements_after
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.ingredient_id = v_ingredient;
  IF v_movements_after IS DISTINCT FROM v_movements_before THEN
    RAISE EXCEPTION 'ISS-06: must not insert stock_movements';
  END IF;

  IF coalesce((
    SELECT pg_catalog.sum(item.unit_cost)
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.ingredient_id = v_ingredient
  ), 0) IS DISTINCT FROM v_grn_cost THEN
    RAISE EXCEPTION 'ISS-06: must not edit confirmed GRN lines';
  END IF;

  v_result := public.owner_set_company_wac(
    v_leftover,
    8000,
    'Chuỗi kiểm thử ISS-06 tồn còn lại không có gốc phiếu nhập.',
    pg_catalog.gen_random_uuid()
  );
  IF (v_result ->> 'quantity_delta')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ISS-06: leftover quantity_delta must be 0';
  END IF;
  SELECT stock.current_quantity, stock.avg_unit_cost
  INTO v_qty_after, v_wac
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.ingredient_id = v_leftover
    AND stock.location_id = v_location;
  IF v_qty_after IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'ISS-06: leftover qty must stay 4';
  END IF;
  IF v_wac IS DISTINCT FROM 8000 THEN
    RAISE EXCEPTION 'ISS-06: leftover WAC must update to 8000, got %', v_wac;
  END IF;
END;
$$;

ROLLBACK;
