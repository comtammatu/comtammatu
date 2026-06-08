-- =========================================================================
-- Attendance write hardening — make clock-in tamper-proof.
--
-- attendance_records had `GRANT INSERT ... TO authenticated` (20260406320000)
-- plus a permissive self-INSERT policy `attendance_self_checkin`
-- (20260417000000) that only checked employee ownership. So any authenticated
-- employee could POST a fabricated attendance row straight to the PostgREST
-- API, bypassing the server action's daily-code, GPS-radius and shift-window
-- checks entirely. The h3c (20260507181413) shift-assignment WITH CHECK on
-- `attendance_write` never took effect for self-insert because this permissive
-- policy OR'd it away.
--
-- Fix: revoke direct INSERT from `authenticated` and drop the permissive
-- self-INSERT policy. All attendance inserts now flow through checked server
-- code — employee clock-in (employee/clock/actions.ts) and HR check-in /
-- bulk check-in (hr/actions.ts) — using the service role, which becomes the
-- only INSERT path. UPDATE is intentionally left intact so clock-out and
-- manager corrections keep working through their existing policies.
-- =========================================================================

REVOKE INSERT ON TABLE public.attendance_records FROM authenticated;
-- anon never legitimately inserts attendance (RLS already blocks it — every
-- INSERT policy requires auth.uid()), but defense-in-depth: the attendance
-- table must be service-role-write-only. (Broad anon table privileges across
-- the schema are tracked separately as an audit item.)
REVOKE INSERT ON TABLE public.attendance_records FROM anon;

DROP POLICY IF EXISTS "attendance_self_checkin" ON public.attendance_records;
