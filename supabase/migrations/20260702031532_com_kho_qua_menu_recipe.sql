BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_tenant_count integer;
  v_menu_item_id bigint;
  v_ingredient_id bigint;
  v_piece_unit_id bigint;
BEGIN
  SELECT count(*), min(id) INTO v_tenant_count, v_tenant_id
  FROM public.tenants;

  IF v_tenant_count <> 1 THEN
    RAISE EXCEPTION 'com_kho_qua_menu_recipe_requires_single_tenant';
  END IF;

  SELECT id INTO v_menu_item_id
  FROM public.menu_items
  WHERE tenant_id = v_tenant_id
    AND name = 'Cơm Khổ Qua'
    AND is_active
  ORDER BY id
  LIMIT 1;

  IF v_menu_item_id IS NULL THEN
    RAISE EXCEPTION 'com_kho_qua_menu_recipe_menu_missing';
  END IF;

  SELECT id INTO v_ingredient_id
  FROM public.ingredients
  WHERE tenant_id = v_tenant_id
    AND sku = 'TP-CANH-KHO-QUA'
    AND item_kind = 'finished_good'
    AND is_active
  ORDER BY id
  LIMIT 1;

  IF v_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'com_kho_qua_menu_recipe_finished_good_missing';
  END IF;

  SELECT id INTO v_piece_unit_id
  FROM public.units
  WHERE tenant_id = v_tenant_id
    AND code = 'piece'
    AND is_active;

  IF v_piece_unit_id IS NULL THEN
    RAISE EXCEPTION 'com_kho_qua_menu_recipe_piece_unit_missing';
  END IF;

  DELETE FROM public.recipes
  WHERE tenant_id = v_tenant_id
    AND menu_item_id = v_menu_item_id;

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

  PERFORM public.refresh_branch_menu_stock_capacity(v_tenant_id, b.id, v_menu_item_id, v_ingredient_id)
  FROM public.branches b
  WHERE b.tenant_id = v_tenant_id
    AND b.is_active;
END $$;

COMMIT;
