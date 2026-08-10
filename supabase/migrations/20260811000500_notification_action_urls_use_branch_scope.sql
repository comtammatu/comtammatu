-- Control Surface scope: L0 inventory notification action URLs use ?branch=
-- (canonical). Legacy ?branchId= links remain readable in the app until dual-read
-- is retired after this emitter cutover.

CREATE OR REPLACE FUNCTION private.canonicalize_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_branch_kind text;
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
    WHEN 'hr.payroll_period_ready' THEN
      format('/hr/payroll/%s', NEW.entity_id)
    WHEN 'hr.leave_requested' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN
          format('/hr/attendance?tab=approvals&leaveRequestId=%s', NEW.entity_id)
        ELSE NEW.action_url
      END
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
    WHEN 'inventory.stock_request_rejected' THEN
      format('/inventory/transfers?requestId=%s', NEW.entity_id)
    WHEN 'inventory.waste_pending_approval' THEN
      format('/inventory/waste/approvals?issueId=%s', NEW.entity_id)
    WHEN 'inventory.valuation_variance' THEN
      '/finance/supplier-invoices?invoiceId=' || NEW.entity_id::text
    WHEN 'inventory.valuation_reconciliation_failed' THEN
      NEW.action_url
    WHEN 'pos.void_requested' THEN
      format('/br/%s/pos?voidRequest=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'hr.checkout_approved' THEN
      NEW.action_url
    WHEN 'hr.checkout_rejected' THEN
      NEW.action_url
    WHEN 'inventory.pos_stock_shortfall' THEN
      CASE
        WHEN NEW.target_branch_id IS NULL THEN '/inventory/stock'
        ELSE format('/br/%s/stock', NEW.target_branch_id)
      END
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
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
    WHEN 'hr.leave_rejected' THEN
      format('/br/%s/shift/schedule/leave', NEW.target_branch_id)
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
      format('/br/%s/pos?voidRequest=%s', NEW.target_branch_id, NEW.entity_id)
    WHEN 'pos.void_resolved' THEN
      NEW.action_url
    WHEN 'pos.void_rejected' THEN
      NEW.action_url
    WHEN 'hr.checkout_approved' THEN
      NEW.action_url
    WHEN 'hr.checkout_rejected' THEN
      NEW.action_url
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
  'Normalizes notification target_roles and action_url. L0 inventory deep links use unified ?branch= scope.';
