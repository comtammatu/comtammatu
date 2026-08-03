CREATE OR REPLACE FUNCTION private.canonicalize_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
      format('/br/%s/stock/count-slips', NEW.target_branch_id)
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

UPDATE public.notifications AS notification
SET kind = 'inventory.stocktake_completed',
    severity = 'info',
    title = format(
      'Kiểm kê %s đã hoàn tất',
      coalesce(session.session_number, format('#%s', session.id))
    ),
    body = 'Xem kết quả và chênh lệch kiểm kê',
    dedup_key = format('inventory.stocktake_completed:%s', session.id),
    expires_at = NULL
FROM public.stocktake_sessions AS session
WHERE notification.tenant_id = session.tenant_id
  AND notification.entity_type = 'stocktake'
  AND notification.entity_id = session.id
  AND notification.kind = 'workflow.stocktake_submitted';

CREATE OR REPLACE FUNCTION public.trg_notify_grn_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
  v_target_roles text[];
BEGIN
  IF NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id
    AND branch.tenant_id = NEW.tenant_id;

  v_target_roles := CASE v_branch_kind
    WHEN 'central_supply'
      THEN ARRAY['owner', 'central_supply_ops']::text[]
    WHEN 'central_kitchen'
      THEN ARRAY['owner', 'central_kitchen_lead']::text[]
    ELSE ARRAY['owner', 'branch_manager']::text[]
  END;

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
    NEW.branch_id,
    v_target_roles,
    'workflow.grn_pending',
    'info',
    format('Phiếu nhập %s đang chờ chốt', NEW.grn_number),
    'Kiểm tra số lượng, hàng từ chối và ảnh bằng chứng rồi chốt nhập kho',
    'grn',
    NEW.id,
    CASE
      WHEN v_branch_kind = 'branch'
        THEN format('/br/%s/stock/transfer', NEW.branch_id)
      ELSE format('/inventory/grn/%s', NEW.id)
    END,
    format('workflow.grn_pending:%s', NEW.id),
    jsonb_build_object('grn_number', NEW.grn_number, 'po_id', NEW.po_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET target_branch_id = EXCLUDED.target_branch_id,
      target_roles = EXCLUDED.target_roles,
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      action_url = EXCLUDED.action_url,
      meta = EXCLUDED.meta,
      expires_at = NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_grn_created()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_notify_grn_created() TO service_role;

DROP FUNCTION public.scan_inventory_alerts();

CREATE FUNCTION public.scan_inventory_alerts()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_low bigint := 0;
BEGIN
  WITH stock_by_site AS (
    SELECT
      stock.tenant_id,
      stock.branch_id,
      stock.ingredient_id,
      sum(stock.current_quantity) AS current_quantity
    FROM public.stock_levels AS stock
    JOIN public.inventory_locations AS location
      ON location.id = stock.location_id
     AND location.tenant_id = stock.tenant_id
     AND location.branch_id = stock.branch_id
     AND location.is_active IS TRUE
    JOIN public.branches AS branch
      ON branch.id = stock.branch_id
     AND branch.tenant_id = stock.tenant_id
     AND branch.is_active IS TRUE
    WHERE location.location_kind = 'warehouse'
       OR (
         branch.branch_kind = 'central_kitchen'
         AND location.location_kind = 'production_storage'
       )
    GROUP BY stock.tenant_id, stock.branch_id, stock.ingredient_id
  ),
  low_stock AS (
    SELECT
      stock.tenant_id,
      stock.branch_id,
      stock.ingredient_id,
      stock.current_quantity,
      ingredient.min_stock_level,
      ingredient.name AS ingredient_name,
      branch.branch_kind,
      unit_row.code AS display_unit_code,
      stock.current_quantity / coalesce(nullif(issue_unit.to_base_factor, 0), 1)
        AS display_quantity,
      ingredient.min_stock_level
        / coalesce(nullif(issue_unit.to_base_factor, 0), 1)
        AS display_min_stock_level
    FROM stock_by_site AS stock
    JOIN public.ingredients AS ingredient
      ON ingredient.id = stock.ingredient_id
     AND ingredient.tenant_id = stock.tenant_id
     AND ingredient.is_active IS TRUE
    JOIN public.branches AS branch
      ON branch.id = stock.branch_id
     AND branch.tenant_id = stock.tenant_id
    LEFT JOIN public.ingredient_units AS issue_unit
      ON issue_unit.tenant_id = ingredient.tenant_id
     AND issue_unit.ingredient_id = ingredient.id
     AND issue_unit.unit_id = ingredient.issue_unit_id
     AND issue_unit.is_active IS TRUE
    LEFT JOIN public.units AS unit_row
      ON unit_row.id = issue_unit.unit_id
     AND unit_row.tenant_id = ingredient.tenant_id
    WHERE ingredient.min_stock_level > 0
      AND stock.current_quantity <= ingredient.min_stock_level
  ),
  reactivated AS (
    UPDATE public.notifications AS notification
    SET expires_at = NULL,
        created_at = now()
    FROM low_stock
    WHERE notification.tenant_id = low_stock.tenant_id
      AND notification.dedup_key = format(
        'inventory.stock_low:%s:%s',
        low_stock.branch_id,
        low_stock.ingredient_id
      )
      AND notification.expires_at IS NOT NULL
    RETURNING notification.id
  ),
  cleared_reads AS (
    DELETE FROM public.notification_reads AS read_state
    USING reactivated
    WHERE read_state.notification_id = reactivated.id
    RETURNING 1
  ),
  upserted AS (
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
      meta,
      expires_at
    )
    SELECT
      low_stock.tenant_id,
      low_stock.branch_id,
      CASE low_stock.branch_kind
        WHEN 'central_supply'
          THEN ARRAY['owner', 'central_supply_ops']::text[]
        WHEN 'central_kitchen'
          THEN ARRAY['owner', 'central_kitchen_lead']::text[]
        ELSE ARRAY['owner', 'branch_manager']::text[]
      END,
      'inventory.stock_low',
      'warning',
      format('Tồn kho thấp: %s', low_stock.ingredient_name),
      format(
        'Còn %s%s (mức tối thiểu %s%s)',
        trim(
          trailing '.' from trim(
            trailing '0' from to_char(
              low_stock.display_quantity,
              'FM999999999999999990.999999999999'
            )
          )
        ),
        CASE
          WHEN low_stock.display_unit_code IS NULL THEN ''
          ELSE format(' %s', low_stock.display_unit_code)
        END,
        trim(
          trailing '.' from trim(
            trailing '0' from to_char(
              low_stock.display_min_stock_level,
              'FM999999999999999990.999999999999'
            )
          )
        ),
        CASE
          WHEN low_stock.display_unit_code IS NULL THEN ''
          ELSE format(' %s', low_stock.display_unit_code)
        END
      ),
      'ingredient',
      low_stock.ingredient_id,
      CASE
        WHEN low_stock.branch_kind = 'branch'
          THEN format(
            '/br/%s/stock/on-hand/%s',
            low_stock.branch_id,
            low_stock.ingredient_id
          )
        ELSE format(
          '/inventory/stock/%s?branchId=%s',
          low_stock.ingredient_id,
          low_stock.branch_id
        )
      END,
      format(
        'inventory.stock_low:%s:%s',
        low_stock.branch_id,
        low_stock.ingredient_id
      ),
      jsonb_build_object(
        'branch_id', low_stock.branch_id,
        'current_quantity_base', low_stock.current_quantity,
        'min_stock_level_base', low_stock.min_stock_level,
        'display_quantity', low_stock.display_quantity,
        'display_min_stock_level', low_stock.display_min_stock_level,
        'display_unit_code', low_stock.display_unit_code
      ),
      NULL
    FROM low_stock
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO UPDATE
    SET target_branch_id = EXCLUDED.target_branch_id,
        target_roles = EXCLUDED.target_roles,
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        entity_type = EXCLUDED.entity_type,
        entity_id = EXCLUDED.entity_id,
        action_url = EXCLUDED.action_url,
        meta = EXCLUDED.meta,
        expires_at = NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM low_stock;

  WITH stock_by_site AS (
    SELECT
      stock.tenant_id,
      stock.branch_id,
      stock.ingredient_id,
      sum(stock.current_quantity) AS current_quantity
    FROM public.stock_levels AS stock
    JOIN public.inventory_locations AS location
      ON location.id = stock.location_id
     AND location.tenant_id = stock.tenant_id
     AND location.branch_id = stock.branch_id
     AND location.is_active IS TRUE
    JOIN public.branches AS branch
      ON branch.id = stock.branch_id
     AND branch.tenant_id = stock.tenant_id
     AND branch.is_active IS TRUE
    WHERE location.location_kind = 'warehouse'
       OR (
         branch.branch_kind = 'central_kitchen'
         AND location.location_kind = 'production_storage'
       )
    GROUP BY stock.tenant_id, stock.branch_id, stock.ingredient_id
  )
  UPDATE public.notifications AS notification
  SET expires_at = now()
  WHERE notification.kind = 'inventory.stock_low'
    AND notification.expires_at IS NULL
    AND notification.dedup_key LIKE 'inventory.stock_low:%'
    AND NOT EXISTS (
      SELECT 1
      FROM stock_by_site AS stock
      JOIN public.ingredients AS ingredient
        ON ingredient.id = stock.ingredient_id
       AND ingredient.tenant_id = stock.tenant_id
       AND ingredient.is_active IS TRUE
      WHERE stock.tenant_id = notification.tenant_id
        AND stock.branch_id = notification.target_branch_id
        AND stock.ingredient_id = notification.entity_id
        AND ingredient.min_stock_level > 0
        AND stock.current_quantity <= ingredient.min_stock_level
    );

  UPDATE public.notifications
  SET expires_at = coalesce(expires_at, now())
  WHERE kind = 'inventory.stock_low'
    AND dedup_key IS DISTINCT FROM format(
      'inventory.stock_low:%s:%s',
      target_branch_id,
      entity_id
    );

  RETURN v_low;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_inventory_alerts()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_inventory_alerts() TO service_role;

CREATE OR REPLACE FUNCTION private.notify_stocktake_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_session public.stocktake_sessions%ROWTYPE;
  v_branch_kind text;
  v_ingredient_name text;
BEGIN
  SELECT session.*
  INTO v_session
  FROM public.stocktake_sessions AS session
  WHERE session.id = NEW.session_id
    AND session.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = v_session.branch_id
    AND branch.tenant_id = v_session.tenant_id;

  SELECT ingredient.name
  INTO v_ingredient_name
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = NEW.ingredient_id
    AND ingredient.tenant_id = NEW.tenant_id;

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
    v_session.branch_id,
    CASE v_branch_kind
      WHEN 'central_supply'
        THEN ARRAY['owner', 'central_supply_ops']::text[]
      WHEN 'central_kitchen'
        THEN ARRAY['owner', 'central_kitchen_lead']::text[]
      ELSE ARRAY['owner', 'branch_manager']::text[]
    END,
    'inventory.stocktake_conflict',
    'warning',
    format(
      'Kiểm kê %s có xung đột',
      coalesce(v_session.session_number, format('#%s', v_session.id))
    ),
    format(
      'Kiểm tra vòng %s của %s trước khi tiếp tục',
      NEW.round_no,
      coalesce(v_ingredient_name, format('#%s', NEW.ingredient_id))
    ),
    'stocktake',
    v_session.id,
    CASE
      WHEN v_branch_kind = 'branch'
        THEN format(
          '/br/%s/stock/stocktake/%s',
          v_session.branch_id,
          v_session.id
        )
      ELSE format(
        '/inventory/stocktake/%s?branchId=%s',
        v_session.id,
        v_session.branch_id
      )
    END,
    format('stocktake.conflict:%s:%s', v_session.id, NEW.id),
    jsonb_build_object(
      'branch_id', v_session.branch_id,
      'conflict_id', NEW.id,
      'ingredient_id', NEW.ingredient_id,
      'round_no', NEW.round_no,
      'conflict_type', NEW.conflict_type
    )
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_stocktake_conflict()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS notify_stocktake_conflict_after_insert
ON public.stocktake_conflicts;
CREATE TRIGGER notify_stocktake_conflict_after_insert
AFTER INSERT ON public.stocktake_conflicts
FOR EACH ROW
EXECUTE FUNCTION private.notify_stocktake_conflict();

CREATE OR REPLACE FUNCTION public.trg_notify_stocktake_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_kind text;
BEGIN
  IF NEW.status <> 'completed'
     OR OLD.status IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind
  INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id
    AND branch.tenant_id = NEW.tenant_id;

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
    NEW.branch_id,
    CASE v_branch_kind
      WHEN 'central_supply'
        THEN ARRAY['owner', 'central_supply_ops']::text[]
      WHEN 'central_kitchen'
        THEN ARRAY['owner', 'central_kitchen_lead']::text[]
      ELSE ARRAY['owner', 'branch_manager']::text[]
    END,
    'inventory.stocktake_completed',
    'info',
    format(
      'Kiểm kê %s đã hoàn tất',
      coalesce(NEW.session_number, format('#%s', NEW.id))
    ),
    'Xem kết quả và chênh lệch kiểm kê',
    'stocktake',
    NEW.id,
    CASE
      WHEN v_branch_kind = 'branch'
        THEN format('/br/%s/stock/stocktake/%s', NEW.branch_id, NEW.id)
      ELSE format('/inventory/stocktake/%s?branchId=%s', NEW.id, NEW.branch_id)
    END,
    format('inventory.stocktake_completed:%s', NEW.id),
    jsonb_build_object('branch_id', NEW.branch_id)
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET target_branch_id = EXCLUDED.target_branch_id,
      target_roles = EXCLUDED.target_roles,
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      action_url = EXCLUDED.action_url,
      meta = EXCLUDED.meta,
      expires_at = NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_stocktake_completed()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_notify_stocktake_completed() TO service_role;

CREATE OR REPLACE FUNCTION public.weekly_waste_report()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_week_end date := date_trunc(
    'week',
    now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::date;
  v_week_start date := v_week_end - 7;
  v_count integer := 0;
BEGIN
  WITH report AS (
    SELECT
      issue.tenant_id,
      issue.branch_id,
      branch.branch_kind,
      count(*) AS waste_count,
      count(*) FILTER (
        WHERE issue.approval_status = 'pending'
      ) AS pending_count,
      count(*) FILTER (
        WHERE issue.approval_status = 'approved'
      ) AS approved_count,
      count(*) FILTER (
        WHERE issue.approval_status = 'rejected'
      ) AS rejected_count
    FROM public.stock_issues AS issue
    JOIN public.branches AS branch
      ON branch.id = issue.branch_id
     AND branch.tenant_id = issue.tenant_id
    WHERE issue.issue_type = 'writeoff'
      AND issue.issued_at >= v_week_start AT TIME ZONE 'Asia/Ho_Chi_Minh'
      AND issue.issued_at < v_week_end AT TIME ZONE 'Asia/Ho_Chi_Minh'
    GROUP BY issue.tenant_id, issue.branch_id, branch.branch_kind
  ),
  upserted AS (
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
      dedup_key,
      expires_at
    )
    SELECT
      report.tenant_id,
      report.branch_id,
      CASE report.branch_kind
        WHEN 'central_supply'
          THEN ARRAY['owner', 'accountant', 'central_supply_ops']::text[]
        WHEN 'central_kitchen'
          THEN ARRAY['owner', 'accountant', 'central_kitchen_lead']::text[]
        ELSE ARRAY['owner', 'accountant', 'branch_manager']::text[]
      END,
      'inventory.waste.weekly_report',
      CASE WHEN report.pending_count >= 5 THEN 'warning' ELSE 'info' END,
      format(
        'Tổng hợp hao hụt %s–%s',
        to_char(v_week_start, 'DD/MM'),
        to_char(v_week_end - 1, 'DD/MM/YYYY')
      ),
      format(
        '%s phiếu; chờ duyệt %s, đã duyệt %s, đã từ chối %s.',
        report.waste_count,
        report.pending_count,
        report.approved_count,
        report.rejected_count
      ),
      'branch',
      report.branch_id,
      CASE
        WHEN report.branch_kind = 'branch'
          THEN format('/br/%s/stock/waste-approvals', report.branch_id)
        ELSE format(
          '/inventory/waste/approvals?branchId=%s',
          report.branch_id
        )
      END,
      jsonb_build_object(
        'week_start', v_week_start,
        'week_end', v_week_end - 1,
        'waste_count', report.waste_count,
        'pending_count', report.pending_count,
        'approved_count', report.approved_count,
        'rejected_count', report.rejected_count
      ),
      format(
        'inventory.waste.weekly_report:%s:%s',
        report.branch_id,
        to_char(v_week_start, 'IYYY-IW')
      ),
      now() + interval '14 days'
    FROM report
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO UPDATE
    SET target_branch_id = EXCLUDED.target_branch_id,
        target_roles = EXCLUDED.target_roles,
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        action_url = EXCLUDED.action_url,
        meta = EXCLUDED.meta,
        expires_at = EXCLUDED.expires_at
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upserted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_waste_report()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_waste_report() TO service_role;

REVOKE ALL ON FUNCTION public.create_expiry_writeoff(
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_expiry_writeoff(
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  text,
  text[]
) TO service_role;
