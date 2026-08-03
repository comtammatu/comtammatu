\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.branches AS branch
    LEFT JOIN public.inventory_locations AS warehouse
      ON warehouse.tenant_id = branch.tenant_id
     AND warehouse.branch_id = branch.id
     AND warehouse.location_kind = 'warehouse'
     AND warehouse.is_active IS TRUE
    WHERE branch.is_active IS TRUE
      AND branch.branch_kind IN (
        'branch',
        'central_supply',
        'central_kitchen'
      )
    GROUP BY branch.tenant_id, branch.id
    HAVING count(warehouse.id) <> 1
       OR bool_and(
         warehouse.is_default_receive
         AND warehouse.is_default_issue
         AND warehouse.is_default_consumption
       ) IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'inventory_topology_warehouse_invariant_invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations
    WHERE location_kind = 'kitchen'
  ) THEN
    RAISE EXCEPTION 'inventory_topology_kitchen_location_survived';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'inventory_locations'
      AND indexname =
        'inventory_locations_one_active_warehouse_per_site_idx'
  ) THEN
    RAISE EXCEPTION 'inventory_topology_warehouse_index_missing';
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.recreate_grn_at_receiving_site(bigint,bigint,bigint,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'inventory_topology_retired_grn_recreate_survived';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'weekly_grn_override_report'
  ) THEN
    RAISE EXCEPTION 'inventory_topology_retired_cron_survived';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.create_production_run_with_locations(bigint,bigint,numeric,bigint,text,bigint,jsonb,bigint,bigint)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%production_maintenance_legacy_rpc%' THEN
    RAISE EXCEPTION 'inventory_topology_legacy_production_create_exposed';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.get_production_recipe_context_for_location(bigint,bigint,bigint)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%production_maintenance_legacy_rpc%' THEN
    RAISE EXCEPTION 'inventory_topology_legacy_recipe_context_exposed';
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.create_inventory_document_correction(text,bigint,bigint,bigint,numeric,text,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'inventory_topology_document_correction_missing';
  END IF;

  SELECT pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
  INTO v_definition
  FROM pg_catalog.pg_policy AS policy
  WHERE policy.polrelid = 'storage.objects'::regclass
    AND policy.polname = 'inv_attach_insert';

  IF v_definition NOT LIKE '%goods_received_notes%'
     OR v_definition NOT LIKE '%has_permission%grn.branch_id%' THEN
    RAISE EXCEPTION 'inventory_topology_attachment_scope_invalid';
  END IF;
END;
$$;

ROLLBACK;
