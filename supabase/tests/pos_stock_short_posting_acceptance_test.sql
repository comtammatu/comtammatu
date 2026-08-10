-- ADR 0026: per-ingredient post-and-flag acceptance.
-- Covers short on-hand, missing stock_levels row, and unknown WAC.

\set ON_ERROR_STOP on
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_definition text;
  v_tenant bigint;
  v_branch bigint;
  v_profile uuid;
  v_location bigint;
  v_unit bigint;
  v_category bigint;
  v_ingredient_short bigint;
  v_ingredient_missing bigint;
  v_ingredient_nocost bigint;
  v_menu_short bigint;
  v_menu_missing bigint;
  v_menu_nocost bigint;
  v_order bigint;
  v_result jsonb;
  v_qty numeric(15,3);
  v_count integer;
  v_note text;
BEGIN
  SELECT pg_get_functiondef(
    'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
  )
  INTO v_definition;

  IF position('insufficient_stock_at_posting' IN v_definition) > 0
     OR position('cost_rung=' IN v_definition) = 0
     OR position('inventory.pos_stock_shortfall' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pos_stock_post_and_flag_contract_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'stock_levels'
      AND c.conname = 'stock_levels_current_quantity_valid'
      AND pg_get_constraintdef(c.oid) LIKE '%>=%0%'
  ) THEN
    RAISE EXCEPTION 'stock_levels_still_blocks_negative';
  END IF;

  SELECT t.id INTO v_tenant FROM public.tenants t WHERE t.slug = 'comtammatu' LIMIT 1;
  SELECT b.id INTO v_branch
  FROM public.branches b
  WHERE b.tenant_id = v_tenant AND b.branch_kind = 'branch' AND b.is_active
  ORDER BY b.id LIMIT 1;
  SELECT p.id INTO v_profile
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant AND p.branch_id = v_branch
  ORDER BY p.id LIMIT 1;
  SELECT loc.id INTO v_location
  FROM public.inventory_locations loc
  WHERE loc.tenant_id = v_tenant
    AND loc.branch_id = v_branch
    AND loc.location_kind = 'warehouse'
    AND loc.is_active
  ORDER BY loc.is_default_consumption DESC NULLS LAST, loc.sort_order, loc.id
  LIMIT 1;
  SELECT u.id INTO v_unit
  FROM public.units u WHERE u.tenant_id = v_tenant ORDER BY u.id LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL OR v_profile IS NULL
     OR v_location IS NULL OR v_unit IS NULL THEN
    RAISE EXCEPTION 'pos_stock_short_seed_missing';
  END IF;

  INSERT INTO public.branch_feature_flags (branch_id, flag_key, enabled, enabled_at, notes)
  VALUES (v_branch, 'pos_stock_outcome_posting', true, now(), 'adr0026')
  ON CONFLICT (branch_id, flag_key) DO UPDATE
  SET enabled = true, enabled_at = now(), disabled_at = null;

  INSERT INTO public.menu_categories (tenant_id, name, type, sort_order)
  VALUES (v_tenant, '__adr26_cat_' || gen_random_uuid()::text, 'main_dish', 999)
  RETURNING id INTO v_category;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant, '__adr26_short_' || gen_random_uuid()::text,
    '__A26S' || floor(random()*1e6)::text, 1000, 'raw_material',
    v_unit, v_unit, v_unit
  ) RETURNING id INTO v_ingredient_short;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant, '__adr26_missing_' || gen_random_uuid()::text,
    '__A26M' || floor(random()*1e6)::text, 2000, 'raw_material',
    v_unit, v_unit, v_unit
  ) RETURNING id INTO v_ingredient_missing;

  INSERT INTO public.ingredients (
    tenant_id, name, sku, unit_cost, item_kind,
    receipt_unit_id, issue_unit_id, production_unit_id
  ) VALUES (
    v_tenant, '__adr26_nocost_' || gen_random_uuid()::text,
    '__A26N' || floor(random()*1e6)::text, 0, 'raw_material',
    v_unit, v_unit, v_unit
  ) RETURNING id INTO v_ingredient_nocost;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active
  ) VALUES
    (v_tenant, v_ingredient_short, v_unit, 1, true, true),
    (v_tenant, v_ingredient_missing, v_unit, 1, true, true),
    (v_tenant, v_ingredient_nocost, v_unit, 1, true, true);

  INSERT INTO public.menu_items (
    tenant_id, category_id, name, base_price, sort_order, is_active
  ) VALUES (
    v_tenant, v_category, '__adr26_menu_short_' || gen_random_uuid()::text,
    10000, 1, true
  ) RETURNING id INTO v_menu_short;

  INSERT INTO public.menu_items (
    tenant_id, category_id, name, base_price, sort_order, is_active
  ) VALUES (
    v_tenant, v_category, '__adr26_menu_missing_' || gen_random_uuid()::text,
    10000, 2, true
  ) RETURNING id INTO v_menu_missing;

  INSERT INTO public.menu_items (
    tenant_id, category_id, name, base_price, sort_order, is_active
  ) VALUES (
    v_tenant, v_category, '__adr26_menu_nocost_' || gen_random_uuid()::text,
    10000, 3, true
  ) RETURNING id INTO v_menu_nocost;

  INSERT INTO public.recipes (
    tenant_id, menu_item_id, ingredient_id, quantity, entry_unit_id, yield_factor
  ) VALUES
    (v_tenant, v_menu_short, v_ingredient_short, 1, v_unit, 1),
    (v_tenant, v_menu_missing, v_ingredient_missing, 1, v_unit, 1),
    (v_tenant, v_menu_nocost, v_ingredient_nocost, 1, v_unit, 1);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id, current_quantity, avg_unit_cost
  ) VALUES (
    v_tenant, v_branch, v_location, v_ingredient_short, 0.5, 1500
  );

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, location_id, ingredient_id, current_quantity, avg_unit_cost
  ) VALUES (
    v_tenant, v_branch, v_location, v_ingredient_nocost, 10, NULL
  );

  PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);

  INSERT INTO public.orders (
    tenant_id, branch_id, order_number, status, payment_status,
    subtotal, total_amount, created_by
  ) VALUES (
    v_tenant, v_branch, '__adr26_' || gen_random_uuid()::text,
    'completed', 'paid', 30000, 30000, v_profile
  ) RETURNING id INTO v_order;

  INSERT INTO public.order_items (
    tenant_id, order_id, menu_item_id, item_name,
    quantity, unit_price, subtotal, vat_rate, sent_to_kitchen_at
  ) VALUES
    (v_tenant, v_order, v_menu_short, 'adr26 short', 1, 10000, 10000, 8, now()),
    (v_tenant, v_order, v_menu_missing, 'adr26 missing', 1, 10000, 10000, 8, now()),
    (v_tenant, v_order, v_menu_nocost, 'adr26 nocost', 1, 10000, 10000, 8, now());

  v_result := public.post_pos_sale_consumption_if_ready(v_order, v_profile);

  IF COALESCE((v_result ->> 'consumed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'expected consumed true, got %', v_result;
  END IF;
  IF COALESCE((v_result ->> 'movements_created')::int, 0) <> 3 THEN
    RAISE EXCEPTION 'expected 3 movements, got %', v_result;
  END IF;
  IF jsonb_array_length(COALESCE(v_result -> 'short_ingredient_ids', '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'expected short ingredients flagged: %', v_result;
  END IF;
  IF jsonb_array_length(COALESCE(v_result -> 'synthesized_ingredient_ids', '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'expected synthesized ingredients flagged: %', v_result;
  END IF;
  IF jsonb_array_length(COALESCE(v_result -> 'zero_cost_ingredient_ids', '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'expected zero-cost ingredients flagged: %', v_result;
  END IF;

  SELECT current_quantity INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant
    AND branch_id = v_branch
    AND location_id = v_location
    AND ingredient_id = v_ingredient_short;
  IF v_qty IS DISTINCT FROM -0.5 THEN
    RAISE EXCEPTION 'short ingredient should be -0.5, got %', v_qty;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stock_levels
  WHERE tenant_id = v_tenant
    AND branch_id = v_branch
    AND location_id = v_location
    AND ingredient_id = v_ingredient_missing;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'missing stock_levels row was not synthesized';
  END IF;

  SELECT reason INTO v_note
  FROM public.stock_movements
  WHERE order_id = v_order
    AND ingredient_id = v_ingredient_nocost
    AND movement_subtype = 'sale_consumption';
  IF v_note IS NULL OR position('cost_rung=zero' IN v_note) = 0 THEN
    RAISE EXCEPTION 'zero cost rung not recorded: %', v_note;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.tenant_id = v_tenant
      AND n.kind = 'inventory.pos_stock_shortfall'
      AND n.entity_id = v_order
      AND n.target_branch_id = v_branch
      AND n.action_url = format('/br/%s/stock', v_branch)
  ) THEN
    RAISE EXCEPTION 'follow-up notification missing';
  END IF;
END;
$$;

ROLLBACK;
