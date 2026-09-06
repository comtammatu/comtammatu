\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_direct_checkout text;
BEGIN
  IF public.attendance_shift_workdays(
    timestamptz '2026-09-10 08:00:00+07',
    timestamptz '2026-09-10 10:00:00+07',
    timestamptz '2026-09-10 08:00:00+07',
    timestamptz '2026-09-10 16:00:00+07'
  ) <> 0.25 THEN
    RAISE EXCEPTION 'TEST FAILED: two completed hours must equal 0.25 công';
  END IF;

  IF public.attendance_shift_workdays(
    timestamptz '2026-09-10 08:00:00+07',
    timestamptz '2026-09-10 15:00:00+07',
    timestamptz '2026-09-10 08:00:00+07',
    timestamptz '2026-09-10 16:00:00+07'
  ) <> 0.75 THEN
    RAISE EXCEPTION 'TEST FAILED: partial fourth quarter must not round up';
  END IF;

  IF public.attendance_shift_workdays(
    timestamptz '2026-09-10 08:00:00+07',
    timestamptz '2026-09-10 09:59:00+07',
    timestamptz '2026-09-10 08:00:00+07',
    timestamptz '2026-09-10 16:00:00+07'
  ) <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: less than one completed quarter must be zero';
  END IF;

  IF public.attendance_shift_workdays(
    timestamptz '2026-08-10 07:55:00+07',
    timestamptz '2026-08-10 15:55:00+07',
    timestamptz '2026-08-10 08:00:00+07',
    timestamptz '2026-08-10 16:00:00+07'
  ) <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: pre-cutover attendance must preserve legacy rounding';
  END IF;

  IF to_regprocedure('public.self_service_clock_out(bigint)') IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: direct checkout RPC is missing';
  END IF;

  SELECT pg_get_functiondef('public.self_service_clock_out(bigint)'::regprocedure)
  INTO v_direct_checkout;

  IF position('profile.branch_id' IN v_direct_checkout) = 0
     OR position('position.code' IN v_direct_checkout) = 0
     OR position('direct_checkout_not_allowed' IN v_direct_checkout) = 0
     OR position('branch_manager' IN v_direct_checkout) = 0
     OR position('hr_manager' IN v_direct_checkout) = 0
     OR position('central_supply_ops' IN v_direct_checkout) = 0
     OR position('central_kitchen_lead' IN v_direct_checkout) = 0
     OR position('checklist_incomplete' IN v_direct_checkout) = 0
     OR position('photo_required' IN v_direct_checkout) = 0
     OR position('inventory_count_slips' IN v_direct_checkout) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: direct checkout authorization/evidence gates are incomplete';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.self_service_clock_out(bigint)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.self_service_clock_out(bigint)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: direct checkout RPC grants are unsafe';
  END IF;
END;
$$;

ROLLBACK;
