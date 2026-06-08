-- =========================================================================
-- RLS policy dedup — drop superseded permissive policies that OR'd away the
-- intended (stricter) policy. Same root-cause class as the attendance/payroll
-- self-read fixes (20260602008000 / 20260602009000): a hardened policy was
-- added but the older broad policy was never dropped, and because Postgres OR's
-- permissive policies, the broad one kept winning.
--
-- Verified on matu-dev (2026-05-30) by comparing each pair's USING/WITH CHECK.
--
-- 1. stock_transfer_items — SECURITY (tightening). `sti_select` / `sti_manage`
--    only checked `tenant_id = auth_tenant_id()` with NO permission gate, so any
--    tenant member could SELECT/INSERT/UPDATE/DELETE transfer items — bypassing
--    the hardened `stock_transfer_items_select` / `_write` policies that require
--    inventory:read / inventory:write on the transfer's from/to branch. Drop the
--    tenant-only policies so the permission gate actually applies.
--
-- 2. payroll_periods — hygiene (no access change). `pp_manage` is byte-identical
--    to `payroll_periods_write` (FOR ALL, finance:payroll_calculate); `pp_select`
--    (finance:payroll_calculate SELECT) is already covered by that FOR ALL
--    policy. The distinct `payroll_periods_select` (finance:view) is kept.
--
-- 3. attendance_records — hygiene (no access change). `attendance_employee_self_
--    select` (self rows only) is a strict subset of `attendance_select`
--    (self OR staff:view OR hr:view_employee). The superset is kept.
-- =========================================================================

-- 1. stock_transfer_items — close the tenant-only permission bypass
DROP POLICY IF EXISTS "sti_select" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "sti_manage" ON public.stock_transfer_items;

-- 2. payroll_periods — drop duplicate / covered policies
DROP POLICY IF EXISTS "pp_manage" ON public.payroll_periods;
DROP POLICY IF EXISTS "pp_select" ON public.payroll_periods;

-- 3. attendance_records — drop redundant self-select subset
DROP POLICY IF EXISTS "attendance_employee_self_select" ON public.attendance_records;
