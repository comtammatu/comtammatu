-- Stop POS order-feed spam, dedup PO status rows, skip the unused outbox,
-- and route personal / cashier follow-up onto reachable non-station URLs.

-- ---------------------------------------------------------------------------
-- P0: ordinary POS orders already live on the board — do not insert
-- pos.order_new. Keep the function as a no-op so a restored trigger is inert.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS notify_order_new_after_insert ON public.orders;

CREATE OR REPLACE FUNCTION public.trg_notify_order_new() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_order_new() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_order_new() TO service_role;

UPDATE public.notifications
SET expires_at = now()
WHERE kind = 'pos.order_new'
  AND (expires_at IS NULL OR expires_at > now());

-- ---------------------------------------------------------------------------
-- P1: re-send / re-approve of the same PO must not inflate unread badges.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_po_sent() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_target_branch_id bigint;
  v_target_roles text[];
  v_kind text;
  v_title text;
  v_body text;
  v_action_url text;
  v_dedup_key text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.status NOT IN ('sent', 'pending_approval', 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id
    AND branch.tenant_id = NEW.tenant_id;

  IF NEW.status = 'pending_approval' THEN
    v_target_branch_id := NULL;
    v_target_roles := ARRAY['owner', 'accountant']::text[];
    v_kind := 'procurement.po_pending_approval';
    v_title := format('Phiếu mua %s chờ duyệt', NEW.po_number);
    v_body := 'Kiểm tra nhà cung cấp, số lượng và duyệt mua.';
    v_action_url := format(
      '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
      NEW.id
    );
  ELSE
    v_target_branch_id := NEW.branch_id;
    v_target_roles := CASE v_branch_kind
      WHEN 'central_supply'
        THEN ARRAY['owner', 'central_supply_ops']::text[]
      WHEN 'central_kitchen'
        THEN ARRAY['owner', 'central_kitchen_lead']::text[]
      ELSE ARRAY['owner', 'branch_manager']::text[]
    END;
    v_kind := CASE NEW.status
      WHEN 'approved' THEN 'workflow.po_approved'
      ELSE 'workflow.po_sent'
    END;
    v_title := CASE NEW.status
      WHEN 'approved'
        THEN format('Phiếu mua %s đã duyệt', NEW.po_number)
      ELSE format('PO %s đã gửi nhà cung cấp', NEW.po_number)
    END;
    v_body := CASE NEW.status
      WHEN 'approved'
        THEN 'Phiếu nhập nháp đã sẵn sàng để Kho tiếp nhận hàng.'
      ELSE 'Chờ nhập hàng và đối chiếu phiếu nhập khi nhà cung cấp giao.'
    END;
    v_action_url := format(
      '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
      NEW.id
    );
  END IF;

  v_dedup_key := format('%s:%s', v_kind, NEW.id);

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    meta,
    dedup_key
  )
  VALUES (
    NEW.tenant_id,
    v_target_branch_id,
    v_target_roles,
    v_kind,
    'info',
    v_title,
    v_body,
    'purchase_order',
    NEW.id,
    v_action_url,
    jsonb_build_object(
      'po_number', NEW.po_number,
      'status', NEW.status
    ),
    v_dedup_key
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    expires_at = NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_po_sent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_po_sent() TO service_role;

CREATE OR REPLACE FUNCTION private.expire_po_status_notification() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_po_id bigint := COALESCE(NEW.id, OLD.id);
  v_status text := NEW.status;
BEGIN
  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = v_tenant
    AND entity_type = 'purchase_order'
    AND entity_id = v_po_id
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      TG_OP = 'DELETE'
      OR (
        kind = 'procurement.po_pending_approval'
        AND v_status IS DISTINCT FROM 'pending_approval'
      )
      OR (
        kind = 'workflow.po_sent'
        AND v_status IS DISTINCT FROM 'sent'
      )
      OR (
        kind = 'workflow.po_approved'
        AND v_status IS DISTINCT FROM 'approved'
      )
    );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_po_status_notification ON public.purchase_orders;
CREATE TRIGGER trg_expire_po_status_notification
  AFTER UPDATE OF status OR DELETE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_po_status_notification();

