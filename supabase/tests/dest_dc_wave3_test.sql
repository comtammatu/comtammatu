\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_supply_user uuid;
  v_supply_branch bigint;
  v_supply_location bigint;
  v_kitchen_branch bigint;
  v_kitchen_location bigint;
  v_bm uuid;
  v_bm_branch bigint;
  v_bm_location bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_both bigint;
  v_result jsonb;
  v_transfer_id bigint;
  v_status text;
  v_movements integer;
  v_failed boolean;
  v_template text;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_supply_on_hand numeric;
  v_kitchen_on_hand numeric;
  v_flags_supply boolean;
  v_flags_kitchen boolean;
  v_kind text;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.create_stock_transfer_draft(bigint,bigint,text,text,text,jsonb,bigint,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION 'WAVE3: create_stock_transfer_draft is missing';
  END IF;

  SELECT template.permission_keys::text
  INTO v_template
  FROM public.role_templates AS template
  WHERE template.position_code = 'branch_manager'
  LIMIT 1;
  IF v_template NOT LIKE '%inventory:transfer_create%' THEN
    RAISE EXCEPTION 'WAVE3: branch_manager must gain transfer_create';
  END IF;
  IF v_template LIKE '%procurement:grn_confirm%'
     OR v_template LIKE '%procurement:grn_create%' THEN
    RAISE EXCEPTION 'WAVE3: branch_manager must not gain GRN confirm';
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
  ORDER BY branch.id
  LIMIT 1;

  SELECT location.id
  INTO v_supply_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_supply_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.is_default_issue DESC, location.id
  LIMIT 1;

  SELECT branch.id
  INTO v_kitchen_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'central_kitchen'
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT location.id
  INTO v_kitchen_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_kitchen_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.is_default_issue DESC, location.id
  LIMIT 1;

  SELECT profile.id
  INTO v_supply_user
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND position.code = 'central_supply_ops'
    AND coalesce(profile.is_active, TRUE)
    AND profile.branch_id = v_supply_branch
  ORDER BY profile.id
  LIMIT 1;

  SELECT profile.id, profile.branch_id
  INTO v_bm, v_bm_branch
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND position.code = 'branch_manager'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT location.id
  INTO v_bm_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_bm_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.is_default_receive DESC, location.id
  LIMIT 1;

  IF v_tenant IS NULL
     OR v_owner IS NULL
     OR v_supply_branch IS NULL
     OR v_supply_location IS NULL
     OR v_bm IS NULL
     OR v_bm_branch IS NULL
     OR v_bm_location IS NULL THEN
    RAISE EXCEPTION 'WAVE3: owner, Kho Tổng, and branch_manager fixtures required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__w3_u_' || v_suffix, 'Wave3 unit')
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    fulfill_from_central_supply,
    fulfill_from_central_kitchen,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__w3_nl_' || v_suffix,
    '__W3-' || v_suffix,
    0,
    'raw_material',
    'central_supply',
    TRUE,
    FALSE,
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (v_tenant, v_ingredient, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    fulfill_from_central_supply,
    fulfill_from_central_kitchen,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__w3_both_' || v_suffix,
    '__W3B-' || v_suffix,
    0,
    'raw_material',
    'central_supply',
    TRUE,
    TRUE,
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_both;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (v_tenant, v_both, v_unit, 1, TRUE, TRUE);

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner'
      )
    )::text,
    TRUE
  );

  PERFORM public.save_ingredient_catalog(
    v_both,
    '__w3_both_' || v_suffix,
    '__W3B-' || v_suffix,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'unit_id', v_unit,
        'to_base_factor', 1,
        'is_base', TRUE,
        'sort_order', 0
      )
    ),
    'central_supply',
    v_unit,
    v_unit,
    v_unit,
    TRUE,
    TRUE
  );

  SELECT
    ingredient.fulfill_from_central_supply,
    ingredient.fulfill_from_central_kitchen,
    ingredient.default_fulfill_site_kind
  INTO v_flags_supply, v_flags_kitchen, v_kind
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = v_both;
  IF v_flags_supply IS NOT TRUE OR v_flags_kitchen IS NOT TRUE THEN
    RAISE EXCEPTION 'WAVE3: catalog must persist both Nguồn hàng flags';
  END IF;
  IF v_kind IS DISTINCT FROM 'central_supply' THEN
    RAISE EXCEPTION 'WAVE3: both flags must prefer Kho Tổng on exclusive leftover';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_bm::text, TRUE);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_bm::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'branch_manager',
        'branch_id', v_bm_branch
      )
    )::text,
    TRUE
  );

  SELECT coalesce(stock.current_quantity, 0)
  INTO v_supply_on_hand
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = v_supply_branch
    AND stock.location_id = v_supply_location
    AND stock.ingredient_id = v_ingredient;
  IF coalesce(v_supply_on_hand, 0) <> 0 THEN
    RAISE EXCEPTION 'WAVE3: dest-initiated fixture must start at qty 0';
  END IF;

  v_result := public.create_stock_transfer_draft(
    v_supply_branch,
    v_bm_branch,
    '',
    'Wave 3 dest-initiated draft',
    NULL,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 3,
        'entry_unit_id', v_unit
      )
    ),
    v_supply_location,
    v_bm_location
  );
  v_transfer_id := (v_result ->> 'id')::bigint;
  v_status := v_result ->> 'status';
  IF v_transfer_id IS NULL OR v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'WAVE3: dest-initiated draft must insert draft';
  END IF;

  SELECT count(*)
  INTO v_movements
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.transfer_id = v_transfer_id;
  IF v_movements <> 0 THEN
    RAISE EXCEPTION 'WAVE3: dest-initiated draft must post no stock';
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.stock_transfer_confirm_ship(v_transfer_id);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_failed := TRUE;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%forbidden_transfer_ship%'
         OR SQLERRM LIKE '%insufficient_stock%' THEN
        v_failed := TRUE;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'WAVE3: ship must stay source-only';
  END IF;

  IF public.has_permission(v_bm_branch, 'procurement:grn_confirm')
     OR public.has_permission(v_supply_branch, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'WAVE3: branch_manager must not confirm GRN';
  END IF;
  IF NOT public.has_permission(v_bm_branch, 'inventory:transfer_create') THEN
    RAISE EXCEPTION 'WAVE3: BM create must be granted on own branch';
  END IF;

  RAISE NOTICE 'WAVE3 dest-initiated draft, BM create, ship source-only, BM cannot confirm GRN, prefer Kho Tổng flags';
END;
$$;

ROLLBACK;
