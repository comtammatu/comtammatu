\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_confirm text;
  v_close text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_confirm
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.confirm_goods_receipt_note(bigint,bigint)'::pg_catalog.regprocedure;
  IF v_confirm !~ 'quantity = v_previously_applied \+ v_applied'
     OR v_confirm !~ 'v_accepted_base > v_remaining_base' THEN
    RAISE EXCEPTION 'GRN KEPT QTY: confirm must amend PO line on over-receipt';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_close
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.close_purchase_order(bigint,text)'::pg_catalog.regprocedure;
  IF v_close !~ 'procurement:grn_confirm'
     OR v_close !~ 'procurement:po_approve'
     OR v_close !~ '''closed''' THEN
    RAISE EXCEPTION 'GRN KEPT QTY: close remainder must allow warehouse confirm';
  END IF;
END;
$$;

ROLLBACK;
