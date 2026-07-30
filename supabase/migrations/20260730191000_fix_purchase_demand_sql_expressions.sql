-- PostgreSQL conditional expressions are syntax and cannot be schema-qualified.

DO $$
DECLARE
  v_signature text;
  v_oid oid;
  v_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.save_purchase_demand_allocations(bigint,jsonb,uuid)',
    'private.recompute_purchase_request_status(bigint,bigint)',
    'public.cancel_purchase_request(bigint,text)',
    'public.close_purchase_request(bigint,text)',
    'public.review_purchase_demand(bigint,text,jsonb,text,uuid)',
    'public.cancel_purchase_order(bigint,text)'
  ]
  LOOP
    v_oid := pg_catalog.to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'purchase_demand_function_missing: %', v_signature;
    END IF;

    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_definition := pg_catalog.replace(
      v_definition,
      'pg_catalog.coalesce(',
      'coalesce('
    );
    v_definition := pg_catalog.replace(
      v_definition,
      'pg_catalog.greatest(',
      'greatest('
    );
    v_definition := pg_catalog.replace(
      v_definition,
      'pg_catalog.nullif(',
      'nullif('
    );

    EXECUTE v_definition;
  END LOOP;
END;
$$;
