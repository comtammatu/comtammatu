-- Rollback for 20260601200000_h2a_refunds_update_perm_gate.sql
--
-- Restores the dual-gate (has_permission + auth_role) pattern from
-- `20260505010000_refunds_table.sql:69-80`. Use only to recover from a
-- failed apply.
--
-- WARNING: After rollback, RLS UPDATE has a 1-hour stale-revoke window
-- via JWT user_role caching. Revoking a super_manager's permission does
-- not block their direct UPDATE on `refunds` until their JWT refreshes.

DROP POLICY IF EXISTS "refunds_update" ON public.refunds;

CREATE POLICY "refunds_update" ON public.refunds
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund')
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'orders:refund')
    AND public.auth_role() IN ('owner', 'super_manager')
  );
