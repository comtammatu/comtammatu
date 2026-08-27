\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch bigint;
  v_location bigint;
  v_supplier bigint;
  v_base_unit bigint;
  v_pack_unit bigint;
  v_ingredient bigint;
  v_same_unit_ingredient bigint;
  v_po bigint;
  v_po_line bigint;
  v_grn bigint;
  v_line bigint;
  v_applied numeric;
  v_po_qty numeric;
  v_po_status text;
  v_movement_count integer;
  v_movement_qty numeric;
  v_total numeric;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
BEGIN
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
     OR v_branch IS NULL
     OR v_location IS NULL
     OR v_supplier IS NULL THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: owner/branch/location/supplier required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__grn_base_' || v_suffix,
    'Hộp'
  )
  RETURNING id INTO v_base_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__grn_pack_' || v_suffix,
    'Thùng'
  )
  RETURNING id INTO v_pack_unit;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__grn_pack_loose__',
    '__grn_pl_' || v_suffix,
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
  ) VALUES (v_tenant, v_supplier, v_ingredient, TRUE, v_owner);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_ingredient, v_location, 0, 1000);

  INSERT INTO public.ingredients (
    tenant_id, name, sku, item_kind, is_active,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant,
    '__grn_same_unit__',
    '__grn_su_' || v_suffix,
    'raw_material',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  )
  RETURNING id INTO v_same_unit_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  ) VALUES (v_tenant, v_same_unit_ingredient, v_base_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.supplier_items (
    tenant_id, supplier_id, ingredient_id, is_active, created_by
  ) VALUES (v_tenant, v_supplier, v_same_unit_ingredient, TRUE, v_owner);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_same_unit_ingredient, v_location, 0, 1000);

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

  -- Partial: 10 thùng remaining, receive 9 thùng + 6 hộp = 222 hộp.
  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__GRN-PO-P-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_po, v_ingredient, 10, v_pack_unit, v_supplier
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
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_line,
      'received_quantity', 222,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 1000,
      'unit_cost_unit_id', v_base_unit
    ))
  );
  PERFORM public.confirm_goods_receipt_note(v_grn);

  SELECT item.po_applied_quantity, item.total_cost, po.status
  INTO v_applied, v_total, v_po_status
  FROM public.grn_items AS item
  JOIN public.purchase_orders AS po
    ON po.id = v_po AND po.tenant_id = item.tenant_id
  WHERE item.id = v_line;

  SELECT count(*), max(movement.quantity_change)
  INTO v_movement_count, v_movement_qty
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.grn_id = v_grn
    AND movement.type = 'grn_receipt';

  IF v_applied IS DISTINCT FROM 9.250 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: partial po_applied expected 9.250 got %', v_applied;
  END IF;
  IF v_po_status IS DISTINCT FROM 'partially_received' THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: partial PO status expected partially_received got %', v_po_status;
  END IF;
  IF v_movement_count IS DISTINCT FROM 1 OR v_movement_qty IS DISTINCT FROM 222 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: partial movement expected 1x222 got % x %',
      v_movement_count, v_movement_qty;
  END IF;
  IF v_total IS DISTINCT FROM 222000::numeric THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: partial total_cost expected 222000 got %', v_total;
  END IF;

  PERFORM public.close_purchase_order(
    v_po,
    'Supplier will not ship remainder'
  );
  SELECT po.status INTO v_po_status
  FROM public.purchase_orders AS po
  WHERE po.id = v_po;
  IF v_po_status IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: close remainder expected closed got %', v_po_status;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant
      AND grn.po_id = v_po
      AND grn.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: close remainder left a draft GRN';
  END IF;

  -- Excess: 10 thùng remaining, receive 10 thùng + 6 hộp = 246 hộp.
  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__GRN-PO-E-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_po, v_ingredient, 10, v_pack_unit, v_supplier
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
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_line,
      'received_quantity', 246,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 1000,
      'unit_cost_unit_id', v_base_unit
    ))
  );
  PERFORM public.confirm_goods_receipt_note(v_grn);

  SELECT item.po_applied_quantity, item.total_cost, po.status, po_item.quantity
  INTO v_applied, v_total, v_po_status, v_po_qty
  FROM public.grn_items AS item
  JOIN public.purchase_orders AS po
    ON po.id = v_po AND po.tenant_id = item.tenant_id
  JOIN public.purchase_order_items AS po_item
    ON po_item.id = item.purchase_order_item_id
   AND po_item.tenant_id = item.tenant_id
  WHERE item.id = v_line;

  SELECT count(*), max(movement.quantity_change)
  INTO v_movement_count, v_movement_qty
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.grn_id = v_grn
    AND movement.type = 'grn_receipt';

  IF v_applied IS DISTINCT FROM 10.250 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: excess po_applied expected 10.250 got %', v_applied;
  END IF;
  IF v_po_qty IS DISTINCT FROM 10.250 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: excess PO qty expected 10.250 got %', v_po_qty;
  END IF;
  IF v_po_status IS DISTINCT FROM 'received' THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: excess PO status expected received got %', v_po_status;
  END IF;
  IF v_movement_count IS DISTINCT FROM 1 OR v_movement_qty IS DISTINCT FROM 246 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: excess movement expected 1x246 got % x %',
      v_movement_count, v_movement_qty;
  END IF;
  IF v_total IS DISTINCT FROM 246000::numeric THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: excess total_cost expected 246000 got %', v_total;
  END IF;

  -- Same-unit over-receipt: order 4, receive 6.
  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__GRN-PO-S-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_po, v_same_unit_ingredient, 4, v_base_unit, v_supplier
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
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_line,
      'received_quantity', 6,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 1000,
      'unit_cost_unit_id', v_base_unit
    ))
  );
  PERFORM public.confirm_goods_receipt_note(v_grn);

  SELECT item.po_applied_quantity, item.total_cost, po.status, po_item.quantity
  INTO v_applied, v_total, v_po_status, v_po_qty
  FROM public.grn_items AS item
  JOIN public.purchase_orders AS po
    ON po.id = v_po AND po.tenant_id = item.tenant_id
  JOIN public.purchase_order_items AS po_item
    ON po_item.id = item.purchase_order_item_id
   AND po_item.tenant_id = item.tenant_id
  WHERE item.id = v_line;

  IF v_applied IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: same-unit po_applied expected 6 got %', v_applied;
  END IF;
  IF v_po_qty IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: same-unit PO qty expected 6 got %', v_po_qty;
  END IF;
  IF v_po_status IS DISTINCT FROM 'received' THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: same-unit PO status expected received got %', v_po_status;
  END IF;
  IF v_total IS DISTINCT FROM 6000::numeric THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: same-unit total_cost expected 6000 got %', v_total;
  END IF;

  -- Carton quote + persist loose: 246 hộp at 24000/thùng = 246000, not 246*24000.
  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_branch, v_supplier,
    '__GRN-PO-U-' || v_suffix, 'draft', v_owner
  ) RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id
  ) VALUES (
    v_tenant, v_po, v_ingredient, 10, v_pack_unit, v_supplier
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
    pg_catalog.now(),
    NULL,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_id', v_line,
      'received_quantity', 246,
      'rejected_quantity', 0,
      'rejection_reason', NULL,
      'rejected_photo_url', NULL,
      'entry_unit_id', v_base_unit,
      'unit_cost', 24000,
      'unit_cost_unit_id', v_pack_unit
    ))
  );
  PERFORM public.confirm_goods_receipt_note(v_grn);

  SELECT item.total_cost, po_item.quantity
  INTO v_total, v_po_qty
  FROM public.grn_items AS item
  JOIN public.purchase_order_items AS po_item
    ON po_item.id = item.purchase_order_item_id
   AND po_item.tenant_id = item.tenant_id
  WHERE item.id = v_line;

  IF v_total IS DISTINCT FROM 246000::numeric THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: carton-quoted total expected 246000 got %', v_total;
  END IF;
  IF v_po_qty IS DISTINCT FROM 10.250 THEN
    RAISE EXCEPTION 'GRN RECEIVE BASE: carton-quoted PO qty expected 10.250 got %', v_po_qty;
  END IF;

  PERFORM pg_catalog.set_config('comtammatu.grn_confirm', 'false', TRUE);
  BEGIN
    UPDATE public.purchase_order_items
    SET quantity = quantity + 1
    WHERE id = v_po_line
      AND tenant_id = v_tenant;
    RAISE EXCEPTION 'GRN RECEIVE BASE: direct linked PO quantity increase must fail';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM <> 'linked_grn_purchase_order_lines_immutable' THEN
        RAISE;
      END IF;
  END;
END;
$$;

ROLLBACK;
