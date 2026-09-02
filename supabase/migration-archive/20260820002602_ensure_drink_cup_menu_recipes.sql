-- Ensure drink menu recipes consume one serving cup.
-- House drinks already have the line; canned drinks (lon) did not.
-- Skip when the live Nước catalog is absent (CI e2e). Fail closed when
-- the category exists but a mapped item, cup SKU, or cái unit is missing.
-- Additive ON CONFLICT only — never replace the rest of the BOM.

DO $$
DECLARE
  v_tenant_id bigint;
  v_nuoc_id bigint;
  v_cup_id bigint;
  v_cai_unit_id bigint;
  v_menu_id bigint;
  v_menu_name text;
  v_order record;
BEGIN
  SELECT tenant.id
  INTO v_tenant_id
  FROM public.tenants AS tenant
  ORDER BY tenant.id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'ensure_drink_cup_menu_recipes_tenant_missing; skip';
    RETURN;
  END IF;

  SELECT category.id
  INTO v_nuoc_id
  FROM public.menu_categories AS category
  WHERE category.tenant_id = v_tenant_id
    AND category.name = 'Nước'
  LIMIT 1;

  IF v_nuoc_id IS NULL THEN
    RAISE NOTICE 'ensure_drink_cup_menu_recipes_nuoc_missing; skip';
    RETURN;
  END IF;

  SELECT ingredient.id
  INTO v_cup_id
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant_id
    AND ingredient.name = 'Ly nhựa trơn PP 95 - 650ml'
    AND ingredient.is_active
  ORDER BY ingredient.id
  LIMIT 1;

  IF v_cup_id IS NULL THEN
    RAISE EXCEPTION 'ensure_drink_cup_menu_recipes_cup_missing';
  END IF;

  SELECT ingredient_unit.unit_id
  INTO v_cai_unit_id
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.units AS unit ON unit.id = ingredient_unit.unit_id
  WHERE ingredient_unit.tenant_id = v_tenant_id
    AND ingredient_unit.ingredient_id = v_cup_id
    AND ingredient_unit.is_active
    AND unit.code = 'cái'
  ORDER BY ingredient_unit.unit_id
  LIMIT 1;

  IF v_cai_unit_id IS NULL THEN
    RAISE EXCEPTION 'ensure_drink_cup_menu_recipes_cai_unit_missing';
  END IF;

  FOREACH v_menu_name IN ARRAY ARRAY[
    'Cam Ép',
    'Coca Cola',
    'Fanta Cam',
    'Fanta Xá Xị',
    'Nước Sâm',
    'Rau Má',
    'Sprite',
    'Trà Đá',
    'Trà Tắc'
  ]
  LOOP
    SELECT item.id
    INTO v_menu_id
    FROM public.menu_items AS item
    WHERE item.tenant_id = v_tenant_id
      AND item.category_id = v_nuoc_id
      AND item.name = v_menu_name
      AND item.is_active
    ORDER BY item.id
    LIMIT 1;

    IF v_menu_id IS NULL THEN
      RAISE EXCEPTION 'ensure_drink_cup_menu_recipes_menu_missing:%', v_menu_name;
    END IF;

    INSERT INTO public.recipes (
      tenant_id,
      menu_item_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      yield_factor
    )
    VALUES (
      v_tenant_id,
      v_menu_id,
      v_cup_id,
      1,
      v_cai_unit_id,
      1
    )
    ON CONFLICT (menu_item_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      entry_unit_id = EXCLUDED.entry_unit_id,
      yield_factor = EXCLUDED.yield_factor;
  END LOOP;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR v_order IN
    SELECT DISTINCT ord.id, ord.created_by
    FROM public.orders AS ord
    JOIN public.branches AS branch ON branch.id = ord.branch_id
    JOIN public.order_items AS line ON line.order_id = ord.id
    JOIN public.menu_items AS item ON item.id = line.menu_item_id
    WHERE ord.tenant_id = v_tenant_id
      AND ord.payment_status = 'paid'
      AND ord.status = 'completed'
      AND branch.branch_kind = 'branch'
      AND item.name IN (
        'Coca Cola',
        'Fanta Cam',
        'Fanta Xá Xị',
        'Sprite'
      )
    ORDER BY ord.id
  LOOP
    PERFORM public.post_pos_sale_consumption_if_ready(
      v_order.id,
      v_order.created_by
    );
  END LOOP;
END
$$;
