\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_assign text;
  v_template text;
  v_station text;
  v_submit text;
  v_gate text :=
    $q$location.location_kind = ANY (ARRAY['warehouse'::text, 'kitchen'::text])$q$;
BEGIN
  SELECT pg_get_functiondef(
    'public.set_inventory_count_assignments(bigint,bigint,bigint,bigint[],bigint)'::regprocedure
  ) INTO v_assign;
  SELECT pg_get_functiondef(
    'public.set_inventory_count_assignments_by_template(bigint,bigint,bigint,bigint,bigint)'::regprocedure
  ) INTO v_template;
  SELECT pg_get_functiondef(
    'public.set_station_count_assignments(bigint,bigint,bigint,bigint,jsonb)'::regprocedure
  ) INTO v_station;
  SELECT pg_get_functiondef(
    'public.submit_inventory_count_slip(bigint,bigint,jsonb,bigint)'::regprocedure
  ) INTO v_submit;

  IF v_assign NOT LIKE '%' || v_gate || '%'
     OR v_template NOT LIKE '%' || v_gate || '%'
     OR v_station NOT LIKE '%' || v_gate || '%'
     OR v_submit NOT LIKE '%' || v_gate || '%' THEN
    RAISE EXCEPTION
      'STAFF COUNT KITCHEN: assignment or submit RPC still rejects kitchen';
  END IF;

  IF v_assign LIKE '%location.location_kind = ''warehouse''%'
     OR v_template LIKE '%location.location_kind = ''warehouse''%'
     OR v_station LIKE '%location.location_kind = ''warehouse''%'
     OR v_submit LIKE '%location.location_kind = ''warehouse''%' THEN
    RAISE EXCEPTION
      'STAFF COUNT KITCHEN: warehouse-only staff-count gate remains';
  END IF;
END;
$$;

ROLLBACK;
