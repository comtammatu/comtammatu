-- =============================================================
-- Fix: Allow POS roles (cashier, waiter) to update table status
-- The create_order RPC marks tables as 'occupied' for dine-in orders,
-- but the existing RLS policy only allows manager roles to UPDATE.
-- This adds a policy for POS staff to update the status column.
-- =============================================================

CREATE POLICY "pos_update_status" ON public.tables
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('cashier', 'waiter', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('cashier', 'waiter', 'branch_manager')
  );
