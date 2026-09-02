-- Wave 5 after soak: freeze leftover YCM/YCH RPCs are gone, then drop
-- request FKs and tables. Historical POs/DCs stay; do not convert leftover
-- vouchers. 6-channel scan (JS .rpc/.from, print-agent, cron, triggers, RLS,
-- tests/docs) found no live callers except history UI removed in the same
-- change. Rollback bodies: 20260902162918_baseline.sql pg_dump snapshot.

-- 1) Live RPCs must stop reading request tables before DROP.
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_po_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
  v_cancelled_grns integer;
  v_permission text;
  v_demand_status text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_permission := CASE
    WHEN v_po.status IN ('draft', 'changes_requested')
      THEN 'procurement:po_create'
    ELSE 'procurement:po_approve'
  END;
  IF NOT public.has_permission(v_po.branch_id, v_permission) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status NOT IN (
    'draft',
    'changes_requested',
    'pending_approval',
    'sent',
    'approved'
  )
  OR EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant
      AND grn.po_id = p_po_id
      AND grn.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'purchase_order_not_cancellable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = pg_catalog.concat_ws(
        E'\n',
        nullif(notes, ''),
        'Hủy cùng PO: ' || pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';
  GET DIAGNOSTICS v_cancelled_grns = ROW_COUNT;

  UPDATE public.purchase_orders
  SET status = 'cancelled',
      status_reason = pg_catalog.btrim(p_reason),
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.po.cancelled',
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status', 'cancelled',
      'reason', pg_catalog.btrim(p_reason),
      'cancelled_draft_grns', v_cancelled_grns,
      'demand_id', v_po.purchase_request_id,
      'demand_status', v_demand_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_po_id,
    'status', 'cancelled',
    'cancelled_draft_grns', v_cancelled_grns,
    'demand_id', v_po.purchase_request_id,
    'demand_status', v_demand_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_goods_receipt_notes(p_query text DEFAULT NULL::text, p_status text DEFAULT 'draft'::text, p_supplier_id bigint DEFAULT NULL::bigint, p_date_field text DEFAULT 'expected'::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_po_id bigint DEFAULT NULL::bigint, p_purchase_request_id bigint DEFAULT NULL::bigint, p_branch_id bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_can_money boolean;
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_status NOT IN ('draft', 'confirmed', 'cancelled', 'all')
     OR p_date_field NOT IN ('expected', 'received')
     OR p_limit NOT BETWEEN 1 AND 200
     OR p_offset < 0 THEN
    RAISE EXCEPTION 'grn_list_filter_invalid' USING ERRCODE = '22023';
  END IF;

  v_can_money := public.can_read_inventory_monetary(
    'procurement:price_list_read'
  );

  WITH filtered AS (
    SELECT
      grn.*,
      purchase_order.po_number,
      purchase_order.display_id,
      purchase_order.supplier_id AS list_supplier_id,
      purchase_order.purchase_request_id,
      NULL::text AS request_number,
      supplier.name AS supplier_name,
      branch.name AS receiving_site_name,
      profile.full_name AS handled_by,
      metrics.line_count,
      metrics.completed_line_count,
      metrics.shortage_line_count,
      metrics.excess_line_count,
      metrics.rejected_line_count,
      metrics.receipt_value,
      invoice.id AS invoice_id,
      invoice.matching_status AS invoice_status
    FROM public.goods_received_notes grn
    JOIN public.purchase_orders purchase_order
      ON purchase_order.id = grn.po_id
     AND purchase_order.tenant_id = grn.tenant_id
    JOIN public.suppliers supplier
      ON supplier.id = purchase_order.supplier_id
     AND supplier.tenant_id = purchase_order.tenant_id
    JOIN public.branches branch
      ON branch.id = grn.branch_id
     AND branch.tenant_id = grn.tenant_id
    LEFT JOIN public.profiles profile
      ON profile.id = COALESCE(grn.received_by, grn.created_by)
     AND profile.tenant_id = grn.tenant_id
    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS line_count,
        count(*) FILTER (
          WHERE item.received_quantity - item.rejected_quantity > 0
        )::integer AS completed_line_count,
        count(*) FILTER (
          WHERE (
            grn.status = 'confirmed'
            AND item.po_applied_quantity < remaining.quantity
          ) OR (
            grn.status = 'draft'
            AND item.received_quantity - item.rejected_quantity > 0
            AND least(
              item.received_quantity - item.rejected_quantity,
              remaining.quantity
            ) < remaining.quantity
          )
        )::integer AS shortage_line_count,
        count(*) FILTER (
          WHERE CASE
            WHEN grn.status = 'confirmed'
              THEN item.received_quantity - item.rejected_quantity
                > item.po_applied_quantity
            ELSE item.received_quantity - item.rejected_quantity
              > remaining.quantity
          END
        )::integer AS excess_line_count,
        count(*) FILTER (
          WHERE item.rejected_quantity > 0
        )::integer AS rejected_line_count,
        COALESCE(sum(item.total_cost), 0)::numeric(15,2)
          AS receipt_value
      FROM public.grn_items item
      LEFT JOIN public.purchase_order_items po_item
        ON po_item.id = item.purchase_order_item_id
       AND po_item.tenant_id = item.tenant_id
      LEFT JOIN LATERAL (
        SELECT greatest(
          COALESCE(po_item.quantity, 0) - COALESCE(sum(
            previous_item.po_applied_quantity
          ), 0),
          0
        ) AS quantity
        FROM public.grn_items previous_item
        JOIN public.goods_received_notes previous_grn
          ON previous_grn.id = previous_item.grn_id
         AND previous_grn.tenant_id = previous_item.tenant_id
        WHERE previous_item.tenant_id = item.tenant_id
          AND previous_item.purchase_order_item_id =
            item.purchase_order_item_id
          AND previous_grn.status = 'confirmed'
          AND previous_grn.id <> grn.id
      ) remaining ON TRUE
      WHERE item.grn_id = grn.id
        AND item.tenant_id = grn.tenant_id
    ) metrics ON TRUE
    LEFT JOIN LATERAL (
      SELECT matched_invoice.id, matched_invoice.matching_status
      FROM public.supplier_invoices matched_invoice
      WHERE matched_invoice.tenant_id = grn.tenant_id
        AND (
          matched_invoice.grn_id = grn.id
          OR EXISTS (
            SELECT 1
            FROM public.supplier_invoice_receipt_allocations allocation
            WHERE allocation.tenant_id = grn.tenant_id
              AND allocation.supplier_invoice_id = matched_invoice.id
              AND allocation.grn_id = grn.id
          )
        )
      ORDER BY matched_invoice.id DESC
      LIMIT 1
    ) invoice ON TRUE
    WHERE grn.tenant_id = v_tenant
      AND public.has_permission(grn.branch_id, 'procurement:read')
      AND (p_branch_id IS NULL OR grn.branch_id = p_branch_id)
      AND (p_status = 'all' OR grn.status = p_status)
      AND (p_supplier_id IS NULL OR purchase_order.supplier_id = p_supplier_id)
      AND (p_po_id IS NULL OR purchase_order.id = p_po_id)
      AND (
        p_purchase_request_id IS NULL
        OR purchase_order.purchase_request_id = p_purchase_request_id
      )
      AND (
        p_date_from IS NULL
        OR CASE p_date_field
          WHEN 'expected' THEN grn.expected_receive_date >= p_date_from
          ELSE grn.received_date::date >= p_date_from
        END
      )
      AND (
        p_date_to IS NULL
        OR CASE p_date_field
          WHEN 'expected' THEN grn.expected_receive_date <= p_date_to
          ELSE grn.received_date::date <= p_date_to
        END
      )
      AND (
        NULLIF(btrim(p_query), '') IS NULL
        OR grn.grn_number ILIKE '%' || btrim(p_query) || '%'
        OR purchase_order.po_number ILIKE '%' || btrim(p_query) || '%'
        OR purchase_order.display_id ILIKE '%' || btrim(p_query) || '%'
        OR supplier.name ILIKE '%' || btrim(p_query) || '%'
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS total
    FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      CASE
        WHEN status = 'confirmed' THEN received_date::date
        ELSE expected_receive_date
      END DESC NULLS LAST,
      updated_at DESC,
      id DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', paged.id,
          'code', paged.grn_number,
          'status', paged.status,
          'supplierId', paged.list_supplier_id,
          'supplierName', paged.supplier_name,
          'poId', paged.po_id,
          'poCode', COALESCE(paged.display_id, paged.po_number),
          'purchaseRequestId', paged.purchase_request_id,
          'purchaseRequestCode', paged.request_number,
          'receivingSiteId', paged.branch_id,
          'receivingSiteName', paged.receiving_site_name,
          'expectedReceiveDate', paged.expected_receive_date,
          'receivedDate', paged.received_date,
          'lineCount', paged.line_count,
          'completedLineCount', paged.completed_line_count,
          'shortageLineCount', paged.shortage_line_count,
          'excessLineCount', paged.excess_line_count,
          'rejectedLineCount', paged.rejected_line_count,
          'updatedAt', paged.updated_at,
          'handledBy', paged.handled_by,
          'monetary', CASE
            WHEN v_can_money THEN jsonb_build_object(
              'receiptValue', paged.receipt_value,
              'invoiceId', paged.invoice_id,
              'invoiceStatus', paged.invoice_status
            )
            ELSE 'null'::jsonb
          END
        )
        ORDER BY
          CASE WHEN paged.status = 'draft' THEN 0 ELSE 1 END,
          CASE
            WHEN paged.status = 'confirmed' THEN paged.received_date::date
            ELSE paged.expected_receive_date
          END DESC NULLS LAST,
          paged.updated_at DESC,
          paged.id DESC
      ),
      '[]'::jsonb
    ),
    COALESCE((SELECT total FROM counted), 0)
  INTO v_rows, v_total
  FROM paged;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

