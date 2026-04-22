-- =============================================================
-- Fix ingredients RLS to match the inventory catalog ACL.
-- App-side catalog access already allows owner, super_manager,
-- warehouse_manager, and production_manager.
-- =============================================================

DROP POLICY IF EXISTS "ingredients_insert" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_update" ON public.ingredients;
DROP POLICY IF EXISTS "ingredients_delete" ON public.ingredients;

CREATE POLICY "ingredients_insert" ON public.ingredients
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'warehouse_manager', 'production_manager')
  );

CREATE POLICY "ingredients_update" ON public.ingredients
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'warehouse_manager', 'production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'warehouse_manager', 'production_manager')
  );

CREATE POLICY "ingredients_delete" ON public.ingredients
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'warehouse_manager', 'production_manager')
  );
