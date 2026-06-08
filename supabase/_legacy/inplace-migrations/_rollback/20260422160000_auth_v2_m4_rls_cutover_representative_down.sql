-- Rollback M4 cutover: restore legacy role-based policies.
-- Mirrors final state from 20260422104856 (ingredients) and 20260409130000 (kds_tickets).

-- ingredients
DROP POLICY IF EXISTS "ingredients_select" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_insert" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_update" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_delete" ON public.ingredients;

CREATE POLICY "ingredients_select" ON public.ingredients
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "ingredients_insert" ON public.ingredients
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner','super_manager','warehouse_manager','production_manager')
  );

CREATE POLICY "ingredients_update" ON public.ingredients
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner','super_manager','warehouse_manager','production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner','super_manager','warehouse_manager','production_manager')
  );

CREATE POLICY "ingredients_delete" ON public.ingredients
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner','super_manager','warehouse_manager','production_manager')
  );

-- kds_tickets
DROP POLICY IF EXISTS "kds_tickets_select" ON public.kds_tickets;
DROP POLICY IF EXISTS "kds_tickets_insert" ON public.kds_tickets;
DROP POLICY IF EXISTS "kds_tickets_update" ON public.kds_tickets;

CREATE POLICY "tenant_select" ON public.kds_tickets
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "rpc_insert" ON public.kds_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('cashier','waiter','branch_manager','owner','super_manager','area_manager')
    AND public.can_access_branch(branch_id)
  );

CREATE POLICY "kds_update" ON public.kds_tickets
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('chef','branch_manager','owner','super_manager','area_manager')
    AND public.can_access_branch(branch_id)
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('chef','branch_manager','owner','super_manager','area_manager')
    AND public.can_access_branch(branch_id)
  );

DROP FUNCTION IF EXISTS public.has_permission_any(TEXT);
