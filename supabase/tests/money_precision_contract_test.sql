-- Run against a non-production database with migrations applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/money_precision_contract_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'normalize_expense_vat_breakdown'
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = '';

  IF v_definition IS NULL
    OR v_definition NOT LIKE '%expense_vat_amount_scale_invalid%'
    OR v_definition NOT LIKE '%round(v_raw_taxable_amount, 2)%' THEN
    RAISE EXCEPTION 'expense VAT scale guard is missing';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.save_supplier_invoice_draft(
      NULL,
      pg_catalog.jsonb_build_object(
        'document_discount_amount', '0.00',
        'subtotal', '1.00',
        'vat_amount', '0.08',
        'total_amount', '1.08'
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'line_key', 'scale-regression',
          'ingredient_id', NULL,
          'description', 'Scale regression',
          'quantity', '1.000',
          'unit_id', NULL,
          'unit_price', '1.001',
          'line_discount', '0.00',
          'vat_rate', 8,
          'vat_amount', '0.08',
          'line_total', '1.00'
        )
      ),
      '[]'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    RAISE EXCEPTION 'supplier invoice accepted excess money scale';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%supplier_invoice_money_scale_invalid%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
