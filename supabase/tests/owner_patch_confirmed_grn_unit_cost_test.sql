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
  v_supplier bigint;
  v_other_supplier bigint;
  v_base_unit bigint;
  v_pack_unit bigint;
  v_wrong_unit bigint;
  v_ingredient bigint;
  v_orphan_ingredient bigint;
  v_po bigint;
  v_po_line bigint;
  v_grn bigint;
  v_line bigint;
  v_zero_po bigint;
  v_zero_po_line bigint;
  v_zero_grn bigint;
  v_zero_line bigint;
  v_orphan_po bigint;
  v_orphan_po_line bigint;
  v_orphan_grn bigint;
  v_orphan_line bigint;
  v_suggestion record;
  v_result jsonb;
  v_event public.inventory_valuation_events%ROWTYPE;
  v_receipt_before numeric;
  v_receipt_after numeric;
  v_receipt_count_before integer;
  v_receipt_count_after integer;
  v_rejected boolean;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_key uuid := pg_catalog.gen_random_uuid();
  v_partial_po bigint;
  v_partial_po_line bigint;
  v_partial_grn bigint;
  v_partial_line bigint;
  v_partial_key uuid := pg_catalog.gen_random_uuid();
  v_origin_id bigint;
  v_book_before numeric;
  v_book_after numeric;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.owner_patch_confirmed_grn_unit_cost(bigint,numeric,bigint,text,uuid)'::pg_catalog.regprocedure;
  IF v_definition IS NULL
     OR v_definition !~ 'auth_is_owner'
     OR v_definition !~ 'quantity_delta'
     OR v_definition !~ 'private.grn_line_book_total'
     OR v_definition !~ 'private.project_company_wac'
     OR v_definition !~ 'private.ingredient_company_wac'
     OR v_definition !~ 'coalesce\\(v_origin.finalized_value, 0\\) > 0'
     OR v_definition !~ 'private.propagate_inventory_origin_reprice'
     OR v_definition ~ 'confirm_goods_receipt_note'
     OR v_definition ~ 'UPDATE public.stock_movements'
     OR v_definition ~ 'invoice_reprice'
     OR v_definition ~ 'UPDATE public.stock_levels' THEN
    RAISE EXCEPTION
      'ISS-05: owner_patch must be owner-only append-only GRN price repair';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.suggest_same_supplier_confirmed_grn_unit_cost(bigint,bigint)'::pg_catalog.regprocedure;
  IF v_definition IS NULL
     OR v_definition !~ 'candidate.supplier_id = v_item.supplier_id'
     OR v_definition !~ 'candidate.unit_cost > 0' THEN
    RAISE EXCEPTION 'ISS-05: suggestion must be same-NCC priced confirmed GRN';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.enforce_linked_grn_line_immutability()'::pg_catalog.regprocedure;
  IF v_definition IS NULL
     OR v_definition !~ 'owner_grn_unit_cost_patch' THEN
    RAISE EXCEPTION 'ISS-05: immutability must allow the owner price-patch flag';
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

  SELECT supplier.id
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND coalesce(supplier.is_active, TRUE)
  ORDER BY supplier.id
  LIMIT 1;

  IF v_owner IS NULL
     OR v_non_owner IS NULL
     OR v_branch IS NULL
     OR v_location IS NULL
     OR v_supplier IS NULL THEN
    RAISE EXCEPTION 'ISS-05: owner/non-owner/branch/location/supplier required';
  END IF;

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, '__iss05_ncc_' || v_suffix, TRUE)
  RETURNING id INTO v_other_supplier;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES
    (v_tenant, '__iss05_hop_' || v_suffix, 'Hộp'),
    (v_tenant, '__iss05_thung_' || v_suffix, 'Thùng'),
    (v_tenant, '__iss05_wrong_' || v_suffix, 'Kg');
  SELECT unit.id INTO v_base_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_tenant AND unit.code = '__iss05_hop_' || v_suffix;
  SELECT unit.id INTO v_pack_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_tenant AND unit.code = '__iss05_thung_' || v_suffix;
  SELECT unit.id INTO v_wrong_unit
  FROM public.units AS unit
  WHERE unit.tenant_id = v_tenant AND unit.code = '__iss05_wrong_' || v_suffix;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__iss05_nl__',
    '__iss05_nl_' || v_suffix,
    'raw_material',
    TRUE,
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

  INSERT INTO public.supplier_items (
    tenant_id, supplier_id, ingredient_id, is_active, created_by
  ) VALUES
    (v_tenant, v_supplier, v_ingredient, TRUE, v_owner),
    (v_tenant, v_other_supplier, v_ingredient, TRUE, v_owner);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_ingredient, v_location, 0, 0);

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__iss05_orphan__',
    '__iss05_or_' || v_suffix,
    'raw_material',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  )
  RETURNING id INTO v_orphan_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  ) VALUES (v_tenant, v_orphan_ingredient, v_base_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.supplier_items (
    tenant_id, supplier_id, ingredient_id, is_active, created_by
  ) VALUES (v_tenant, v_supplier, v_orphan_ingredient, TRUE, v_owner);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_orphan_ingredient, v_location, 0, 0);

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

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__ISS05-PO-P-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_po, v_ingredient, 2, v_pack_unit, v_supplier
  ) RETURNING id INTO v_po_line;

  UPDATE public.purchase_orders SET status = 'sent' WHERE id = v_po;

  SELECT grn.id INTO STRICT v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant AND grn.po_id = v_po AND grn.status = 'draft';

  SELECT item.id INTO STRICT v_line
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = v_grn
    AND item.purchase_order_item_id = v_po_line;

  PERFORM public.save_goods_receipt_note(
    v_grn,
    pg_catalog.now() - interval '1 day',
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_line,
      'received_quantity', 1,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_pack_unit,
      'unit_cost', 24000,
      'unit_cost_unit_id', v_pack_unit
    ))
  );
  PERFORM public.confirm_goods_receipt_note(v_grn);

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__ISS05-PO-Z-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_zero_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_zero_po, v_ingredient, 20, v_pack_unit, v_supplier
  ) RETURNING id INTO v_zero_po_line;

  UPDATE public.purchase_orders SET status = 'sent' WHERE id = v_zero_po;

  SELECT grn.id INTO STRICT v_zero_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_zero_po
    AND grn.status = 'draft';

  SELECT item.id INTO STRICT v_zero_line
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = v_zero_grn
    AND item.purchase_order_item_id = v_zero_po_line;

  PERFORM public.save_goods_receipt_note(
    v_zero_grn,
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_zero_line,
      'received_quantity', 246,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 0,
      'unit_cost_unit_id', v_base_unit
    ))
  );

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      received_date = pg_catalog.now(),
      received_by = v_owner,
      location_id = coalesce(location_id, v_location)
  WHERE id = v_zero_grn
    AND tenant_id = v_tenant;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    type,
    quantity_change,
    reason,
    created_by,
    grn_id,
    grn_item_id,
    unit_cost,
    location_id,
    entry_unit_id,
    entry_quantity
  )
  VALUES (
    v_tenant,
    v_branch,
    v_ingredient,
    'grn_receipt',
    246,
    'ISS-05 zero GRN ' || v_suffix,
    v_owner,
    v_zero_grn,
    v_zero_line,
    0,
    v_location,
    v_base_unit,
    246
  );

  SELECT suggestion.unit_cost, suggestion.unit_cost_unit_id
  INTO v_suggestion
  FROM private.suggest_same_supplier_confirmed_grn_unit_cost(
    v_tenant,
    v_zero_line
  ) AS suggestion;

  IF v_suggestion.unit_cost IS DISTINCT FROM 24000
     OR v_suggestion.unit_cost_unit_id IS DISTINCT FROM v_pack_unit THEN
    RAISE EXCEPTION
      'ISS-05: same-NCC suggestion expected 24000/pack, got % / %',
      v_suggestion.unit_cost,
      v_suggestion.unit_cost_unit_id;
  END IF;

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__ISS05-PO-O-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_orphan_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_orphan_po, v_orphan_ingredient, 1, v_base_unit, v_supplier
  ) RETURNING id INTO v_orphan_po_line;

  UPDATE public.purchase_orders SET status = 'sent' WHERE id = v_orphan_po;

  SELECT grn.id INTO STRICT v_orphan_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_orphan_po
    AND grn.status = 'draft';

  SELECT item.id INTO STRICT v_orphan_line
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = v_orphan_grn
    AND item.purchase_order_item_id = v_orphan_po_line;

  PERFORM public.save_goods_receipt_note(
    v_orphan_grn,
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_orphan_line,
      'received_quantity', 1,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 0,
      'unit_cost_unit_id', v_base_unit
    ))
  );

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      received_date = pg_catalog.now(),
      received_by = v_owner,
      location_id = coalesce(location_id, v_location)
  WHERE id = v_orphan_grn
    AND tenant_id = v_tenant;

  IF EXISTS (
    SELECT 1
    FROM private.suggest_same_supplier_confirmed_grn_unit_cost(
      v_tenant,
      v_orphan_line
    )
  ) THEN
    RAISE EXCEPTION 'ISS-05: suggestion must be empty when no same-NCC priced GRN';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(movement.quantity_change), 0),
    pg_catalog.count(*)
  INTO v_receipt_before, v_receipt_count_before
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.grn_id = v_zero_grn
    AND movement.type = 'grn_receipt';

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_patch_confirmed_grn_unit_cost(
      v_zero_line,
      0,
      v_pack_unit,
      'Chuỗi kiểm thử ISS-05 từ chối đơn giá 0.',
      v_key
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-05: unit_cost 0 must be rejected';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_patch_confirmed_grn_unit_cost(
      v_zero_line,
      24000,
      v_wrong_unit,
      'Chuỗi kiểm thử ISS-05 từ chối đơn vị sai.',
      v_key
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-05: wrong unit must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_non_owner::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant
      )
    )::text,
    TRUE
  );

  v_rejected := FALSE;
  BEGIN
    PERFORM public.owner_patch_confirmed_grn_unit_cost(
      v_zero_line,
      24000,
      v_pack_unit,
      'Chuỗi kiểm thử ISS-05 từ chối không phải Owner.',
      v_key
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISS-05: non-owner must be rejected';
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

  v_result := public.owner_patch_confirmed_grn_unit_cost(
    v_zero_line,
    24000,
    v_pack_unit,
    'Chuỗi kiểm thử ISS-05 xác nhận đơn giá cùng NCC.',
    v_key
  );

  IF (v_result ->> 'quantity_delta')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ISS-05: quantity_delta must be 0, got %',
      v_result ->> 'quantity_delta';
  END IF;
  IF (v_result ->> 'book_total')::numeric IS DISTINCT FROM 246000 THEN
    RAISE EXCEPTION
      'ISS-05: book total must use price unit (246000), got %',
      v_result ->> 'book_total';
  END IF;
  IF (v_result ->> 'total_cost')::numeric IS DISTINCT FROM 246000 THEN
    RAISE EXCEPTION 'ISS-05: persisted total_cost expected 246000, got %',
      v_result ->> 'total_cost';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(movement.quantity_change), 0),
    pg_catalog.count(*)
  INTO v_receipt_after, v_receipt_count_after
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.grn_id = v_zero_grn
    AND movement.type = 'grn_receipt';

  IF v_receipt_after IS DISTINCT FROM v_receipt_before
     OR v_receipt_count_after IS DISTINCT FROM v_receipt_count_before THEN
    RAISE EXCEPTION
      'ISS-05: extra grn_receipt qty % x % -> % x %',
      v_receipt_count_before,
      v_receipt_before,
      v_receipt_count_after,
      v_receipt_after;
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.inventory_valuation_events AS event
  WHERE event.id = (v_result ->> 'event_id')::bigint;

  IF v_event.quantity_delta IS DISTINCT FROM 0
     OR v_event.event_type IS DISTINCT FROM 'provisional_reprice' THEN
    RAISE EXCEPTION
      'ISS-05: restatement must be provisional_reprice with quantity_delta 0';
  END IF;

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__ISS05-PO-PV-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_partial_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_partial_po, v_ingredient, 20, v_pack_unit, v_supplier
  ) RETURNING id INTO v_partial_po_line;

  UPDATE public.purchase_orders SET status = 'sent' WHERE id = v_partial_po;

  SELECT grn.id INTO STRICT v_partial_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_partial_po
    AND grn.status = 'draft';

  SELECT item.id INTO STRICT v_partial_line
  FROM public.grn_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.grn_id = v_partial_grn
    AND item.purchase_order_item_id = v_partial_po_line;

  PERFORM public.save_goods_receipt_note(
    v_partial_grn,
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_partial_line,
      'received_quantity', 246,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 0,
      'unit_cost_unit_id', v_base_unit
    ))
  );

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      received_date = pg_catalog.now(),
      received_by = v_owner,
      location_id = coalesce(location_id, v_location)
  WHERE id = v_partial_grn
    AND tenant_id = v_tenant;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    type,
    quantity_change,
    reason,
    created_by,
    grn_id,
    grn_item_id,
    unit_cost,
    location_id,
    entry_unit_id,
    entry_quantity
  )
  VALUES (
    v_tenant,
    v_branch,
    v_ingredient,
    'grn_receipt',
    246,
    'ISS-05 partial GRN ' || v_suffix,
    v_owner,
    v_partial_grn,
    v_partial_line,
    0,
    v_location,
    v_base_unit,
    246
  );

  SELECT origin.id
  INTO STRICT v_origin_id
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant
    AND origin.ingredient_id = v_ingredient
    AND origin.source_kind = 'grn_receipt'
    AND (
      origin.grn_item_id = v_partial_line
      OR (
        origin.grn_item_id IS NULL
        AND origin.source_id IN (
          SELECT movement.id
          FROM public.stock_movements AS movement
          WHERE movement.tenant_id = v_tenant
            AND movement.grn_id = v_partial_grn
            AND movement.ingredient_id = v_ingredient
            AND movement.type = 'grn_receipt'
        )
      )
    );

  UPDATE public.inventory_cost_origins
  SET cost_status = 'partial',
      provisional_value = 0,
      finalized_value = 246000
  WHERE id = v_origin_id
    AND tenant_id = v_tenant;

  UPDATE public.inventory_origin_balances
  SET book_value = 246000
  WHERE tenant_id = v_tenant
    AND origin_id = v_origin_id
    AND holder_kind = 'stock_pool'
    AND quantity > 0;

  SELECT coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_book_before
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_tenant
    AND balance.origin_id = v_origin_id;

  v_result := public.owner_patch_confirmed_grn_unit_cost(
    v_partial_line,
    24000,
    v_pack_unit,
    'Chuỗi kiểm thử ISS-05 đơn giá trùng HĐ NCC đã ghi.',
    v_partial_key
  );

  IF (v_result ->> 'value_delta')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'ISS-05: partial booked origin must be value_delta 0, got %',
      v_result ->> 'value_delta';
  END IF;
  IF v_result ->> 'event_id' IS NOT NULL THEN
    RAISE EXCEPTION
      'ISS-05: matching booked value must not insert restatement';
  END IF;
  IF (v_result ->> 'book_total')::numeric IS DISTINCT FROM 246000 THEN
    RAISE EXCEPTION
      'ISS-05: partial document book total expected 246000, got %',
      v_result ->> 'book_total';
  END IF;

  SELECT coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_book_after
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_tenant
    AND balance.origin_id = v_origin_id;
  IF v_book_after IS DISTINCT FROM v_book_before THEN
    RAISE EXCEPTION 'ISS-05: matching booked value must not change origin book';
  END IF;
END;
$$;

ROLLBACK;
