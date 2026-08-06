-- Notification work queue: expire-on-resolve, Team-hub deep links,
-- list active-first, payroll period ready producer.

-- ---------------------------------------------------------------------------
-- 1) Canonicalize action URLs (leave/checkout → Team hub; count-slip + slipId)
-- ---------------------------------------------------------------------------
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
          THEN format('/inventory/stock?branchId=%s', NEW.target_branch_id)
        ELSE format(
          '/inventory/stock/%s?branchId=%s',
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
    WHEN 'workflow.stocktake_submitted' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branchId=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.stocktake_completed' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/stocktake/%s',
            NEW.target_branch_id,
            NEW.entity_id
          )
        ELSE format(
          '/inventory/stocktake/%s?branchId=%s',
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
          '/inventory/stocktake/%s?branchId=%s',
          NEW.entity_id,
          NEW.target_branch_id
        )
      END
    WHEN 'inventory.waste.weekly_report' THEN
      CASE
        WHEN v_branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', NEW.target_branch_id)
        ELSE format(
          '/inventory/waste/approvals?branchId=%s',
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
    WHEN 'pos.payment_stock_failed' THEN
      format('/br/%s/orders', NEW.target_branch_id)
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;

-- Backfill active leave/checkout/count-slip URLs to Team hub / slipId.
UPDATE public.notifications AS notification
SET action_url = CASE notification.kind
  WHEN 'hr.leave_requested' THEN
    CASE
      WHEN notification.target_branch_id IS NULL THEN
        format(
          '/hr/attendance?tab=approvals&leaveRequestId=%s',
          notification.entity_id
        )
      ELSE format(
        '/br/%s/team?tab=leaves&leaveRequestId=%s',
        notification.target_branch_id,
        notification.entity_id
      )
    END
  WHEN 'attendance.checkout_requested' THEN
    CASE
      WHEN notification.target_branch_id IS NULL THEN
        format(
          '/hr/attendance/checkout-approvals?attendanceId=%s',
          notification.entity_id
        )
      ELSE format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        notification.target_branch_id,
        notification.entity_id
      )
    END
  WHEN 'hr.checkout_requested' THEN
    CASE
      WHEN notification.target_branch_id IS NULL THEN
        format(
          '/hr/attendance/checkout-approvals?attendanceId=%s',
          notification.entity_id
        )
      ELSE format(
        '/br/%s/team?tab=checkouts&attendanceId=%s',
        notification.target_branch_id,
        notification.entity_id
      )
    END
  WHEN 'inventory.count_slip_submitted' THEN
    format(
      '/br/%s/stock/count-slips?slipId=%s',
      notification.target_branch_id,
      notification.entity_id
    )
  ELSE notification.action_url
END
WHERE notification.kind IN (
  'hr.leave_requested',
  'attendance.checkout_requested',
  'hr.checkout_requested',
  'inventory.count_slip_submitted'
)
  AND notification.entity_id IS NOT NULL
  AND (notification.expires_at IS NULL OR notification.expires_at > now());

-- ---------------------------------------------------------------------------
-- 2) Expire helpers + triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.expire_leave_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'pending' THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'hr.leave_requested'
    AND entity_type = 'leave_request'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_leave_request_notification
  ON public.leave_requests;
CREATE TRIGGER trg_expire_leave_request_notification
  AFTER UPDATE OF status OR DELETE
  ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_leave_request_notification();

CREATE OR REPLACE FUNCTION private.expire_checkout_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Resolved: approved (check_out set) or rejected (request cleared).
  IF TG_OP = 'UPDATE'
     AND NEW.check_out IS NULL
     AND NEW.checkout_requested_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.checkout_requested_at IS NULL
     AND NEW.checkout_requested_at IS NULL
     AND OLD.check_out IS NOT DISTINCT FROM NEW.check_out THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind IN ('attendance.checkout_requested', 'hr.checkout_requested')
    AND entity_type = 'attendance_record'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_checkout_request_notification
  ON public.attendance_records;
CREATE TRIGGER trg_expire_checkout_request_notification
  AFTER UPDATE OF check_out, checkout_requested_at OR DELETE
  ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_checkout_request_notification();

CREATE OR REPLACE FUNCTION private.expire_count_slip_submitted_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Submitted work item ends when approved or sent back for recount.
  IF TG_OP = 'UPDATE' AND NEW.status = 'submitted' THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'inventory.count_slip_submitted'
    AND entity_type = 'inventory_count_slip'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_count_slip_submitted_notification
  ON public.inventory_count_slips;
