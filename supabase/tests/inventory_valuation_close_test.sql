\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.permission_keys
    WHERE key = 'accounting:period_close'
      AND NOT is_delegable_to_staff
  ) THEN
    RAISE EXCEPTION 'COST CLOSE: owner close permission is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.prepare_inventory_valuation_cutover(uuid)'::pg_catalog.regprocedure;
  v_definition := v_definition || pg_catalog.pg_get_functiondef(
    'private.prepare_inventory_valuation_cutover_prebootstrap(uuid)'::pg_catalog.regprocedure
  );
  IF v_definition !~ 'inventory_valuation_negative_stock'
     OR v_definition !~ 'inventory_valuation_zero_cost_stock'
     OR v_definition !~ 'inventory_valuation_quantity_drift'
     OR v_definition !~ 'inventory_valuation_ambiguous_grn_lineage'
     OR v_definition !~ 'inventory_valuation_propagation_unfinished' THEN
    RAISE EXCEPTION 'COST CLOSE: cutover blockers are incomplete';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.close_inventory_cost_period(integer,integer,text,uuid)'::pg_catalog.regprocedure;
  IF v_definition !~ 'inventory_cost_close_waiver_required'
     OR v_definition !~ 'inventory_valuation_movement_unposted'
     OR v_definition !~ 'inventory_valuation_cost_pending'
     OR v_definition !~ 'close_period_hard' THEN
    RAISE EXCEPTION 'COST CLOSE: hard-close gates are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'inventory-valuation-reconciliation-daily'
  ) THEN
    RAISE EXCEPTION 'COST CLOSE: reconciliation cron is missing';
  END IF;
END;
$$;

ROLLBACK;
