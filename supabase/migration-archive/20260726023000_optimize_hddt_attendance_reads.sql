BEGIN;

CREATE INDEX IF NOT EXISTS idx_tax_invoices_tenant_created_id
ON public.tax_invoices (tenant_id, created_at DESC, id DESC);

ALTER POLICY tax_invoices_select
ON public.tax_invoices
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    (SELECT public.auth_is_owner((SELECT auth.uid())))
    OR public.has_permission(branch_id, 'orders:read')
  )
);

ALTER POLICY attendance_select
ON public.attendance_records
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND (
    (SELECT public.auth_is_owner((SELECT auth.uid())))
    OR EXISTS (
      SELECT 1
      FROM public.employees employee
      WHERE employee.id = attendance_records.employee_id
        AND employee.profile_id = (SELECT auth.uid())
    )
    OR public.has_permission(branch_id, 'staff:view')
    OR public.has_permission(branch_id, 'hr:view_employee')
    OR public.has_permission(branch_id, 'staff:manage')
    OR public.has_permission(branch_id, 'hr:approve_checkout')
  )
);

ALTER POLICY attendance_checklist_items_select
ON public.attendance_checklist_items
USING (
  tenant_id = (SELECT public.auth_tenant_id())
  AND EXISTS (
    SELECT 1
    FROM public.attendance_records attendance
    WHERE attendance.id = attendance_checklist_items.attendance_record_id
      AND attendance.tenant_id = attendance_checklist_items.tenant_id
      AND (
        (SELECT public.auth_is_owner((SELECT auth.uid())))
        OR (
          EXISTS (
            SELECT 1
            FROM public.employees employee
            WHERE employee.id = attendance.employee_id
              AND employee.profile_id = (SELECT auth.uid())
          )
          OR public.has_permission(attendance.branch_id, 'staff:view')
          OR public.has_permission(attendance.branch_id, 'hr:view_employee')
          OR public.has_permission(attendance.branch_id, 'staff:manage')
        )
      )
  )
);

COMMIT;
