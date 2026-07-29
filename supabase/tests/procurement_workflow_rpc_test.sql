\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_signature text;
  v_signatures constant text[] := ARRAY[
    'public.save_purchase_request(bigint,bigint,date,text,jsonb,boolean,uuid)',
    'public.cancel_purchase_request(bigint,text)',
    'public.close_purchase_request(bigint,text)',
    'public.send_purchase_order(bigint)',
    'public.save_purchase_orders_from_request(bigint,jsonb,boolean,uuid)',
    'public.save_purchase_order(bigint,date,text,jsonb,boolean)',
    'public.cancel_purchase_order(bigint,text)',
    'public.close_purchase_order(bigint,text)',
    'public.save_goods_receipt_note(bigint,timestamp with time zone,text,jsonb)',
    'public.cancel_goods_receipt_note(bigint,text)',
    'public.save_stock_request(bigint,bigint,text,jsonb,boolean,uuid)',
    'public.cancel_stock_request(bigint,text)',
    'public.close_stock_request(bigint,text)',
    'public.cancel_stock_transfer(bigint,text)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'WORKFLOW RPC: missing %', v_signature;
    END IF;
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
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
      RAISE EXCEPTION 'WORKFLOW RPC: grants invalid for %', v_signature;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = to_regprocedure(v_signature)
        AND procedure.prosecdef IS TRUE
        AND procedure.proconfig @> ARRAY['search_path=""']::text[]
    ) THEN
      RAISE EXCEPTION 'WORKFLOW RPC: security contract invalid for %',
        v_signature;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.permission_keys
    WHERE key = 'procurement:request_manage'
      AND scope = 'branch'
      AND is_delegable_to_staff IS TRUE
  ) THEN
    RAISE EXCEPTION 'WORKFLOW RPC: request permission missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.purchase_requests'::regclass
      AND conname = 'purchase_requests_status_check'
      AND pg_get_constraintdef(oid) LIKE '%closed%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.purchase_orders'::regclass
      AND conname = 'purchase_orders_status_check'
      AND pg_get_constraintdef(oid) LIKE '%closed%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.stock_requests'::regclass
      AND conname = 'stock_requests_status_check'
      AND pg_get_constraintdef(oid) LIKE '%closed%'
  ) THEN
    RAISE EXCEPTION 'WORKFLOW RPC: closed status contract missing';
  END IF;
END;
$$;

DO $$
DECLARE
  v_owner uuid;
  v_tenant bigint;
  v_central_branch bigint;
  v_branch bigint;
  v_unit bigint;
  v_ingredient bigint;
  v_request_key uuid := gen_random_uuid();
  v_stock_request_key uuid := gen_random_uuid();
  v_first jsonb;
  v_second jsonb;
  v_request_id bigint;
  v_stock_request_id bigint;
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

  SELECT branch.id
  INTO v_central_branch
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

  IF v_owner IS NULL
     OR v_tenant IS NULL
     OR v_central_branch IS NULL
     OR v_branch IS NULL THEN
    RAISE EXCEPTION 'WORKFLOW RPC: seeded owner/site fixture missing';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__workflow_' || substr(gen_random_uuid()::text, 1, 8),
    'Workflow test unit'
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
    '__workflow_ingredient_' || gen_random_uuid()::text,
    '__WF-' || gen_random_uuid()::text,
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

  v_first := public.save_purchase_request(
    NULL,
    v_central_branch,
    current_date + 1,
    'Atomic direct submit',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 2
    )),
    TRUE,
    v_request_key
  );
  v_second := public.save_purchase_request(
    NULL,
    v_central_branch,
    current_date + 1,
    'Atomic direct submit retry',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 2
    )),
    TRUE,
    v_request_key
  );
  v_request_id := (v_first ->> 'request_id')::bigint;

  IF v_request_id IS NULL
     OR v_second ->> 'request_id' <> v_first ->> 'request_id'
     OR (SELECT status FROM public.purchase_requests WHERE id = v_request_id)
        <> 'submitted'
     OR (SELECT count(*) FROM public.purchase_request_items
         WHERE purchase_request_id = v_request_id) <> 1 THEN
    RAISE EXCEPTION 'WORKFLOW RPC: YCM direct submit/idempotency failed';
  END IF;

  PERFORM public.cancel_purchase_request(
    v_request_id,
    'Test cancellation before PO'
  );
  IF (SELECT status FROM public.purchase_requests WHERE id = v_request_id)
     <> 'cancelled' THEN
    RAISE EXCEPTION 'WORKFLOW RPC: YCM cancel failed';
  END IF;

  v_first := public.save_stock_request(
    NULL,
    v_branch,
    'Atomic direct submit',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 3
    )),
    TRUE,
    v_stock_request_key
  );
  v_second := public.save_stock_request(
    NULL,
    v_branch,
    'Atomic direct submit retry',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient,
      'entry_unit_id', v_unit,
      'quantity', 3
    )),
    TRUE,
    v_stock_request_key
  );
  v_stock_request_id := (v_first ->> 'request_id')::bigint;

  IF v_stock_request_id IS NULL
     OR v_second ->> 'request_id' <> v_first ->> 'request_id'
     OR (SELECT status FROM public.stock_requests WHERE id = v_stock_request_id)
        <> 'submitted'
     OR (SELECT count(*) FROM public.stock_request_items
         WHERE request_id = v_stock_request_id) <> 1 THEN
    RAISE EXCEPTION 'WORKFLOW RPC: YCH direct submit/idempotency failed';
  END IF;

  PERFORM public.cancel_stock_request(
    v_stock_request_id,
    'Test cancellation before Transfer'
  );
  IF (SELECT status FROM public.stock_requests WHERE id = v_stock_request_id)
     <> 'cancelled' THEN
    RAISE EXCEPTION 'WORKFLOW RPC: YCH cancel failed';
  END IF;
END;
$$;

ROLLBACK;
