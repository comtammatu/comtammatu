-- Run after migrations against an isolated dev/test database.
\set ON_ERROR_STOP on
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_warehouse_id bigint;
  v_signature regprocedure;
  v_source text;
BEGIN
  SELECT t.id
  INTO v_tenant_id
  FROM public.tenants AS t
  ORDER BY t.id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'inventory_single_warehouse_test_requires_tenant';
  END IF;

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active
  )
  VALUES (
    v_tenant_id,
    '__single_warehouse_test_' || pg_catalog.txid_current()::text,
    'central_kitchen',
    TRUE
  )
  RETURNING id INTO v_branch_id;

  SELECT il.id
  INTO v_warehouse_id
  FROM public.inventory_locations AS il
  WHERE il.tenant_id = v_tenant_id
    AND il.branch_id = v_branch_id
    AND il.location_kind = 'warehouse'
    AND il.is_active = TRUE
    AND il.is_default_receive = TRUE
    AND il.is_default_issue = TRUE
    AND il.is_default_consumption = TRUE;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'active_site_warehouse_not_created';
  END IF;

  BEGIN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active
    )
    VALUES (
      v_tenant_id,
      v_branch_id,
      'legacy_kitchen',
      'Legacy kitchen',
      'kitchen',
      TRUE
    );
    RAISE EXCEPTION 'active_legacy_location_was_accepted';
  EXCEPTION
    WHEN check_violation OR unique_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.inventory_locations (
      tenant_id,
      branch_id,
      code,
      name,
      location_kind,
      is_active,
      is_default_receive,
      is_default_issue,
      is_default_consumption
    )
    VALUES (
      v_tenant_id,
      v_branch_id,
      'second_warehouse',
      'Second warehouse',
      'warehouse',
      TRUE,
      TRUE,
      TRUE,
      TRUE
    );
    RAISE EXCEPTION 'second_active_warehouse_was_accepted';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  BEGIN
    UPDATE public.inventory_locations
    SET is_active = FALSE,
        is_default_receive = FALSE,
        is_default_issue = FALSE,
        is_default_consumption = FALSE
    WHERE id = v_warehouse_id;

    SET CONSTRAINTS trg_inventory_locations_active_site_warehouse IMMEDIATE;
    RAISE EXCEPTION 'active_site_without_warehouse_was_accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.branches AS b
    WHERE b.is_active = TRUE
      AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
      AND (
        SELECT count(*)
        FROM public.inventory_locations AS il
        WHERE il.tenant_id = b.tenant_id
          AND il.branch_id = b.id
          AND il.location_kind = 'warehouse'
          AND il.is_active = TRUE
          AND il.is_default_receive = TRUE
          AND il.is_default_issue = TRUE
          AND il.is_default_consumption = TRUE
      ) <> 1
  ) THEN
    RAISE EXCEPTION 'active_site_warehouse_count_invalid';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.branch_manager_approve_consumption_report(bigint,bigint)'::regprocedure,
    'public.consume_stock_for_order(bigint)'::regprocedure,
    'public.consume_stock_for_order_service(bigint,uuid)'::regprocedure,
    'public.create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)'::regprocedure,
    'public.get_production_recipe_context_for_location(bigint,bigint,bigint)'::regprocedure
  ]
  LOOP
    SELECT p.prosrc
    INTO v_source
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = v_signature::oid;

    IF v_source LIKE '%location_kind = ''kitchen''%'
       OR v_source LIKE '%location_kind = ''production_storage''%' THEN
      RAISE EXCEPTION 'legacy_inventory_routing_remains:%', v_signature;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
