\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_supply_user uuid;
  v_supply_branch bigint;
  v_kitchen_branch bigint;
  v_bm uuid;
  v_bm_branch bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_unmapped bigint;
  v_finished bigint;
  v_supplier bigint;
  v_result jsonb;
  v_replay jsonb;
  v_po_id bigint;
  v_po public.purchase_orders%ROWTYPE;
  v_grn_id bigint;
  v_grn_count integer;
  v_failed boolean;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_key uuid := pg_catalog.gen_random_uuid();
  v_template text;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.create_purchase_order(bigint,bigint,bigint,text,date,jsonb,boolean,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'WAVE1: create_purchase_order is missing';
  END IF;

  SELECT template.permission_keys::text
  INTO v_template
  FROM public.role_templates AS template
  WHERE template.position_code = 'branch_manager'
  LIMIT 1;
  IF v_template LIKE '%procurement:po_create%'
     OR v_template LIKE '%procurement:grn_create%' THEN
    RAISE EXCEPTION 'WAVE1: branch_manager must not gain PO/GRN create';
  END IF;

  FOR v_template IN
    SELECT template.permission_keys::text
    FROM public.role_templates AS template
    WHERE template.position_code IN (
      'central_supply_ops',
      'central_kitchen_lead'
    )
  LOOP
    IF v_template NOT LIKE '%procurement:po_create%' THEN
      RAISE EXCEPTION 'WAVE1: central templates must include po_create';
    END IF;
  END LOOP;

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
    AND EXISTS (
      SELECT 1
      FROM public.inventory_locations AS location
      WHERE location.tenant_id = branch.tenant_id
        AND location.branch_id = branch.id
        AND location.location_kind = 'warehouse'
        AND location.is_active
        AND location.is_default_receive
    )
  ORDER BY branch.id
  LIMIT 1;

  SELECT branch.id
  INTO v_kitchen_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'central_kitchen'
    AND branch.is_active
  ORDER BY branch.id
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

  IF v_tenant IS NULL
     OR v_owner IS NULL
     OR v_supply_branch IS NULL THEN
    RAISE EXCEPTION 'WAVE1: owner and central_supply fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__w1_u_' || v_suffix, 'Wave1 unit')
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__w1_nl_' || v_suffix,
    '__W1-' || v_suffix,
    0,
    'raw_material',
    'central_supply',
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
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__w1_unmap_' || v_suffix,
    '__W1U-' || v_suffix,
    0,
    'raw_material',
    'central_supply',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_unmapped;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (v_tenant, v_unmapped, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__w1_fg_' || v_suffix,
    '__W1FG-' || v_suffix,
    0,
    'finished_good',
    'central_kitchen',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_finished;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES (v_tenant, v_finished, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, '__w1_ncc_' || v_suffix, TRUE)
  RETURNING id INTO v_supplier;

  INSERT INTO public.supplier_items (
    tenant_id,
    supplier_id,
    ingredient_id,
    is_active,
    is_preferred,
    created_by
  )
  VALUES (v_tenant, v_supplier, v_ingredient, TRUE, TRUE, v_owner);

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'branch_id', v_supply_branch
      )
    )::text,
    TRUE
  );

  v_failed := FALSE;
  BEGIN
    PERFORM public.create_purchase_order(
      NULL,
      v_supplier,
      v_supply_branch,
      'FG must not PO',
      CURRENT_DATE + 1,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'ingredient_id', v_finished,
          'quantity', 1,
          'entry_unit_id', v_unit
        )
      ),
      FALSE,
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation THEN
      v_failed := SQLERRM LIKE '%finished_good_not_purchased%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'WAVE1: finished good must be rejected';
  END IF;

  v_result := public.create_purchase_order(
    NULL,
    v_supplier,
    v_supply_branch,
    'Draft may warn unmapped',
    CURRENT_DATE + 1,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_unmapped,
        'quantity', 2,
        'entry_unit_id', v_unit
      )
    ),
    FALSE,
    pg_catalog.gen_random_uuid()
  );
  IF v_result ->> 'status' <> 'draft'
     OR v_result ->> 'grn_id' IS NOT NULL THEN
    RAISE EXCEPTION 'WAVE1: unmapped draft must not Auto-GRN';
  END IF;
  v_po_id := (v_result ->> 'po_id')::bigint;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = v_po_id;
  IF v_po.purchase_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'WAVE1: draft must not attach YCM';
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.create_purchase_order(
      v_po_id,
      v_supplier,
      v_supply_branch,
      'Send must block unmapped',
      CURRENT_DATE + 1,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'ingredient_id', v_unmapped,
          'quantity', 2,
          'entry_unit_id', v_unit
        )
      ),
      TRUE,
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation THEN
      v_failed := SQLERRM LIKE '%supplier_item_mapping_required%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'WAVE1: send must reject unmapped lines';
  END IF;

  v_result := public.create_purchase_order(
    NULL,
    v_supplier,
    v_supply_branch,
    'Owner send without YCM',
    CURRENT_DATE + 1,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 4,
        'entry_unit_id', v_unit
      )
    ),
    TRUE,
    v_key
  );
  IF v_result ->> 'status' <> 'approved'
     OR v_result ->> 'grn_id' IS NULL THEN
    RAISE EXCEPTION 'WAVE1: send must approve and mint Auto-GRN';
  END IF;
  v_po_id := (v_result ->> 'po_id')::bigint;
  v_grn_id := (v_result ->> 'grn_id')::bigint;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = v_po_id;
  IF v_po.purchase_request_id IS NOT NULL THEN
    RAISE EXCEPTION 'WAVE1: sent PO must have null YCM FK';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS po_item
    WHERE po_item.po_id = v_po_id
      AND po_item.purchase_request_item_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'WAVE1: PO lines must not point at YCM lines';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_grn_count
  FROM public.goods_received_notes AS grn
  WHERE grn.po_id = v_po_id
    AND grn.status = 'draft';
  IF v_grn_count <> 1 OR v_grn_id IS NULL THEN
    RAISE EXCEPTION 'WAVE1: Auto-GRN draft missing';
  END IF;

  v_replay := public.create_purchase_order(
    NULL,
    v_supplier,
    v_supply_branch,
    'Owner send without YCM',
    CURRENT_DATE + 1,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 4,
        'entry_unit_id', v_unit
      )
    ),
    TRUE,
    v_key
  );
  IF (v_replay ->> 'po_id')::bigint <> v_po_id
     OR (v_replay ->> 'grn_id')::bigint <> v_grn_id THEN
    RAISE EXCEPTION 'WAVE1: idempotent send must replay the same PO and GRN';
  END IF;

  IF v_bm IS NOT NULL THEN
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
    v_failed := FALSE;
    BEGIN
      PERFORM public.create_purchase_order(
        NULL,
        v_supplier,
        v_supply_branch,
        'BM cannot PO',
        CURRENT_DATE + 1,
        pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'ingredient_id', v_ingredient,
            'quantity', 1,
            'entry_unit_id', v_unit
          )
        ),
        TRUE,
        pg_catalog.gen_random_uuid()
      );
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_failed := TRUE;
    END;
    IF NOT v_failed THEN
      RAISE EXCEPTION 'WAVE1: branch_manager must be forbidden';
    END IF;
  END IF;

  IF v_supply_user IS NULL THEN
    RAISE EXCEPTION 'WAVE1: central_supply_ops fixture required for ACL proof';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    v_supply_user::text,
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_supply_user::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'central_supply_ops',
        'branch_id', v_supply_branch
      )
    )::text,
    TRUE
  );

  v_result := public.create_purchase_order(
    NULL,
    v_supplier,
    v_supply_branch,
    'Warehouse send without YCM',
    CURRENT_DATE + 1,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 3,
        'entry_unit_id', v_unit
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  IF v_result ->> 'status' <> 'approved'
     OR v_result ->> 'grn_id' IS NULL THEN
    RAISE EXCEPTION 'WAVE1: warehouse send must mint Auto-GRN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = (v_result ->> 'po_id')::bigint
      AND purchase_order.purchase_request_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'WAVE1: warehouse PO must not attach YCM';
  END IF;

  IF v_kitchen_branch IS NOT NULL
     AND v_kitchen_branch IS DISTINCT FROM v_supply_branch THEN
    v_failed := FALSE;
    BEGIN
      PERFORM public.create_purchase_order(
        NULL,
        v_supplier,
        v_kitchen_branch,
        'Pinned site only',
        CURRENT_DATE + 1,
        pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'ingredient_id', v_ingredient,
            'quantity', 1,
            'entry_unit_id', v_unit
          )
        ),
        TRUE,
        pg_catalog.gen_random_uuid()
      );
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_failed := TRUE;
    END;
    IF NOT v_failed THEN
      RAISE EXCEPTION
        'WAVE1: central_supply_ops must not create PO for the other site';
    END IF;
  END IF;
END;
$$;

ROLLBACK;
