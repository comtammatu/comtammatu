-- Static SQL assertions for WP-C/D/E migrations.
-- Runtime verification belongs on a Preview Branch after apply.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shift_assignments'
      AND column_name = 'is_shift_leader'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: shift_assignments has is_shift_leader';
  END IF;

  IF to_regclass('public.pos_void_requests') IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: pos_void_requests queue table exists';
  END IF;

  IF to_regprocedure('public.request_pos_void_after_paid(bigint,text,text)') IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: request_pos_void_after_paid exists';
  END IF;

  IF to_regprocedure('public.resolve_pos_void_request(bigint,text,text)') IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: resolve_pos_void_request exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'position_shift_tasks'
      AND column_name = 'allows_photo'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: position_shift_tasks.allows_photo exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_checklist_items'
      AND column_name = 'photo_path'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: attendance_checklist_items.photo_path exists';
  END IF;
END;
$$;

ROLLBACK;
