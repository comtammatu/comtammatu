-- Notification handoff matrix harden:
-- YCM pending_allocation producer, notification_reads realtime,
-- inventory/finance/orders/hr producer fixes, expire gates, dead-kind cleanup.

ALTER TABLE public.notification_reads REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
  END IF;
END$$;


CREATE OR REPLACE FUNCTION private.notify_purchase_request_submitted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.status <> 'pending_allocation'
     OR (
       TG_OP = 'UPDATE'
       AND OLD.status IS NOT DISTINCT FROM 'pending_allocation'
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


CREATE OR REPLACE FUNCTION private.expire_purchase_request_submitted_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'pending_allocation' THEN
    RETURN NULL;
  END IF;
  UPDATE public.notifications SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'procurement.purchase_request_submitted'
    AND entity_type = 'purchase_request'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_expire_purchase_request_submitted_notification ON public.purchase_requests;
CREATE TRIGGER trg_expire_purchase_request_submitted_notification
  AFTER UPDATE OF status OR DELETE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION private.expire_purchase_request_submitted_notification();

CREATE OR REPLACE FUNCTION private.expire_po_pending_approval_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'pending_approval' THEN
    RETURN NULL;
  END IF;
  UPDATE public.notifications SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'procurement.po_pending_approval'
    AND entity_type = 'purchase_order'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_expire_po_pending_approval_notification ON public.purchase_orders;
CREATE TRIGGER trg_expire_po_pending_approval_notification
  AFTER UPDATE OF status OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.expire_po_pending_approval_notification();


CREATE OR REPLACE FUNCTION public.trg_notify_transfer_in_transit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('in_transit', 'confirmed_ship')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta, dedup_key
    )
    VALUES (
      NEW.tenant_id,
      NEW.to_branch_id,
      ARRAY['branch_manager', 'owner']::TEXT[],
      'workflow.transfer_in_transit',
      'info',
      format('Chuyển kho %s đang về', NEW.transfer_number),
      'Chuẩn bị nhận hàng từ chi nhánh đối ứng',
      'stock_transfer',
      NEW.id,
      format('/br/%s/stock/receive/%s', NEW.to_branch_id, NEW.id),
      jsonb_build_object(
        'transfer_number', NEW.transfer_number,
        'from_branch_id', NEW.from_branch_id,
        'status', NEW.status
      ),
      format('workflow.transfer_in_transit:%s', NEW.id)
    )
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      action_url = EXCLUDED.action_url,
      meta = EXCLUDED.meta,
      created_at = now(),
      expires_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_stock_request_lines(p_request_id bigint, p_fulfill_site_kind text, p_item_ids bigint[], p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_actor_kind text;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF p_fulfill_site_kind NOT IN ('central_supply', 'central_kitchen')
     OR p_item_ids IS NULL
     OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'stock_request_reject_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission_any('inventory:request_fulfill') THEN
    RAISE EXCEPTION 'forbidden_request_fulfill' USING ERRCODE = '42501';
  END IF;

  v_actor_kind := CASE public.auth_role()
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
    ELSE p_fulfill_site_kind
  END;

  IF v_actor_kind IS DISTINCT FROM p_fulfill_site_kind THEN
    RAISE EXCEPTION 'forbidden_request_fulfill_scope'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.stock_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
    AND request.status = 'submitted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_request_not_fulfillable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.stock_request_items
  SET status = 'rejected',
      notes = concat_ws(E'\n', NULLIF(notes, ''), btrim(p_reason)),
      updated_at = now()
  WHERE request_id = p_request_id
    AND tenant_id = v_tenant
    AND id = ANY (p_item_ids)
    AND fulfill_site_kind = p_fulfill_site_kind
    AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'stock_request_lines_not_pending'
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.log_audit(
    'inventory.request.lines_rejected',
    'stock_request',
    p_request_id,
    NULL,
    jsonb_build_object(
      'item_ids', p_item_ids,
      'fulfill_site_kind', p_fulfill_site_kind,
      'reason', btrim(p_reason)
    )
  );

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  )
  SELECT
    request.tenant_id,
    request.branch_id,
    ARRAY['branch_manager', 'owner']::text[],
    'inventory.stock_request_rejected',
    'warning',
    format('Yêu cầu hàng %s bị từ chối một phần', request.request_number),
    format('%s dòng đã bị từ chối (%s): %s', v_count, p_fulfill_site_kind, btrim(p_reason)),
    'stock_request',
    request.id,
    format('/inventory/transfers?requestId=%s', request.id),
    format('inventory.stock_request_rejected:%s:%s:%s', request.id, p_fulfill_site_kind, to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')),
    jsonb_build_object(
      'item_ids', p_item_ids,
      'fulfill_site_kind', p_fulfill_site_kind,
      'reason', btrim(p_reason),
      'rejected_count', v_count
    )
  FROM public.stock_requests AS request
  WHERE request.id = p_request_id AND request.tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'rejected_count', v_count
  );
