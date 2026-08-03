-- =============================================================
-- POS/KDS stock-control acceptance:
--   - stock capacity converts recipe entry_unit_id to ingredient base unit
--   - manager quota availability is min(San ban, Ton)
--   - missing stock capacity blocks stock-control availability
--   - paid+ready posts sale consumption
--   - cancel before ready posts nothing
--   - cancel after ready posts waste
--
-- Run against a local/dev DB with migrations + dev seed applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pos_stock_outcome_multiunit_acceptance_test.sql
--
-- The outer transaction always rolls back fixture data.
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_profile uuid;
  v_category bigint;
  v_drink_category bigint;
  v_station bigint;
  v_ingredient bigint;
  v_side_ingredient bigint;
  v_drink_ingredient bigint;
  v_part_unit bigint;
  v_pack_unit bigint;
  v_limit_menu bigint;
  v_pool_menu bigint;
  v_side_menu bigint;
  v_drink_menu bigint;
  v_empty_menu bigint;
  v_location bigint;
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_capacity integer;
  v_available integer;
  v_stock_live integer;
  v_manual_limit integer;
  v_order bigint;
  v_item bigint;
  v_result jsonb;
  v_qty numeric(15,3);
  v_count integer;
BEGIN
  SELECT t.id INTO v_tenant FROM public.tenants t WHERE t.slug = 'comtammatu' LIMIT 1;
  SELECT b.id INTO v_branch
  FROM public.branches b
  WHERE b.tenant_id = v_tenant AND b.branch_kind = 'branch' AND b.is_active = true
  ORDER BY b.id
  LIMIT 1;
  SELECT p.id INTO v_profile
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant AND p.branch_id = v_branch
  ORDER BY p.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION 'Seed data missing: tenant=% branch=% profile=%',
      v_tenant, v_branch, v_profile;
  END IF;

  INSERT INTO public.branch_feature_flags (branch_id, flag_key, enabled, enabled_at, notes)
  VALUES (v_branch, 'pos_stock_outcome_posting', true, now(), 'g5_acceptance')
  ON CONFLICT (branch_id, flag_key) DO UPDATE
  SET enabled = true, enabled_at = now(), disabled_at = null, notes = EXCLUDED.notes;

  INSERT INTO public.menu_categories (tenant_id, name, type, sort_order)
  VALUES (v_tenant, '__g5_stock_category_' || gen_random_uuid()::text, 'main_dish', 999)
  RETURNING id INTO v_category;

  INSERT INTO public.menu_categories (tenant_id, name, type, sort_order)
  VALUES (v_tenant, '__g5_drink_category_' || gen_random_uuid()::text, 'drink', 1000)
  RETURNING id INTO v_drink_category;

  INSERT INTO public.kds_stations (tenant_id, branch_id, name, "position", is_active)
  VALUES (v_tenant, v_branch, '__g5_station_' || gen_random_uuid()::text, 999, true)
  RETURNING id INTO v_station;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__g5_part_' || gen_random_uuid()::text, 'Phan')
  RETURNING id INTO v_part_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__g5_pack_' || gen_random_uuid()::text, 'Bich')
  RETURNING id INTO v_pack_unit;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    receipt_unit_id, issue_unit_id, production_unit_id
  )
  VALUES (
    v_tenant,
    '__g5_suon_cot_let_finished_good_' || gen_random_uuid()::text,
    '__G5-FG-' || floor(random() * 1000000)::text,
    10000,
    'finished_good',
    v_part_unit, v_part_unit, v_part_unit
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    receipt_unit_id, issue_unit_id, production_unit_id
  )
  VALUES (
    v_tenant,
    '__g5_trung_finished_good_' || gen_random_uuid()::text,
    '__G5-EGG-' || floor(random() * 1000000)::text,
    3000,
    'finished_good',
    v_part_unit, v_part_unit, v_part_unit
  )
  RETURNING id INTO v_side_ingredient;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    receipt_unit_id, issue_unit_id, production_unit_id
  )
  VALUES (
    v_tenant,
    '__g5_drink_stock_item_' || gen_random_uuid()::text,
    '__G5-DRINK-' || floor(random() * 1000000)::text,
    12000,
    'finished_good',
    v_part_unit, v_part_unit, v_part_unit
  )
  RETURNING id INTO v_drink_ingredient;

  INSERT INTO public.ingredient_units
    (tenant_id, ingredient_id, unit_id, to_base_factor, is_base)
  VALUES
    (v_tenant, v_ingredient, v_part_unit, 1, true),
    (v_tenant, v_ingredient, v_pack_unit, 20, false),
    (v_tenant, v_side_ingredient, v_part_unit, 1, true),
    (v_tenant, v_drink_ingredient, v_part_unit, 1, true);

  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, sort_order, vat_rate)
  VALUES (v_tenant, v_category, '__g5_stock_limit_item_' || gen_random_uuid()::text, 45000, 1, 0)
  RETURNING id INTO v_limit_menu;

  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, sort_order, vat_rate)
  VALUES (v_tenant, v_category, '__g5_shared_pool_item_' || gen_random_uuid()::text, 45000, 2, 0)
  RETURNING id INTO v_pool_menu;

  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, sort_order, vat_rate)
  VALUES (v_tenant, v_category, '__g5_side_item_' || gen_random_uuid()::text, 7000, 3, 0)
  RETURNING id INTO v_side_menu;

  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, sort_order, vat_rate)
  VALUES (v_tenant, v_drink_category, '__g5_drink_item_' || gen_random_uuid()::text, 15000, 4, 0)
  RETURNING id INTO v_drink_menu;

  INSERT INTO public.menu_items (tenant_id, category_id, name, base_price, sort_order, vat_rate)
  VALUES (v_tenant, v_category, '__g5_missing_config_item_' || gen_random_uuid()::text, 45000, 5, 0)
  RETURNING id INTO v_empty_menu;

  INSERT INTO public.recipes
    (tenant_id, menu_item_id, ingredient_id, quantity, entry_unit_id, yield_factor)
  VALUES (v_tenant, v_limit_menu, v_ingredient, 1, v_pack_unit, 1);

  INSERT INTO public.recipes
    (tenant_id, menu_item_id, ingredient_id, quantity, entry_unit_id, yield_factor)
  VALUES (v_tenant, v_pool_menu, v_ingredient, 1, v_pack_unit, 1);

  INSERT INTO public.recipes
    (tenant_id, menu_item_id, ingredient_id, quantity, entry_unit_id, yield_factor)
  VALUES (v_tenant, v_side_menu, v_side_ingredient, 1, v_part_unit, 1);

  INSERT INTO public.recipes
    (tenant_id, menu_item_id, ingredient_id, quantity, entry_unit_id, yield_factor)
  VALUES (v_tenant, v_drink_menu, v_drink_ingredient, 1, v_part_unit, 1);

  PERFORM public.ensure_branch_inventory_location_defaults(v_tenant, v_branch);

  SELECT il.id INTO v_location
  FROM public.inventory_locations il
  WHERE il.tenant_id = v_tenant
    AND il.branch_id = v_branch
    AND il.location_kind = 'warehouse'
    AND il.is_active = true
  ORDER BY il.is_default_issue DESC, il.sort_order NULLS LAST, il.id
  LIMIT 1;

  IF v_location IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP FAILED: active branch warehouse missing for %', v_branch;
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  )
  VALUES
    (v_tenant, v_branch, v_ingredient, v_location, 40, 10000),
    (v_tenant, v_branch, v_side_ingredient, v_location, 10, 3000),
    (v_tenant, v_branch, v_drink_ingredient, v_location, 5, 12000);

  v_capacity := public.compute_menu_item_stock_capacity(v_tenant, v_branch, v_limit_menu);
  IF v_capacity <> 2 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: expected capacity=2, got %', v_capacity;
  END IF;

  INSERT INTO public.branch_menu_item_daily_limits (
    tenant_id, branch_id, menu_item_id, limit_date,
    limit_quantity, stock_capacity, sold_today
  )
  VALUES (v_tenant, v_branch, v_limit_menu, v_today, 1, v_capacity, 0)
  ON CONFLICT (branch_id, menu_item_id, limit_date) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      limit_quantity = EXCLUDED.limit_quantity,
      stock_capacity = EXCLUDED.stock_capacity,
      sold_today = EXCLUDED.sold_today,
      is_disabled = false,
      updated_at = now();

  SELECT a.available_to_sell, a.stock_capacity, a.manual_limit_quantity
    INTO v_available, v_stock_live, v_manual_limit
  FROM public.branch_menu_limit_availability(v_tenant, v_branch, v_today, true) a
  WHERE a.menu_item_id = v_limit_menu;

  IF v_available <> 1 OR v_stock_live <> 2 OR v_manual_limit <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: expected available=1 stock=2 manual=1, got available=% stock=% manual=%',
      v_available, v_stock_live, v_manual_limit;
  END IF;

  SELECT a.available_to_sell
    INTO v_available
  FROM public.branch_menu_limit_availability(v_tenant, v_branch, v_today, true) a
  WHERE a.menu_item_id = v_empty_menu;

  IF v_available <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: missing recipe item must block at available=0, got %',
      v_available;
  END IF;

  UPDATE public.branch_menu_item_daily_limits
  SET limit_quantity = 100, stock_capacity = 100, sold_today = 0
  WHERE branch_id = v_branch AND menu_item_id = v_limit_menu AND limit_date = v_today;

  UPDATE public.stock_levels
  SET current_quantity = 60
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_ingredient AND location_id = v_location;

  UPDATE public.stock_levels
  SET current_quantity = 10
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_side_ingredient AND location_id = v_location;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  )
  VALUES (
    v_tenant, v_branch, '__g5_shared_pool_pending_' || gen_random_uuid()::text,
    'confirmed', 'unpaid', 90000, 90000, v_profile
  )
  RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, subtotal, vat_rate
  )
  VALUES (v_tenant, v_order, v_limit_menu, 'G5 pending shared pool item', 2, 45000, 90000, 8)
  RETURNING id INTO v_item;

  SELECT a.available_to_sell, a.stock_capacity, a.pending_unfinalized_demand
    INTO v_available, v_stock_live, v_manual_limit
  FROM public.branch_menu_limit_availability(v_tenant, v_branch, v_today, true) a
  WHERE a.menu_item_id = v_pool_menu;

  IF v_available <> 1 OR v_stock_live <> 3 OR v_manual_limit <> 2 THEN
    RAISE EXCEPTION 'TEST 3B FAILED: shared ingredient pool expected available=1 stock=3 pending=2, got available=% stock=% pending=%',
      v_available, v_stock_live, v_manual_limit;
  END IF;

  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  )
  VALUES (
    v_tenant, v_branch, '__g5_sale_' || gen_random_uuid()::text,
    'completed', 'paid', 104000, 104000, v_profile
  )
  RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, sides, subtotal, vat_rate
  )
  VALUES (
    v_tenant,
    v_order,
    v_limit_menu,
    'G5 sale item',
    2,
    52000,
    jsonb_build_array(jsonb_build_object('side_item_id', v_side_menu, 'name', 'G5 side', 'price', 7000, 'quantity', 1)),
    104000,
    8
  )
  RETURNING id INTO v_item;

  INSERT INTO public.kds_tickets (
    tenant_id, branch_id, station_id, order_id, order_item_id,
    status, first_ready_at, bumped_at, bumped_by
  )
  VALUES (v_tenant, v_branch, v_station, v_order, v_item, 'ready', now(), now(), v_profile);

  v_result := public.post_pos_sale_consumption_if_ready(v_order, v_profile);
  IF COALESCE((v_result ->> 'consumed')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST 4 FAILED: sale consumption not posted: %', v_result;
  END IF;

  SELECT quantity_change INTO v_qty
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND ingredient_id = v_ingredient
    AND movement_subtype = 'sale_consumption';

  IF v_qty <> -40 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected sale quantity_change=-40, got %', v_qty;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND movement_subtype = 'sale_consumption'
    AND location_id IS DISTINCT FROM v_location;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: % sale-consumption row(s) were not posted at branch warehouse %',
      v_count, v_location;
  END IF;

  SELECT quantity_change INTO v_qty
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND ingredient_id = v_side_ingredient
    AND movement_subtype = 'sale_consumption';

  IF v_qty <> -2 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected side sale quantity_change=-2, got %', v_qty;
  END IF;

  SELECT current_quantity INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_ingredient AND location_id = v_location;

  IF v_qty <> 20 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected stock after sale=20, got %', v_qty;
  END IF;

  SELECT current_quantity INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_side_ingredient AND location_id = v_location;

  IF v_qty <> 8 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected side stock after sale=8, got %', v_qty;
  END IF;

  v_result := public.post_pos_sale_consumption_if_ready(v_order, v_profile);
  SELECT count(*) INTO v_count
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND movement_subtype = 'sale_consumption';

  IF v_count <> 2 OR v_result ->> 'reason' <> 'already_posted' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: sale idempotency failed, count=% result=%',
      v_count, v_result;
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  )
  VALUES (
    v_tenant, v_branch, '__g5_drink_only_' || gen_random_uuid()::text,
    'completed', 'paid', 45000, 45000, v_profile
  )
  RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, subtotal, vat_rate
  )
  VALUES (
    v_tenant,
    v_order,
    v_drink_menu,
    'G5 printer-only stock item',
    3,
    15000,
    45000,
    8
  )
  RETURNING id INTO v_item;

  UPDATE public.order_items
  SET sent_to_kitchen_at = now()
  WHERE id = v_item;

  v_result := public.post_pos_sale_consumption_if_ready(v_order, v_profile);
  IF COALESCE((v_result ->> 'consumed')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST 5B FAILED: printer-only sale consumption not posted: %', v_result;
  END IF;

  SELECT quantity_change INTO v_qty
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND ingredient_id = v_drink_ingredient
    AND movement_subtype = 'sale_consumption';

  IF v_qty <> -3 THEN
    RAISE EXCEPTION 'TEST 5B FAILED: expected printer-only sale quantity_change=-3, got %', v_qty;
  END IF;

  SELECT current_quantity INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_drink_ingredient AND location_id = v_location;

  IF v_qty <> 2 THEN
    RAISE EXCEPTION 'TEST 5B FAILED: expected printer-only stock after sale=2, got %', v_qty;
  END IF;

  UPDATE public.stock_levels
  SET current_quantity = 60
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_ingredient AND location_id = v_location;

  UPDATE public.stock_levels
  SET current_quantity = 10
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_side_ingredient AND location_id = v_location;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  )
  VALUES (
    v_tenant, v_branch, '__g5_cancel_before_ready_' || gen_random_uuid()::text,
    'confirmed', 'unpaid', 45000, 45000, v_profile
  )
  RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, subtotal, vat_rate
  )
  VALUES (v_tenant, v_order, v_limit_menu, 'G5 pending item', 1, 45000, 45000, 8)
  RETURNING id INTO v_item;

  INSERT INTO public.kds_tickets (
    tenant_id, branch_id, station_id, order_id, order_item_id, status
  )
  VALUES (v_tenant, v_branch, v_station, v_order, v_item, 'pending');

  v_result := public.post_pos_cancelled_ready_waste(v_order, v_profile, 'test');
  SELECT count(*) INTO v_count
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND movement_subtype = 'cancelled_after_kds_ready';

  IF v_count <> 0 OR v_result ->> 'reason' <> 'no_ready_kds_items' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: cancel before ready must not post waste, count=% result=%',
      v_count, v_result;
  END IF;

  UPDATE public.stock_levels
  SET current_quantity = 60
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_ingredient AND location_id = v_location;

  UPDATE public.stock_levels
  SET current_quantity = 10
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_side_ingredient AND location_id = v_location;

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  )
  VALUES (
    v_tenant, v_branch, '__g5_cancel_after_ready_' || gen_random_uuid()::text,
    'confirmed', 'unpaid', 52000, 52000, v_profile
  )
  RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, sides, subtotal, vat_rate
  )
  VALUES (
    v_tenant,
    v_order,
    v_limit_menu,
    'G5 ready cancelled item',
    1,
    52000,
    jsonb_build_array(jsonb_build_object('side_item_id', v_side_menu, 'name', 'G5 side', 'price', 7000, 'quantity', 1)),
    52000,
    8
  )
  RETURNING id INTO v_item;

  INSERT INTO public.kds_tickets (
    tenant_id, branch_id, station_id, order_id, order_item_id,
    status, first_ready_at, bumped_at, bumped_by
  )
  VALUES (v_tenant, v_branch, v_station, v_order, v_item, 'ready', now(), now(), v_profile);

  v_result := public.post_pos_cancelled_ready_waste(v_order, v_profile, 'test');
  IF COALESCE((v_result ->> 'consumed')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST 7 FAILED: cancel after ready waste not posted: %', v_result;
  END IF;

  SELECT quantity_change INTO v_qty
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND ingredient_id = v_ingredient
    AND movement_subtype = 'cancelled_after_kds_ready';

  IF v_qty <> -20 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: expected ready-cancel waste=-20, got %', v_qty;
  END IF;

  SELECT quantity_change INTO v_qty
  FROM public.stock_movements
  WHERE tenant_id = v_tenant AND order_id = v_order
    AND ingredient_id = v_side_ingredient
    AND movement_subtype = 'cancelled_after_kds_ready';

  IF v_qty <> -1 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: expected ready-cancel side waste=-1, got %', v_qty;
  END IF;

  SELECT current_quantity INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_ingredient AND location_id = v_location;

  IF v_qty <> 40 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: expected stock after ready-cancel=40, got %', v_qty;
  END IF;

  SELECT current_quantity INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant AND branch_id = v_branch
    AND ingredient_id = v_side_ingredient AND location_id = v_location;

  IF v_qty <> 9 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: expected side stock after ready-cancel=9, got %', v_qty;
  END IF;

  UPDATE public.branch_feature_flags
  SET enabled = false,
      disabled_at = now(),
      updated_at = now()
  WHERE branch_id = v_branch
    AND flag_key = 'pos_stock_outcome_posting';

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  )
  VALUES (
    v_tenant, v_branch, '__g5_disabled_then_short_' || gen_random_uuid()::text,
    'completed', 'paid', 14985000, 14985000, v_profile
  )
  RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, subtotal, vat_rate, sent_to_kitchen_at
  )
  VALUES (
    v_tenant,
    v_order,
    v_drink_menu,
    'G5 disabled then insufficient item',
    999,
    15000,
    14985000,
    8,
    now()
  );

  v_result := public.post_pos_sale_consumption_if_ready(v_order, v_profile);
  IF v_result ->> 'reason' <> 'feature_disabled' THEN
    RAISE EXCEPTION
      'TEST 8 FAILED: disabled switch did not bypass posting: %',
      v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stock_movements
  WHERE tenant_id = v_tenant
    AND order_id = v_order
    AND movement_subtype = 'sale_consumption';

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'TEST 8 FAILED: disabled switch posted % movement(s)',
      v_count;
  END IF;

  UPDATE public.branch_feature_flags
  SET enabled = true,
      enabled_at = now(),
      disabled_at = NULL,
      updated_at = now()
  WHERE branch_id = v_branch
    AND flag_key = 'pos_stock_outcome_posting';

  v_result := public.post_pos_sale_consumption_if_ready(v_order, v_profile);
  IF v_result ->> 'reason' <> 'insufficient_stock_at_posting' THEN
    RAISE EXCEPTION
      'TEST 9 FAILED: insufficient stock did not fail closed: %',
      v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stock_movements
  WHERE tenant_id = v_tenant
    AND order_id = v_order
    AND movement_subtype = 'sale_consumption';

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'TEST 9 FAILED: insufficient posting wrote % partial movement(s)',
      v_count;
  END IF;

  RAISE NOTICE 'G5 POS/KDS stock outcome multi-unit acceptance passed';
END;
$$;

ROLLBACK;
