-- NULLIF is SQL syntax and cannot be schema-qualified.

DO $$
DECLARE
  v_oid oid;
  v_definition text;
BEGIN
  v_oid := pg_catalog.to_regprocedure(
    'private.settle_supplier_invoice_valuation(bigint,uuid)'
  );
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'supplier_invoice_valuation_function_missing'
      USING ERRCODE = '55000';
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  IF pg_catalog.strpos(v_definition, 'pg_catalog.nullif(') > 0 THEN
    v_definition := pg_catalog.replace(
      v_definition,
      'pg_catalog.nullif(',
      'nullif('
    );
    EXECUTE v_definition;
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  IF pg_catalog.strpos(v_definition, 'pg_catalog.nullif(') > 0 THEN
    RAISE EXCEPTION 'supplier_invoice_valuation_nullif_repair_failed'
      USING ERRCODE = '55000';
  END IF;
END;
$$;
