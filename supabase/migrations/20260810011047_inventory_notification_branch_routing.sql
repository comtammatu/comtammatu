-- INV-4 / INV-5: route branch-targeted inventory notifications to reachable
-- branch surfaces, and point valuation-drift alerts at /finance/food-cost
-- (the repository deliberately has no /finance/cost-close page).

CREATE OR REPLACE FUNCTION public.run_inventory_valuation_reconciliation() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_tenant bigint := public.auth_tenant_id();
  v_tenant record;
  v_quantity_mismatches integer;
  v_value_mismatches integer;
  v_result jsonb := '[]'::jsonb;
  v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_year integer := extract(
    YEAR FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
  v_month integer := extract(
    MONTH FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
BEGIN
  IF v_actor IS NOT NULL
     AND (
       v_actor_tenant IS NULL
       OR NOT public.has_permission_any('inventory:valuation_read')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_tenant IN
    SELECT cutover.tenant_id, cutover.status
    FROM public.inventory_valuation_cutovers AS cutover
    WHERE cutover.status IN ('shadow', 'active')
      AND (
        v_actor IS NULL
        OR cutover.tenant_id = v_actor_tenant
      )
    ORDER BY cutover.tenant_id
  LOOP
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE account.quantity IS DISTINCT FROM stock.current_quantity
      ),
      pg_catalog.count(*) FILTER (
        WHERE account.book_value IS DISTINCT FROM origin_totals.book_value
           OR account.quantity IS DISTINCT FROM origin_totals.quantity
      )
    INTO v_quantity_mismatches, v_value_mismatches
    FROM public.inventory_valuation_accounts AS account
    FULL JOIN public.stock_levels AS stock
      ON stock.tenant_id = account.tenant_id
     AND stock.branch_id = account.branch_id
     AND stock.location_id = account.location_id
     AND stock.ingredient_id = account.ingredient_id
    LEFT JOIN LATERAL (
      SELECT
        coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity,
        coalesce(pg_catalog.sum(balance.book_value), 0) AS book_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = account.tenant_id
        AND balance.valuation_account_id = account.id
        AND balance.holder_kind = 'stock_pool'
    ) AS origin_totals ON TRUE
    WHERE coalesce(account.tenant_id, stock.tenant_id) = v_tenant.tenant_id;

    IF v_quantity_mismatches = 0 AND v_value_mismatches = 0 THEN
      UPDATE public.notifications
      SET expires_at = now()
      WHERE tenant_id = v_tenant.tenant_id
        AND kind = 'inventory.valuation_reconciliation_failed'
        AND (expires_at IS NULL OR expires_at > now())
        AND dedup_key LIKE ('inventory.valuation_reconciliation_failed:' || v_today::text || ':%');
    END IF;

    IF v_quantity_mismatches > 0 THEN
      INSERT INTO public.notifications (
        tenant_id,
        target_roles,
        kind,
        severity,
        title,
        body,
        action_url,
        dedup_key,
        meta
      )
      VALUES (
        v_tenant.tenant_id,
        ARRAY['owner', 'accountant']::text[],
        'inventory.valuation_reconciliation_failed',
        'critical',
        'Số lượng tồn kho và sổ giá trị đang lệch',
        'Hệ thống đã dừng khóa kỳ; cần đối soát movement và valuation account.',
        '/finance/food-cost?year=' || v_year::text || '&month=' || v_month::text,
        'inventory.valuation_reconciliation_failed:'
          || v_today::text || ':quantity',
        pg_catalog.jsonb_build_object(
          'drift_type', 'quantity',
          'mismatch_count', v_quantity_mismatches,
          'source', 'scheduled_job'
        )
      )
      ON CONFLICT (tenant_id, dedup_key)
        WHERE dedup_key IS NOT NULL
      DO UPDATE SET
        body = EXCLUDED.body,
        meta = EXCLUDED.meta,
        created_at = pg_catalog.now(),
        expires_at = NULL;
    END IF;

    IF v_value_mismatches > 0 THEN
      INSERT INTO public.notifications (
        tenant_id,
        target_roles,
        kind,
        severity,
        title,
        body,
        action_url,
        dedup_key,
        meta
      )
      VALUES (
        v_tenant.tenant_id,
        ARRAY['owner', 'accountant']::text[],
        'inventory.valuation_reconciliation_failed',
        'critical',
        'Giá trị tồn kho và cost origin đang lệch',
        'Hệ thống đã dừng khóa kỳ; cần đối soát valuation account và origin balance.',
        '/finance/food-cost?year=' || v_year::text || '&month=' || v_month::text,
        'inventory.valuation_reconciliation_failed:'
          || v_today::text || ':value',
        pg_catalog.jsonb_build_object(
          'drift_type', 'value',
          'mismatch_count', v_value_mismatches,
          'source', 'scheduled_job'
        )
      )
      ON CONFLICT (tenant_id, dedup_key)
        WHERE dedup_key IS NOT NULL
      DO UPDATE SET
        body = EXCLUDED.body,
        meta = EXCLUDED.meta,
        created_at = pg_catalog.now(),
        expires_at = NULL;
    END IF;

    v_result := v_result || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant.tenant_id,
        'status', v_tenant.status,
        'quantity_mismatches', v_quantity_mismatches,
        'value_mismatches', v_value_mismatches,
        'is_reconciled',
          v_quantity_mismatches = 0 AND v_value_mismatches = 0
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;

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
    ELSE NEW.action_url
  END;

  RETURN NEW;
END;
$$;


-- Backfill active rows so already-delivered alerts stop pointing at dead or
-- ACL-denied destinations.
UPDATE public.notifications AS n
SET action_url = format('/br/%s/stock?work=receive', n.target_branch_id)
FROM public.branches AS b
WHERE n.kind = 'inventory.stock_request_rejected'
  AND n.target_branch_id IS NOT NULL
  AND b.id = n.target_branch_id
  AND b.tenant_id = n.tenant_id
  AND b.branch_kind = 'branch'
  AND (n.expires_at IS NULL OR n.expires_at > now())
  AND n.action_url LIKE '/inventory/%';

UPDATE public.notifications AS n
SET action_url = format('/br/%s/stock/waste-approvals', n.target_branch_id)
FROM public.branches AS b
WHERE n.kind = 'inventory.waste_pending_approval'
  AND n.target_branch_id IS NOT NULL
  AND b.id = n.target_branch_id
  AND b.tenant_id = n.tenant_id
  AND b.branch_kind = 'branch'
  AND (n.expires_at IS NULL OR n.expires_at > now())
  AND n.action_url LIKE '/inventory/%';

UPDATE public.notifications
SET action_url = replace(action_url, '/finance/cost-close?', '/finance/food-cost?')
WHERE kind = 'inventory.valuation_reconciliation_failed'
  AND action_url LIKE '/finance/cost-close?%'
  AND (expires_at IS NULL OR expires_at > now());
