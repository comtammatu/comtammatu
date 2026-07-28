-- D091: Accountant reads purchase prices for GRN/PO, never inventory valuation.

UPDATE public.permission_keys
SET description =
      'Owner-only WAC and inventory valuation through the protected monetary boundary.',
    is_delegable_to_staff = false
WHERE key = 'inventory:valuation_read';

UPDATE public.role_templates
SET permission_keys = array_remove(permission_keys, 'inventory:valuation_read'),
    updated_at = now()
WHERE position_code = 'accountant';

DELETE FROM public.staff_permissions permission
USING public.profiles profile, public.positions position
WHERE permission.user_id = profile.id
  AND permission.tenant_id = profile.tenant_id
  AND position.id = profile.position_id
  AND position.tenant_id = profile.tenant_id
  AND position.code = 'accountant'
  AND permission.permission_key = 'inventory:valuation_read';

CREATE OR REPLACE FUNCTION public.can_read_inventory_monetary(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_key
    WHEN 'procurement:price_list_read' THEN
      public.auth_is_owner(auth.uid())
      OR (
        public.has_position('accountant')
        AND public.has_permission_any(p_key)
      )
    WHEN 'inventory:valuation_read' THEN public.auth_is_owner(auth.uid())
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.can_read_inventory_monetary(text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_inventory_monetary(text)
TO authenticated, service_role;

COMMENT ON FUNCTION public.can_read_inventory_monetary(text) IS
  'Owner/Accountant purchase-price boundary; inventory valuation is Owner-only.';
