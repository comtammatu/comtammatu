-- =====================================================================
-- Attendance is append + manager-correct, never client-DELETE.
--
-- `authenticated` (and `anon`) retained the DELETE privilege on
-- attendance_records, and the `attendance_write` policy's self branch
-- (`EXISTS own employee`) permits DELETE — so an employee could erase their own
-- attendance history straight through the PostgREST API. No application code
-- deletes attendance_records (clock-in/check-in INSERT via the service role;
-- clock-out + manager corrections are UPDATE).
--
-- Revoke DELETE from authenticated + anon (service_role keeps it for admin
-- tooling). UPDATE is intentionally left intact (clock-out, manager
-- updateAttendanceStatus). Forward migration on top of the baseline.
-- =====================================================================

REVOKE DELETE ON TABLE public.attendance_records FROM authenticated;
REVOKE DELETE ON TABLE public.attendance_records FROM anon;
