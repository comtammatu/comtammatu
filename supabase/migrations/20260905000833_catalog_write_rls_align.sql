-- Migration: catalog_write_rls_align
-- Align catalog table write RLS with inventory:catalog_write / units_master.
-- Keep has_position('central_supply_ops') (ADR 0045 adapter). inventory:write
-- is stock, not SKU. Owner write comes from the catalog/units keys, not a
-- standalone role check.

DROP POLICY IF EXISTS ingredient_categories_insert ON public.ingredient_categories;
CREATE POLICY ingredient_categories_insert
  ON public.ingredient_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS ingredient_categories_update ON public.ingredient_categories;
CREATE POLICY ingredient_categories_update
  ON public.ingredient_categories
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS ingredient_categories_delete ON public.ingredient_categories;
CREATE POLICY ingredient_categories_delete
  ON public.ingredient_categories
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS units_insert ON public.units;
CREATE POLICY units_insert
  ON public.units
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:units_master')
      OR public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS units_update ON public.units;
CREATE POLICY units_update
  ON public.units
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:units_master')
      OR public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:units_master')
      OR public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS units_delete ON public.units;
CREATE POLICY units_delete
  ON public.units
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:units_master')
      OR public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS ingredients_insert ON public.ingredients;
CREATE POLICY ingredients_insert
  ON public.ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS ingredients_update ON public.ingredients;
CREATE POLICY ingredients_update
  ON public.ingredients
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );

DROP POLICY IF EXISTS ingredients_delete ON public.ingredients;
CREATE POLICY ingredients_delete
  ON public.ingredients
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('inventory:catalog_write')
      OR public.has_position('central_supply_ops')
    )
  );
