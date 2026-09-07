-- Migration: slow_read_list_rpcs
-- SECURITY DEFINER list RPCs authorize once; PostgREST policies stay unchanged.
-- First-paint finance and close-day totals skip food-cost / valuation scans.

CREATE INDEX IF NOT EXISTS idx_stock_levels_tenant_branch_location
  ON public.stock_levels (tenant_id, branch_id, location_id);

CREATE OR REPLACE FUNCTION public.list_stock_on_hand(
  p_branch_id bigint,
  p_location_ids bigint[] DEFAULT NULL
)
RETURNS TABLE (
  ingredient_id bigint,
  location_id bigint,
  current_quantity numeric,
  avg_unit_cost numeric,
  last_counted_at timestamptz,
  location_name text,
  location_code text,
  location_kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_can_money boolean;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_location_ids IS NOT NULL AND cardinality(p_location_ids) = 0 THEN
    RETURN;
  END IF;

  v_can_money := public.can_read_inventory_monetary('inventory:valuation_read');

  RETURN QUERY
  SELECT
    stock.ingredient_id,
    stock.location_id,
    stock.current_quantity,
    CASE WHEN v_can_money THEN stock.avg_unit_cost ELSE NULL END,
    stock.last_counted_at,
    location.name,
    location.code,
    location.location_kind
  FROM public.stock_levels AS stock
  JOIN public.inventory_locations AS location
    ON location.id = stock.location_id
   AND location.tenant_id = stock.tenant_id
  WHERE stock.tenant_id = v_tenant
    AND stock.branch_id = p_branch_id
    AND (
      p_location_ids IS NULL
      OR stock.location_id = ANY (p_location_ids)
    );
END;
$$;

COMMENT ON FUNCTION public.list_stock_on_hand(bigint, bigint[]) IS
  'On-hand stock for one branch after a single inventory:read check. Direct stock_levels RLS stays for other callers.';

REVOKE ALL ON FUNCTION public.list_stock_on_hand(bigint, bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_stock_on_hand(bigint, bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_stock_on_hand(bigint, bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_stock_transfer_items(p_transfer_id bigint)
RETURNS TABLE (
  id bigint,
  tenant_id bigint,
  transfer_id bigint,
  ingredient_id bigint,
  quantity numeric,
  quantity_received numeric,
  receive_note text,
  entry_unit_id bigint,
  unit_cost_at_ship numeric,
  ingredient_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_from bigint;
  v_to bigint;
  v_can_money boolean;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT transfer.from_branch_id, transfer.to_branch_id
    INTO v_from, v_to
    FROM public.stock_transfers AS transfer
   WHERE transfer.id = p_transfer_id
     AND transfer.tenant_id = v_tenant;

  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission(v_from, 'inventory:read')
    OR public.has_permission(v_to, 'inventory:read')
    OR public.has_permission(v_from, 'inventory:transfer_create')
    OR public.has_permission(v_from, 'inventory:transfer_ship')
    OR public.has_permission(v_to, 'inventory:transfer_receive')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_can_money := public.can_read_inventory_monetary('inventory:valuation_read');

  RETURN QUERY
  SELECT
    line.id,
    line.tenant_id,
    line.transfer_id,
    line.ingredient_id,
    line.quantity,
    line.quantity_received,
    line.receive_note,
    line.entry_unit_id,
    CASE WHEN v_can_money THEN line.unit_cost_at_ship ELSE NULL END,
    ingredient.name
  FROM public.stock_transfer_items AS line
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = line.tenant_id
  WHERE line.tenant_id = v_tenant
    AND line.transfer_id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.list_stock_transfer_items(bigint) IS
  'Transfer lines after one parent permission disjunction. Direct item RLS stays for other callers.';

REVOKE ALL ON FUNCTION public.list_stock_transfer_items(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_stock_transfer_items(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_stock_transfer_items(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_inventory_count_slip_lines(p_slip_ids bigint[])
RETURNS TABLE (
  id bigint,
  slip_id bigint,
  ingredient_id bigint,
  system_quantity numeric,
  counted_quantity numeric,
  entry_unit_id bigint,
  entry_to_base_factor numeric,
  counted_base_quantity numeric,
  recount_required boolean,
  last_recount_round integer,
  note text,
  ingredient_name text,
  unit_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_slip_ids IS NULL OR cardinality(p_slip_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    line.id,
    line.slip_id,
    line.ingredient_id,
    line.system_quantity,
    line.counted_quantity,
    line.entry_unit_id,
    line.entry_to_base_factor,
    line.counted_base_quantity,
    line.recount_required,
    line.last_recount_round,
    line.note,
    ingredient.name,
    unit.code
  FROM public.inventory_count_slip_lines AS line
  JOIN public.inventory_count_slips AS slip
    ON slip.id = line.slip_id
   AND slip.tenant_id = line.tenant_id
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = line.tenant_id
  LEFT JOIN public.units AS unit
    ON unit.id = line.entry_unit_id
   AND unit.tenant_id = line.tenant_id
  WHERE line.tenant_id = v_tenant
    AND line.slip_id = ANY (p_slip_ids)
    AND public.has_permission(slip.branch_id, 'inventory:count_approve');
END;
$$;

COMMENT ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) IS
  'Count-slip lines for slips the caller may approve. Direct line RLS stays for other callers.';

REVOKE ALL ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_operating_first_paint(
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
  v_expense jsonb := '{}'::jsonb;
  v_net numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_order_count bigint := 0;
  v_cash_revenue numeric := 0;
  v_vietqr_revenue numeric := 0;
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

  SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
  INTO v_sales_branch_ids
  FROM public.branches AS branch
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
    ) AS kpis;

    SELECT
      COALESCE(summary.abs_variance_total, 0),
      COALESCE(summary.session_count, 0)
    INTO v_cash_abs, v_cash_sessions
    FROM public.get_cash_variance_summary(
      CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END,
      p_start_date,
      p_end_date
    ) AS summary;

    IF v_location = 'branch' THEN
      SELECT target.session_id, target.branch_id
      INTO v_cash_session_id, v_cash_session_branch
      FROM public.get_cash_variance_action_target(
        p_branch_id,
        p_start_date,
        p_end_date
      ) AS target
      LIMIT 1;
    END IF;

    SELECT COALESCE(dash.invoice_attention_count, 0)
    INTO v_invoice_attention
    FROM public.get_finance_dashboard_summary(
      p_start_date,
      p_end_date,
      CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END
    ) AS dash;

    SELECT
      COUNT(*)::integer,
      COALESCE(SUM(desync.amount), 0)
    INTO v_desync_count, v_desync_amount
    FROM public.find_payment_order_desync(v_start_utc) AS desync
    WHERE desync.payment_paid_at < v_end_utc
      AND (
        v_location <> 'branch'
        OR desync.branch_id = p_branch_id
      );
  END IF;

  v_expense := public.get_finance_expense_period_summary(
    v_location,
    p_start_date,
    p_end_date,
    CASE WHEN v_location = 'branch' THEN p_branch_id ELSE NULL END
  );

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
    FROM public.supplier_invoices AS invoice
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
    FROM public.supplier_invoices AS invoice
    JOIN public.goods_received_notes AS grn
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
    FROM public.supplier_invoices AS invoice
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
    ) AS attn;
  END IF;

  RETURN jsonb_build_object(
    'net_revenue', COALESCE(v_net, 0)::text,
    'subtotal_revenue', COALESCE(v_subtotal, 0)::text,
    'discount_amount', COALESCE(v_discount, 0)::text,
    'order_count', COALESCE(v_order_count, 0),
    'cash_revenue', COALESCE(v_cash_revenue, 0)::text,
    'vietqr_revenue', COALESCE(v_vietqr_revenue, 0)::text,
    'food_cost', jsonb_build_object(
      'valuation_active', false,
      'ingredient_cost', '0.00',
      'operating_consumption', '0.00',
      'paid_order_count', 0,
      'covered_order_count', 0,
      'coverage_complete', true
    ),
    'goods_in', '0',
    'goods_in_kind', CASE
      WHEN v_location IN ('branch', 'branches') THEN 'inbound_transfer'
      ELSE 'inventory_purchase'
    END,
    'operating_expense_total', COALESCE(v_expense->>'operating_total', '0'),
    'operating_expense_recorded', COALESCE((v_expense->>'operating_recorded')::boolean, false),
    'inventory_opening', '0',
    'inventory_closing', '0',
    'inventory_readable', false,
    'inventory_change', '0',
    'inventory_change_included', false,
    'valuation_active', false,
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

COMMENT ON FUNCTION public.get_finance_operating_first_paint(text, date, date, bigint) IS
  'Home finance attention: revenue + exceptions. Food cost and inventory stay on get_finance_operating_cockpit.';

REVOKE ALL ON FUNCTION public.get_finance_operating_first_paint(text, date, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_operating_first_paint(text, date, date, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_finance_operating_first_paint(text, date, date, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_branch_day_report_totals(
  p_branch_id bigint,
  p_business_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_net_revenue numeric(15, 2) := 0;
  v_money_collected numeric(15, 2) := 0;
  v_cash_revenue numeric(15, 2) := 0;
  v_noncash_revenue numeric(15, 2) := 0;
  v_payment_mix jsonb := '{}'::jsonb;
  v_paid_orders bigint := 0;
  v_unpaid_orders bigint := 0;
  v_operating_expense numeric(15, 2) := 0;
  v_closed_session_count bigint := 0;
  v_open_session_count bigint := 0;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL OR p_business_date IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'settings:branch')
     AND NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant
      AND branch.branch_kind = 'branch'
  ) THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT bounds.day_start, bounds.day_end
    INTO v_day_start, v_day_end
    FROM public.branch_business_day_bounds(p_branch_id, p_business_date) AS bounds;

  WITH paid AS (
    SELECT
      payment.order_id,
      payment.id AS payment_id,
      payment.paid_at,
      payment.amount,
      payment.method,
      orders.subtotal,
      orders.discount_amount
    FROM public.payments AS payment
    JOIN public.orders AS orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
     AND orders.branch_id = payment.branch_id
    WHERE payment.tenant_id = v_tenant
      AND payment.branch_id = p_branch_id
      AND payment.status = 'completed'
      AND payment.paid_at IS NOT NULL
      AND payment.paid_at >= v_day_start
      AND payment.paid_at < v_day_end
      AND orders.status <> 'cancelled'
  ),
  order_facts AS (
    SELECT DISTINCT ON (paid.order_id)
      paid.order_id,
      paid.subtotal,
      paid.discount_amount
    FROM paid
    ORDER BY paid.order_id, paid.paid_at, paid.payment_id
  )
  SELECT
    COALESCE(sum(order_facts.subtotal - order_facts.discount_amount), 0)::numeric(15, 2),
    (SELECT COALESCE(sum(paid.amount), 0)::numeric(15, 2) FROM paid),
    (SELECT COALESCE(sum(paid.amount) FILTER (WHERE paid.method = 'cash'), 0)::numeric(15, 2) FROM paid),
    (SELECT COALESCE(sum(paid.amount) FILTER (WHERE paid.method <> 'cash'), 0)::numeric(15, 2) FROM paid),
    COALESCE(
      (
        SELECT jsonb_object_agg(mix.method, mix.amount)
        FROM (
          SELECT COALESCE(paid.method, 'unknown') AS method,
                 sum(paid.amount)::numeric(15, 2) AS amount
          FROM paid
          GROUP BY 1
        ) AS mix
      ),
      '{}'::jsonb
    ),
    (SELECT count(*) FROM order_facts)
  INTO
    v_net_revenue,
    v_money_collected,
    v_cash_revenue,
    v_noncash_revenue,
    v_payment_mix,
    v_paid_orders
  FROM order_facts;

  SELECT COUNT(*)
    INTO v_unpaid_orders
    FROM public.orders AS orders
   WHERE orders.tenant_id = v_tenant
     AND orders.branch_id = p_branch_id
     AND orders.status IN ('confirmed', 'preparing', 'ready', 'served')
     AND orders.payment_status = 'unpaid'
     AND orders.created_at >= v_day_start
     AND orders.created_at < v_day_end;

  SELECT
    COUNT(*) FILTER (WHERE sessions.status = 'closed'),
    COUNT(*) FILTER (WHERE sessions.status = 'open')
    INTO v_closed_session_count, v_open_session_count
    FROM public.pos_sessions AS sessions
   WHERE sessions.tenant_id = v_tenant
     AND sessions.branch_id = p_branch_id
     AND sessions.opened_at >= v_day_start
     AND sessions.opened_at < v_day_end;

  SELECT COALESCE(sum(expense.subtotal), 0)::numeric(15, 2)
    INTO v_operating_expense
    FROM public.expenses AS expense
   WHERE expense.tenant_id = v_tenant
     AND expense.branch_id = p_branch_id
     AND expense.expense_date = p_business_date
     AND expense.category IN (
       'rent', 'utilities', 'gas_fuel', 'salary', 'repair', 'supplies',
       'marketing', 'fees_tax', 'hospitality', 'other'
     );

  RETURN jsonb_build_object(
    'business_date', p_business_date,
    'day_start', v_day_start,
    'day_end', v_day_end,
    'valuation_active', false,
    'net_revenue', v_net_revenue,
    'money_collected', v_money_collected,
    'cash_revenue', v_cash_revenue,
    'noncash_revenue', v_noncash_revenue,
    'payment_mix', v_payment_mix,
    'paid_orders', v_paid_orders,
    'unpaid_orders', v_unpaid_orders,
    'food_cost', NULL,
    'food_cost_coverage', v_paid_orders = 0,
    'gross_profit', NULL,
    'gross_margin', NULL,
    'goods_in', NULL,
    'operating_expense', v_operating_expense,
    'inventory_opening', NULL,
    'inventory_closing', NULL,
    'inventory_change', NULL,
    'operating_result', NULL,
    'sale_consumption_value', NULL,
    'manual_consumption_value', NULL,
    'waste_value', NULL,
    'top_items', '[]'::jsonb,
    'closed_session_count', v_closed_session_count,
    'open_session_count', v_open_session_count
  );
END;
$$;

COMMENT ON FUNCTION public.get_branch_day_report_totals(bigint, date) IS
  'Close-day first paint: paid/session/expense totals. Top items and valuation stay on get_branch_day_report.';

REVOKE ALL ON FUNCTION public.get_branch_day_report_totals(bigint, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_branch_day_report_totals(bigint, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_branch_day_report_totals(bigint, date) TO authenticated;
