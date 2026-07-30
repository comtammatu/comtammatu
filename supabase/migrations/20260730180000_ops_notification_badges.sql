CREATE OR REPLACE FUNCTION private.canonicalize_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
      'branch_staff'
    ]::text[])
    ORDER BY target_role
  );

  IF cardinality(NEW.target_roles) = 0 THEN
    RAISE EXCEPTION 'notification_requires_canonical_target_role'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.action_url := CASE NEW.kind
    WHEN 'inventory.stock_low' THEN
      CASE WHEN NEW.entity_id IS NULL
        THEN format('/br/%s/stock', NEW.target_branch_id)
        ELSE format(
          '/br/%s/stock/on-hand/%s',
          NEW.target_branch_id,
          NEW.entity_id
        )
      END
    WHEN 'inventory.stock_request_submitted' THEN
      format('/inventory/stock-requests/%s', NEW.entity_id)
    WHEN 'workflow.grn_pending' THEN
      format('/br/%s/stock/grn/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'workflow.po_sent' THEN
      CASE WHEN NEW.target_roles && ARRAY[
        'central_supply_ops',
        'central_kitchen_lead'
      ]::text[]
        THEN '/inventory/grn'
        ELSE format('/br/%s/stock/grn', NEW.target_branch_id)
      END
    WHEN 'workflow.po_approved' THEN
      '/inventory/grn'
    WHEN 'inventory.count_slip_submitted' THEN
      format('/br/%s/stock/count-slips', NEW.target_branch_id)
    WHEN 'workflow.stocktake_submitted' THEN
      format('/br/%s/stock/stocktake/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'workflow.transfer_in_transit' THEN
      format('/br/%s/stock/receive/%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      format('/br/%s/shift/leave-approvals', NEW.target_branch_id)
    WHEN 'attendance.checkout_requested' THEN
      format('/br/%s/shift/checkout-approvals', NEW.target_branch_id)
    WHEN 'inventory.count_slip_approved' THEN
      format('/br/%s/stock/count', NEW.target_branch_id)
    WHEN 'inventory.count_slip_recount' THEN
      format('/br/%s/stock/count', NEW.target_branch_id)
    WHEN 'hr.leave_approved' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'hr.leave_rejected' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'pos.shift_variance' THEN
      format(
        '/br/%s/pos-sessions?session=%s',
        NEW.target_branch_id,
        NEW.entity_id
      )
    WHEN 'pos.payment_stock_failed' THEN
      format('/br/%s/orders', NEW.target_branch_id)
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.canonicalize_notification() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_notify_po_sent()
RETURNS trigger
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
      '/inventory/purchase-orders?poId=%s&mode=view',
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
    v_action_url := CASE
      WHEN v_branch_kind IN ('central_supply', 'central_kitchen')
        THEN '/inventory/grn'
      ELSE format('/br/%s/stock/grn', NEW.branch_id)
    END;
  END IF;

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
    meta
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
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_po_sent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_po_sent() TO service_role;

CREATE OR REPLACE FUNCTION private.notify_stock_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status <> 'submitted'
     OR (
       TG_OP = 'UPDATE'
       AND OLD.status IS NOT DISTINCT FROM 'submitted'
     ) THEN
    RETURN NEW;
  END IF;

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
    dedup_key,
    meta
  )
  SELECT
    NEW.tenant_id,
    target_site.id,
    CASE destination.fulfill_site_kind
      WHEN 'central_supply'
        THEN ARRAY['owner', 'central_supply_ops']::text[]
      ELSE ARRAY['owner', 'central_kitchen_lead']::text[]
    END,
    'inventory.stock_request_submitted',
    'info',
    format('Yêu cầu hàng %s mới', NEW.request_number),
    format(
      '%s gửi %s mặt hàng cần %s đáp ứng.',
      source_site.name,
      destination.line_count,
      CASE destination.fulfill_site_kind
        WHEN 'central_supply' THEN 'Kho Tổng'
        ELSE 'Bếp Trung tâm'
      END
    ),
    'stock_request',
    NEW.id,
    format('/inventory/stock-requests/%s', NEW.id),
    format(
      'inventory.stock_request_submitted:%s:%s',
      NEW.id,
      destination.fulfill_site_kind
    ),
    jsonb_build_object(
      'request_number', NEW.request_number,
      'source_branch_id', NEW.branch_id,
      'fulfill_site_kind', destination.fulfill_site_kind,
      'line_count', destination.line_count
    )
  FROM (
    SELECT
      item.fulfill_site_kind,
      count(*)::integer AS line_count
    FROM public.stock_request_items AS item
    WHERE item.tenant_id = NEW.tenant_id
      AND item.request_id = NEW.id
      AND item.status = 'pending'
    GROUP BY item.fulfill_site_kind
  ) AS destination
  JOIN public.branches AS target_site
    ON target_site.tenant_id = NEW.tenant_id
   AND target_site.branch_kind = destination.fulfill_site_kind
   AND target_site.is_active
  JOIN public.branches AS source_site
    ON source_site.id = NEW.branch_id
   AND source_site.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_stock_request_submitted() FROM PUBLIC;

CREATE TRIGGER trg_notify_stock_request_submitted
AFTER INSERT OR UPDATE OF status
ON public.stock_requests
FOR EACH ROW
EXECUTE FUNCTION private.notify_stock_request_submitted();

CREATE OR REPLACE FUNCTION private.notify_purchase_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status <> 'submitted'
     OR (
       TG_OP = 'UPDATE'
       AND OLD.status IS NOT DISTINCT FROM 'submitted'
     ) THEN
    RETURN NEW;
  END IF;

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
    dedup_key,
    meta
  )
  SELECT
    NEW.tenant_id,
    NULL,
    ARRAY['owner', 'accountant']::text[],
    'procurement.purchase_request_submitted',
    'info',
    format('Yêu cầu mua %s chờ lập đơn', NEW.request_number),
    format(
      '%s đã gửi yêu cầu mua. Kiểm tra nhà cung cấp, giá và lập Đơn mua hàng.',
      source_site.name
    ),
    'purchase_request',
    NEW.id,
    format(
      '/inventory/purchase-requests?requestId=%s&mode=view',
      NEW.id
    ),
    format('procurement.purchase_request_submitted:%s', NEW.id),
    jsonb_build_object(
      'request_number', NEW.request_number,
      'source_branch_id', NEW.branch_id
    )
  FROM public.branches AS source_site
  WHERE source_site.id = NEW.branch_id
    AND source_site.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_purchase_request_submitted() FROM PUBLIC;

CREATE TRIGGER trg_notify_purchase_request_submitted
AFTER INSERT OR UPDATE OF status
ON public.purchase_requests
FOR EACH ROW
EXECUTE FUNCTION private.notify_purchase_request_submitted();

CREATE OR REPLACE FUNCTION public.count_unread_notifications_by_target()
RETURNS TABLE (
  kind text,
  action_url text,
  unread_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    notification.kind,
    notification.action_url,
    count(*)::bigint AS unread_count
  FROM public.notifications AS notification
  LEFT JOIN public.notification_reads AS notification_read
    ON notification_read.notification_id = notification.id
   AND notification_read.user_id = (SELECT auth.uid())
  WHERE notification_read.notification_id IS NULL
    AND (
      notification.expires_at IS NULL
      OR notification.expires_at > now()
    )
  GROUP BY notification.kind, notification.action_url;
$$;

REVOKE ALL
ON FUNCTION public.count_unread_notifications_by_target()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.count_unread_notifications_by_target()
TO authenticated, service_role;

COMMENT ON FUNCTION public.count_unread_notifications_by_target() IS
  'RLS-scoped unread notification counts grouped by navigation target.';
