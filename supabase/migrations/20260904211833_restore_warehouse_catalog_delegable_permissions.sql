-- Migration: restore_warehouse_catalog_delegable_permissions
-- Restores is_delegable_to_staff = true for inventory catalog/units/pricing permissions
-- previously regressed during baseline fold, ensuring central_supply_ops (Warehouse keeper)
-- can manage raw ingredients, units, and supplier prices.

INSERT INTO public.permission_keys (key, module, description, scope, is_delegable_to_staff)
VALUES
  ('inventory:catalog_write', 'inventory', 'Thêm/sửa nguyên liệu và thang đơn vị quy đổi', 'tenant', true)
ON CONFLICT (key) DO UPDATE SET
  is_delegable_to_staff = true,
  description = EXCLUDED.description;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES ('tenant_owner', 'inventory:catalog_write')
ON CONFLICT DO NOTHING;

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = ANY (ARRAY[
  'inventory:catalog_write',
  'inventory:units_master',
  'procurement:price_list_write'
]::text[]);

UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'inventory:catalog_write',
        'inventory:units_master',
        'procurement:price_list_write'
      ]::text[])
    ),
    updated_at = now()
WHERE position_code = 'central_supply_ops';

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template
)
SELECT
  pr.id,
  pr.tenant_id,
  NULL,
  k.key,
  rt.id
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
JOIN public.role_templates rt
  ON rt.tenant_id = pr.tenant_id
 AND rt.position_code = po.code
CROSS JOIN (
  VALUES
    ('inventory:catalog_write'),
    ('inventory:units_master'),
    ('procurement:price_list_write')
) AS k(key)
WHERE po.code = 'central_supply_ops'
ON CONFLICT DO NOTHING;
