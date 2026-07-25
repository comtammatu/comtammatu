BEGIN;

ALTER POLICY attendance_consumption_report_lines_select
ON public.attendance_consumption_report_lines
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_consumption_reports report
    WHERE report.id = attendance_consumption_report_lines.report_id
      AND report.tenant_id = attendance_consumption_report_lines.tenant_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.employees employee
          WHERE employee.id = report.employee_id
            AND employee.tenant_id = report.tenant_id
            AND employee.profile_id = (SELECT auth.uid())
        )
        OR public.has_permission(report.branch_id, 'hr:approve_checkout')
        OR public.has_permission(report.branch_id, 'inventory:read')
      )
  )
);

ALTER POLICY attendance_consumption_reports_select
ON public.attendance_consumption_reports
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.id = attendance_consumption_reports.employee_id
        AND employee.tenant_id = attendance_consumption_reports.tenant_id
        AND employee.profile_id = (SELECT auth.uid())
    )
    OR public.has_permission(branch_id, 'hr:approve_checkout')
    OR public.has_permission(branch_id, 'inventory:read')
  )
);

ALTER POLICY profiles_select_authorized
ON public.profiles
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    id = (SELECT auth.uid())
    OR (SELECT public.auth_role()) = 'owner'
    OR (
      branch_id IS NOT NULL
      AND branch_id = (SELECT public.auth_branch_id())
      AND public.has_permission(branch_id, 'staff:view')
    )
  )
);

ALTER POLICY inventory_count_assignments_select
ON public.inventory_count_assignments
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.id = inventory_count_assignments.employee_id
        AND employee.profile_id = (SELECT auth.uid())
    )
    OR public.has_permission(branch_id, 'inventory:count_assign')
    OR public.has_permission(branch_id, 'inventory:count_approve')
  )
);

ALTER POLICY inventory_count_slips_select
ON public.inventory_count_slips
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.id = inventory_count_slips.employee_id
        AND employee.profile_id = (SELECT auth.uid())
    )
    OR public.has_permission(branch_id, 'inventory:count_approve')
  )
);

ALTER POLICY leave_requests_select
ON public.leave_requests
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.id = leave_requests.employee_id
        AND employee.tenant_id = leave_requests.tenant_id
        AND employee.profile_id = (SELECT auth.uid())
    )
    OR public.has_permission(NULL, 'hr:view_employee')
    OR public.has_permission(branch_id, 'hr:approve_leave_request')
  )
);

-- Self access remains available through profiles_select_authorized and tenant scoped.
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;

COMMIT;
