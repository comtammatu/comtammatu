-- Grant procurement:po_approve to central_supply_ops (Central Warehouse Manager)
-- so they can cancel/manage purchase orders and approve PO workflows.

UPDATE public.role_templates
SET permission_keys = array_append(permission_keys, 'procurement:po_approve'),
    updated_at = now()
WHERE position_code = 'central_supply_ops'
  AND NOT ('procurement:po_approve' = ANY (permission_keys));

SELECT public.sync_missing_permissions_from_template();
