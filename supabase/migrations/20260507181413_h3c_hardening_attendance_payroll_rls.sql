-- =========================================================================
-- HR Phase 3c — Hardening RLS for attendance + payroll
--
-- 1. attendance_records WITH CHECK: self-INSERT/UPDATE now requires an
--    active shift_assignments row covering (employee_id, branch_id, date).
--    Manager path (staff:manage) bypasses the gate — for manual correction
--    or backfill.
--
-- 2. payroll_entries_select: self-row read narrows to status='paid' periods
--    only. Owner / payroll calculator / finance:view see all (unchanged).
--
-- Rationale: per tasks/todo.md Security review 2026-04-27 P1 items:
--   - Daily HMAC code reuse → leak = whole-shift remote clock-in. Strict
--     assignment-gate at INSERT is the load-bearing defence.
--   - payroll_entries_select still tenant-wide for self → employees can see
--     unfinalised draft entries before approval. Tighten to paid-only.
-- =========================================================================

-- ─── 1. Tighten attendance_records write policy ─────────────────────────

DROP POLICY IF EXISTS "attendance_write" ON public.attendance_records;

CREATE POLICY "attendance_write" ON public.attendance_records
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission_any('staff:manage')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Self path: must own the employee row AND have active shift_assignment
      ( EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = attendance_records.employee_id
            AND e.profile_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.shift_assignments sa
          WHERE sa.employee_id = attendance_records.employee_id
            AND sa.branch_id   = attendance_records.branch_id
            AND sa.date        = attendance_records.date
            AND sa.tenant_id   = attendance_records.tenant_id
        )
      )
      -- Manager path: bypass strict assignment check for corrections
      OR public.has_permission_any('staff:manage')
    )
  );

-- ─── 2. Tighten payroll_entries_select self-row read ────────────────────

DROP POLICY IF EXISTS "payroll_entries_select" ON public.payroll_entries;

CREATE POLICY "payroll_entries_select" ON public.payroll_entries
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Self read: only paid (immutable, employee-visible) periods
      ( EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = payroll_entries.employee_id
            AND e.profile_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM public.payroll_periods pp
          WHERE pp.id = payroll_entries.payroll_period_id
            AND pp.status = 'paid'
        )
      )
      OR public.has_permission_any('finance:payroll_calculate')
      OR public.has_permission_any('finance:view')
    )
  );
