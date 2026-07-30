WITH candidates AS (
  SELECT demand.*
  FROM public.purchase_requests AS demand
  WHERE demand.status = 'submitted'
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_orders AS purchase_order
      WHERE purchase_order.tenant_id = demand.tenant_id
        AND purchase_order.purchase_request_id = demand.id
        AND purchase_order.status <> 'cancelled'
    )
  FOR UPDATE
),
normalized AS (
  UPDATE public.purchase_requests AS demand
  SET status = 'pending_allocation',
      updated_at = pg_catalog.now()
  FROM candidates AS candidate
  WHERE demand.id = candidate.id
    AND demand.tenant_id = candidate.tenant_id
  RETURNING
    demand.tenant_id,
    demand.id,
    pg_catalog.to_jsonb(candidate) AS old_data,
    pg_catalog.to_jsonb(demand) AS new_data
)
INSERT INTO public.audit_logs (
  tenant_id,
  user_id,
  action,
  entity_type,
  entity_id,
  old_data,
  new_data
)
SELECT
  normalized.tenant_id,
  NULL,
  'procurement.demand.cutover_normalized',
  'purchase_request',
  normalized.id,
  normalized.old_data,
  normalized.new_data
FROM normalized;

REVOKE ALL ON FUNCTION public.save_purchase_request(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) FROM PUBLIC, anon, authenticated;