CREATE TRIGGER trg_expire_count_slip_submitted_notification
  AFTER UPDATE OF status OR DELETE
  ON public.inventory_count_slips
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_count_slip_submitted_notification();

CREATE OR REPLACE FUNCTION private.expire_transfer_in_transit_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status NOT IN ('received', 'cancelled', 'closed') THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'workflow.transfer_in_transit'
    AND entity_type = 'stock_transfer'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_transfer_in_transit_notification
  ON public.stock_transfers;
CREATE TRIGGER trg_expire_transfer_in_transit_notification
  AFTER UPDATE OF status OR DELETE
  ON public.stock_transfers
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_transfer_in_transit_notification();

-- ---------------------------------------------------------------------------
-- 3) Payroll period ready producer + expire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.notify_payroll_period_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'calculated' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'calculated' THEN
    RETURN NULL;
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
  VALUES (
    NEW.tenant_id,
    NULL,
    ARRAY['owner', 'accountant']::text[],
    'hr.payroll_period_ready',
    'info',
    format('Kỳ lương %s/%s sẵn duyệt', NEW.period_month, NEW.period_year),
    'Bảng lương đã tính xong. Kiểm tra và duyệt kỳ lương.',
    'payroll_period',
    NEW.id,
    format('/hr/payroll/%s', NEW.id),
    format('hr.payroll_period_ready:%s', NEW.id),
    jsonb_build_object(
      'period_id', NEW.id,
      'period_month', NEW.period_month,
      'period_year', NEW.period_year
    )
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET created_at = EXCLUDED.created_at,
      expires_at = NULL,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      meta = EXCLUDED.meta,
      action_url = EXCLUDED.action_url;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.expire_payroll_period_ready_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status NOT IN ('approved', 'paid') THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND kind = 'hr.payroll_period_ready'
    AND entity_type = 'payroll_period'
    AND entity_id = NEW.id
    AND (expires_at IS NULL OR expires_at > now());

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payroll_period_ready ON public.payroll_periods;
CREATE TRIGGER trg_notify_payroll_period_ready
  AFTER INSERT OR UPDATE OF status
  ON public.payroll_periods
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_payroll_period_ready();

DROP TRIGGER IF EXISTS trg_expire_payroll_period_ready ON public.payroll_periods;
CREATE TRIGGER trg_expire_payroll_period_ready
  AFTER UPDATE OF status
  ON public.payroll_periods
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_payroll_period_ready_notification();

REVOKE ALL ON FUNCTION private.expire_leave_request_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_checkout_request_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_count_slip_submitted_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_transfer_in_transit_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_payroll_period_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.expire_payroll_period_ready_notification() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4) list_notifications: exclude expired by default; critical-first
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_notifications(integer, timestamp with time zone, boolean);

CREATE FUNCTION public.list_notifications(
  p_limit integer DEFAULT 20,
  p_before timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_unread_only boolean DEFAULT false,
  p_include_expired boolean DEFAULT false
) RETURNS TABLE(
  id bigint,
  tenant_id bigint,
  target_branch_id bigint,
  target_roles text[],
  kind text,
  severity text,
  title text,
  body text,
  entity_type text,
  entity_id bigint,
  action_url text,
  meta jsonb,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  read_at timestamp with time zone
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    n.id, n.tenant_id, n.target_branch_id, n.target_roles,
    n.kind, n.severity, n.title, n.body,
    n.entity_type, n.entity_id, n.action_url, n.meta,
    n.created_at, n.expires_at,
    r.read_at
  FROM public.notifications n
  LEFT JOIN public.notification_reads r
    ON r.notification_id = n.id
   AND r.user_id = (SELECT auth.uid())
  WHERE (p_before IS NULL OR n.created_at < p_before)
    AND (NOT p_unread_only OR r.read_at IS NULL)
    AND (
      p_include_expired
      OR n.expires_at IS NULL
      OR n.expires_at > now()
    )
  ORDER BY
    CASE n.severity
      WHEN 'critical' THEN 0
      WHEN 'warning' THEN 1
      ELSE 2
    END,
    n.created_at DESC,
    n.id DESC
  LIMIT least(greatest(p_limit, 1), 50) + 1;
$$;

COMMENT ON FUNCTION public.list_notifications(integer, timestamp with time zone, boolean, boolean) IS
  'Keyset notification feed; defaults to active (non-expired) rows, critical-first.';

REVOKE ALL ON FUNCTION public.list_notifications(integer, timestamp with time zone, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_notifications(integer, timestamp with time zone, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_notifications(integer, timestamp with time zone, boolean, boolean) TO service_role;
