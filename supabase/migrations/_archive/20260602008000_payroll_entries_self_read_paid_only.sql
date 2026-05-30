-- =========================================================================
-- Payroll RLS hardening — enforce the self-read status gate h3c intended.
--
-- h3c (20260507181413) recreated payroll_entries_select to narrow employee
-- self-reads to status='paid' periods, but the older, more permissive
-- pe_employee_self_select policy (any-status self read, from 20260416060000)
-- was never dropped. Postgres OR's permissive policies together, so employees
-- could still read their own DRAFT / unapproved payroll entries — i.e. their
-- salary before it is finalised and approved.
--
-- Drop the over-permissive self policy so employee self-reads flow only through
-- payroll_entries_select (paid-only). Also drop two redundant policies:
--   * pe_select   — duplicate of the finance:payroll_calculate branch already
--                   present in payroll_entries_select.
--   * pe_manage   — exact duplicate of payroll_entries_write (FOR ALL,
--                   finance:payroll_calculate).
--
-- No access change for finance roles. Tightens only the employee self-read
-- path to paid periods, restoring the documented h3c intent.
-- =========================================================================

DROP POLICY IF EXISTS "pe_employee_self_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_select" ON public.payroll_entries;
DROP POLICY IF EXISTS "pe_manage" ON public.payroll_entries;
