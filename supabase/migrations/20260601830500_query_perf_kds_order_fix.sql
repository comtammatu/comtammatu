-- Correct the KDS board hot-path index so RLS tenant predicates and
-- created_at ordering can be satisfied by the same partial index.

DROP INDEX IF EXISTS public.idx_kds_tickets_branch_created_live;

CREATE INDEX IF NOT EXISTS idx_kds_tickets_tenant_branch_created_live
  ON public.kds_tickets (tenant_id, branch_id, created_at ASC)
  INCLUDE (
    status,
    station_id,
    order_id,
    order_item_id,
    kitchen_send_batch_id,
    bumped_at,
    updated_at
  )
  WHERE status = ANY (ARRAY['pending', 'preparing', 'ready']);