REVOKE ALL ON FUNCTION private.expire_po_status_notification() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.expire_kds_out_of_stock_notification()
RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status NOT IN ('completed', 'cancelled') THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'pos.kds_out_of_stock'
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      (meta ->> 'order_id')::bigint = COALESCE(NEW.id, OLD.id)
      OR entity_id IN (
        SELECT item.id
        FROM public.order_items AS item
        WHERE item.order_id = COALESCE(NEW.id, OLD.id)
          AND item.tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      )
    );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_kds_out_of_stock_notification ON public.orders;
CREATE TRIGGER trg_expire_kds_out_of_stock_notification
  AFTER UPDATE OF status OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_kds_out_of_stock_notification();

REVOKE ALL ON FUNCTION private.expire_kds_out_of_stock_notification()
  FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- P2: no worker consumes notification_outbox. Stop enqueueing pending rows.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_supplier_returns_outbox ON public.supplier_returns;

CREATE OR REPLACE FUNCTION public.trg_supplier_return_outbox() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_supplier_return_outbox()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_supplier_return_outbox() TO service_role;

UPDATE public.notification_outbox
SET status = 'skipped'
WHERE status = 'pending';

REVOKE ALL ON TABLE public.notification_outbox FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.notification_outbox
  FROM authenticated;
GRANT SELECT ON TABLE public.notification_outbox TO authenticated;

