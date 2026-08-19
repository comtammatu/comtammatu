\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_nuoc bigint;
  v_cup bigint;
  v_cai bigint;
  v_menu bigint;
  v_other bigint;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_cup_lines integer;
  v_other_lines integer;
  v_live_cups integer;
BEGIN
  SELECT tenant.id
  INTO v_tenant
  FROM public.tenants AS tenant
  ORDER BY tenant.id
  LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'DRINK CUP: tenant required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name, is_active)
  VALUES (v_tenant, 'cái', 'cái', TRUE)
  ON CONFLICT (code, tenant_id) DO UPDATE
  SET is_active = TRUE
  RETURNING id INTO v_cai;
  IF v_cai IS NULL THEN
    SELECT unit.id
    INTO v_cai
    FROM public.units AS unit
    WHERE unit.tenant_id = v_tenant
      AND unit.code = 'cái'
    LIMIT 1;
  END IF;
  IF v_cai IS NULL THEN
    RAISE EXCEPTION 'DRINK CUP: cái unit required';
  END IF;

  INSERT INTO public.menu_categories (
    tenant_id,
    name,
    type,
    sort_order,
    is_active
  )
  VALUES (
    v_tenant,
    'Nước ' || v_suffix,
    'drink',
    990,
    true
  )
  RETURNING id INTO v_nuoc;

  INSERT INTO public.menu_items (
    tenant_id,
    category_id,
    name,
    base_price,
    vat_rate,
    is_active
  )
  VALUES (
    v_tenant,
    v_nuoc,
    'Coca Cola ' || v_suffix,
    10000,
    10,
    true
  )
  RETURNING id INTO v_menu;

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
    v_tenant,
    'Ly nhựa trơn PP 95 - 650ml ' || v_suffix,
    'QA-CUP-' || v_suffix,
    'raw_material',
    true,
    v_cai,
    v_cai,
    v_cai
  )
  RETURNING id INTO v_cup;

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
    v_tenant,
    'DRINK CUP other ' || v_suffix,
    'QA-CUP-OTHER-' || v_suffix,
    'raw_material',
    true,
    v_cai,
    v_cai,
    v_cai
  )
  RETURNING id INTO v_other;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES
    (v_tenant, v_cup, v_cai, 1, true, true),
    (v_tenant, v_other, v_cai, 1, true, true);

  INSERT INTO public.recipes (
    tenant_id,
    menu_item_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    yield_factor
  )
  VALUES (
    v_tenant,
    v_menu,
    v_other,
    1,
    v_cai,
    1
  );

  INSERT INTO public.recipes (
    tenant_id,
    menu_item_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    yield_factor
  )
  VALUES (
    v_tenant,
    v_menu,
    v_cup,
    1,
    v_cai,
    1
  )
  ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    entry_unit_id = EXCLUDED.entry_unit_id,
    yield_factor = EXCLUDED.yield_factor;

  INSERT INTO public.recipes (
    tenant_id,
    menu_item_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    yield_factor
  )
  VALUES (
    v_tenant,
    v_menu,
    v_cup,
    1,
    v_cai,
    1
  )
  ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    entry_unit_id = EXCLUDED.entry_unit_id,
    yield_factor = EXCLUDED.yield_factor;

  SELECT count(*)::integer
  INTO v_cup_lines
  FROM public.recipes AS recipe
  WHERE recipe.menu_item_id = v_menu
    AND recipe.ingredient_id = v_cup;

  SELECT count(*)::integer
  INTO v_other_lines
  FROM public.recipes AS recipe
  WHERE recipe.menu_item_id = v_menu
    AND recipe.ingredient_id = v_other;

  IF v_cup_lines <> 1 OR v_other_lines <> 1 THEN
    RAISE EXCEPTION
      'DRINK CUP: cup upsert must keep other BOM lines (cup=% other=%)',
      v_cup_lines,
      v_other_lines;
  END IF;

  SELECT category.id
  INTO v_nuoc
  FROM public.menu_categories AS category
  WHERE category.tenant_id = v_tenant
    AND category.name = 'Nước'
  LIMIT 1;

  IF v_nuoc IS NULL THEN
    RAISE NOTICE 'DRINK CUP: live Nước catalog absent; skip live assertion';
    RETURN;
  END IF;

  SELECT ingredient.id
  INTO v_cup
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.name = 'Ly nhựa trơn PP 95 - 650ml'
    AND ingredient.is_active
  LIMIT 1;

  SELECT ingredient_unit.unit_id
  INTO v_cai
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.units AS unit ON unit.id = ingredient_unit.unit_id
  WHERE ingredient_unit.ingredient_id = v_cup
    AND ingredient_unit.is_active
    AND unit.code = 'cái'
  LIMIT 1;

  IF v_cup IS NULL OR v_cai IS NULL THEN
    RAISE EXCEPTION 'DRINK CUP: live Nước catalog must have the 650ml cup SKU';
  END IF;

  SELECT count(*)::integer
  INTO v_live_cups
  FROM public.recipes AS recipe
  JOIN public.menu_items AS item ON item.id = recipe.menu_item_id
  WHERE recipe.tenant_id = v_tenant
    AND item.name IN (
      'Cam Ép',
      'Coca Cola',
      'Fanta Cam',
      'Fanta Xá Xị',
      'Nước Sâm',
      'Rau Má',
      'Sprite',
      'Trà Đá',
      'Trà Tắc'
    )
    AND recipe.ingredient_id = v_cup
    AND recipe.quantity = 1
    AND recipe.entry_unit_id = v_cai;

  IF v_live_cups <> 9 THEN
    RAISE EXCEPTION
      'DRINK CUP: all nine drink recipes must consume 1 cái 650ml cup';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recipes AS recipe
    JOIN public.menu_items AS item ON item.id = recipe.menu_item_id
    WHERE recipe.tenant_id = v_tenant
      AND item.name IN ('Nước Suối', 'Khăn Lạnh', 'Dụng cụ mang về')
      AND recipe.ingredient_id = v_cup
  ) THEN
    RAISE EXCEPTION
      'DRINK CUP: chai/towel/takeaway pack must not consume the drink cup';
  END IF;
END
$$;

ROLLBACK;
