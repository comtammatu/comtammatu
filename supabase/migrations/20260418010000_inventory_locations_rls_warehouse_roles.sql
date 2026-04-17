-- Fix: inventory_locations_select RLS did not include warehouse_manager and
-- production_manager. These roles need to read their own branch's locations
-- to create intra-branch stock transfers via the new "Chuyển nội bộ" tab.

DROP POLICY IF EXISTS "inventory_locations_select" ON public.inventory_locations;

CREATE POLICY "inventory_locations_select" ON public.inventory_locations
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'office', 'area_manager')
      OR (
        public.auth_role() IN (
          'branch_manager', 'cashier', 'waiter', 'chef',
          'warehouse_manager', 'production_manager'
        )
        AND branch_id = COALESCE(
          public.auth_branch_id(),
          (SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid())
        )
      )
    )
  );
