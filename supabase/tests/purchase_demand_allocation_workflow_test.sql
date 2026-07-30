\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_unit bigint;
  v_ingredient bigint;
  v_supplier_a bigint;
  v_supplier_b bigint;
  v_demand_id bigint;
  v_rejected_demand_id bigint;
  v_item_id bigint;
  v_key uuid := pg_catalog.gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_po_id bigint;
  v_po_count integer;
  v_grn_count integer;
  v_submitted_by uuid;
  v_submitted_at timestamptz;
  v_failed boolean := FALSE;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.save_purchase_demand(bigint,bigint,date,text,jsonb,boolean,uuid)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.save_purchase_demand_allocations(bigint,jsonb,uuid)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.review_purchase_demand(bigint,text,jsonb,text,uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: required RPCs are missing';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.save_purchase_request(bigint,bigint,date,text,jsonb,boolean,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: legacy save RPC remains executable';
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
    RAISE EXCEPTION 'PURCHASE DEMAND: owner and central site fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__demand_' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Demand allocation test unit'
  )
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active
  )
  VALUES (
    v_tenant,
    '__demand_ingredient_' || pg_catalog.gen_random_uuid()::text,
    '__DEMAND-' || pg_catalog.gen_random_uuid()::text,
    0,
    'raw_material',
    'central_supply',
    TRUE
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

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES
    (
      v_tenant,
      '__demand_supplier_a_' || pg_catalog.gen_random_uuid()::text,
      TRUE
    ),
    (
      v_tenant,
      '__demand_supplier_b_' || pg_catalog.gen_random_uuid()::text,
      TRUE
    );

  SELECT supplier.id
  INTO v_supplier_a
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND supplier.name LIKE '__demand_supplier_a_%'
  ORDER BY supplier.id DESC
  LIMIT 1;

  SELECT supplier.id
  INTO v_supplier_b
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND supplier.name LIKE '__demand_supplier_b_%'
  ORDER BY supplier.id DESC
  LIMIT 1;

  INSERT INTO public.supplier_items (
    tenant_id,
    supplier_id,
    ingredient_id,
    is_active,
    is_preferred,
    created_by
  )
  VALUES
    (v_tenant, v_supplier_a, v_ingredient, TRUE, TRUE, v_owner),
    (v_tenant, v_supplier_b, v_ingredient, TRUE, FALSE, v_owner);

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
    'Warehouse demand without supplier selection',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 10,
        'entry_unit_id', v_unit,
        'notes', ''
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  v_demand_id := (v_result ->> 'demand_id')::bigint;

  SELECT demand.submitted_by, demand.submitted_at
  INTO v_submitted_by, v_submitted_at
  FROM public.purchase_requests AS demand
  WHERE demand.id = v_demand_id
    AND demand.tenant_id = v_tenant;

  v_result := public.save_purchase_demand(
    v_demand_id,
    v_branch,
    CURRENT_DATE + 2,
    'Warehouse updates demand before supplier allocation',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 12,
        'entry_unit_id', v_unit,
        'notes', ''
      )
    ),
    FALSE,
    NULL
  );

  IF v_result ->> 'status' <> 'pending_allocation'
     OR EXISTS (
       SELECT 1
       FROM public.purchase_requests AS demand
       WHERE demand.id = v_demand_id
         AND demand.tenant_id = v_tenant
         AND (
           demand.status <> 'pending_allocation'
           OR demand.submitted_by IS DISTINCT FROM v_submitted_by
           OR demand.submitted_at IS DISTINCT FROM v_submitted_at
           OR demand.needed_by <> CURRENT_DATE + 2
         )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.purchase_request_items AS item
       WHERE item.tenant_id = v_tenant
         AND item.purchase_request_id = v_demand_id
         AND item.quantity = 12
     ) THEN
    RAISE EXCEPTION
      'PURCHASE DEMAND: pending edit changed submission state';
  END IF;

  SELECT item.id
  INTO v_item_id
  FROM public.purchase_request_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.purchase_request_id = v_demand_id;

  PERFORM public.save_purchase_demand_allocations(
    v_demand_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'request_item_id', v_item_id,
        'supplier_id', v_supplier_a,
        'quantity', 4
      )
    ),
    pg_catalog.gen_random_uuid()
  );

  v_failed := FALSE;
  BEGIN
    PERFORM public.save_purchase_demand(
      v_demand_id,
      v_branch,
      CURRENT_DATE + 3,
      'This edit must be blocked after allocation starts',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'ingredient_id', v_ingredient,
          'quantity', 11,
          'entry_unit_id', v_unit,
          'notes', ''
        )
      ),
      TRUE,
      NULL
    );
  EXCEPTION
    WHEN check_violation THEN
      v_failed := SQLERRM LIKE '%purchase_demand_allocation_started%';
  END;
  IF NOT v_failed
     OR NOT EXISTS (
       SELECT 1
       FROM public.purchase_request_items AS item
       WHERE item.tenant_id = v_tenant
         AND item.purchase_request_id = v_demand_id
         AND item.quantity = 12
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.purchase_request_allocations AS allocation
       WHERE allocation.tenant_id = v_tenant
         AND allocation.purchase_request_id = v_demand_id
         AND allocation.quantity = 4
     ) THEN
    RAISE EXCEPTION
      'PURCHASE DEMAND: allocation did not lock warehouse editing';
  END IF;

  v_result := public.review_purchase_demand(
    v_demand_id,
    'request_changes',
    NULL,
    'Adjust the requested quantity',
    NULL
  );
  IF v_result ->> 'status' <> 'changes_requested' THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: request changes did not return demand';
  END IF;

  v_result := public.save_purchase_demand(
    v_demand_id,
    v_branch,
    CURRENT_DATE + 1,
    'Warehouse resubmits the returned demand',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 10,
        'entry_unit_id', v_unit,
        'notes', ''
      )
    ),
    TRUE,
    NULL
  );
  IF v_result ->> 'status' <> 'pending_allocation'
     OR EXISTS (
       SELECT 1
       FROM public.purchase_request_allocations AS allocation
       WHERE allocation.tenant_id = v_tenant
         AND allocation.purchase_request_id = v_demand_id
     ) THEN
    RAISE EXCEPTION
      'PURCHASE DEMAND: returned edit did not clear stale allocation';
  END IF;

  SELECT item.id
  INTO v_item_id
  FROM public.purchase_request_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.purchase_request_id = v_demand_id;

  v_failed := FALSE;
  BEGIN
    PERFORM public.review_purchase_demand(
      v_demand_id,
      'approve',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'request_item_id', v_item_id,
          'supplier_id', v_supplier_a,
          'quantity', 9
        )
      ),
      NULL,
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN check_violation THEN
      v_failed := TRUE;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: incomplete allocation was accepted';
  END IF;

  v_result := public.review_purchase_demand(
    v_demand_id,
    'approve',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'request_item_id', v_item_id,
        'supplier_id', v_supplier_a,
        'quantity', 4
      ),
      pg_catalog.jsonb_build_object(
        'request_item_id', v_item_id,
        'supplier_id', v_supplier_b,
        'quantity', 6
      )
    ),
    NULL,
    v_key
  );
  v_replay := public.review_purchase_demand(
    v_demand_id,
    'approve',
    NULL,
    NULL,
    v_key
  );

  IF v_result <> v_replay
     OR pg_catalog.jsonb_array_length(v_result -> 'purchase_orders') <> 2 THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: approve replay contract failed';
  END IF;

  v_failed := FALSE;
  BEGIN
    PERFORM public.save_purchase_demand(
      v_demand_id,
      v_branch,
      CURRENT_DATE + 4,
      'This edit must be blocked after PO creation',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'ingredient_id', v_ingredient,
          'quantity', 10,
          'entry_unit_id', v_unit,
          'notes', ''
        )
      ),
      TRUE,
      NULL
    );
  EXCEPTION
    WHEN check_violation THEN
      v_failed := SQLERRM LIKE '%purchase_demand_not_editable%';
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: active PO did not lock demand editing';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_po_count
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = v_demand_id
    AND purchase_order.status = 'approved'
    AND purchase_order.display_id ~ '-0[12]$';

  SELECT pg_catalog.count(*)
  INTO v_grn_count
  FROM public.goods_received_notes AS grn
  JOIN public.purchase_orders AS purchase_order
    ON purchase_order.id = grn.po_id
   AND purchase_order.tenant_id = grn.tenant_id
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = v_demand_id
    AND grn.status = 'draft';

  IF v_po_count <> 2
     OR v_grn_count <> 2
     OR EXISTS (
       SELECT 1
       FROM public.purchase_order_items AS item
       JOIN public.purchase_orders AS purchase_order
         ON purchase_order.id = item.po_id
        AND purchase_order.tenant_id = item.tenant_id
       WHERE purchase_order.tenant_id = v_tenant
         AND purchase_order.purchase_request_id = v_demand_id
         AND (item.unit_price_est IS NOT NULL OR item.line_total IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: PO/GRN atomic contract failed';
  END IF;

  SELECT purchase_order.id
  INTO v_po_id
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = v_demand_id
  ORDER BY purchase_order.group_sequence
  LIMIT 1;

  PERFORM public.cancel_purchase_order(v_po_id, 'Reallocate test quantity');

  IF (
    SELECT demand.status <> 'partially_ordered'
    FROM public.purchase_requests AS demand
    WHERE demand.id = v_demand_id
      AND demand.tenant_id = v_tenant
  )
  OR EXISTS (
    SELECT 1
    FROM public.purchase_request_allocations AS allocation
    WHERE allocation.tenant_id = v_tenant
      AND allocation.purchase_request_id = v_demand_id
  ) THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: cancelled PO did not reopen demand';
  END IF;

  v_result := public.save_purchase_demand(
    NULL,
    v_branch,
    CURRENT_DATE + 1,
    'Demand rejected by accounting',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient,
        'quantity', 1,
        'entry_unit_id', v_unit,
        'notes', ''
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  v_rejected_demand_id := (v_result ->> 'demand_id')::bigint;
  v_result := public.review_purchase_demand(
    v_rejected_demand_id,
    'reject',
    NULL,
    'Purchase is no longer needed',
    NULL
  );
  IF v_result ->> 'status' <> 'cancelled'
     OR NOT EXISTS (
       SELECT 1
       FROM public.purchase_requests AS demand
       WHERE demand.id = v_rejected_demand_id
         AND demand.tenant_id = v_tenant
         AND demand.status = 'cancelled'
         AND demand.status_reason = 'Purchase is no longer needed'
     ) THEN
    RAISE EXCEPTION 'PURCHASE DEMAND: reject did not cancel demand';
  END IF;
END;
$$;

ROLLBACK;
