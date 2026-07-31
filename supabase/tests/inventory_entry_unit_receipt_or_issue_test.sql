\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch bigint;
  v_location bigint;
  v_supplier bigint;
  v_receipt_unit bigint;
  v_issue_unit bigint;
  v_production_unit bigint;
  v_ingredient bigint;
  v_grn bigint;
  v_issue bigint;
  v_ok boolean;
BEGIN
  IF pg_catalog.to_regprocedure(
    'private.entry_unit_matches_roles(bigint,bigint,bigint,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'ENTRY UNIT ROLES: helper missing';
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
  INTO v_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT location.id
  INTO v_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  SELECT supplier.id
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND coalesce(supplier.is_active, TRUE)
  ORDER BY supplier.id
  LIMIT 1;

  IF v_tenant IS NULL
     OR v_owner IS NULL
     OR v_branch IS NULL
     OR v_location IS NULL
     OR v_supplier IS NULL THEN
    RAISE EXCEPTION 'ENTRY UNIT ROLES: owner/branch/location/supplier fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__eur_r_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Entry receipt'
  )
  RETURNING id INTO v_receipt_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__eur_i_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Entry issue'
  )
  RETURNING id INTO v_issue_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__eur_p_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Entry production'
  )
  RETURNING id INTO v_production_unit;

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
    '__entry_unit_roles__',
    '__eur_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'raw_material',
    TRUE,
    v_receipt_unit,
    v_issue_unit,
    v_production_unit
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  )
  VALUES
    (v_tenant, v_ingredient, v_production_unit, 1, TRUE, TRUE, 0),
    (v_tenant, v_ingredient, v_issue_unit, 10, FALSE, TRUE, 1),
    (v_tenant, v_ingredient, v_receipt_unit, 100, FALSE, TRUE, 2);

  v_ok := private.entry_unit_matches_roles(
    v_tenant, v_ingredient, v_issue_unit, 'receipt,issue'
  );
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ENTRY UNIT ROLES: issue unit must match receipt,issue';
  END IF;

  v_ok := private.entry_unit_matches_roles(
    v_tenant, v_ingredient, v_receipt_unit, 'receipt,issue'
  );
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ENTRY UNIT ROLES: receipt unit must match receipt,issue';
  END IF;

  v_ok := private.entry_unit_matches_roles(
    v_tenant, v_ingredient, v_production_unit, 'receipt,issue'
  );
  IF v_ok THEN
    RAISE EXCEPTION 'ENTRY UNIT ROLES: production unit must not match receipt,issue';
  END IF;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch,
    v_location,
    v_supplier,
    '__EUR-GRN-' || pg_catalog.gen_random_uuid()::text,
    'draft',
    v_owner
  )
  RETURNING id INTO v_grn;

  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id, received_quantity, entry_unit_id
  )
  VALUES (v_tenant, v_grn, v_ingredient, 1, v_issue_unit);

  BEGIN
    INSERT INTO public.grn_items (
      tenant_id, grn_id, ingredient_id, received_quantity, entry_unit_id
    )
    VALUES (v_tenant, v_grn, v_ingredient, 1, v_production_unit);
    RAISE EXCEPTION 'ENTRY UNIT ROLES: GRN must reject production unit';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    created_by,
    source_location_id
  )
  VALUES (
    v_tenant,
    v_branch,
    '__EUR-ISSUE-' || pg_catalog.gen_random_uuid()::text,
    'other',
    'draft',
    v_owner,
    v_location
  )
  RETURNING id INTO v_issue;

  INSERT INTO public.stock_issue_items (
    tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost
  )
  VALUES (v_tenant, v_issue, v_ingredient, 1, v_receipt_unit, 0);

  BEGIN
    INSERT INTO public.stock_issue_items (
      tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost
    )
    VALUES (v_tenant, v_issue, v_ingredient, 1, v_production_unit, 0);
    RAISE EXCEPTION 'ENTRY UNIT ROLES: issue must reject production unit';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  RAISE NOTICE 'ENTRY UNIT ROLES: ok';
END;
$$;

ROLLBACK;
