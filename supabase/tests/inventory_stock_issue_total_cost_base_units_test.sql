\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch bigint;
  v_location bigint;
  v_base_unit bigint;
  v_pack_unit bigint;
  v_ingredient bigint;
  v_issue bigint;
  v_item_id bigint;
  v_total numeric;
BEGIN
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

  SELECT branch.id, location.id
  INTO v_branch, v_location
  FROM public.branches AS branch
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.inventory_locations AS candidate
    WHERE candidate.tenant_id = branch.tenant_id
      AND candidate.branch_id = branch.id
      AND candidate.location_kind = 'warehouse'
      AND candidate.is_active IS TRUE
    ORDER BY candidate.id
    LIMIT 1
  ) AS location ON TRUE
  WHERE branch.tenant_id = v_tenant
    AND branch.is_active IS TRUE
  ORDER BY branch.id
  LIMIT 1;

  IF v_owner IS NULL OR v_branch IS NULL OR v_location IS NULL THEN
    RAISE EXCEPTION 'ISSUE TOTAL COST: owner/branch/location fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__itc_base_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Issue total-cost base'
  )
  RETURNING id INTO v_base_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__itc_pack_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Issue total-cost pack'
  )
  RETURNING id INTO v_pack_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    item_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  ) VALUES (
    v_tenant,
    '__issue_total_cost__',
    '__itc_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'raw_material',
    TRUE,
    v_base_unit,
    v_base_unit,
    v_base_unit
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  ) VALUES
    (v_tenant, v_ingredient, v_base_unit, 1, TRUE, TRUE, 0),
    (v_tenant, v_ingredient, v_pack_unit, 50, FALSE, TRUE, 1);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_ingredient, v_location, 500, 10);

  INSERT INTO public.stock_issues (
    tenant_id, branch_id, issue_number, issue_type, status, created_by, source_location_id
  ) VALUES (
    v_tenant,
    v_branch,
    '__ISSUE-TOTAL-' || pg_catalog.gen_random_uuid()::text,
    'consumption',
    'draft',
    v_owner,
    v_location
  )
  RETURNING id INTO v_issue;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );

  PERFORM public.save_stock_issue_line(
    v_issue,
    v_ingredient,
    4,
    v_pack_unit,
    'Pack entry unit',
    NULL
  );

  SELECT item.id, item.total_cost
  INTO v_item_id, v_total
  FROM public.stock_issue_items AS item
  WHERE item.issue_id = v_issue
    AND item.ingredient_id = v_ingredient;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'ISSUE TOTAL COST: line missing after save';
  END IF;

  -- 4 pack × 50 base × 10 VND WAC = 2000
  IF v_total IS DISTINCT FROM 2000::numeric THEN
    RAISE EXCEPTION 'ISSUE TOTAL COST: expected 2000 got %', v_total;
  END IF;

  UPDATE public.stock_issue_items
  SET unit_cost = 12
  WHERE id = v_item_id;

  SELECT item.total_cost
  INTO v_total
  FROM public.stock_issue_items AS item
  WHERE item.id = v_item_id;

  -- Confirm-time WAC rewrite must revalue: 4 × 50 × 12 = 2400
  IF v_total IS DISTINCT FROM 2400::numeric THEN
    RAISE EXCEPTION 'ISSUE TOTAL COST: expected 2400 after unit_cost update got %', v_total;
  END IF;
END;
$$;

ROLLBACK;
