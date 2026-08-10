-- INV-2: first stock_levels row per location must use INSERT … ON CONFLICT so
-- concurrent first movements do not raise a unique violation.

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_definition text;
  v_tenant bigint;
  v_branch bigint;
  v_location bigint;
  v_ingredient bigint;
  v_unit bigint;
  v_profile uuid;
  v_qty numeric(15, 3);
  v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.trg_update_stock_on_movement()'::regprocedure)
  INTO v_definition;

  IF position('ON CONFLICT' IN v_definition) = 0
     OR position('INSERT INTO public.stock_levels' IN v_definition) = 0
     OR position('IF NOT FOUND THEN' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'stock_level_upsert_contract_drift';
  END IF;

  SELECT t.id INTO v_tenant FROM public.tenants t WHERE t.slug = 'comtammatu' LIMIT 1;
  SELECT b.id INTO v_branch
  FROM public.branches b
  WHERE b.tenant_id = v_tenant AND b.is_active = true
  ORDER BY b.id
  LIMIT 1;
  SELECT loc.id INTO v_location
  FROM public.inventory_locations loc
  WHERE loc.tenant_id = v_tenant
    AND loc.branch_id = v_branch
    AND loc.location_kind = 'warehouse'
    AND loc.is_active = true
  ORDER BY loc.is_default_consumption DESC NULLS LAST, loc.sort_order, loc.id
  LIMIT 1;
  SELECT u.id INTO v_unit
  FROM public.units u
  WHERE u.tenant_id = v_tenant
  ORDER BY u.id
  LIMIT 1;
  SELECT p.id INTO v_profile
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
  ORDER BY p.id
  LIMIT 1;

  IF v_tenant IS NULL
     OR v_branch IS NULL
     OR v_location IS NULL
     OR v_unit IS NULL
     OR v_profile IS NULL THEN
    RAISE EXCEPTION 'stock_level_upsert_seed_missing';
  END IF;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    item_kind,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__inv2_upsert_' || gen_random_uuid()::text,
    '__INV2-' || floor(random() * 1000000)::text,
    'raw_material',
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_ingredient;

  -- Two sequential first movements for a never-seen (ingredient, location)
  -- must both succeed and accumulate quantity. The ON CONFLICT body is what
  -- makes the same outcome safe under true concurrency.
  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    quantity_change,
    type,
    created_by,
    entry_unit_id,
    entry_quantity,
    reason
  )
  VALUES (
    v_tenant,
    v_branch,
    v_location,
    v_ingredient,
    3.5,
    'adjustment',
    v_profile,
    v_unit,
    3.5,
    'inv2 first'
  );

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    quantity_change,
    type,
    created_by,
    entry_unit_id,
    entry_quantity,
    reason
  )
  VALUES (
    v_tenant,
    v_branch,
    v_location,
    v_ingredient,
    1.5,
    'adjustment',
    v_profile,
    v_unit,
    1.5,
    'inv2 second'
  );

  SELECT current_quantity
  INTO v_qty
  FROM public.stock_levels
  WHERE tenant_id = v_tenant
    AND branch_id = v_branch
    AND location_id = v_location
    AND ingredient_id = v_ingredient;

  SELECT count(*)
  INTO v_count
  FROM public.stock_levels
  WHERE tenant_id = v_tenant
    AND branch_id = v_branch
    AND location_id = v_location
    AND ingredient_id = v_ingredient;

  IF v_count <> 1 OR v_qty IS DISTINCT FROM 5.0 THEN
    RAISE EXCEPTION 'stock_level_upsert_quantity_mismatch: count=% qty=%',
      v_count, v_qty;
  END IF;
END;
$$;

ROLLBACK;