-- 2) REVOKE leftover authenticated EXECUTE, then DROP YCM/YCH RPCs.
REVOKE ALL ON FUNCTION public.cancel_purchase_request(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_purchase_request(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_stock_request(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_stock_request(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_request_actor_can_read(bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS stock_request_items_select ON public.stock_request_items;
DROP POLICY IF EXISTS stock_requests_select ON public.stock_requests;

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.purchase_requests;
DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.stock_requests;
DROP TRIGGER IF EXISTS trg_expire_purchase_request_submitted_notification
  ON public.purchase_requests;
DROP TRIGGER IF EXISTS trg_expire_stock_request_notifications
  ON public.stock_requests;
DROP TRIGGER IF EXISTS trg_expire_stock_request_source_notification
  ON public.stock_request_items;
DROP TRIGGER IF EXISTS trg_notify_purchase_request_submitted
  ON public.purchase_requests;
DROP TRIGGER IF EXISTS trg_notify_stock_request_submitted
  ON public.stock_requests;
DROP TRIGGER IF EXISTS trg_purchase_request_items_require_purchased
  ON public.purchase_request_items;

DROP FUNCTION IF EXISTS public.cancel_purchase_request(bigint, text);
DROP FUNCTION IF EXISTS public.close_purchase_request(bigint, text);
DROP FUNCTION IF EXISTS public.cancel_stock_request(bigint, text);
DROP FUNCTION IF EXISTS public.close_stock_request(bigint, text);
DROP FUNCTION IF EXISTS public.fulfill_stock_request_lines(bigint, text, bigint, bigint, bigint[]);
DROP FUNCTION IF EXISTS public.reject_stock_request_lines(bigint, text, bigint[], text);
DROP FUNCTION IF EXISTS public.review_purchase_demand(bigint, text, jsonb, text, uuid);
DROP FUNCTION IF EXISTS public.save_purchase_demand(bigint, bigint, date, text, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.save_purchase_demand_allocations(bigint, jsonb, uuid);
DROP FUNCTION IF EXISTS public.save_purchase_request(bigint, bigint, date, text, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.save_stock_request(bigint, bigint, timestamp with time zone, text, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.stock_request_actor_can_read(bigint, text);

DROP FUNCTION IF EXISTS private.expire_purchase_request_submitted_notification();
DROP FUNCTION IF EXISTS private.expire_stock_request_notifications();
DROP FUNCTION IF EXISTS private.expire_stock_request_source_notification();
DROP FUNCTION IF EXISTS private.notify_purchase_request_submitted();
DROP FUNCTION IF EXISTS private.notify_stock_request_submitted();
DROP FUNCTION IF EXISTS private.purchase_demand_allocation_result(bigint, bigint);
DROP FUNCTION IF EXISTS private.purchase_request_item_ordered_base(bigint, bigint);
DROP FUNCTION IF EXISTS private.purchase_request_item_remaining_demand_qty(bigint, bigint);
DROP FUNCTION IF EXISTS private.recompute_purchase_request_status(bigint, bigint);

-- 3) Drop FKs from surviving PO/DC rows. Keep the orphaned id columns.
ALTER TABLE ONLY public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_purchase_request_tenant_fkey;
ALTER TABLE ONLY public.purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_request_item_tenant_fkey;
ALTER TABLE ONLY public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_request_tenant_fkey;

-- 4) Drop request tables, children first.
DROP TABLE IF EXISTS public.purchase_request_allocations;
DROP TABLE IF EXISTS public.purchase_request_items;
DROP TABLE IF EXISTS public.purchase_requests;
DROP TABLE IF EXISTS public.stock_request_items;
DROP TABLE IF EXISTS public.stock_requests;
