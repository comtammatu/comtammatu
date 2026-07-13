DO $$
DECLARE
  v_signature text;
  v_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.set_inventory_count_assignments(bigint,bigint,bigint,bigint[],bigint)',
    'public.submit_inventory_count_slip(bigint,bigint,jsonb,bigint)'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_signature::regprocedure::oid)
    INTO v_definition;

    IF position('location_kind <> ''kitchen''' IN v_definition) = 0
      OR position('location_kind = ''kitchen''' IN v_definition) = 0
      OR position('branch_kitchen_location_missing' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'unexpected_count_rpc_definition:%', v_signature;
    END IF;

    v_definition := replace(
      v_definition,
      'location_kind <> ''kitchen''',
      'location_kind <> ''warehouse'''
    );
    v_definition := replace(
      v_definition,
      'location_kind = ''kitchen''',
      'location_kind = ''warehouse'''
    );
    v_definition := replace(
      v_definition,
      'branch_kitchen_location_missing',
      'branch_warehouse_location_missing'
    );

    EXECUTE v_definition;

    SELECT pg_catalog.pg_get_functiondef(v_signature::regprocedure::oid)
    INTO v_definition;
    IF position('location_kind <> ''warehouse''' IN v_definition) = 0
      OR position('location_kind = ''warehouse''' IN v_definition) = 0
      OR position('branch_warehouse_location_missing' IN v_definition) = 0
      OR position('kitchen' IN v_definition) > 0 THEN
      RAISE EXCEPTION 'count_rpc_warehouse_repair_failed:%', v_signature;
    END IF;
  END LOOP;
END;
$$;
