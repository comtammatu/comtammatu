\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_constraint text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO v_constraint
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conname = 'inventory_valuation_cutovers_status_check'
    AND constraint_row.conrelid =
      'public.inventory_valuation_cutovers'::pg_catalog.regclass;

  IF v_constraint !~ '''active''' OR v_constraint ~ '''shadow''' THEN
    RAISE EXCEPTION 'VALUATION: cutover status must not expose shadow';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.apply_latest_supplier_price_to_grn_line()'::pg_catalog.regprocedure;

  IF v_definition ~ 'NEW.unit_cost := 0'
     OR v_definition !~ 'grn_receipt'
     OR v_definition ~ 'supplier_ingredient_price_history'
  THEN
    RAISE EXCEPTION 'VALUATION: GRN must persist operator unit_cost';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.bootstrap_inventory_valuation_from_invoices(bigint)'::pg_catalog.regprocedure;

  IF v_definition !~ 'UPDATE public.stock_movements'
     OR v_definition !~ 'grn_amend'
     OR v_definition !~ 'private.settle_supplier_invoice_valuation'
     OR v_definition ~ 'inventory_valuation_bootstrap_missing_invoice_coverage'
  THEN
    RAISE EXCEPTION 'VALUATION: automatic invoice restore contract is incomplete';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.activate_inventory_valuation_cutover(uuid)'::pg_catalog.regprocedure;

  IF v_definition !~ 'prepare_inventory_valuation_cutover'
     OR v_definition ~ 'shadow'
     OR v_definition ~ '7 days'
  THEN
    RAISE EXCEPTION 'VALUATION: activation must not retain a shadow gate';
  END IF;
END;
$$;

ROLLBACK;
