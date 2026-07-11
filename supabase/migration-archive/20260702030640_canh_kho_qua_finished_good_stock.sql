BEGIN;

INSERT INTO public.units (tenant_id, code, name)
SELECT id, 'trai', 'trái'
FROM public.tenants
ON CONFLICT (code, tenant_id) DO UPDATE
SET name = EXCLUDED.name,
    is_active = true,
    updated_at = now();

DO $$
DECLARE
  v_tenant_id bigint;
  v_tenant_count integer;
  v_category_id bigint;
  v_ingredient_id bigint;
  v_trai_unit_id bigint;
  v_piece_unit_id bigint;
  v_branch_id bigint;
  v_location_id bigint;
  v_menu_item_id bigint;
BEGIN
  SELECT count(*), min(id) INTO v_tenant_count, v_tenant_id
  FROM public.tenants;

  IF v_tenant_count <> 1 THEN
    RAISE EXCEPTION 'canh_kho_qua_finished_good_stock_requires_single_tenant';
  END IF;

  SELECT id INTO v_category_id
  FROM public.ingredient_categories
  WHERE tenant_id = v_tenant_id
    AND name = 'Thành Phẩm';

  IF v_category_id IS NULL THEN
    INSERT INTO public.ingredient_categories (tenant_id, name, sort_order)
    VALUES (v_tenant_id, 'Thành Phẩm', 10)
    RETURNING id INTO v_category_id;
  END IF;

  UPDATE public.ingredient_categories
  SET is_active = true,
      sort_order = 10,
      updated_at = now()
  WHERE id = v_category_id
    AND tenant_id = v_tenant_id;

  SELECT id INTO v_trai_unit_id
  FROM public.units
  WHERE tenant_id = v_tenant_id
    AND code = 'trai'
    AND is_active;

  SELECT id INTO v_piece_unit_id
  FROM public.units
  WHERE tenant_id = v_tenant_id
    AND code = 'piece'
    AND is_active;

  IF v_trai_unit_id IS NULL OR v_piece_unit_id IS NULL THEN
    RAISE EXCEPTION 'canh_kho_qua_finished_good_stock_unit_missing';
  END IF;

  SELECT id INTO v_ingredient_id
  FROM public.ingredients
  WHERE tenant_id = v_tenant_id
    AND (
      sku = 'TP-CANH-KHO-QUA'
      OR lower(name) IN (
        lower('Canh Khổ Qua - Thành Phẩm'),
        lower('Canh Khổ Qua')
      )
    )
  ORDER BY CASE
      WHEN sku = 'TP-CANH-KHO-QUA' THEN 0
      WHEN name = 'Canh Khổ Qua - Thành Phẩm' THEN 1
      ELSE 2
    END,
    id
  LIMIT 1;

  IF v_ingredient_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit,
      purchase_unit, measure_unit, purchase_to_measure_factor,
      item_kind, storage_type, min_stock_level, is_active
    )
    VALUES (
      v_tenant_id, 'Canh Khổ Qua - Thành Phẩm', 'TP-CANH-KHO-QUA',
      v_category_id, 'Thành Phẩm', 'piece',
      'trai', 'piece', 2,
      'finished_good', 'ambient', 0, true
    )
    RETURNING id INTO v_ingredient_id;
  ELSE
    UPDATE public.ingredients
    SET name = 'Canh Khổ Qua - Thành Phẩm',
        sku = 'TP-CANH-KHO-QUA',
        category_id = v_category_id,
        category = 'Thành Phẩm',
        unit = 'piece',
        purchase_unit = 'trai',
        measure_unit = 'piece',
        purchase_to_measure_factor = 2,
        item_kind = 'finished_good',
        storage_type = 'ambient',
        min_stock_level = 0,
        is_active = true,
        updated_at = now()
    WHERE id = v_ingredient_id
      AND tenant_id = v_tenant_id;
  END IF;

  DELETE FROM public.ingredient_units
  WHERE tenant_id = v_tenant_id
    AND ingredient_id = v_ingredient_id;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
    allow_purchase, allow_issue, allow_production, sort_order
  )
  VALUES
    (v_tenant_id, v_ingredient_id, v_trai_unit_id, 1, true, true, true, true, 0),
    (v_tenant_id, v_ingredient_id, v_piece_unit_id, 1.0 / 2, false, false, true, true, 1);

  SELECT b.id, il.id INTO v_branch_id, v_location_id
  FROM public.branches b
  JOIN public.inventory_locations il
    ON il.tenant_id = b.tenant_id
   AND il.branch_id = b.id
   AND il.code = 'main_warehouse'
   AND il.is_active
  WHERE b.tenant_id = v_tenant_id
    AND b.code = 'PH'
    AND b.is_active
  LIMIT 1;

  IF v_branch_id IS NULL OR v_location_id IS NULL THEN
    RAISE EXCEPTION 'canh_kho_qua_finished_good_stock_ph_location_missing';
  END IF;

  DELETE FROM public.stock_levels
  WHERE tenant_id = v_tenant_id
    AND ingredient_id = v_ingredient_id;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, current_quantity,
    last_counted_at, updated_at, location_id
  )
  VALUES (
    v_tenant_id, v_branch_id, v_ingredient_id, 100,
    now(), now(), v_location_id
  )
  ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id) DO UPDATE
  SET current_quantity = EXCLUDED.current_quantity,
      last_counted_at = EXCLUDED.last_counted_at,
      updated_at = EXCLUDED.updated_at;

  SELECT id INTO v_menu_item_id
  FROM public.menu_items
  WHERE tenant_id = v_tenant_id
    AND name = 'Canh Khổ Qua'
    AND is_active
  ORDER BY id
  LIMIT 1;

  IF v_menu_item_id IS NOT NULL THEN
    INSERT INTO public.recipes (
      tenant_id, menu_item_id, ingredient_id, quantity, unit, entry_unit_id, yield_factor
    )
    VALUES (
      v_tenant_id, v_menu_item_id, v_ingredient_id, 1, 'piece', v_piece_unit_id, 1
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        unit = EXCLUDED.unit,
        entry_unit_id = EXCLUDED.entry_unit_id,
        yield_factor = EXCLUDED.yield_factor,
        note = NULL;
  END IF;

  PERFORM public.refresh_branch_menu_stock_capacity(v_tenant_id, b.id, v_menu_item_id, v_ingredient_id)
  FROM public.branches b
  WHERE b.tenant_id = v_tenant_id
    AND b.is_active;
END $$;

COMMIT;
