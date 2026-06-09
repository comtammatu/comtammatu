-- Harden execute grants on recent attendance and POS RPCs.
-- Attendance checkout writes go through service-role Server Actions.
-- POS discount RPCs keep authenticated execution because they enforce auth.uid()
-- and branch/role checks internally, but anon must not execute them.

REVOKE ALL ON FUNCTION public.employee_clock_in_with_checklist(
  bigint,
  bigint,
  bigint,
  bigint,
  date,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist(
  bigint,
  bigint,
  bigint,
  bigint,
  date,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.employee_request_clock_out(
  bigint,
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_request_clock_out(
  bigint,
  bigint,
  bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.employee_clock_out_with_code(
  bigint,
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_clock_out_with_code(
  bigint,
  bigint,
  bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.branch_manager_approve_employee_clock_out(
  bigint,
  bigint,
  bigint,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_manager_approve_employee_clock_out(
  bigint,
  bigint,
  bigint,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_shift_checklist_template(
  bigint,
  bigint,
  text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shift_checklist_template(
  bigint,
  bigint,
  text[]
) TO service_role;

REVOKE ALL ON FUNCTION public.apply_order_item_discount(
  bigint,
  text,
  numeric,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_order_item_discount(
  bigint,
  text,
  numeric,
  text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.clear_order_item_discount(
  bigint,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_order_item_discount(
  bigint,
  text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_order_discount(
  bigint,
  text,
  numeric,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_order_discount(
  bigint,
  text,
  numeric,
  text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.clear_order_discount(
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_order_discount(
  bigint
) TO authenticated, service_role;
