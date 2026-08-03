\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_issue_unit bigint;
  v_receipt_unit bigint;
  v_ingredient bigint;
  v_supplier bigint;
  v_demand_id bigint;
  v_item_id bigint;
  v_result jsonb;
  v_status text;
  v_po_qty numeric;
  v_po_unit bigint;
BEGIN
  IF pg_catalog.to_regprocedure(
    'private.purchase_request_item_ordered_base(bigint,bigint)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'private.purchase_request_item_remaining_demand_qty(bigint,bigint)'
     ) IS NULL THEN
    RAISE EXCEPTION 'COVERAGE BASE: helpers missing';
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
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'COVERAGE BASE: owner and central site fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__cov_issue_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Coverage issue unit'
  )
  RETURNING id INTO v_issue_unit;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__cov_receipt_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Coverage receipt unit'
  )
  RETURNING id INTO v_receipt_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id
  )
  VALUES (
    v_tenant,
    '__cov_ingredient_' || pg_catalog.gen_random_uuid()::text,
    '__COV-' || pg_catalog.gen_random_uuid()::text,
    0,
    'raw_material',
    'central_supply',
    TRUE,
    v_receipt_unit,
    v_issue_unit
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
  VALUES
    (v_tenant, v_ingredient, v_issue_unit, 1, TRUE, TRUE),
    (v_tenant, v_ingredient, v_receipt_unit, 100, FALSE, TRUE);

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (
    v_tenant,
    '__cov_supplier_' || pg_catalog.gen_random_uuid()::text,
    TRUE
  )
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
        'branch_id', v_branch
      )
    )::text,
    TRUE
  );

  v_result := public.save_purchase_demand(
    NULL,
    v_branch,
    CURRENT_DATE + 1,
    'Coverage base-unit demand',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 200,
        'entry_unit_id', v_issue_unit,
        'notes', ''
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  v_demand_id := (v_result ->> 'demand_id')::bigint;

  SELECT demand_item.id
  INTO v_item_id
  FROM public.purchase_request_items AS demand_item
  WHERE demand_item.purchase_request_id = v_demand_id
    AND demand_item.tenant_id = v_tenant;

  PERFORM public.save_purchase_demand_allocations(
    v_demand_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'request_item_id', v_item_id,
        'supplier_id', v_supplier,
        'quantity', 200
      )
    ),
    pg_catalog.gen_random_uuid()
  );

  v_result := public.review_purchase_demand(
    v_demand_id,
    'approve',
    NULL,
    NULL,
    pg_catalog.gen_random_uuid()
  );

  SELECT item.quantity, item.entry_unit_id
  INTO v_po_qty, v_po_unit
  FROM public.purchase_order_items AS item
  JOIN public.purchase_orders AS purchase_order
    ON purchase_order.id = item.po_id
   AND purchase_order.tenant_id = item.tenant_id
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = v_demand_id
    AND item.purchase_request_item_id = v_item_id;

  IF v_po_qty IS DISTINCT FROM 200
     OR v_po_unit IS DISTINCT FROM v_issue_unit THEN
    RAISE EXCEPTION
      'COVERAGE BASE: expected PO to preserve the active demand unit, got qty=% unit=%',
      v_po_qty,
      v_po_unit;
  END IF;

  IF private.purchase_request_item_ordered_base(v_tenant, v_item_id)
       IS DISTINCT FROM 200
     OR private.purchase_request_item_remaining_demand_qty(
          v_tenant,
          v_item_id
        )
       IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'COVERAGE BASE: ordered/remaining helpers wrong';
  END IF;

  v_status := private.recompute_purchase_request_status(
    v_demand_id,
    v_tenant
  );

  IF v_status IS DISTINCT FROM 'ordered'
     OR (
       SELECT demand.status
       FROM public.purchase_requests AS demand
       WHERE demand.id = v_demand_id
         AND demand.tenant_id = v_tenant
     ) IS DISTINCT FROM 'ordered' THEN
    RAISE EXCEPTION 'COVERAGE BASE: demand status stayed %', v_status;
  END IF;
END;
$$;

ROLLBACK;
