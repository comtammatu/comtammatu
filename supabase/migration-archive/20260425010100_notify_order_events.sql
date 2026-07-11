-- =============================================================
-- Notification triggers — POS order events
-- =============================================================
-- Fire on: AFTER INSERT ON orders → "pos.order_new"
-- Recipients: cashier, waiter, branch_manager at the order's branch.

CREATE OR REPLACE FUNCTION public.trg_notify_order_new()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles,
    kind, severity, title, body,
    entity_type, entity_id, action_url, meta
  )
  VALUES (
    NEW.tenant_id,
    NEW.branch_id,
    ARRAY['cashier', 'waiter', 'branch_manager']::TEXT[],
    'pos.order_new',
    'info',
    format('Đơn mới #%s', NEW.order_number),
    CASE
      WHEN NEW.table_id IS NOT NULL THEN format('Bàn %s', NEW.table_id)
      WHEN NEW.order_type = 'takeaway' THEN 'Mang về'
      ELSE NULL
    END,
    'order',
    NEW.id,
    format('/br/%s/pos?order=%s', NEW.branch_id, NEW.id),
    jsonb_build_object(
      'order_number', NEW.order_number,
      'order_type', NEW.order_type,
      'table_id', NEW.table_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_order_new_after_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_order_new();
