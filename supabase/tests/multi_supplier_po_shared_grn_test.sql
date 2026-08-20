\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_supply_branch bigint;
  v_unit bigint;
  v_ingredient_a bigint;
  v_ingredient_b bigint;
  v_supplier_a bigint;
  v_supplier_b bigint;
  v_result jsonb;
  v_po_id bigint;
  v_grn_id bigint;
  v_grn_count integer;
  v_header_supplier bigint;
  v_line_a bigint;
  v_line_b bigint;
  v_grn_item_a bigint;
  v_grn_item_b bigint;
  v_stock_a numeric;
  v_stock_b numeric;
  v_grn_status text;
  v_po_status text;
  v_failed boolean;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.confirm_goods_receipt_note(bigint,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION 'ADR0043: confirm_goods_receipt_note(bigint,bigint) missing';
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

  SELECT branch.id
  INTO v_supply_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'central_supply'
    AND branch.is_active
    AND EXISTS (
      SELECT 1
      FROM public.inventory_locations AS location
      WHERE location.tenant_id = branch.tenant_id
        AND location.branch_id = branch.id
        AND location.location_kind = 'warehouse'
        AND location.is_active
        AND location.is_default_receive
    )
  ORDER BY branch.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL OR v_supply_branch IS NULL THEN
    RAISE EXCEPTION 'ADR0043: owner and central_supply fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__a43_u_' || v_suffix, 'ADR43 unit')
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    default_fulfill_site_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  )
  VALUES (
    v_tenant, '__a43_nl_a_' || v_suffix, '__A43A-' || v_suffix, 0,
    'raw_material', 'central_supply', TRUE, v_unit, v_unit, v_unit
  )
  RETURNING id INTO v_ingredient_a;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active
  )
  VALUES (v_tenant, v_ingredient_a, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    default_fulfill_site_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  )
  VALUES (
    v_tenant, '__a43_nl_b_' || v_suffix, '__A43B-' || v_suffix, 0,
    'raw_material', 'central_supply', TRUE, v_unit, v_unit, v_unit
  )
  RETURNING id INTO v_ingredient_b;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active
  )
  VALUES (v_tenant, v_ingredient_b, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, '__a43_ncc_a_' || v_suffix, TRUE)
  RETURNING id INTO v_supplier_a;

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, '__a43_ncc_b_' || v_suffix, TRUE)
  RETURNING id INTO v_supplier_b;

  INSERT INTO public.supplier_items (
    tenant_id, supplier_id, ingredient_id, is_active, is_preferred, created_by
  )
  VALUES
    (v_tenant, v_supplier_a, v_ingredient_a, TRUE, TRUE, v_owner),
    (v_tenant, v_supplier_b, v_ingredient_b, TRUE, TRUE, v_owner);

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'branch_id', v_supply_branch
      )
    )::text,
    TRUE
  );

  v_result := public.create_purchase_order(
    NULL,
    NULL,
    v_supply_branch,
    'Two NCC one PO',
    CURRENT_DATE + 1,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_a,
        'quantity', 4,
        'entry_unit_id', v_unit,
        'supplier_id', v_supplier_a
      ),
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_b,
        'quantity', 6,
        'entry_unit_id', v_unit,
        'supplier_id', v_supplier_b
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  IF v_result ->> 'status' <> 'approved'
     OR v_result ->> 'grn_id' IS NULL THEN
    RAISE EXCEPTION 'ADR0043: mixed send must mint one Auto-GRN';
  END IF;
  v_po_id := (v_result ->> 'po_id')::bigint;
  v_grn_id := (v_result ->> 'grn_id')::bigint;

  SELECT purchase_order.supplier_id
  INTO v_header_supplier
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = v_po_id;
  IF v_header_supplier IS NOT NULL THEN
    RAISE EXCEPTION 'ADR0043: mixed PO header supplier must be null';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_grn_count
  FROM public.goods_received_notes AS grn
  WHERE grn.po_id = v_po_id;
  IF v_grn_count <> 1 THEN
    RAISE EXCEPTION 'ADR0043: mixed PO must have exactly one GRN';
  END IF;

  SELECT po_item.id
  INTO v_line_a
  FROM public.purchase_order_items AS po_item
  WHERE po_item.po_id = v_po_id
    AND po_item.supplier_id = v_supplier_a;
  SELECT po_item.id
  INTO v_line_b
  FROM public.purchase_order_items AS po_item
  WHERE po_item.po_id = v_po_id
    AND po_item.supplier_id = v_supplier_b;
  IF v_line_a IS NULL OR v_line_b IS NULL THEN
    RAISE EXCEPTION 'ADR0043: PO lines must carry distinct NCC';
  END IF;

  SELECT item.id
  INTO v_grn_item_a
  FROM public.grn_items AS item
  WHERE item.grn_id = v_grn_id
    AND item.purchase_order_item_id = v_line_a;
  SELECT item.id
  INTO v_grn_item_b
  FROM public.grn_items AS item
  WHERE item.grn_id = v_grn_id
    AND item.purchase_order_item_id = v_line_b;

  PERFORM public.save_goods_receipt_note(
    v_grn_id,
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_id', v_grn_item_a,
        'received_quantity', 4,
        'rejected_quantity', 0,
        'rejection_reason', NULL,
        'rejected_photo_url', NULL,
        'entry_unit_id', v_unit,
        'unit_cost', 1000,
        'unit_cost_unit_id', v_unit
      )
    )
  );

  v_result := public.confirm_goods_receipt_note(v_grn_id, v_supplier_a);
  IF v_result ->> 'status' <> 'draft'
     OR v_result ->> 'po_status' <> 'partially_received' THEN
    RAISE EXCEPTION 'ADR0043: confirm A must leave shared GRN draft: %', v_result;
  END IF;

  SELECT coalesce(stock.current_quantity, 0)
  INTO v_stock_a
  FROM public.stock_levels AS stock
  JOIN public.goods_received_notes AS grn
    ON grn.id = v_grn_id
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = grn.branch_id
    AND stock.location_id = grn.location_id
    AND stock.ingredient_id = v_ingredient_a;
  SELECT coalesce(stock.current_quantity, 0)
  INTO v_stock_b
  FROM public.stock_levels AS stock
  JOIN public.goods_received_notes AS grn
    ON grn.id = v_grn_id
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = grn.branch_id
    AND stock.location_id = grn.location_id
    AND stock.ingredient_id = v_ingredient_b;
  IF v_stock_a IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'ADR0043: confirm A stock expected 4 got %', v_stock_a;
  END IF;
  IF coalesce(v_stock_b, 0) <> 0 THEN
    RAISE EXCEPTION 'ADR0043: confirm A must not stock B, got %', v_stock_b;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.grn_id = v_grn_id
      AND movement.ingredient_id = v_ingredient_b
  ) THEN
    RAISE EXCEPTION 'ADR0043: confirm A must not move B';
  END IF;

  PERFORM public.save_goods_receipt_note(
    v_grn_id,
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_id', v_grn_item_b,
        'received_quantity', 6,
        'rejected_quantity', 0,
        'rejection_reason', NULL,
        'rejected_photo_url', NULL,
        'entry_unit_id', v_unit,
        'unit_cost', 2000,
        'unit_cost_unit_id', v_unit
      )
    )
  );

  v_result := public.confirm_goods_receipt_note(v_grn_id, v_supplier_b);
  IF v_result ->> 'status' <> 'confirmed'
     OR v_result ->> 'po_status' <> 'received' THEN
    RAISE EXCEPTION 'ADR0043: confirm B must close shared GRN: %', v_result;
  END IF;

  SELECT grn.status INTO v_grn_status
  FROM public.goods_received_notes AS grn
  WHERE grn.id = v_grn_id;
  SELECT purchase_order.status INTO v_po_status
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = v_po_id;
  IF v_grn_status <> 'confirmed' OR v_po_status <> 'received' THEN
    RAISE EXCEPTION 'ADR0043: expected confirmed/received got % / %',
      v_grn_status, v_po_status;
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.save_supplier_invoice_draft(
      NULL,
      pg_catalog.jsonb_build_object(
        'supplier_id', v_supplier_a,
        'invoice_kind', 'goods',
        'invoice_date', CURRENT_DATE,
        'due_date', CURRENT_DATE + 7,
        'document_discount_amount', 0,
        'subtotal', 12000,
        'vat_amount', 960,
        'total_amount', 12960,
        'matching_notes', 'A must not bill B'
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'line_key', 'line-b',
          'ingredient_id', v_ingredient_b,
          'description', 'NCC B line',
          'quantity', 6,
          'unit_id', v_unit,
          'unit_price', 2000,
          'gross_line_total', 12960,
          'line_discount', 0,
          'vat_rate', 8,
          'vat_amount', 960,
          'line_total', 12000
        )
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'line_key', 'line-b',
          'grn_id', v_grn_id,
          'po_id', v_po_id,
          'purchase_order_item_id', v_line_b,
          'quantity', 6
        )
      ),
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation THEN
      v_failed := SQLERRM LIKE '%supplier_invoice_receipt_line_mismatch%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'ADR0043: invoice A must not allocate B';
  END IF;
END;
$$;

ROLLBACK;
