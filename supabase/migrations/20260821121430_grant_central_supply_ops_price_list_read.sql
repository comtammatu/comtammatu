-- Allow central_supply_ops (Central Warehouse Manager) to read purchase price list
-- and supplier prices through the protected monetary boundary.

UPDATE public.role_templates
SET permission_keys = array_append(permission_keys, 'procurement:price_list_read'),
    updated_at = now()
WHERE position_code = 'central_supply_ops'
  AND NOT ('procurement:price_list_read' = ANY (permission_keys));

SELECT public.sync_missing_permissions_from_template();

CREATE OR REPLACE FUNCTION public.can_read_inventory_monetary(p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT CASE p_key
    WHEN 'procurement:price_list_read' THEN
      public.auth_is_owner(auth.uid())
      OR (
        (public.has_position('accountant') OR public.has_position('central_supply_ops'))
        AND public.has_permission_any(p_key)
      )
    WHEN 'inventory:valuation_read' THEN public.auth_is_owner(auth.uid())
    ELSE false
  END
$$;

COMMENT ON FUNCTION public.can_read_inventory_monetary(p_key text) IS
  'Owner/Accountant/Central Supply Ops purchase-price boundary; inventory valuation is Owner-only.';
