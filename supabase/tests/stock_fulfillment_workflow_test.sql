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
    IF to_regprocedure(v_signature) IS NOT NULL THEN
      RAISE EXCEPTION 'STOCK FULFILLMENT: retired RPC still exists: %',
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
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES (
    v_tenant,
    '__stock_fulfillment_' || gen_random_uuid()::text,
    '__SF-' || gen_random_uuid()::text,
    0,
    'raw_material',
    v_source_kind,
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

  v_rejected := FALSE;
  BEGIN
    PERFORM public.stock_transfer_receive(
      v_transfer_id,
      jsonb_build_object(
        v_ingredient::text,
        jsonb_build_object('qty', 4, 'note', 'Damaged package')
      )
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := TRUE;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'STOCK FULFILLMENT: short receive accepted without classification';
  END IF;

  PERFORM public.stock_transfer_receive(
    v_transfer_id,
    jsonb_build_object(
      v_ingredient::text,
      jsonb_build_object(
        'qty', 4,
        'note', 'Damaged package',
        'shortfall_class', 'transit_loss'
      )
    )
  );

  IF (
    SELECT transfer.status
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_transfer_id
  ) <> 'received' THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: receive did not complete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.transfer_id = v_transfer_id
      AND movement.branch_id = v_source
      AND movement.movement_subtype = 'transfer_transit_loss'
      AND movement.quantity_change = 0
      AND movement.entry_quantity = 1
  ) THEN
    RAISE EXCEPTION
      'STOCK FULFILLMENT: transit shortfall was not attributed to source';
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

DO $$
DECLARE
  v_tenant bigint;
  v_owner_user uuid;
  v_kitchen_user uuid;
  v_supply_user uuid;
  v_kitchen bigint;
  v_supply bigint;
  v_other_branch bigint;
  v_kitchen_position bigint;
  v_supply_position bigint;
  v_supply_location bigint;
  v_kitchen_location bigint;
  v_unit bigint;
  v_supply_ingredient bigint;
  v_kitchen_ingredient bigint;
  v_request_key uuid := gen_random_uuid();
  v_request_id bigint;
  v_lane_request_id bigint;
  v_item_id bigint;
  v_transfer_id bigint;
  v_result jsonb;
  v_rejected boolean;
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner_user
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND profile.is_active
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id
  INTO v_kitchen
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'central_kitchen'
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT branch.id
  INTO v_supply
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'central_supply'
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT branch.id
  INTO v_other_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT position.id
  INTO v_kitchen_position
  FROM public.positions AS position
  WHERE position.tenant_id = v_tenant
    AND position.code = 'central_kitchen_lead';

  SELECT position.id
  INTO v_supply_position
  FROM public.positions AS position
  WHERE position.tenant_id = v_tenant
    AND position.code = 'central_supply_ops';

  IF v_owner_user IS NULL
     OR v_kitchen IS NULL
     OR v_supply IS NULL
     OR v_other_branch IS NULL
     OR v_kitchen_position IS NULL
     OR v_supply_position IS NULL THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: central role fixture missing';
  END IF;

  SELECT profile.id
  INTO v_kitchen_user
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND profile.is_active
    AND position.code <> 'owner'
  ORDER BY profile.id
  LIMIT 1;

  SELECT profile.id
  INTO v_supply_user
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND profile.is_active
    AND position.code <> 'owner'
    AND profile.id <> v_kitchen_user
  ORDER BY profile.id
  LIMIT 1;

  IF v_kitchen_user IS NULL OR v_supply_user IS NULL THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: central actor fixture missing';
  END IF;

  UPDATE public.profiles
  SET position_id = v_kitchen_position,
      branch_id = v_kitchen,
      updated_at = now()
  WHERE id = v_kitchen_user;

  UPDATE public.profiles
  SET position_id = v_supply_position,
      branch_id = v_supply,
      updated_at = now()
  WHERE id = v_supply_user;

  DELETE FROM public.staff_permissions
  WHERE user_id IN (v_kitchen_user, v_supply_user);

  PERFORM public.sync_missing_permissions_from_template();

  IF NOT EXISTS (
    SELECT 1
    FROM public.role_templates AS template
    WHERE template.tenant_id = v_tenant
      AND template.position_code = 'central_kitchen_lead'
      AND template.permission_keys @> ARRAY[
        'inventory:request_create',
        'inventory:request_submit',
        'inventory:request_cancel'
      ]::text[]
  ) THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: kitchen request template is invalid';
  END IF;

  SELECT location.id
  INTO v_supply_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_supply
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  IF v_supply_location IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id, branch_id, code, name, location_kind, is_active
    )
    VALUES (
      v_tenant,
      v_supply,
      '__sf_supply_' || substr(gen_random_uuid()::text, 1, 8),
      'Supply test warehouse',
      'warehouse',
      TRUE
    )
    RETURNING id INTO v_supply_location;
  END IF;

  SELECT location.id
  INTO v_kitchen_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_kitchen
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  IF v_kitchen_location IS NULL THEN
    INSERT INTO public.inventory_locations (
      tenant_id, branch_id, code, name, location_kind, is_active
    )
    VALUES (
      v_tenant,
      v_kitchen,
      '__sf_kitchen_' || substr(gen_random_uuid()::text, 1, 8),
      'Kitchen test warehouse',
      'warehouse',
      TRUE
    )
    RETURNING id INTO v_kitchen_location;
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__sf_kitchen_' || substr(gen_random_uuid()::text, 1, 8),
    'Kitchen request test unit'
  )
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
    '__sf_supply_' || gen_random_uuid()::text,
    '__SFS-' || gen_random_uuid()::text,
    0,
    'raw_material',
    'central_supply',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_supply_ingredient;

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
    '__sf_kitchen_' || gen_random_uuid()::text,
    '__SFK-' || gen_random_uuid()::text,
    0,
    'raw_material',
    'central_kitchen',
    TRUE,
    v_unit,
    v_unit,
    v_unit
  )
  RETURNING id INTO v_kitchen_ingredient;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES
    (v_tenant, v_supply_ingredient, v_unit, 1, TRUE, TRUE),
    (v_tenant, v_kitchen_ingredient, v_unit, 1, TRUE, TRUE);

  PERFORM set_config('request.jwt.claim.sub', v_kitchen_user::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_kitchen_user::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'central_kitchen_lead',
        'branch_id', v_kitchen
      )
    )::text,
    TRUE
  );

  v_result := public.save_stock_request(
    NULL,
    v_kitchen,
    now() + interval '1 day',
    'Kitchen requests central supply',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_supply_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 3
    )),
    TRUE,
    v_request_key
  );
  v_request_id := (v_result ->> 'request_id')::bigint;

  IF (
    public.save_stock_request(
      NULL,
      v_kitchen,
      NULL,
      'Kitchen request retry',
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_supply_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 9
      )),
      TRUE,
      v_request_key
    ) ->> 'request_id'
  )::bigint <> v_request_id THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: kitchen idempotency failed';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.save_stock_request(
      NULL,
      v_kitchen,
      NULL,
      'Kitchen self-source request',
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_kitchen_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 1
      )),
      TRUE,
      gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: kitchen self-source was accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.save_stock_request(
      NULL,
      v_other_branch,
      NULL,
      'Wrong branch request',
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_supply_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 1
      )),
      TRUE,
      gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: wrong-branch request was accepted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE notification.kind = 'inventory.stock_request_submitted'
      AND notification.entity_type = 'stock_request'
      AND notification.entity_id = v_request_id
      AND notification.target_branch_id = v_supply
      AND notification.action_url =
        '/inventory/transfers?requestId=' || v_request_id
      AND notification.expires_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: supply notification is invalid';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_user::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_user::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'branch_id', NULL
      )
    )::text,
    TRUE
  );

  v_result := public.save_stock_request(
    NULL,
    v_other_branch,
    NULL,
    'Submitted request gains another source',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_supply_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 1
    )),
    TRUE,
    gen_random_uuid()
  );
  v_lane_request_id := (v_result ->> 'request_id')::bigint;

  PERFORM public.save_stock_request(
    v_lane_request_id,
    v_other_branch,
    NULL,
    'Submitted request now has two sources',
    jsonb_build_array(
      jsonb_build_object(
        'ingredient_id', v_supply_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 2
      ),
      jsonb_build_object(
        'ingredient_id', v_kitchen_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 2
      )
    ),
    TRUE,
    NULL
  );

  IF (
    SELECT count(*)
    FROM public.notifications AS notification
    WHERE notification.kind = 'inventory.stock_request_submitted'
      AND notification.entity_type = 'stock_request'
      AND notification.entity_id = v_lane_request_id
      AND notification.action_url =
        '/inventory/transfers?requestId=' || v_lane_request_id
      AND notification.expires_at IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: added source notification is invalid';
  END IF;

  PERFORM public.save_stock_request(
    v_lane_request_id,
    v_other_branch,
    NULL,
    'Submitted request removes supply source',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_kitchen_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 2
    )),
    TRUE,
    NULL
  );

  IF EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE notification.kind = 'inventory.stock_request_submitted'
      AND notification.entity_id = v_lane_request_id
      AND notification.meta ->> 'fulfill_site_kind' = 'central_supply'
      AND (notification.expires_at IS NULL OR notification.expires_at > now())
  )
  OR NOT EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE notification.kind = 'inventory.stock_request_submitted'
      AND notification.entity_id = v_lane_request_id
      AND notification.meta ->> 'fulfill_site_kind' = 'central_kitchen'
      AND notification.action_url =
        '/inventory/transfers?requestId=' || v_lane_request_id
      AND notification.expires_at IS NULL
  ) THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: removed source notification is invalid';
  END IF;

  SELECT item.id
  INTO v_item_id
  FROM public.stock_request_items AS item
  WHERE item.request_id = v_request_id;

  INSERT INTO public.stock_levels (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    current_quantity
  )
  VALUES (
    v_tenant,
    v_supply,
    v_supply_location,
    v_supply_ingredient,
    10
  );

  PERFORM set_config('request.jwt.claim.sub', v_supply_user::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_supply_user::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'central_supply_ops',
        'branch_id', v_supply
      )
    )::text,
    TRUE
  );

  v_rejected := FALSE;
  BEGIN
    PERFORM public.save_stock_request(
      NULL,
      v_kitchen,
      NULL,
      'Supply actor creates for kitchen',
      jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_supply_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 1
      )),
      TRUE,
      gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: supply actor created kitchen request';
  END IF;

  v_result := public.fulfill_stock_request_lines(
    v_request_id,
    'central_supply',
    v_supply,
    v_supply_location,
    ARRAY[v_item_id]
  );
  v_transfer_id := (v_result ->> 'transfer_id')::bigint;

  IF (
    SELECT transfer.to_branch_id
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_transfer_id
  ) <> v_kitchen
  OR (
    SELECT transfer.to_location_id
    FROM public.stock_transfers AS transfer
    WHERE transfer.id = v_transfer_id
  ) <> v_kitchen_location THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: kitchen destination is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE notification.kind = 'inventory.stock_request_submitted'
      AND notification.entity_id = v_request_id
      AND (notification.expires_at IS NULL OR notification.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: completed source notification is live';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_kitchen_user::text, TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_kitchen_user::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'central_kitchen_lead',
        'branch_id', v_kitchen
      )
    )::text,
    TRUE
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_requests AS request
    JOIN public.stock_request_items AS item
      ON item.request_id = request.id
     AND item.tenant_id = request.tenant_id
    JOIN public.stock_transfers AS transfer
      ON transfer.stock_request_id = request.id
     AND transfer.tenant_id = request.tenant_id
    WHERE request.id = v_request_id
      AND request.branch_id = v_kitchen
      AND item.fulfill_site_kind = 'central_supply'
      AND transfer.id = v_transfer_id
  ) THEN
    RAISE EXCEPTION 'STOCK FULFILLMENT: kitchen cannot read own journey';
  END IF;
END;
$$;

ROLLBACK;