END;
$$;


CREATE OR REPLACE FUNCTION private.notify_waste_pending_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_roles text[];
  v_branch_kind text;
BEGIN
  IF NEW.issue_type <> 'writeoff' OR NEW.approval_status <> 'pending' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS NOT DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT branch.branch_kind INTO v_branch_kind
  FROM public.branches AS branch
  WHERE branch.id = NEW.branch_id AND branch.tenant_id = NEW.tenant_id;

  v_roles := CASE v_branch_kind
    WHEN 'central_supply' THEN ARRAY['owner', 'accountant', 'central_supply_ops']::text[]
    WHEN 'central_kitchen' THEN ARRAY['owner', 'accountant', 'central_kitchen_lead']::text[]
    ELSE ARRAY['owner', 'accountant', 'branch_manager']::text[]
  END;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  ) VALUES (
    NEW.tenant_id, NEW.branch_id, v_roles,
    'inventory.waste_pending_approval', 'warning',
    format('Hao hụt %s chờ duyệt', NEW.issue_number),
    'Phiếu hao hụt cần duyệt trước khi trừ kho.',
    'stock_issue', NEW.id,
    format('/inventory/waste/approvals?issueId=%s', NEW.id),
    format('inventory.waste_pending_approval:%s', NEW.id),
    jsonb_build_object('issue_number', NEW.issue_number, 'branch_id', NEW.branch_id, 'source', 'rpc')
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta, created_at = now(), expires_at = NULL;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_waste_pending_approval ON public.stock_issues;
CREATE TRIGGER trg_notify_waste_pending_approval
  AFTER INSERT OR UPDATE OF approval_status ON public.stock_issues
  FOR EACH ROW EXECUTE FUNCTION private.notify_waste_pending_approval();

CREATE OR REPLACE FUNCTION private.expire_waste_pending_approval_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.approval_status = 'pending' THEN RETURN NULL; END IF;
  UPDATE public.notifications SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'inventory.waste_pending_approval'
    AND entity_type = 'stock_issue'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_expire_waste_pending_approval_notification ON public.stock_issues;
CREATE TRIGGER trg_expire_waste_pending_approval_notification
  AFTER UPDATE OF approval_status OR DELETE ON public.stock_issues
  FOR EACH ROW EXECUTE FUNCTION private.expire_waste_pending_approval_notification();


CREATE OR REPLACE FUNCTION private.notify_supplier_invoice_valuation_variance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_warning boolean;
  v_delta numeric(20,2);
  v_provisional numeric(20,2);
BEGIN
  IF NEW.document_status <> 'confirmed'
     OR OLD.document_status = 'confirmed'
     OR NEW.invoice_kind = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(pg_catalog.bool_or(
      pg_catalog.abs(event.value_delta) >= settings.variance_warning_amount
      OR (
        allocation.confirmed_net_inventory_amount - event.value_delta > 0
        AND pg_catalog.abs(event.value_delta) * 100
          / (
            allocation.confirmed_net_inventory_amount - event.value_delta
          ) >= settings.variance_warning_percent
      )
    ), FALSE),
    coalesce(pg_catalog.sum(event.value_delta), 0),
    coalesce(pg_catalog.sum(
      allocation.confirmed_net_inventory_amount - event.value_delta
    ), 0)
  INTO v_warning, v_delta, v_provisional
  FROM public.inventory_valuation_events AS event
  JOIN public.supplier_invoice_receipt_allocations AS allocation
    ON allocation.valuation_event_id = event.id
   AND allocation.tenant_id = event.tenant_id
  JOIN public.inventory_valuation_settings AS settings
    ON settings.tenant_id = event.tenant_id
  WHERE event.tenant_id = NEW.tenant_id
    AND event.source_invoice_id = NEW.id;

  IF NOT v_warning THEN
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
  VALUES (
    NEW.tenant_id,
    NULL,
    ARRAY['owner', 'accountant']::text[],
    'inventory.valuation_variance',
    'warning',
    'Chênh lệch giá mua cần hậu kiểm',
    pg_catalog.format(
      'Hóa đơn NCC đã xác nhận; chênh lệch quyết toán tồn kho là %sđ.',
      pg_catalog.to_char(v_delta, 'FM999G999G999G999G990D00')
    ),
    'supplier_invoice',
    NEW.id,
    '/finance/supplier-invoices?invoiceId=' || NEW.id::text,
    'inventory.valuation_variance:' || NEW.id::text,
    pg_catalog.jsonb_build_object(
      'provisional_value', v_provisional,
      'variance_amount', v_delta,
      'currency', 'VND',
      'source', 'rpc'
    )
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = pg_catalog.now(),
    expires_at = NULL;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION private.expire_valuation_variance_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.document_status = 'confirmed' THEN RETURN NULL; END IF;
  UPDATE public.notifications SET expires_at = now()
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND kind = 'inventory.valuation_variance'
    AND entity_type = 'supplier_invoice'
    AND entity_id = COALESCE(NEW.id, OLD.id)
    AND (expires_at IS NULL OR expires_at > now());
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_expire_valuation_variance_notification ON public.supplier_invoices;
CREATE TRIGGER trg_expire_valuation_variance_notification
  AFTER UPDATE OF document_status OR DELETE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION private.expire_valuation_variance_notification();


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
        '/finance/cost-close?year=' || v_year::text || '&month=' || v_month::text,
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
        '/finance/cost-close?year=' || v_year::text || '&month=' || v_month::text,
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

CREATE OR REPLACE FUNCTION private.execute_approve_inventory_count_slip(p_slip_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_line            RECORD;
  v_fresh           NUMERIC(15,3);
  v_counted_base    NUMERIC(15,3);
  v_delta           NUMERIC(15,3);
  v_adjusted        INT := 0;
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_slip.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'already_approved', true);
  END IF;

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN
    SELECT * FROM public.inventory_count_slip_lines
    WHERE slip_id = p_slip_id AND tenant_id = v_tenant
  LOOP
    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh
    FROM public.stock_levels stl
    WHERE stl.tenant_id = v_tenant AND stl.branch_id = v_slip.branch_id
      AND stl.location_id = v_slip.location_id AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh := 0;
    END IF;

    v_counted_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_line.counted_quantity);
    v_delta := v_counted_base - v_fresh;

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, location_id, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant, v_slip.branch_id, v_line.ingredient_id, 'count_adjustment', v_delta,
        'Count slip #' || p_slip_id::text, v_uid, v_slip.location_id,
        v_line.entry_unit_id, v_line.counted_quantity
      );
      v_adjusted := v_adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.inventory_count_slips
  SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'approve'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved', 'adjusted_lines', v_adjusted)
  );

  SELECT private.staff_role_from_position_code(po.code)
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  IF v_employee_bucket IS NULL THEN
    RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'adjusted_lines', v_adjusted);
  END IF;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[v_employee_bucket]::text[],
    'inventory.count_slip_approved',
    'info',
    'Phiếu đếm tồn đã được duyệt',
    'Phiếu đếm tồn của bạn đã được duyệt và điều chỉnh kho.',
    'inventory_count_slip',
    p_slip_id,
    format('/br/%s/stock/count', v_slip.branch_id),
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'approved', 'adjusted_lines', v_adjusted
    ),
    format('inventory.count_slip:%s:approved', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;

  RETURN jsonb_build_object('success', true, 'slip_id', p_slip_id, 'adjusted_lines', v_adjusted);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_inventory_count_recount(p_slip_id bigint, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant          BIGINT := public.auth_tenant_id();
  v_uid             UUID   := auth.uid();
  v_slip            public.inventory_count_slips%ROWTYPE;
  v_note            TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_employee_bucket TEXT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = 'string_data_right_truncation';
  END IF;

  SELECT * INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = v_slip.employee_id AND e.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'needs_changes', review_note = v_note, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
  WHERE id = p_slip_id;

  PERFORM public.log_audit(
    'request_recount'::TEXT,
    'inventory_count_slip'::TEXT,
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'needs_changes')
  );

  SELECT private.staff_role_from_position_code(po.code)
    INTO v_employee_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
   WHERE e.id = v_slip.employee_id AND e.tenant_id = v_tenant;

  IF v_employee_bucket IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY[v_employee_bucket]::text[],
    'inventory.count_slip_recount',
    'warning',
    'Phiếu đếm tồn cần đếm lại',
    COALESCE(format('Quản lý yêu cầu đếm lại: %s', v_note), 'Quản lý yêu cầu đếm lại phiếu đếm tồn của bạn.'),
    'inventory_count_slip',
    p_slip_id,
    format('/br/%s/stock/count', v_slip.branch_id),
    jsonb_build_object(
      'slip_id', p_slip_id, 'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id, 'result', 'needs_changes'
    ),
    format('inventory.count_slip:%s:recount', p_slip_id)
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = NULL, meta = EXCLUDED.meta;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_pos_void_request(
  p_request_id bigint,
  p_decision text,
  p_resolution_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_req record;
  v_can_resolve boolean := false;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL OR p_decision IS NULL
     OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_req
  FROM public.pos_void_requests
  WHERE id = p_request_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'void_request_not_pending' USING ERRCODE = 'P0001';
  END IF;

  v_can_resolve :=
    public.auth_is_owner(v_actor)
    OR public.has_permission(v_req.branch_id, 'settings:branch')
    OR private.is_shift_leader_for_branch(v_req.branch_id, v_actor, now());

  IF NOT v_can_resolve THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.pos_void_requests
    SET
      status = 'rejected',
      resolved_by = v_actor,
      resolved_at = now(),
      resolution_note = NULLIF(trim(COALESCE(p_resolution_note, '')), ''),
      updated_at = now()
    WHERE id = v_req.id;


  UPDATE public.notifications SET expires_at = now()
  WHERE tenant_id = v_tenant
    AND kind = 'pos.void_requested'
    AND entity_type = 'pos_void_request'
    AND entity_id = v_req.id
    AND (expires_at IS NULL OR expires_at > now());

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  )
  SELECT
    v_tenant,
    v_req.branch_id,
    ARRAY[COALESCE(private.staff_role_from_position_code(pos.code), 'cashier')]::text[],
    CASE WHEN p_decision = 'approved' THEN 'pos.void_resolved' ELSE 'pos.void_rejected' END,
    'info',
    CASE WHEN p_decision = 'approved'
      THEN 'Yêu cầu hủy đơn đã được duyệt'
      ELSE 'Yêu cầu hủy đơn bị từ chối' END,
    CASE WHEN p_decision = 'approved'
      THEN format('Đơn #%s đã được hủy hoàn tiền.', v_req.order_id)
      ELSE format('Đơn #%s vẫn giữ nguyên; yêu cầu hủy không được duyệt.', v_req.order_id) END,
    'pos_void_request',
    v_req.id,
    format('/br/%s/pos?orderId=%s', v_req.branch_id, v_req.order_id),
    format('pos.void_resolved:%s:%s', v_req.id, p_decision),
    jsonb_build_object('request_id', v_req.id, 'order_id', v_req.order_id, 'decision', p_decision)
  FROM public.profiles AS profile
  LEFT JOIN public.positions AS pos
    ON pos.id = profile.position_id AND pos.tenant_id = profile.tenant_id
  WHERE profile.id = v_req.requested_by
    AND profile.tenant_id = v_tenant
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta, created_at = now(), expires_at = NULL;

    RETURN jsonb_build_object(
      'request_id', v_req.id,
      'status', 'rejected',
      'order_id', v_req.order_id
    );
  END IF;

  UPDATE public.pos_void_requests
  SET
    status = 'approved',
    resolved_by = v_actor,
    resolved_at = clock_timestamp(),
    resolution_note = NULLIF(trim(COALESCE(p_resolution_note, '')), ''),
    updated_at = now()
  WHERE id = v_req.id;

  v_result := public.refund_paid_order_with_payout(
    v_req.order_id,
    v_req.reason,
    v_req.payout_method
  );


  UPDATE public.notifications SET expires_at = now()
  WHERE tenant_id = v_tenant
    AND kind = 'pos.void_requested'
    AND entity_type = 'pos_void_request'
    AND entity_id = v_req.id
    AND (expires_at IS NULL OR expires_at > now());

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  )
  SELECT
    v_tenant,
    v_req.branch_id,
    ARRAY[COALESCE(private.staff_role_from_position_code(pos.code), 'cashier')]::text[],
    CASE WHEN p_decision = 'approved' THEN 'pos.void_resolved' ELSE 'pos.void_rejected' END,
    'info',
    CASE WHEN p_decision = 'approved'
      THEN 'Yêu cầu hủy đơn đã được duyệt'
      ELSE 'Yêu cầu hủy đơn bị từ chối' END,
    CASE WHEN p_decision = 'approved'
      THEN format('Đơn #%s đã được hủy hoàn tiền.', v_req.order_id)
      ELSE format('Đơn #%s vẫn giữ nguyên; yêu cầu hủy không được duyệt.', v_req.order_id) END,
    'pos_void_request',
    v_req.id,
    format('/br/%s/pos?orderId=%s', v_req.branch_id, v_req.order_id),
    format('pos.void_resolved:%s:%s', v_req.id, p_decision),
    jsonb_build_object('request_id', v_req.id, 'order_id', v_req.order_id, 'decision', p_decision)
  FROM public.profiles AS profile
  LEFT JOIN public.positions AS pos
    ON pos.id = profile.position_id AND pos.tenant_id = profile.tenant_id
  WHERE profile.id = v_req.requested_by
    AND profile.tenant_id = v_tenant
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta, created_at = now(), expires_at = NULL;

  RETURN jsonb_build_object(
    'request_id', v_req.id,
    'status', 'approved',
    'order_id', v_req.order_id,
    'refund', v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
BEGIN
  v_request := private.authorize_leave_review(p_request_id);
  UPDATE public.leave_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = v_request.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave_request_not_pending' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_audit(
    'approve', 'leave_request', p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved')
  );

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  )
  SELECT
    v_request.tenant_id,
    v_request.branch_id,
    ARRAY[role_bucket]::text[],
    'hr.leave_approved',
    'info',
    'Nghỉ phép đã được duyệt',
    'Yêu cầu nghỉ phép của bạn đã được duyệt.',
    'leave_request',
    v_request.id,
    CASE
      WHEN v_request.branch_id IS NULL THEN '/hr/attendance?tab=leave'
      ELSE format('/br/%s/shift/schedule/leave', v_request.branch_id)
    END,
    format('hr.leave_approved:%s', v_request.id),
    jsonb_build_object('leave_request_id', v_request.id, 'decision', 'approved')
  FROM (
    SELECT private.staff_role_from_position_code(po.code) AS role_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
    WHERE e.id = v_request.employee_id AND e.tenant_id = v_request.tenant_id
  ) AS mapped
  WHERE role_bucket IS NOT NULL
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now(), expires_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_leave_request(p_request_id bigint, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
BEGIN
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reject_leave_request: reason too long' USING ERRCODE = '22001';
  END IF;
  v_request := private.authorize_leave_review(p_request_id);
  UPDATE public.leave_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      rejected_reason = NULLIF(btrim(p_reason), '')
  WHERE id = v_request.id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'leave_request_not_pending' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_audit(
    'reject', 'leave_request', p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'reason', NULLIF(btrim(p_reason), ''))
  );

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, dedup_key, meta
  )
  SELECT
    v_request.tenant_id,
    v_request.branch_id,
    ARRAY[role_bucket]::text[],
    'hr.leave_rejected',
    'warning',
    'Nghỉ phép bị từ chối',
    COALESCE(NULLIF(btrim(p_reason), ''), 'Yêu cầu nghỉ phép của bạn đã bị từ chối.'),
    'leave_request',
    v_request.id,
    CASE
      WHEN v_request.branch_id IS NULL THEN '/hr/attendance?tab=leave'
      ELSE format('/br/%s/shift/schedule/leave', v_request.branch_id)
    END,
    format('hr.leave_rejected:%s', v_request.id),
    jsonb_build_object('leave_request_id', v_request.id, 'decision', 'rejected')
  FROM (
    SELECT private.staff_role_from_position_code(po.code) AS role_bucket
    FROM public.employees e
    JOIN public.profiles p ON p.id = e.profile_id AND p.tenant_id = e.tenant_id
    LEFT JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
    WHERE e.id = v_request.employee_id AND e.tenant_id = v_request.tenant_id
  ) AS mapped
  WHERE role_bucket IS NOT NULL
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now(), expires_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_employee_clock_out(p_attendance_id bigint, p_note text DEFAULT NULL::text) RETURNS TABLE(branch_id bigint, check_out timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_actor_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_branch_id bigint;
  v_branch_kind text;
  v_requested_at timestamptz;
  v_check_out timestamptz;
BEGIN
  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile
  WHERE profile.id = v_actor AND profile.tenant_id = v_tenant_id AND profile.is_active;

  IF v_actor IS NULL OR v_actor_role NOT IN ('owner', 'branch_manager') THEN
    RAISE EXCEPTION 'checkout_approver_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT requester.id, private.staff_role_from_position_code(position.code),
         attendance.branch_id, branch.branch_kind, attendance.checkout_requested_at
  INTO v_requester_profile_id, v_requester_role, v_branch_id, v_branch_kind, v_requested_at
  FROM public.attendance_records attendance
  JOIN public.employees employee
    ON employee.id = attendance.employee_id AND employee.tenant_id = attendance.tenant_id
  JOIN public.profiles requester
    ON requester.id = employee.profile_id AND requester.tenant_id = employee.tenant_id
  JOIN public.positions position
    ON position.id = requester.position_id AND position.tenant_id = requester.tenant_id
  LEFT JOIN public.branches branch
    ON branch.id = attendance.branch_id AND branch.tenant_id = attendance.tenant_id
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL
  FOR UPDATE OF attendance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_requester_profile_id = v_actor THEN
    RAISE EXCEPTION 'cannot_approve_own_checkout' USING ERRCODE = '42501';
  END IF;

  -- Floor branch → BM (or Owner). Accountant (null site) + central → Owner only.
  IF v_branch_kind = 'branch'
     AND v_requester_role IN ('cashier', 'chef', 'branch_staff')
     AND v_branch_id IS NOT NULL THEN
    IF v_actor_role <> 'owner'
       AND (v_actor_role <> 'branch_manager' OR v_actor_branch_id IS DISTINCT FROM v_branch_id
            OR NOT public.has_permission(v_branch_id, 'hr:approve_checkout')) THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'checkout_requires_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records attendance
  SET check_out = v_requested_at,
      checkout_approved_at = now(),
      checkout_approved_by = v_actor,
      checkout_approval_note = NULLIF(btrim(p_note), ''),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
  RETURNING attendance.check_out INTO v_check_out;

  IF v_requester_role IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta
    ) VALUES (
      v_tenant_id,
      v_branch_id,
      ARRAY[v_requester_role]::text[],
      'hr.checkout_approved',
      'info',
      'Yêu cầu kết ca đã được duyệt',
      'Ca của bạn đã được xác nhận kết thúc.',
      'attendance_record',
      p_attendance_id,
      CASE
        WHEN v_branch_id IS NULL THEN '/hr/attendance'
        ELSE format('/br/%s/shift/attendance', v_branch_id)
      END,
      format('hr.checkout_approved:%s', p_attendance_id),
      jsonb_build_object('attendance_id', p_attendance_id, 'decision', 'approved')
    )
    ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now(), expires_at = NULL;
  END IF;

  RETURN QUERY SELECT v_branch_id, v_check_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_employee_clock_out(p_attendance_id bigint, p_note text DEFAULT NULL::text) RETURNS TABLE(branch_id bigint, rejected boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant_id bigint := public.auth_tenant_id();
  v_actor_role text := public.auth_role();
  v_actor_branch_id bigint;
  v_requester_profile_id uuid;
  v_requester_role text;
  v_branch_id bigint;
  v_branch_kind text;
BEGIN
  SELECT profile.branch_id INTO v_actor_branch_id
  FROM public.profiles profile
  WHERE profile.id = v_actor AND profile.tenant_id = v_tenant_id AND profile.is_active;

  SELECT requester.id, private.staff_role_from_position_code(position.code),
         attendance.branch_id, branch.branch_kind
  INTO v_requester_profile_id, v_requester_role, v_branch_id, v_branch_kind
  FROM public.attendance_records attendance
  JOIN public.employees employee
    ON employee.id = attendance.employee_id AND employee.tenant_id = attendance.tenant_id
  JOIN public.profiles requester
    ON requester.id = employee.profile_id AND requester.tenant_id = employee.tenant_id
  JOIN public.positions position
    ON position.id = requester.position_id AND position.tenant_id = requester.tenant_id
  LEFT JOIN public.branches branch
    ON branch.id = attendance.branch_id AND branch.tenant_id = attendance.tenant_id
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL
  FOR UPDATE OF attendance;
  IF NOT FOUND OR v_actor IS NULL OR v_requester_profile_id = v_actor THEN
    RAISE EXCEPTION 'checkout_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch_kind = 'branch'
     AND v_requester_role IN ('cashier', 'chef', 'branch_staff')
     AND v_branch_id IS NOT NULL THEN
    IF v_actor_role <> 'owner'
       AND (v_actor_role <> 'branch_manager' OR v_actor_branch_id IS DISTINCT FROM v_branch_id
            OR NOT public.has_permission(v_branch_id, 'hr:approve_checkout')) THEN
      RAISE EXCEPTION 'checkout_approver_wrong_branch' USING ERRCODE = '42501';
    END IF;
  ELSIF v_actor_role <> 'owner' OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'checkout_requires_owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.attendance_records attendance
  SET checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      checkout_approval_note = NULLIF(btrim(p_note), ''),
      updated_at = now()
  WHERE attendance.id = p_attendance_id
    AND attendance.tenant_id = v_tenant_id
    AND attendance.check_out IS NULL
    AND attendance.checkout_requested_at IS NOT NULL;

  IF v_requester_role IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta
    ) VALUES (
      v_tenant_id,
      v_branch_id,
      ARRAY[v_requester_role]::text[],
      'hr.checkout_rejected',
      'warning',
      'Yêu cầu kết ca bị từ chối',
      COALESCE(NULLIF(btrim(p_note), ''), 'Yêu cầu kết ca của bạn đã bị từ chối; ca vẫn đang mở.'),
      'attendance_record',
      p_attendance_id,
      CASE
        WHEN v_branch_id IS NULL THEN '/hr/attendance'
        ELSE format('/br/%s/shift/attendance', v_branch_id)
      END,
      format('hr.checkout_rejected:%s', p_attendance_id),
      jsonb_build_object('attendance_id', p_attendance_id, 'decision', 'rejected')
    )
    ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now(), expires_at = NULL;
  END IF;

  RETURN QUERY SELECT v_branch_id, true;
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

  RETURN NEW;
END;
$$;


UPDATE public.notifications
SET expires_at = now()
WHERE kind IN ('pos.payment_stock_failed', 'workflow.stocktake_submitted')
  AND (expires_at IS NULL OR expires_at > now());
