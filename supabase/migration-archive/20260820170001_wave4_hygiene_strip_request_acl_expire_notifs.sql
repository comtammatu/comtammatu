-- Wave 4 completion: hygiene leftover YCM/YCH, strip request ACL keys,
-- REVOKE leftover allocate RPC, expire request notifications.
-- Write RPCs were already revoked in 20260820123758.

-- 1) Close leftover non-terminal vouchers without convert (Owner lock).
DELETE FROM public.purchase_request_allocations AS allocation
USING public.purchase_requests AS demand
WHERE demand.id = allocation.purchase_request_id
  AND demand.tenant_id = allocation.tenant_id
  AND demand.request_number IN ('YCM-07082026-0022', 'YCM-20082026-0051');

UPDATE public.purchase_requests AS demand
SET status = 'closed',
    status_reason = 'Wave 4 freeze: close leftover YCM without convert',
    closed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
WHERE demand.request_number = 'YCM-07082026-0022'
  AND demand.status = 'partially_ordered';

UPDATE public.purchase_requests AS demand
SET status = 'cancelled',
    status_reason = 'Wave 4 freeze: cancel leftover YCM without convert',
    updated_at = pg_catalog.now()
WHERE demand.request_number = 'YCM-20082026-0051'
  AND demand.status = 'pending_allocation';

UPDATE public.stock_request_items AS item
SET status = 'cancelled',
    updated_at = pg_catalog.now()
FROM public.stock_requests AS request
WHERE request.id = item.request_id
  AND request.tenant_id = item.tenant_id
  AND request.request_number IN ('YC-31072026-0001', 'YC-08082026-0002')
  AND request.status = 'submitted'
  AND item.status = 'pending';

UPDATE public.stock_requests AS request
SET status = 'closed',
    status_reason = 'Wave 4 freeze: close leftover YCH without convert',
    closed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
WHERE request.request_number IN ('YC-31072026-0001', 'YC-08082026-0002')
  AND request.status = 'submitted';

-- 2) REVOKE leftover allocate write (Wave 4 deny list includes save_purchase_demand*).
REVOKE ALL ON FUNCTION public.save_purchase_demand_allocations(
  bigint, jsonb, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_purchase_demand_allocations(
  bigint, jsonb, uuid
) TO service_role;

-- 3) Strip request ACL from templates and live staff grants.
UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT permission_key ORDER BY permission_key), ARRAY[]::text[])
  FROM unnest(template.permission_keys) AS permission_key
  WHERE permission_key NOT IN (
    'procurement:request_manage',
    'inventory:request_create',
    'inventory:request_submit',
    'inventory:request_cancel',
    'inventory:request_fulfill'
  )
),
updated_at = pg_catalog.now()
WHERE template.permission_keys && ARRAY[
  'procurement:request_manage',
  'inventory:request_create',
  'inventory:request_submit',
  'inventory:request_cancel',
  'inventory:request_fulfill'
]::text[];

DELETE FROM public.staff_permissions AS permission
WHERE permission.permission_key IN (
  'procurement:request_manage',
  'inventory:request_create',
  'inventory:request_submit',
  'inventory:request_cancel',
  'inventory:request_fulfill'
);

-- 4) Expire request-queue notifications so toasts stop pointing at frozen paths.
UPDATE public.notifications AS notification
SET expires_at = pg_catalog.now()
WHERE notification.kind IN (
  'procurement.purchase_request_submitted',
  'inventory.stock_request_submitted',
  'inventory.stock_request_fulfillable',
  'inventory.stock_request_source_attention'
)
AND (notification.expires_at IS NULL OR notification.expires_at > pg_catalog.now());
