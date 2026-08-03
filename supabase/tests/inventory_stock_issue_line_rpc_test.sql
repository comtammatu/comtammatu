\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch bigint;
  v_location bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_issue bigint;
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
    RAISE EXCEPTION 'ISSUE LINE RPC: owner/branch/location fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__issue_line_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Issue line RPC unit'
  )
  RETURNING id INTO v_unit;

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
    '__issue_line_rpc__',
    '__issue_line_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'raw_material',
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
    is_active,
    sort_order
  ) VALUES (v_tenant, v_ingredient, v_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    ingredient_id,
    location_id,
    current_quantity,
    avg_unit_cost
  ) VALUES (v_tenant, v_branch, v_ingredient, v_location, 20, 100);

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    created_by,
    source_location_id
  ) VALUES (
    v_tenant,
    v_branch,
    '__ISSUE-LINE-' || pg_catalog.gen_random_uuid()::text,
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

  PERFORM set_config('test.issue_line.tenant', v_tenant::text, TRUE);
  PERFORM set_config('test.issue_line.issue', v_issue::text, TRUE);
  PERFORM set_config('test.issue_line.ingredient', v_ingredient::text, TRUE);
  PERFORM set_config('test.issue_line.unit', v_unit::text, TRUE);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant bigint := current_setting('test.issue_line.tenant')::bigint;
  v_issue bigint := current_setting('test.issue_line.issue')::bigint;
  v_ingredient bigint := current_setting('test.issue_line.ingredient')::bigint;
  v_unit bigint := current_setting('test.issue_line.unit')::bigint;
  v_result jsonb;
  v_quantity numeric;
  v_reason text;
  v_photo_urls text[];
BEGIN
  BEGIN
    INSERT INTO public.stock_issue_items (
      tenant_id,
      issue_id,
      ingredient_id,
      quantity,
      entry_unit_id
    ) VALUES (v_tenant, v_issue, v_ingredient, 1, v_unit)
    ON CONFLICT (issue_id, ingredient_id, tenant_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
    RAISE EXCEPTION 'ISSUE LINE RPC: direct authenticated upsert accepted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;

  v_result := public.save_stock_issue_line(
    v_issue,
    v_ingredient,
    2,
    v_unit,
    'Initial quantity',
    ARRAY['https://example.invalid/evidence.webp']
  );
  IF coalesce((v_result ->> 'item_id')::bigint, 0) <= 0 THEN
    RAISE EXCEPTION 'ISSUE LINE RPC: insert did not return item id';
  END IF;

  PERFORM public.save_stock_issue_line(
    v_issue,
    v_ingredient,
    3,
    v_unit,
    'Updated quantity',
    NULL
  );

  SELECT item.quantity, item.reason, item.photo_urls
  INTO v_quantity, v_reason, v_photo_urls
  FROM public.stock_issue_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.issue_id = v_issue
    AND item.ingredient_id = v_ingredient;

  IF v_quantity <> 3
     OR v_reason <> 'Updated quantity'
     OR v_photo_urls <> ARRAY['https://example.invalid/evidence.webp'] THEN
    RAISE EXCEPTION 'ISSUE LINE RPC: draft update did not persist correctly';
  END IF;

  RAISE NOTICE 'ISSUE LINE RPC: ok';
END;
$$;

ROLLBACK;
