-- Auth/PBAC refactor grant hardening.
-- Keep helper and service-role RPC execution out of browser-callable roles.

REVOKE ALL ON FUNCTION public.auth_role_to_position(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text)
  TO service_role;

REVOKE ALL ON FUNCTION private.staff_role_from_position_code(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.staff_role_from_position_code(text)
  TO service_role;

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
