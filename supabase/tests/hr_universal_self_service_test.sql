\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_contract_fn text;
  v_submit_leave_fn text;
BEGIN
  IF (
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'branch_id'
  ) <> 'YES' THEN
    RAISE EXCEPTION 'TEST FAILED: attendance_records.branch_id must be nullable';
  END IF;

  IF (
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leave_requests'
      AND column_name = 'branch_id'
  ) <> 'YES' THEN
    RAISE EXCEPTION 'TEST FAILED: leave_requests.branch_id must be nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employment_contracts'
      AND column_name = 'pay_basis'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: employment contract pay_basis is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payroll_entries'
      AND column_name = 'pay_basis'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: payroll snapshot pay_basis is missing';
  END IF;

  IF to_regprocedure('public.self_service_clock_in(bigint,bigint,date,text)') IS NULL
     OR to_regprocedure('public.self_service_toggle_task(bigint,boolean)') IS NULL
     OR to_regprocedure('public.self_service_request_checkout(bigint)') IS NULL
     OR to_regprocedure('public.self_service_cancel_checkout(bigint)') IS NULL
     OR to_regprocedure('public.submit_leave_request(bigint,date,date,text,text)') IS NULL
     OR to_regprocedure('public.approve_leave_request(bigint)') IS NULL
     OR to_regprocedure('public.reject_leave_request(bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: self-service attendance/leave RPC contract is incomplete';
  END IF;

  SELECT pg_get_functiondef('private.set_contract_pay_basis()'::regprocedure)
  INTO v_contract_fn;
  IF v_contract_fn ILIKE '%staff_role_from_position_code%'
     OR v_contract_fn ILIKE '%accountant%' THEN
    RAISE EXCEPTION 'TEST FAILED: contract pay_basis must not infer from role';
  END IF;

  SELECT pg_get_functiondef(
    'public.submit_leave_request(bigint,date,date,text,text)'::regprocedure
  )
  INTO v_submit_leave_fn;
  IF v_submit_leave_fn ILIKE '%leave not required for central%' THEN
    RAISE EXCEPTION 'TEST FAILED: central roles must be able to submit leave';
  END IF;
  IF position('tab=approvals' IN v_submit_leave_fn) = 0 THEN
    RAISE EXCEPTION 'TEST FAILED: Owner leave notification must deep-link to approvals tab';
  END IF;

  IF has_table_privilege('authenticated', 'public.attendance_records', 'INSERT')
     OR has_table_privilege('authenticated', 'public.attendance_records', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.attendance_records', 'DELETE')
     OR has_table_privilege('authenticated', 'public.attendance_checklist_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.attendance_checklist_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.attendance_checklist_items', 'DELETE')
     OR has_table_privilege('authenticated', 'public.leave_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.leave_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.leave_requests', 'DELETE') THEN
    RAISE EXCEPTION 'TEST FAILED: HR self-service tables must be RPC-only';
  END IF;
END;
$$;

ROLLBACK;
