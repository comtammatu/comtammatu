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
    ELSE NEW.action_url
  END;

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

REVOKE ALL
ON FUNCTION private.canonicalize_notification()
FROM PUBLIC, anon, authenticated, service_role;

UPDATE public.notifications
SET action_url = CASE kind
  WHEN 'procurement.purchase_request_submitted' THEN
    format(
      '/inventory/purchase-orders?tab=needs&demandId=%s&mode=view',
      entity_id
    )
  ELSE format(
    '/inventory/purchase-orders?tab=orders&poId=%s&mode=view',
    entity_id
  )
END
WHERE kind IN (
    'procurement.purchase_request_submitted',
    'procurement.po_pending_approval',
    'workflow.po_approved',
    'workflow.po_sent'
  )
  AND entity_id IS NOT NULL;
