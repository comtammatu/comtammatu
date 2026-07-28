-- D091: purchase prices and inventory valuation are Owner/Accountant only.

UPDATE public.permission_keys
SET scope = 'tenant',
    is_delegable_to_staff = true,
    description = 'Read purchase prices through the protected monetary boundary.'
WHERE key = 'procurement:price_list_read';

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES ('inventory:valuation_read', 'inventory',
  'Read WAC and inventory valuation through the protected monetary boundary.',
  'tenant', true)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT key
      FROM unnest(
        permission_keys
        || ARRAY[
          'procurement:price_list_read',
          'inventory:valuation_read'
        ]::text[]
      ) AS key
      ORDER BY key
    ),
    updated_at = now()
WHERE position_code IN ('owner', 'accountant');

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  profile.id,
  profile.tenant_id,
  NULL,
  key.permission_key,
  template.id,
  NULL
FROM public.profiles profile
JOIN public.positions position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
JOIN public.role_templates template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = 'accountant'
CROSS JOIN (
  VALUES
    ('procurement:price_list_read'),
    ('inventory:valuation_read')
) AS key(permission_key)
WHERE position.code = 'accountant'
  AND COALESCE(profile.is_active, true)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_read_inventory_monetary(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_key IN (
      'procurement:price_list_read',
      'inventory:valuation_read'
    )
    AND (
      public.auth_is_owner(auth.uid())
      OR (
        public.has_position('accountant')
        AND public.has_permission_any(p_key)
      )
    )
$$;

REVOKE ALL ON FUNCTION public.can_read_inventory_monetary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_inventory_monetary(text)
TO authenticated, service_role;

COMMENT ON FUNCTION public.can_read_inventory_monetary(text) IS
  'Owner/Accountant monetary capability boundary. Operational roles fail closed even if a stale grant exists.';

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices_protected(
  p_po_id bigint,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.auth_tenant_id() IS NULL
     OR NOT public.can_read_inventory_monetary(
    'procurement:price_list_read'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN public.update_purchase_order_prices(p_po_id, p_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_order_prices_protected(
  bigint,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_prices_protected(
  bigint,
  jsonb
) TO authenticated, service_role;
