\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = 'purchase_order_items'
      AND column_row.column_name IN ('unit_price_est', 'line_total')
  ) THEN
    RAISE EXCEPTION 'GRN BOOK PRICE: PO estimate columns must be dropped';
  END IF;

  IF NOT has_column_privilege(
    'authenticated',
    'public.grn_items'::regclass,
    'unit_cost',
    'SELECT'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items'::regclass,
    'unit_cost',
    'INSERT'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items'::regclass,
    'unit_cost',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION 'GRN BOOK PRICE: warehouse must read/write grn_items.unit_cost';
  END IF;

  IF NOT has_column_privilege(
    'authenticated',
    'public.grn_items'::regclass,
    'unit_cost_unit_id',
    'SELECT'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items'::regclass,
    'unit_cost_unit_id',
    'INSERT'
  ) OR NOT has_column_privilege(
    'authenticated',
    'public.grn_items'::regclass,
    'unit_cost_unit_id',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION 'GRN BOOK PRICE: warehouse must read/write grn_items.unit_cost_unit_id';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.apply_latest_supplier_price_to_grn_line()'::pg_catalog.regprocedure;
  IF v_definition ~ 'NEW.unit_cost := 0'
     OR v_definition !~ 'grn_receipt'
     OR v_definition !~ 'grn_unit_price_invalid'
     OR v_definition !~ 'grn_line_book_total'
     OR v_definition !~ 'grn_unit_price_unit_required' THEN
    RAISE EXCEPTION 'GRN BOOK PRICE: apply_latest must persist operator unit_cost';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.settle_supplier_invoice_valuation(bigint,uuid)'::pg_catalog.regprocedure;
  IF v_definition !~ '''ap_only'''
     OR v_definition ~ 'invoice_reprice' THEN
    RAISE EXCEPTION 'GRN BOOK PRICE: invoice settlement must stay AP-only';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.confirm_goods_receipt_note(bigint,bigint)'::pg_catalog.regprocedure;
  IF v_definition !~ 'grn_unit_price_required'
     OR v_definition !~ 'private.grn_line_book_total'
     OR v_definition ~ 'WHEN v_item.cost_pending' THEN
    RAISE EXCEPTION 'GRN BOOK PRICE: confirm must require unit_cost and book GRN price';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.ensure_grn_draft_for_po(bigint,bigint,uuid,uuid)'::pg_catalog.regprocedure;
  IF v_definition ~ 'avg_unit_cost'
     OR v_definition ~ 'ingredient.unit_cost'
     OR v_definition !~ 'provisional_cost_source'
     OR v_definition !~ '''pending''' THEN
    RAISE EXCEPTION
      'GRN BOOK PRICE: auto-GRN drafts must stay unpriced until warehouse books';
  END IF;
END;
$$;

ROLLBACK;
