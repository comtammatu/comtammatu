-- NĐ 254/2026/NĐ-CP (effective 01/07/2026) Phụ lục "Nội dung của hóa đơn" mục 4b:
-- a consumer buyer with no name/MST/ID is shown as "Bán cho người tiêu dùng".
-- Realign the B2C daily-summary draft buyer_name to that phrase; the wire value
-- sent to Viettel is the app constant BUYER_NOT_GET_INVOICE_NAME (also updated).
-- Body is baseline aggregate_daily_b2c_invoice verbatim; only the draft literal
-- changes. CREATE OR REPLACE preserves the existing grants and comment.
CREATE OR REPLACE FUNCTION public.aggregate_daily_b2c_invoice(p_branch_id bigint, p_summary_date date, p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id   BIGINT;
  v_invoice_id  BIGINT;
  v_order_count INT;
  v_subtotal    NUMERIC(15,2);
  v_vat_amount  NUMERIC(15,2);
  v_total       NUMERIC(15,2);
  v_pred_rate   NUMERIC(5,2);
  v_eligible    BIGINT[];
  v_breakdown   JSONB;
  v_line_items  JSONB;
  v_is_service  BOOLEAN;
  v_actor       UUID;
BEGIN
  v_is_service := (auth.role() = 'service_role');
  v_actor := COALESCE(p_actor, auth.uid());

  -- 1. Tenant guard
  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = p_branch_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Permission gate (skip for service_role)
  IF NOT v_is_service THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    IF v_tenant_id <> public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_permission_any('settings:tenant') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Per-(branch, date) advisory xact lock.
  PERFORM pg_advisory_xact_lock(
    hashtext('hddt-b2c:' || p_branch_id::text || ':' || p_summary_date::text)::bigint
  );

  -- 4. Idempotency short-circuit
  SELECT id INTO v_invoice_id
  FROM public.tax_invoices
  WHERE branch_id = p_branch_id
    AND summary_date = p_summary_date
    AND invoice_kind = 'daily_summary'
    AND status NOT IN ('cancelled', 'replaced');
  IF FOUND THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'already_exists',
      'tax_invoice_id', v_invoice_id
    );
  END IF;

  -- 5. Eligible orders (B2C bucket). Bucket source = payments.paid_at
  -- in Asia/Ho_Chi_Minh, matching revenue reporting.
  SELECT array_agg(DISTINCT o.id ORDER BY o.id)
  INTO v_eligible
  FROM public.orders o
  JOIN public.payments p ON p.order_id = o.id
  WHERE o.tenant_id = v_tenant_id
    AND o.branch_id = p_branch_id
    AND o.payment_status = 'paid'
    AND o.status NOT IN ('cancelled', 'refunded')
    AND p.status = 'completed'
    AND p.paid_at IS NOT NULL
    AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_summary_date
    AND NOT EXISTS (
      SELECT 1 FROM public.tax_invoices ti
       WHERE ti.order_id = o.id
         AND ti.status IN ('draft', 'signing', 'submitted', 'issued')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tax_invoice_orders tio
      JOIN public.tax_invoices ti2 ON ti2.id = tio.tax_invoice_id
      WHERE tio.order_id = o.id
        AND ti2.status NOT IN ('cancelled', 'replaced')
    );

  IF v_eligible IS NULL OR array_length(v_eligible, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'no_eligible_orders',
      'order_count', 0
    );
  END IF;

  v_order_count := array_length(v_eligible, 1);

  -- 6. Compute per-rate VAT breakdown via shared SQL helper.
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'vat_rate', vat_rate,
      'line_gross', line_gross,
      'line_subtotal', line_subtotal,
      'line_vat', line_vat
    ) ORDER BY vat_rate), '[]'::jsonb),
    COALESCE(SUM(line_subtotal), 0),
    COALESCE(SUM(line_vat), 0)
  INTO v_breakdown, v_subtotal, v_vat_amount
  FROM public._compute_vat_breakdown(v_eligible);

  v_total := v_subtotal + v_vat_amount;

  SELECT vat_rate INTO v_pred_rate
  FROM public._compute_vat_breakdown(v_eligible)
  ORDER BY line_gross DESC
  LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'name', CASE
      WHEN vat_rate = 8  THEN 'Đồ ăn (8%)'
      WHEN vat_rate = 10 THEN 'Đồ uống có cồn (10%)'
      WHEN vat_rate = 5  THEN 'Hàng hoá khác (5%)'
      ELSE 'Hàng hoá VAT ' || vat_rate || '%'
    END,
    'unit', 'Phần',
    'quantity', 1,
    'unit_price', line_subtotal,
    'amount', line_subtotal,
    'vat_rate', vat_rate,
    'vat_amount', line_vat
  ) ORDER BY vat_rate)
  INTO v_line_items
  FROM public._compute_vat_breakdown(v_eligible);

  -- 7. INSERT tax_invoices as Viettel S-invoice draft.
  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id, status,
    invoice_kind, summary_date, summary_orders_count,
    buyer_name, buyer_tax_code, buyer_address,
    subtotal, vat_rate, vat_amount, total_amount,
    provider, provider_ref, provider_data,
    created_by
  ) VALUES (
    v_tenant_id, p_branch_id, NULL, 'draft',
    'daily_summary', p_summary_date, v_order_count,
    'Bán cho người tiêu dùng', NULL, NULL,
    v_subtotal, v_pred_rate, v_vat_amount, v_total,
    'viettel', NULL,
    jsonb_build_object('vat_breakdown', v_breakdown),
    v_actor
  )
  RETURNING id INTO v_invoice_id;

  -- 8. INSERT junction rows.
  INSERT INTO public.tax_invoice_orders
    (tax_invoice_id, order_id, tenant_id, branch_id, vat_rate, line_subtotal, line_vat_amount)
  SELECT
    v_invoice_id,
    per_order.order_id,
    v_tenant_id,
    p_branch_id,
    per_order.pred_rate,
    per_order.order_subtotal,
    per_order.order_vat
  FROM (
    SELECT
      o.id AS order_id,
      SUM(
        (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
        / (1 + oi.vat_rate / 100)
      )::numeric(15,2) AS order_subtotal,
      SUM(
        (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
        - (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
          / (1 + oi.vat_rate / 100)
      )::numeric(15,2) AS order_vat,
      (
        SELECT oi3.vat_rate
        FROM public.order_items oi3
        WHERE oi3.order_id = o.id
          AND oi3.status <> 'cancelled'
        GROUP BY oi3.vat_rate
        ORDER BY SUM(oi3.subtotal) DESC
        LIMIT 1
      ) AS pred_rate
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN LATERAL (
      SELECT COALESCE(SUM(subtotal), 0) AS s
      FROM public.order_items
      WHERE order_id = o.id AND status <> 'cancelled'
    ) items_sum ON true
    WHERE o.id = ANY(v_eligible)
      AND oi.status <> 'cancelled'
      AND items_sum.s > 0
    GROUP BY o.id, o.total_amount, items_sum.s
  ) per_order;

  -- 9. Return aggregation result for Node runtime to call Sinvoice.
  RETURN jsonb_build_object(
    'tax_invoice_id', v_invoice_id,
    'order_count', v_order_count,
    'subtotal', v_subtotal,
    'vat_amount', v_vat_amount,
    'total_amount', v_total,
    'header_vat_rate', v_pred_rate,
    'vat_breakdown', v_breakdown,
    'order_ids', v_eligible,
    'line_items_for_provider', COALESCE(v_line_items, '[]'::jsonb)
  );
END;
$$;

-- Re-assert ACL verbatim from baseline (idempotent). CREATE OR REPLACE preserves
-- existing grants, so this is defense-in-depth for a SECURITY DEFINER RPC whose
-- only caller is the service_role cron.
REVOKE ALL ON FUNCTION public.aggregate_daily_b2c_invoice(p_branch_id bigint, p_summary_date date, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aggregate_daily_b2c_invoice(p_branch_id bigint, p_summary_date date, p_actor uuid) TO service_role;

