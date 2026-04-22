-- =============================================================
-- Auth v2 hotfix: allow KDS staff to SELECT order_items
-- Chef template has only kds:use + kds:mark_ready, not orders:read.
-- To cook, chef must see what's on the order. Broaden order_items SELECT
-- to accept EITHER orders:read OR kds:use on the parent order's branch.
-- Same for order_status_history SELECT.
-- =============================================================

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = order_items.tenant_id
        AND (
          public.has_permission(o.branch_id, 'orders:read')
          OR public.has_permission(o.branch_id, 'kds:use')
        )
    )
  );

DROP POLICY IF EXISTS "order_status_history_select" ON public.order_status_history;

CREATE POLICY "order_status_history_select" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.tenant_id = order_status_history.tenant_id
        AND (
          public.has_permission(o.branch_id, 'orders:read')
          OR public.has_permission(o.branch_id, 'kds:use')
        )
    )
  );

-- Also broaden orders SELECT so KDS board can fetch the order row (table number, created_at, etc.)
DROP POLICY IF EXISTS "orders_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'orders:read')
      OR public.has_permission(branch_id, 'kds:use')
    )
  );
