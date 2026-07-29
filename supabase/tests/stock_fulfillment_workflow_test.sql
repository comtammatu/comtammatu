\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_signature text;
  v_signatures constant text[] := ARRAY[
    'public.save_stock_request(bigint,bigint,timestamp with time zone,text,jsonb,boolean,uuid)',
    'public.cancel_stock_request(bigint,text)',
    'public.close_stock_request(bigint,text)',
    'public.reject_stock_request_lines(bigint,text,bigint[],text)',
    'public.fulfill_stock_request_lines(bigint,text,bigint,bigint,bigint[])',
    'public.cancel_stock_transfer(bigint,text)',
    'public.stock_transfer_confirm_ship(bigint)',
    'public.stock_transfer_confirm_receive(bigint)',
    'public.stock_transfer_receive(bigint,jsonb)'
  ];
  v_retired_signatures constant text[] := ARRAY[
    'public.create_stock_request_draft(bigint,text)',
    'public.add_stock_request_line(bigint,bigint,bigint,numeric)',
    'public.submit_stock_request(bigint)',
    'public.cancel_stock_request(bigint)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    IF to_regprocedure(v_signature) IS NULL
       OR has_function_privilege('anon', v_signature, 'EXECUTE')
       OR NOT has_function_privilege(
         'authenticated',
         v_signature,
         'EXECUTE'
       )
       OR NOT has_function_privilege(
         'service_role',
         v_signature,
         'EXECUTE'
       ) THEN
      RAISE EXCEPTION 'STOCK FULFILLMENT: invalid grant for %', v_signature;
    END IF;
  END LOOP;
  FOREACH v_signature IN ARRAY v_retired_signatures LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'STOCK FULFILLMENT: retired RPC is executable: %',
        v_signature;
    END IF;
  END LOOP;
  IF to_regprocedure(
    'public.save_stock_request(bigint,bigint,text,jsonb,boolean,uuid)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: legacy save RPC overload remains';
  END IF;

  IF pg_get_constraintdef(
    (
      SELECT constraint_row.oid
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'public.stock_requests'::regclass
        AND constraint_row.conname = 'stock_requests_status_check'
    )
  ) ~ '(partially_fulfilled|fulfilled)'
  OR pg_get_constraintdef(
    (
      SELECT constraint_row.oid
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'public.stock_request_items'::regclass
        AND constraint_row.conname = 'stock_request_items_status_check'
    )
  ) ~ '(shipped|received)' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: retired request status remains';
  END IF;
END;
$$;

DO $$
DECLARE
  v_owner uuid;
  v_tenant bigint;
  v_branch bigint;
  v_source bigint;
  v_source_kind text;
  v_source_location bigint;
  v_destination_location bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_request_key uuid := gen_random_uuid();
  v_request_id bigint;
  v_item_id bigint;
  v_transfer_id bigint;
  v_result jsonb;
  v_rejected boolean;
BEGIN
  SELECT profile.id, profile.tenant_id
  INTO v_owner, v_tenant
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND profile.is_active
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id, branch.branch_kind
  INTO v_source, v_source_kind
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT branch.id
  INTO v_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT location.id
  INTO v_source_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_source
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  SELECT location.id
  INTO v_destination_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  IF v_owner IS NULL OR v_source IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: seeded fixture missing';
  END IF;

  IF v_source_location IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant,
      v_source,
      '__sf_source_' || substr(gen_random_uuid()::text, 1, 8),
      'Stock fulfillment source',
      'warehouse',
      TRUE
    )
    RETURNING id INTO v_source_location;
  END IF;

  IF v_destination_location IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant,
      v_branch,
      '__sf_destination_' || substr(gen_random_uuid()::text, 1, 8),
      'Stock fulfillment destination',
      'warehouse',
      TRUE
    )
    RETURNING id INTO v_destination_location;
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__stock_fulfillment_' || substr(gen_random_uuid()::text, 1, 8),
    'Stock fulfillment test unit'
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
    '__stock_fulfillment_' || gen_random_uuid()::text,
    '__SF-' || gen_random_uuid()::text,
    0,
    'raw_material',
    v_source_kind,
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

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );

  v_result := public.save_stock_request(
    NULL,
    v_branch,
    now() + interval '1 day',
    'Atomic stock request',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 5
    )),
    TRUE,
    v_request_key
  );
  v_request_id := (v_result ->> 'request_id')::bigint;

  IF (
    public.save_stock_request(
      NULL,
      v_branch,
      NULL,
      'Idempotent retry',
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 9
      )),
      TRUE,
      v_request_key
    ) ->> 'request_id'
  )::bigint <> v_request_id THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: idempotency failed';
  END IF;
  IF (
    SELECT request.needed_at
    FROM public.stock_requests AS request
    WHERE request.id = v_request_id
  ) IS NULL THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: needed_at was not saved';
  END IF;

  SELECT item.id
  INTO v_item_id
  FROM public.stock_request_items AS item
  WHERE item.request_id = v_request_id;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.fulfill_stock_request_lines(
      v_request_id,
      v_source_kind,
      v_source,
      v_source_location,
      ARRAY[v_item_id]
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_rejected := TRUE;
  END;

  IF NOT v_rejected
     OR EXISTS (
       SELECT 1
       FROM public.stock_transfers AS transfer
       WHERE transfer.stock_request_id = v_request_id
     )
     OR (
       SELECT item.status
       FROM public.stock_request_items AS item
       WHERE item.id = v_item_id
     ) <> 'pending' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: insufficient-stock rollback failed';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    current_quantity
  )
  VALUES (
    v_tenant,
    v_source,
    v_source_location,
    v_ingredient,
    10
  );

  v_result := public.fulfill_stock_request_lines(
    v_request_id,
    v_source_kind,
    v_source,
    v_source_location,
    ARRAY[v_item_id]
  );
  v_transfer_id := (v_result ->> 'transfer_id')::bigint;

  PERFORM public.cancel_stock_transfer(
    v_transfer_id,
    'Test restoring pending line'
  );

  IF (
    SELECT item.status
    FROM public.stock_request_items AS item
    WHERE item.id = v_item_id
  ) <> 'pending' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: cancel did not restore line';
  END IF;

  v_result := public.fulfill_stock_request_lines(
    v_request_id,
    v_source_kind,
    v_source,
    v_source_location,
    ARRAY[v_item_id]
  );
  v_transfer_id := (v_result ->> 'transfer_id')::bigint;

  IF public.stock_transfer_confirm_ship(v_transfer_id) ->> 'status'
     <> 'in_transit' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: ship did not enter transit';
  END IF;

  PERFORM public.stock_transfer_confirm_receive(v_transfer_id);

  v_rejected := FALSE;
  BEGIN
    PERFORM public.stock_transfer_receive(
      v_transfer_id,
      jsonb_build_object(
        v_ingredient::text,
        jsonb_build_object('qty', 4)
      )
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := TRUE;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: short receive accepted without reason';
  END IF;

  PERFORM public.stock_transfer_receive(
    v_transfer_id,
    jsonb_build_object(
      v_ingredient::text,
      jsonb_build_object('qty', 4, 'note', 'Damaged package')
    )
  );

  IF (
    SELECT transfer.status
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_transfer_id
  ) <> 'received' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: receive did not complete';
  END IF;

  v_result := public.save_stock_request(
    NULL,
    v_branch,
    NULL,
    'Reject request line',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 1
    )),
    TRUE,
    gen_random_uuid()
  );
  v_request_id := (v_result ->> 'request_id')::bigint;
  SELECT item.id
  INTO v_item_id
  FROM public.stock_request_items AS item
  WHERE item.request_id = v_request_id;

  PERFORM public.reject_stock_request_lines(
    v_request_id,
    v_source_kind,
    ARRAY[v_item_id],
    'Source cannot fulfill this line'
  );

  IF (
    SELECT item.status
    FROM public.stock_request_items AS item
    WHERE item.id = v_item_id
  ) <> 'rejected' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: reject did not close the line';
  END IF;

  v_result := public.save_stock_request(
    NULL,
    v_branch,
    NULL,
    'Close remaining request line',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 1
    )),
    TRUE,
    gen_random_uuid()
  );
  v_request_id := (v_result ->> 'request_id')::bigint;
  SELECT item.id
  INTO v_item_id
  FROM public.stock_request_items AS item
  WHERE item.request_id = v_request_id;

  PERFORM public.close_stock_request(
    v_request_id,
    'Owner closed the remaining line'
  );

  IF (
    SELECT request.status
    FROM public.stock_requests AS request
    WHERE request.id = v_request_id
  ) <> 'closed'
  OR (
    SELECT item.status
    FROM public.stock_request_items AS item
    WHERE item.id = v_item_id
  ) <> 'cancelled' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: close state is invalid';
  END IF;
END;
$$;

ROLLBACK;
