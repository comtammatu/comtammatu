BEGIN;

INSERT INTO public.units (tenant_id, code, name)
SELECT id, 'goi', 'gói'
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
  v_goi_unit_id bigint;
  v_ly_unit_id bigint;
  v_menu_item_id bigint;
BEGIN
  SELECT count(*), min(id) INTO v_tenant_count, v_tenant_id
  FROM public.tenants;

  IF v_tenant_count <> 1 THEN
    RAISE EXCEPTION 'tra_lai_consumes_tra_da_requires_single_tenant';
  END IF;

  SELECT id INTO v_category_id
  FROM public.ingredient_categories
  WHERE tenant_id = v_tenant_id
    AND name = 'Nguyên liệu';

  IF v_category_id IS NULL THEN
    INSERT INTO public.ingredient_categories (tenant_id, name, sort_order)
    VALUES (v_tenant_id, 'Nguyên liệu', 20)
    RETURNING id INTO v_category_id;
  END IF;

  UPDATE public.ingredient_categories
  SET is_active = true,
      updated_at = now()
  WHERE id = v_category_id
    AND tenant_id = v_tenant_id;

  SELECT id INTO v_goi_unit_id
  FROM public.units
  WHERE tenant_id = v_tenant_id
    AND code = 'goi'
    AND is_active;

  SELECT id INTO v_ly_unit_id
  FROM public.units
  WHERE tenant_id = v_tenant_id
    AND code = 'ly'
    AND is_active;

  IF v_goi_unit_id IS NULL OR v_ly_unit_id IS NULL THEN
    RAISE EXCEPTION 'tra_lai_consumes_tra_da_unit_missing';
  END IF;

  SELECT id INTO v_ingredient_id
  FROM public.ingredients
  WHERE tenant_id = v_tenant_id
    AND (sku = 'TR01' OR name = 'Trà Lài Thu Thảo')
  ORDER BY CASE WHEN sku = 'TR01' THEN 0 ELSE 1 END, id
  LIMIT 1;

  IF v_ingredient_id IS NULL THEN
    INSERT INTO public.ingredients (
      tenant_id, name, sku, category_id, category, unit,
      purchase_unit, measure_unit, purchase_to_measure_factor,
      item_kind, storage_type, min_stock_level, is_active
    )
    VALUES (
      v_tenant_id, 'Trà Lài Thu Thảo', 'TR01', v_category_id, 'Nguyên liệu', 'ly',
      'goi', 'ly', 500,
      'raw_material', 'ambient', 0, true
    )
    RETURNING id INTO v_ingredient_id;
  ELSE
    UPDATE public.ingredients
    SET name = 'Trà Lài Thu Thảo',
        sku = 'TR01',
        category_id = v_category_id,
        category = 'Nguyên liệu',
        unit = 'ly',
        purchase_unit = 'goi',
        measure_unit = 'ly',
        purchase_to_measure_factor = 500,
        item_kind = 'raw_material',
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
    (v_tenant_id, v_ingredient_id, v_goi_unit_id, 1, true, true, true, true, 0),
    (v_tenant_id, v_ingredient_id, v_ly_unit_id, 1.0 / 500, false, false, true, true, 1);

  SELECT id INTO v_menu_item_id
  FROM public.menu_items
  WHERE tenant_id = v_tenant_id
    AND name = 'Trà Đá'
    AND is_active;

  IF v_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'tra_lai_consumes_tra_da_menu_missing';
  END IF;

  DELETE FROM public.recipes
  WHERE tenant_id = v_tenant_id
    AND menu_item_id = v_menu_item_id;

  INSERT INTO public.recipes (
    tenant_id, menu_item_id, ingredient_id, quantity, unit, entry_unit_id, yield_factor
  )
  VALUES (
    v_tenant_id, v_menu_item_id, v_ingredient_id, 1, 'ly', v_ly_unit_id, 1
  )
  ON CONFLICT (menu_item_id, ingredient_id, tenant_id) DO UPDATE
  SET quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id,
      yield_factor = EXCLUDED.yield_factor,
      note = NULL;

  PERFORM public.refresh_branch_menu_stock_capacity(v_tenant_id, b.id, v_menu_item_id)
  FROM public.branches b
  WHERE b.tenant_id = v_tenant_id
    AND b.is_active;
END $$;

COMMIT;
