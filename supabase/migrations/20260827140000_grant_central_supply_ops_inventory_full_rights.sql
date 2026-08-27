-- Grant full inventory and supplier mapping permissions to central_supply_ops (Central Warehouse Manager):
-- 1. procurement:price_list_write (assign ingredients to suppliers, set preferred supplier, delete supplier items)
-- 2. inventory:units_master (manage units registry and create packaging units)
-- 3. inventory:catalog_write (catalog management)
-- 4. Relax owner-only RLS gates on public.units and public.ingredient_categories

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = ANY (ARRAY[
  'procurement:price_list_write',
  'inventory:units_master',
  'inventory:catalog_write'
]::text[]);

UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'procurement:price_list_write',
        'inventory:units_master',
        'inventory:catalog_write'
      ]::text[])
    ),
    updated_at = now()
WHERE position_code = 'central_supply_ops';

SELECT public.sync_missing_permissions_from_template();

-- ── Units Table RLS ──

DROP POLICY IF EXISTS units_insert ON public.units;
CREATE POLICY units_insert ON public.units FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:units_master')
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_position('central_supply_ops')
  )
);

DROP POLICY IF EXISTS units_update ON public.units;
CREATE POLICY units_update ON public.units FOR UPDATE TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:units_master')
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_position('central_supply_ops')
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:units_master')
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_position('central_supply_ops')
  )
);

DROP POLICY IF EXISTS units_delete ON public.units;
CREATE POLICY units_delete ON public.units FOR DELETE TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:units_master')
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_position('central_supply_ops')
  )
);

-- ── Ingredient Categories Table RLS ──

DROP POLICY IF EXISTS ingredient_categories_insert ON public.ingredient_categories;
CREATE POLICY ingredient_categories_insert ON public.ingredient_categories FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_permission_any('inventory:write')
    OR public.has_position('central_supply_ops')
  )
);

DROP POLICY IF EXISTS ingredient_categories_update ON public.ingredient_categories;
CREATE POLICY ingredient_categories_update ON public.ingredient_categories FOR UPDATE TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_permission_any('inventory:write')
    OR public.has_position('central_supply_ops')
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_permission_any('inventory:write')
    OR public.has_position('central_supply_ops')
  )
);

DROP POLICY IF EXISTS ingredient_categories_delete ON public.ingredient_categories;
CREATE POLICY ingredient_categories_delete ON public.ingredient_categories FOR DELETE TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND (
    public.auth_role() = 'owner'
    OR public.has_permission_any('inventory:catalog_write')
    OR public.has_permission_any('inventory:write')
    OR public.has_position('central_supply_ops')
  )
);
