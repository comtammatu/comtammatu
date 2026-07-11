-- =========================================================================
-- Tighten shift_assignments SELECT RLS — auth v2 cleanup
--
-- The original 20260406320000_hr.sql shipped a tenant-wide SELECT policy:
--   USING (tenant_id = public.auth_tenant_id())
-- which let any authenticated employee read every coworker's schedule.
--
-- Auth v2's m4c3 migration (20260422220000_auth_v2_m4c3_hr_payroll_finance)
-- replaced `shift_assignments_manage` but left the legacy SELECT policy
-- untouched. Close that gap to match the per-employee + permission-gated
-- pattern used elsewhere in m4c3 (employees_select, attendance_select).
--
-- Self-service /employee/schedule still works: the page filters by
-- employee_id from the user's profile, and the EXISTS clause below grants
-- self-read.
-- =========================================================================

DROP POLICY IF EXISTS "shift_assignments_select" ON public.shift_assignments;

CREATE POLICY "shift_assignments_select" ON public.shift_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Self: see own assignments
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = shift_assignments.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission_any('staff:view')
      OR public.has_permission_any('hr:view_employee')
    )
  );
