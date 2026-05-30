-- =========================================================================
-- Cổng nhân viên unblock — self-read policy on public.employees
--
-- Regression fix: after auth_v2 m4c consolidation, employees_select required
-- 'hr:view_employee' to read ANY row — including the user's OWN row.
-- This blocked getEmployeeContext() in /employee/* for ~90% of staff
-- (waiter, cashier, chef, phu_bep, ...) who don't carry hr:view_employee.
--
-- Fix: add a permissive self-read policy. PostgreSQL OR's permissive
-- policies → HR seniors with hr:view_employee still see all rows via
-- employees_select; everyone else sees only their own row via
-- employees_select_self. No write change. No data leak.
-- =========================================================================

CREATE POLICY employees_select_self ON public.employees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND profile_id = auth.uid()
  );

COMMENT ON POLICY employees_select_self ON public.employees IS
  'Self-read regression fix: every authenticated user can read their own employees row even without hr:view_employee. Required for /employee/* portal (clock, schedule, attendance, payslip, shift-register).';
