\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_branch_a bigint;
  v_branch_b bigint;
  v_location_a bigint;
  v_location_b bigint;
  v_supplier bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_grn bigint;
  v_issue bigint;
  v_transfer bigint;
  v_run bigint;
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
  INTO v_branch_a, v_location_a
  FROM public.branches AS branch
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.inventory_locations AS candidate
    WHERE candidate.tenant_id = branch.tenant_id
      AND candidate.branch_id = branch.id
      AND candidate.is_active
      AND candidate.location_kind = 'warehouse'
    ORDER BY candidate.id
    LIMIT 1
  ) AS location ON TRUE
  WHERE branch.tenant_id = v_tenant
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT branch.id, location.id
  INTO v_branch_b, v_location_b
  FROM public.branches AS branch
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.inventory_locations AS candidate
    WHERE candidate.tenant_id = branch.tenant_id
      AND candidate.branch_id = branch.id
      AND candidate.is_active
      AND candidate.location_kind = 'warehouse'
    ORDER BY candidate.id
    LIMIT 1
  ) AS location ON TRUE
  WHERE branch.tenant_id = v_tenant
    AND branch.is_active
    AND branch.id <> v_branch_a
  ORDER BY branch.id
  LIMIT 1;

  SELECT supplier.id
  INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND coalesce(supplier.is_active, TRUE)
  ORDER BY supplier.id
  LIMIT 1;

  IF v_owner IS NULL
     OR v_branch_a IS NULL
     OR v_branch_b IS NULL
     OR v_location_a IS NULL
     OR v_location_b IS NULL
     OR v_supplier IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT CORRECTION: owner/two branches/locations/supplier required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__doc_correction_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Document correction unit'
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
    '__document_correction__',
    '__doc_correction_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'raw_material',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id, ingredient_id, unit_id, to_base_factor, is_base, is_active, sort_order
  ) VALUES (v_tenant, v_ingredient, v_unit, 1, TRUE, TRUE, 0);

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, location_id, current_quantity, avg_unit_cost
  ) VALUES
    (v_tenant, v_branch_a, v_ingredient, v_location_a, 20, 100),
    (v_tenant, v_branch_b, v_ingredient, v_location_b, 20, 100);

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, location_id, supplier_id, grn_number, status, created_by
  ) VALUES (
    v_tenant, v_branch_a, v_location_a, v_supplier,
    '__DOC-GRN-' || pg_catalog.gen_random_uuid()::text, 'confirmed', v_owner
  ) RETURNING id INTO v_grn;
  INSERT INTO public.grn_items (
    tenant_id, grn_id, ingredient_id, received_quantity, entry_unit_id
  ) VALUES (v_tenant, v_grn, v_ingredient, 1, v_unit);

  INSERT INTO public.stock_issues (
    tenant_id, branch_id, issue_number, issue_type, status, created_by,
    source_location_id
  ) VALUES (
    v_tenant, v_branch_a,
    '__DOC-ISSUE-' || pg_catalog.gen_random_uuid()::text,
    'other', 'confirmed', v_owner, v_location_a
  ) RETURNING id INTO v_issue;
  INSERT INTO public.stock_issue_items (
    tenant_id, issue_id, ingredient_id, quantity, entry_unit_id, unit_cost
  ) VALUES (v_tenant, v_issue, v_ingredient, 1, v_unit, 0);

  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, transfer_number, status,
    created_by, from_location_id, to_location_id
  ) VALUES (
    v_tenant, v_branch_a, v_branch_b,
    '__DOC-TRANSFER-' || pg_catalog.gen_random_uuid()::text,
    'received', v_owner, v_location_a, v_location_b
  ) RETURNING id INTO v_transfer;
  INSERT INTO public.stock_transfer_items (
    tenant_id, transfer_id, ingredient_id, quantity, entry_unit_id
  ) VALUES (v_tenant, v_transfer, v_ingredient, 1, v_unit);

  INSERT INTO public.production_runs (
    tenant_id, production_number, branch_id, target_branch_id,
    source_location_id, target_location_id, finished_good_id,
    planned_quantity, actual_quantity, entry_unit_id, status, created_by
  ) VALUES (
    v_tenant,
    '__DOC-RUN-' || pg_catalog.gen_random_uuid()::text,
    v_branch_a, v_branch_b, v_location_a, v_location_b, v_ingredient,
    1, 1, v_unit, 'completed', v_owner
  ) RETURNING id INTO v_run;

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

  PERFORM set_config('test.doc_correction.owner', v_owner::text, TRUE);
  PERFORM set_config('test.doc_correction.tenant', v_tenant::text, TRUE);
  PERFORM set_config('test.doc_correction.branch_a', v_branch_a::text, TRUE);
  PERFORM set_config('test.doc_correction.branch_b', v_branch_b::text, TRUE);
  PERFORM set_config('test.doc_correction.location_a', v_location_a::text, TRUE);
  PERFORM set_config('test.doc_correction.location_b', v_location_b::text, TRUE);
  PERFORM set_config('test.doc_correction.ingredient', v_ingredient::text, TRUE);
  PERFORM set_config('test.doc_correction.grn', v_grn::text, TRUE);
  PERFORM set_config('test.doc_correction.issue', v_issue::text, TRUE);
  PERFORM set_config('test.doc_correction.transfer', v_transfer::text, TRUE);
  PERFORM set_config('test.doc_correction.run', v_run::text, TRUE);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner uuid := current_setting('test.doc_correction.owner')::uuid;
  v_tenant bigint := current_setting('test.doc_correction.tenant')::bigint;
  v_branch_a bigint := current_setting('test.doc_correction.branch_a')::bigint;
  v_branch_b bigint := current_setting('test.doc_correction.branch_b')::bigint;
  v_location_a bigint := current_setting('test.doc_correction.location_a')::bigint;
  v_location_b bigint := current_setting('test.doc_correction.location_b')::bigint;
  v_ingredient bigint := current_setting('test.doc_correction.ingredient')::bigint;
  v_grn bigint := current_setting('test.doc_correction.grn')::bigint;
  v_issue bigint := current_setting('test.doc_correction.issue')::bigint;
  v_transfer bigint := current_setting('test.doc_correction.transfer')::bigint;
  v_run bigint := current_setting('test.doc_correction.run')::bigint;
  v_grn_key uuid := gen_random_uuid();
  v_result jsonb;
  v_movement_count integer;
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.create_inventory_document_correction(text,bigint,bigint,bigint,numeric,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.create_inventory_document_correction(text,bigint,bigint,bigint,numeric,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'public.create_inventory_document_correction(text,bigint,bigint,bigint,numeric,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'DOCUMENT CORRECTION: RPC ACL invalid';
  END IF;

  v_result := public.create_inventory_document_correction(
    'grn', v_grn, v_branch_a, v_ingredient, 1,
    'Correct confirmed GRN quantity', v_grn_key
  );
  IF coalesce((v_result ->> 'idempotent')::boolean, TRUE) THEN
    RAISE EXCEPTION 'DOCUMENT CORRECTION: first GRN call marked idempotent';
  END IF;

  v_result := public.create_inventory_document_correction(
    'grn', v_grn, v_branch_a, v_ingredient, 1,
    'Correct confirmed GRN quantity', v_grn_key
  );
  IF NOT coalesce((v_result ->> 'idempotent')::boolean, FALSE) THEN
    RAISE EXCEPTION 'DOCUMENT CORRECTION: GRN replay not idempotent';
  END IF;

  PERFORM public.create_inventory_document_correction(
    'issue', v_issue, v_branch_a, v_ingredient, 1,
    'Correct confirmed issue quantity', gen_random_uuid()
  );
  PERFORM public.create_inventory_document_correction(
    'transfer', v_transfer, v_branch_a, v_ingredient, 1,
    'Correct received transfer quantity', gen_random_uuid()
  );
  PERFORM public.create_inventory_document_correction(
    'production_run', v_run, v_branch_b, v_ingredient, 1,
    'Correct completed production output', gen_random_uuid()
  );

  SELECT count(*)
  INTO v_movement_count
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.ingredient_id = v_ingredient
    AND movement.correction_idempotency_key IS NOT NULL
    AND movement.created_by = v_owner
    AND movement.type = 'adjustment';
  IF v_movement_count <> 4 THEN
    RAISE EXCEPTION 'DOCUMENT CORRECTION: expected 4 movements, got %', v_movement_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE correction_idempotency_key = v_grn_key
      AND grn_id = v_grn
      AND branch_id = v_branch_a
      AND location_id = v_location_a
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE issue_id = v_issue AND location_id = v_location_a
      AND correction_idempotency_key IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE transfer_id = v_transfer AND branch_id = v_branch_a
      AND location_id = v_location_a
      AND correction_idempotency_key IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE production_run_id = v_run AND branch_id = v_branch_b
      AND location_id = v_location_b
      AND correction_idempotency_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'DOCUMENT CORRECTION: source/location link invalid';
  END IF;

  BEGIN
    PERFORM public.create_inventory_document_correction(
      'grn', v_grn, v_branch_a, v_ingredient, 2,
      'Correct confirmed GRN quantity', v_grn_key
    );
    RAISE EXCEPTION 'DOCUMENT CORRECTION: idempotency conflict accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_inventory_document_correction(
      'grn', v_grn, v_branch_a, v_ingredient, -1000,
      'Reject correction below stock zero', gen_random_uuid()
    );
    RAISE EXCEPTION 'DOCUMENT CORRECTION: negative stock accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_inventory_document_correction(
      'production_run', v_run, v_branch_a, v_ingredient, 1,
      'Reject production source branch scope', gen_random_uuid()
    );
    RAISE EXCEPTION 'DOCUMENT CORRECTION: production source scope accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'DOCUMENT CORRECTION: ok';
END;
$$;

ROLLBACK;
