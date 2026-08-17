-- Static SQL assertions: photo evidence is required to complete allows_photo tasks.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_toggle text;
  v_attach text;
  v_checkout text;
BEGIN
  SELECT pg_get_functiondef(
    'public.self_service_toggle_task(bigint,boolean)'::regprocedure
  )
  INTO v_toggle;
  IF position('photo_required' IN v_toggle) = 0
     OR position('allows_photo' IN v_toggle) = 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: self_service_toggle_task must reject done without photo';
  END IF;

  SELECT pg_get_functiondef(
    'public.self_service_attach_task_photo(bigint,text)'::regprocedure
  )
  INTO v_attach;
  IF position('is_done = true' IN v_attach) = 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: attaching a task photo must mark the item done';
  END IF;

  SELECT pg_get_functiondef(
    'public.self_service_request_checkout(bigint)'::regprocedure
  )
  INTO v_checkout;
  IF position('photo_required' IN v_checkout) = 0
     OR position('allows_photo' IN v_checkout) = 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: checkout must require photos on required photo tasks';
  END IF;
END;
$$;

ROLLBACK;