-- ---------------------------------------------------------------------------
-- Route personal outcomes to /me and cashier follow-up to Cổng Đơn bán.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.canonicalize_notification() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_order_id bigint;
BEGIN
  NEW.target_roles := ARRAY(
    SELECT DISTINCT target_role
    FROM unnest(NEW.target_roles) AS roles(target_role)
    WHERE target_role = ANY (ARRAY[
      'owner',
      'accountant',
      'central_supply_ops',
      'central_kitchen_lead',
      'branch_manager',
      'cashier',
      'chef',
      'branch_staff',
      'self_service'
    ]::text[])
    ORDER BY target_role
  );

  IF cardinality(NEW.target_roles) = 0 THEN
    RAISE EXCEPTION 'notification_requires_canonical_target_role'
      USING ERRCODE = '23514';
  END IF;

  NEW.action_url := CASE NEW.kind
    WHEN 'procurement.purchase_request_submitted' THEN
      format(
        '/inventory/purchase-orders?tab=needs&demandId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'procurement.po_pending_approval' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'workflow.po_approved' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'workflow.po_sent' THEN
      format(
        '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
        NEW.entity_id
      )
    WHEN 'hr.payroll_period_ready' THEN
      format('/hr/payroll/%s', NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format('/hr/attendance?tab=approvals&leaveRequestId=%s', NEW.entity_id)
        ELSE NEW.action_url
      END
    WHEN 'hr.leave_approved' THEN
      '/me/schedule/leave'
    WHEN 'hr.leave_rejected' THEN
      '/me/schedule/leave'
    WHEN 'hr.checkout_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format(
            '/hr/attendance/checkout-approvals?attendanceId=%s',
            NEW.entity_id
          )
        ELSE NEW.action_url
      END
    WHEN 'attendance.checkout_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format(
            '/hr/attendance/checkout-approvals?attendanceId=%s',
            NEW.entity_id
          )
        ELSE NEW.action_url
      END
    WHEN 'hr.checkout_approved' THEN
      '/me/clock'
    WHEN 'hr.checkout_rejected' THEN
      '/me/clock'
    WHEN 'inventory.stock_request_rejected' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'inventory.waste_pending_approval' THEN
      format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN NEW.action_url
        ELSE format(
          '/br/%s/orders?voidRequest=%s',
          NEW.target_branch_id,
          NEW.entity_id
        )
      END
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'pos.kds_out_of_stock' THEN
      NEW.action_url
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN '/inventory/stock'
        ELSE format('/br/%s/stock', NEW.target_branch_id)
      END
    WHEN 'work.task_assigned' THEN
      format('/work/tasks/%s', NEW.entity_id)
    ELSE NEW.action_url
  END;

  IF NEW.target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.target_branch_id
    AND branch.tenant_id = NEW.tenant_id;

  v_order_id := CASE
    WHEN (NEW.meta ->> 'order_id') ~ '^\d+$'
      THEN (NEW.meta ->> 'order_id')::bigint
    ELSE NULL
  END;

  NEW.action_url := CASE NEW.kind
    WHEN 'inventory.stock_low' THEN
      CASE
        WHEN v_branch_kind = 'branch' AND NEW.entity_id IS NULL
          THEN format('/br/%s/stock', NEW.target_branch_id)
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/on-hand/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        WHEN NEW.entity_id IS NULL
          THEN format('/inventory/stock?branch=%s', NEW.target_branch_id)
        ELSE format(
          '/inventory/stock/%s?branch=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stock_request_submitted' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'workflow.grn_pending' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/transfer', NEW.target_branch_id)
        ELSE format('/inventory/grn/%s', NEW.entity_id)
      END
    WHEN 'inventory.count_slip_submitted' THEN
      format(
        '/br/%s/stock/count-slips?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.stocktake_completed' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branch=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stocktake_conflict' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branch=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.waste.weekly_report' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format(
          '/inventory/waste/approvals?branch=%s',
          NEW.target_branch_id
        )
      END
    WHEN 'workflow.transfer_in_transit' THEN
      format('/br/%s/stock/receive/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      format(
        '/br/%s/team?tab=leaves&leaveRequestId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'attendance.checkout_requested' THEN
      format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'hr.checkout_requested' THEN
      format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.count_slip_approved' THEN
      format(
        '/br/%s/stock/count-slips?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.count_slip_recount' THEN
      format(
        '/br/%s/stock/count?slipId=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'hr.leave_approved' THEN
      '/me/schedule/leave'
    WHEN 'hr.leave_rejected' THEN
      '/me/schedule/leave'
    WHEN 'hr.checkout_approved' THEN
      '/me/clock'
    WHEN 'hr.checkout_rejected' THEN
      '/me/clock'
    WHEN 'pos.shift_variance' THEN
      format(
        '/br/%s/pos-sessions?session=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'inventory.stock_request_rejected' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock?work=receive', NEW.target_branch_id)
        ELSE format('/inventory/transfers?requestId=%s', NEW.entity_id)
      END
    WHEN 'inventory.waste_pending_approval' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
      END
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      format(
        '/br/%s/orders?voidRequest=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'pos.void_resolved' THEN
      CASE
        WHEN v_order_id IS NOT NULL THEN
          format('/br/%s/orders?orderId=%s', NEW.target_branch_id, v_order_id)
        ELSE format('/br/%s/orders', NEW.target_branch_id)
      END
    WHEN 'pos.void_rejected' THEN
      CASE
        WHEN v_order_id IS NOT NULL THEN
          format('/br/%s/orders?orderId=%s', NEW.target_branch_id, v_order_id)
        ELSE format('/br/%s/orders', NEW.target_branch_id)
      END
    WHEN 'pos.kds_out_of_stock' THEN
      CASE
        WHEN v_order_id IS NOT NULL THEN
          format('/br/%s/orders?orderId=%s', NEW.target_branch_id, v_order_id)
        ELSE format('/br/%s/orders', NEW.target_branch_id)
      END
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock', NEW.target_branch_id)
        ELSE format('/inventory/stock?branch=%s', NEW.target_branch_id)
      END
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.canonicalize_notification() IS
  'Normalizes notification target_roles and action_url. Personal leave/checkout results use /me; cashier void and hết món use Cổng Đơn bán, not the live POS board.';

UPDATE public.notifications
SET action_url = '/me/schedule/leave'
WHERE kind IN ('hr.leave_approved', 'hr.leave_rejected')
  AND (expires_at IS NULL OR expires_at > now());

UPDATE public.notifications
SET action_url = '/me/clock'
WHERE kind IN ('hr.checkout_approved', 'hr.checkout_rejected')
  AND (expires_at IS NULL OR expires_at > now());

UPDATE public.notifications
SET action_url = format(
  '/br/%s/orders?voidRequest=%s',
  target_branch_id,
  entity_id
)
WHERE kind = 'pos.void_requested'
  AND target_branch_id IS NOT NULL
  AND entity_id IS NOT NULL
  AND (expires_at IS NULL OR expires_at > now());

UPDATE public.notifications
SET action_url = CASE
  WHEN NULLIF(meta ->> 'order_id', '') IS NOT NULL THEN
    format(
      '/br/%s/orders?orderId=%s',
      target_branch_id,
      meta ->> 'order_id'
    )
  ELSE format('/br/%s/orders', target_branch_id)
END
WHERE kind IN (
    'pos.kds_out_of_stock',
    'pos.void_resolved',
    'pos.void_rejected'
  )
  AND target_branch_id IS NOT NULL
  AND (expires_at IS NULL OR expires_at > now());
