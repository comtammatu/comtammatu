-- Catalog guards for the order-id vs tax-invoice-id S-invoice uuid rebind.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_fn oid := to_regprocedure(
    'public.reconcile_tax_invoice_provider_issued(bigint,text,text,text,jsonb,timestamptz,text)'
  );
  v_src text;
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'reconcile_tax_invoice_provider_issued_missing';
  END IF;
  v_src := pg_get_functiondef(v_fn);
  IF v_src NOT LIKE '%tax_invoice_number_already_bound%'
    OR v_src NOT LIKE '%tax_invoice_provider_ref_mismatch%' THEN
    RAISE EXCEPTION 'reconcile_tax_invoice_number_guard_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tax_invoices'
      AND indexname = 'uq_tax_invoices_issued_invoice_number'
  ) THEN
    RAISE EXCEPTION 'uq_tax_invoices_issued_invoice_number_missing';
  END IF;
END
$$;

ROLLBACK;
