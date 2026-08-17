-- Compact floor shift tasks plus photo-required CHECK.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_check text;
  v_toggle text;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_check
  FROM pg_constraint
  WHERE conname = 'attendance_checklist_items_photo_required_when_done'
    AND conrelid = 'public.attendance_checklist_items'::regclass;
  IF v_check IS NULL
     OR position('allows_photo' IN v_check) = 0
     OR position('photo_path' IN v_check) = 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: photo-required CHECK must block done without photo_path';
  END IF;

  SELECT pg_get_functiondef(
    'public.self_service_toggle_task(bigint,boolean)'::regprocedure
  )
  INTO v_toggle;
  IF position('photo_required' IN v_toggle) = 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: self_service_toggle_task must still raise photo_required';
  END IF;
END;
$$;

ROLLBACK;
