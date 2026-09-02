-- Server-side inventory-change identity (closing - opening) computed in the
-- cockpit RPC for every location scope incl. company, with valuation-cutover
-- awareness: when the cutover is inactive the term is marked unavailable
-- (inventory_change_included=false), never silently zero.

CREATE OR REPLACE FUNCTION public.get_finance_operating_cockpit(
  p_location text,
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_location text;
  v_includes_branch boolean;
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_food jsonb := '{}'::jsonb;
  v_expense jsonb := '{}'::jsonb;
  v_net numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_order_count bigint := 0;
  v_cash_revenue numeric := 0;
  v_vietqr_revenue numeric := 0;
  v_goods_in numeric(20, 2) := 0;
  v_goods_in_kind text := 'inventory_purchase';
  v_inv_open numeric := 0;
  v_inv_close numeric := 0;
  v_inv_readable boolean := false;
  v_inv_change numeric := 0;
  v_inv_included boolean := false;
  v_valuation_active boolean := false;
  v_cash_abs numeric := 0;
  v_cash_sessions bigint := 0;
  v_cash_session_id bigint := NULL;
  v_cash_session_branch bigint := NULL;
  v_unpaid_count integer := 0;
  v_unpaid_amount numeric := 0;
  v_desync_count integer := 0;
  v_desync_amount numeric := 0;
  v_invoice_attention bigint := 0;
  v_unmatched_bank_count bigint := 0;
  v_unmatched_bank_amount numeric := 0;
  v_missing_vietqr_count bigint := 0;
  v_missing_vietqr_amount numeric := 0;
  v_sales_branch_ids bigint[] := ARRAY[]::bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;

  v_location := lower(btrim(COALESCE(p_location, '')));
  IF v_location NOT IN ('all', 'company', 'branches', 'branch') THEN
    RAISE EXCEPTION 'invalid_location' USING ERRCODE = '22023';
  END IF;

  IF v_location = 'branch' AND p_branch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_branch' USING ERRCODE = '22023';
  END IF;

  v_includes_branch := v_location <> 'company';
  v_start_utc := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_goods_in_kind := CASE
    WHEN v_location IN ('branch', 'branches') THEN 'inbound_transfer'
    ELSE 'inventory_purchase'
  END;

  SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
  INTO v_sales_branch_ids
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND COALESCE(branch.is_active, true);

  IF v_includes_branch THEN
    SELECT
      kpis.net_revenue,
      kpis.subtotal_revenue,
      kpis.discount_amount,
      kpis.order_count,
      kpis.cash_revenue,
      kpis.vietqr_revenue
    INTO
      v_net,
      v_subtotal,
      v_discount,
      v_order_count,
      v_cash_revenue,
      v_vietqr_revenue
    FROM public.get_revenue_kpis(
      CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END,
      p_start_date,
      p_end_date
    ) kpis;

    v_food := public.get_finance_food_cost_recorded(
      p_start_date,
      p_end_date,
      CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END
    );

    SELECT
      COALESCE(summary.abs_variance_total, 0),
      COALESCE(summary.session_count, 0)
    INTO v_cash_abs, v_cash_sessions
    FROM public.get_cash_variance_summary(
      CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END,
      p_start_date,
      p_end_date
    ) summary;

    IF v_location = 'branch' THEN
      SELECT target.session_id, target.branch_id
      INTO v_cash_session_id, v_cash_session_branch
      FROM public.get_cash_variance_action_target(
        p_branch_id,
        p_start_date,
        p_end_date
      ) target
      LIMIT 1;
    END IF;

    SELECT COALESCE(dash.invoice_attention_count, 0)
    INTO v_invoice_attention
    FROM public.get_finance_dashboard_summary(
      p_start_date,
      p_end_date,
      CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END
    ) dash;

    SELECT
      COUNT(*)::integer,
      COALESCE(SUM(desync.amount), 0)
    INTO v_desync_count, v_desync_amount
    FROM public.find_payment_order_desync(v_start_utc) desync
    WHERE desync.payment_paid_at < v_end_utc
      AND (
        v_location <> 'branch'
        OR desync.branch_id = p_branch_id
      );
  ELSE
    v_food := jsonb_build_object(
      'valuation_active', false,
      'ingredient_cost', '0.00',
      'operating_consumption', '0.00',
      'paid_order_count', 0,
      'covered_order_count', 0,
      'coverage_complete', true
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_valuation_cutovers cutover
    WHERE cutover.tenant_id = v_tenant
      AND cutover.status = 'active'
  )
  INTO v_valuation_active;

  IF v_valuation_active THEN
    BEGIN
      SELECT
        COALESCE(SUM(period.opening_value), 0),
        COALESCE(SUM(period.closing_value), 0)
      INTO v_inv_open, v_inv_close
      FROM public.get_inventory_valuation_period_value(
        p_start_date,
        p_end_date,
        CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END
      ) period;
      v_inv_readable := true;
      v_inv_change := v_inv_close - v_inv_open;
      v_inv_included := true;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_inv_readable := false;
        v_inv_open := 0;
        v_inv_close := 0;
        v_inv_change := 0;
        v_inv_included := false;
    END;
  END IF;

  v_expense := public.get_finance_expense_period_summary(
    v_location,
    p_start_date,
    p_end_date,
    CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END
  );

  IF v_goods_in_kind = 'inbound_transfer' THEN
    SELECT COALESCE(SUM(allocation.allocated_value), 0)
    INTO v_goods_in
    FROM public.inventory_value_allocations allocation
    JOIN public.inventory_valuation_events event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    JOIN public.stock_movements movement
      ON movement.id = event.stock_movement_id
     AND movement.tenant_id = event.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.allocation_bucket = 'inventory'
      AND event.event_type = 'transfer_in'
      AND event.effective_at >= v_start_utc
      AND event.effective_at < v_end_utc
      AND movement.branch_id = ANY (
        CASE
          WHEN v_location = 'branch' THEN ARRAY[p_branch_id]
          ELSE v_sales_branch_ids
        END
      );
  ELSE
    SELECT COALESCE(SUM(invoice.subtotal), 0)
    INTO v_goods_in
    FROM public.supplier_invoices invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.document_status IN ('confirmed', 'adjusted')
      AND invoice.invoice_date >= p_start_date
      AND invoice.invoice_date <= p_end_date;
  END IF;

  IF v_location = 'company' THEN
    SELECT
      COUNT(*)::integer,
      COALESCE(SUM(
        GREATEST(
          invoice.total_amount
            - COALESCE(invoice.paid_amount, 0)
            - COALESCE(invoice.credit_applied_amount, 0),
          0
        )
      ), 0)
    INTO v_unpaid_count, v_unpaid_amount
    FROM public.supplier_invoices invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.payment_status IS DISTINCT FROM 'paid'
      AND invoice.grn_id IS NULL
      AND invoice.invoice_date >= p_start_date
      AND invoice.invoice_date <= p_end_date;
  ELSIF v_location IN ('branch', 'branches') THEN
    SELECT
      COUNT(*)::integer,
      COALESCE(SUM(
        GREATEST(
          invoice.total_amount
            - COALESCE(invoice.paid_amount, 0)
            - COALESCE(invoice.credit_applied_amount, 0),
          0
        )
      ), 0)
    INTO v_unpaid_count, v_unpaid_amount
    FROM public.supplier_invoices invoice
    JOIN public.goods_received_notes grn
      ON grn.id = invoice.grn_id
     AND grn.tenant_id = invoice.tenant_id
    WHERE invoice.tenant_id = v_tenant
      AND invoice.payment_status IS DISTINCT FROM 'paid'
      AND invoice.invoice_date >= p_start_date
      AND invoice.invoice_date <= p_end_date
      AND (
        (v_location = 'branch' AND grn.branch_id = p_branch_id)
        OR (
          v_location = 'branches'
          AND grn.branch_id = ANY (v_sales_branch_ids)
        )
      );
  ELSE
    SELECT
      COUNT(*)::integer,
      COALESCE(SUM(
        GREATEST(
          invoice.total_amount
            - COALESCE(invoice.paid_amount, 0)
            - COALESCE(invoice.credit_applied_amount, 0),
          0
        )
      ), 0)
    INTO v_unpaid_count, v_unpaid_amount
    FROM public.supplier_invoices invoice
    WHERE invoice.tenant_id = v_tenant
      AND invoice.payment_status IS DISTINCT FROM 'paid'
      AND invoice.invoice_date >= p_start_date
      AND invoice.invoice_date <= p_end_date;
  END IF;

  IF v_location IN ('all', 'company') THEN
    SELECT
      COALESCE(attn.unmatched_bank_count, 0),
      COALESCE(attn.unmatched_bank_amount, 0),
      COALESCE(attn.missing_vietqr_count, 0),
      COALESCE(attn.missing_vietqr_amount, 0)
    INTO
      v_unmatched_bank_count,
      v_unmatched_bank_amount,
      v_missing_vietqr_count,
      v_missing_vietqr_amount
    FROM public.get_finance_reconciliation_attention(
      p_start_date,
      p_end_date
    ) attn;
  END IF;

  RETURN jsonb_build_object(
    'net_revenue', COALESCE(v_net, 0)::text,
    'subtotal_revenue', COALESCE(v_subtotal, 0)::text,
    'discount_amount', COALESCE(v_discount, 0)::text,
    'order_count', COALESCE(v_order_count, 0),
    'cash_revenue', COALESCE(v_cash_revenue, 0)::text,
    'vietqr_revenue', COALESCE(v_vietqr_revenue, 0)::text,
    'food_cost', v_food,
    'goods_in', COALESCE(v_goods_in, 0)::text,
    'goods_in_kind', v_goods_in_kind,
    'operating_expense_total', COALESCE(v_expense->>'operating_total', '0'),
    'operating_expense_recorded', COALESCE((v_expense->>'operating_recorded')::boolean, false),
    'inventory_opening', COALESCE(v_inv_open, 0)::text,
    'inventory_closing', COALESCE(v_inv_close, 0)::text,
    'inventory_readable', v_inv_readable,
    'inventory_change', v_inv_change::text,
    'inventory_change_included', v_inv_included,
    'valuation_active', v_valuation_active,
    'exceptions', jsonb_build_object(
      'cash_variance_abs', COALESCE(v_cash_abs, 0)::text,
      'cash_variance_sessions', COALESCE(v_cash_sessions, 0),
      'cash_variance_session_id', v_cash_session_id,
      'cash_variance_branch_id', v_cash_session_branch,
      'unpaid_ap_count', v_unpaid_count,
      'unpaid_ap_amount', COALESCE(v_unpaid_amount, 0)::text,
      'payment_desync_count', v_desync_count,
      'payment_desync_amount', COALESCE(v_desync_amount, 0)::text,
      'invoice_attention_count', COALESCE(v_invoice_attention, 0),
      'unmatched_bank_count', COALESCE(v_unmatched_bank_count, 0),
      'unmatched_bank_amount', COALESCE(v_unmatched_bank_amount, 0)::text,
      'missing_vietqr_count', COALESCE(v_missing_vietqr_count, 0),
      'missing_vietqr_amount', COALESCE(v_missing_vietqr_amount, 0)::text
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) TO authenticated;

COMMENT ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) IS
  'Period operating KPIs for /finance. Excludes funds and theoretical food cost.';
