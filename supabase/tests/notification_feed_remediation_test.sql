-- Catalog contract for notification feed remediation: stop pos.order_new,
-- PO status dedup, skip unused outbox, personal /me and Cổng Đơn bán routes.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_order_new text;
  v_po_sent text;
  v_canonicalize text;
  v_outbox text;
  v_expire_po text;
  v_expire_oos text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'orders'
      AND trigger_row.tgname = 'notify_order_new_after_insert'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'pos.order_new trigger must stay dropped';
  END IF;

  SELECT pg_get_functiondef('public.trg_notify_order_new()'::regprocedure)
  INTO v_order_new;
  IF v_order_new LIKE '%pos.order_new%'
     OR v_order_new LIKE '%INSERT INTO public.notifications%' THEN
    RAISE EXCEPTION 'trg_notify_order_new must not insert notifications';
  END IF;

  SELECT pg_get_functiondef('public.trg_notify_po_sent()'::regprocedure)
  INTO v_po_sent;
  IF position('v_dedup_key' IN v_po_sent) = 0
     OR position('v_kind, NEW.id' IN v_po_sent) = 0
     OR position('workflow.po_sent' IN v_po_sent) = 0
     OR position('workflow.po_approved' IN v_po_sent) = 0
     OR position('ON CONFLICT (tenant_id, dedup_key)' IN v_po_sent) = 0
     OR position('DO UPDATE SET' IN v_po_sent) = 0
     OR position('expires_at = NULL' IN v_po_sent) = 0
     OR position('created_at = now()' IN v_po_sent) > 0
     OR position('SET search_path TO ''' IN v_po_sent) = 0 THEN
    RAISE EXCEPTION 'trg_notify_po_sent must upsert by kind+po id without bumping created_at';
  END IF;

  SELECT pg_get_functiondef(
    'private.expire_po_status_notification()'::regprocedure
  ) INTO v_expire_po;
  IF position('workflow.po_sent' IN v_expire_po) = 0
     OR position('workflow.po_approved' IN v_expire_po) = 0
     OR position('procurement.po_pending_approval' IN v_expire_po) = 0 THEN
    RAISE EXCEPTION 'expire_po_status_notification kinds missing';
  END IF;

  SELECT pg_get_functiondef(
    'private.expire_kds_out_of_stock_notification()'::regprocedure
  ) INTO v_expire_oos;
  IF position('pos.kds_out_of_stock' IN v_expire_oos) = 0 THEN
    RAISE EXCEPTION 'kds out-of-stock expiry missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'supplier_returns'
      AND trigger_row.tgname = 'trg_supplier_returns_outbox'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'supplier return outbox trigger must stay dropped';
  END IF;

  SELECT pg_get_functiondef('public.trg_supplier_return_outbox()'::regprocedure)
  INTO v_outbox;
  IF v_outbox LIKE '%INSERT INTO public.notification_outbox%' THEN
    RAISE EXCEPTION 'trg_supplier_return_outbox must not enqueue';
  END IF;

  IF has_table_privilege('anon', 'public.notification_outbox', 'INSERT')
     OR has_table_privilege('authenticated', 'public.notification_outbox', 'INSERT')
     OR has_table_privilege('authenticated', 'public.notification_outbox', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.notification_outbox', 'DELETE') THEN
    RAISE EXCEPTION 'notification_outbox must not accept client writes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_outbox
    WHERE status = 'pending'
  ) THEN
    RAISE EXCEPTION 'notification_outbox must not keep pending rows';
  END IF;

  SELECT pg_get_functiondef(
    'private.canonicalize_notification()'::regprocedure
  ) INTO v_canonicalize;
  IF position('/me/schedule/leave' IN v_canonicalize) = 0
     OR position('/me/clock' IN v_canonicalize) = 0
     OR position('/br/%s/orders?voidRequest=%s' IN v_canonicalize) = 0
     OR position('/br/%s/orders?orderId=%s' IN v_canonicalize) = 0
     OR position('/br/%s/pos?voidRequest=%s' IN v_canonicalize) > 0 THEN
    RAISE EXCEPTION 'canonicalize_notification route contract mismatch';
  END IF;
END;
$$;

ROLLBACK;
