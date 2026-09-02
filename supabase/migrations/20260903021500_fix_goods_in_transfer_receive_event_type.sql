-- Fix event_type matching for inbound transfers in finance operating cockpit.
-- When stock transfers are received, post_stock_movement_valuation writes event_type = 'transfer_receive'.
-- RPCs looking up inbound goods must match both 'transfer_in' and 'transfer_receive'.

CREATE OR REPLACE FUNCTION private.get_finance_operating_cockpit_without_inventory_breakdown(
  p_location text, 
  p_start_date date, 
  p_end_date date, 
  p_branch_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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
      AND event.event_type IN ('transfer_in', 'transfer_receive')
      AND EXISTS (
        SELECT 1
        FROM public.stock_transfers AS transfer
        WHERE transfer.id = movement.transfer_id
          AND transfer.tenant_id = movement.tenant_id
          AND transfer.transfer_scope = 'inter_site'
      )
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

COMMENT ON FUNCTION private.get_finance_operating_cockpit_without_inventory_breakdown(p_location text, p_start_date date, p_end_date date, p_branch_id bigint) IS 'Period operating KPIs for /finance. Excludes funds and theoretical food cost.';
REVOKE ALL ON FUNCTION private.get_finance_operating_cockpit_without_inventory_breakdown(p_location text, p_start_date date, p_end_date date, p_branch_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION private.get_finance_operating_cockpit_without_inventory_breakdown(p_location text, p_start_date date, p_end_date date, p_branch_id bigint) TO service_role;


CREATE OR REPLACE FUNCTION public.get_branch_day_report(p_branch_id bigint, p_business_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_actor uuid := auth.uid();
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_valuation_active boolean := false;
  v_net_revenue numeric(15, 2) := 0;
  v_money_collected numeric(15, 2) := 0;
  v_cash_revenue numeric(15, 2) := 0;
  v_noncash_revenue numeric(15, 2) := 0;
  v_payment_mix jsonb := '{}'::jsonb;
  v_paid_orders bigint := 0;
  v_unpaid_orders bigint := 0;
  v_food_cost numeric(15, 2) := 0;
  v_food_cost_coverage boolean := true;
  v_gross_profit numeric(15, 2);
  v_gross_margin numeric(8, 2);
  v_goods_in numeric(15, 2) := 0;
  v_operating_expense numeric(15, 2) := 0;
  v_inventory_opening numeric(15, 2);
  v_inventory_closing numeric(15, 2);
  v_inventory_change numeric(15, 2);
  v_operating_result numeric(15, 2);
  v_sale_consumption_value numeric(15, 2) := 0;
  v_manual_consumption_value numeric(15, 2) := 0;
  v_waste_value numeric(15, 2) := 0;
  v_top_items jsonb := '[]'::jsonb;
  v_closed_session_count bigint := 0;
  v_open_session_count bigint := 0;
  v_covered_orders bigint := 0;
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

  SELECT b.day_start, b.day_end
    INTO v_day_start, v_day_end
    FROM public.branch_business_day_bounds(p_branch_id, p_business_date) AS b;

  SELECT cutover.status = 'active'
    INTO v_valuation_active
    FROM public.inventory_valuation_cutovers AS cutover
   WHERE cutover.tenant_id = v_tenant;
  v_valuation_active := COALESCE(v_valuation_active, false);

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

  WITH paid_orders AS (
    SELECT DISTINCT ON (payment.order_id)
      payment.order_id
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
      AND orders.payment_status = 'paid'
    ORDER BY payment.order_id, payment.paid_at, payment.id
  ),
  paid_items AS (
    SELECT
      item.id AS order_item_id,
      item.item_name,
      item.quantity::numeric AS parent_quantity,
      COALESCE(item.subtotal, 0)::numeric AS line_revenue,
      CASE
        WHEN jsonb_typeof(item.sides) = 'array' THEN item.sides
        ELSE '[]'::jsonb
      END AS sides,
      CASE
        WHEN jsonb_typeof(item.modifiers) = 'array' THEN item.modifiers
        ELSE '[]'::jsonb
      END AS modifiers
    FROM public.order_items AS item
    JOIN paid_orders AS paid
      ON paid.order_id = item.order_id
    WHERE item.tenant_id = v_tenant
      AND item.status <> 'cancelled'
  ),
  side_lines AS (
    SELECT
      paid_items.order_item_id,
      COALESCE(NULLIF(side_el ->> 'name', ''), 'Mon an kem')::text AS item_name,
      paid_items.parent_quantity,
      CASE
        WHEN COALESCE(side_el ->> 'quantity', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((side_el ->> 'quantity')::numeric, 0)
        ELSE 1
      END AS quantity_per_parent,
      CASE
        WHEN COALESCE(side_el ->> 'price', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((side_el ->> 'price')::numeric, 0)
        ELSE 0
      END AS unit_price
    FROM paid_items
    CROSS JOIN LATERAL jsonb_array_elements(paid_items.sides) AS side_el
    WHERE side_el ? 'side_item_id'
      AND (side_el ->> 'side_item_id') ~ '^[0-9]+$'
  ),
  modifier_lines AS (
    SELECT
      paid_items.order_item_id,
      COALESCE(NULLIF(mod_el ->> 'name', ''), 'Tuy chon')::text AS item_name,
      paid_items.parent_quantity,
      1::numeric AS quantity_per_parent,
      CASE
        WHEN COALESCE(mod_el ->> 'price', '') ~ '^[0-9]+(\.[0-9]+)?$'
          THEN GREATEST((mod_el ->> 'price')::numeric, 0)
        ELSE 0
      END AS unit_price
    FROM paid_items
    CROSS JOIN LATERAL jsonb_array_elements(paid_items.modifiers) AS mod_el
    WHERE mod_el ? 'modifier_id'
      AND (mod_el ->> 'modifier_id') ~ '^[0-9]+$'
  ),
  side_totals_by_line AS (
    SELECT
      side_lines.order_item_id,
      COALESCE(
        SUM(
          side_lines.quantity_per_parent
          * side_lines.unit_price
          * side_lines.parent_quantity
        ),
        0
      )::numeric AS side_revenue
    FROM side_lines
    GROUP BY side_lines.order_item_id
  ),
  modifier_totals_by_line AS (
    SELECT
      modifier_lines.order_item_id,
      COALESCE(
        SUM(
          modifier_lines.quantity_per_parent
          * modifier_lines.unit_price
          * modifier_lines.parent_quantity
        ),
        0
      )::numeric AS modifier_revenue
    FROM modifier_lines
    GROUP BY modifier_lines.order_item_id
  ),
  main_components AS (
    SELECT
      paid_items.item_name AS name,
      'main'::text AS source,
      COALESCE(SUM(paid_items.parent_quantity), 0)::integer AS qty,
      COALESCE(
        SUM(
          GREATEST(
            paid_items.line_revenue
            - COALESCE(side_totals.side_revenue, 0)
            - COALESCE(mod_totals.modifier_revenue, 0),
            0
          )
        ),
        0
      )::numeric AS revenue
    FROM paid_items
    LEFT JOIN side_totals_by_line AS side_totals
      ON side_totals.order_item_id = paid_items.order_item_id
    LEFT JOIN modifier_totals_by_line AS mod_totals
      ON mod_totals.order_item_id = paid_items.order_item_id
    GROUP BY paid_items.item_name
  ),
  side_components AS (
    SELECT
      side_lines.item_name AS name,
      'side'::text AS source,
      COALESCE(
        SUM(side_lines.parent_quantity * side_lines.quantity_per_parent),
        0
      )::integer AS qty,
      COALESCE(
        SUM(
          side_lines.parent_quantity
          * side_lines.quantity_per_parent
          * side_lines.unit_price
        ),
        0
      )::numeric AS revenue
    FROM side_lines
    GROUP BY side_lines.item_name
  ),
  modifier_components AS (
    SELECT
      modifier_lines.item_name AS name,
      'modifier'::text AS source,
      COALESCE(
        SUM(modifier_lines.parent_quantity * modifier_lines.quantity_per_parent),
        0
      )::integer AS qty,
      COALESCE(
        SUM(
          modifier_lines.parent_quantity
          * modifier_lines.quantity_per_parent
          * modifier_lines.unit_price
        ),
        0
      )::numeric AS revenue
    FROM modifier_lines
    GROUP BY modifier_lines.item_name
  ),
  all_items AS (
    SELECT * FROM main_components
    UNION ALL
    SELECT * FROM side_components
    UNION ALL
    SELECT * FROM modifier_components
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(row_to_json(ranked) ORDER BY ranked.qty DESC, ranked.revenue DESC, ranked.name)
      FROM (
        SELECT all_items.name, all_items.source, all_items.qty, all_items.revenue
        FROM all_items
        ORDER BY all_items.qty DESC, all_items.revenue DESC, all_items.name
        LIMIT 30
      ) AS ranked
    ),
    '[]'::jsonb
  )
  INTO v_top_items;

  IF v_valuation_active THEN
    SELECT COALESCE(sum(allocation.allocated_value), 0)::numeric(15, 2)
      INTO v_food_cost
      FROM public.inventory_value_allocations AS allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = allocation.valuation_event_id
       AND event.tenant_id = allocation.tenant_id
      JOIN public.stock_movements AS movement
        ON movement.id = event.stock_movement_id
       AND movement.tenant_id = event.tenant_id
     WHERE allocation.tenant_id = v_tenant
       AND allocation.allocation_bucket = 'food_cost'
       AND event.effective_at >= v_day_start
       AND event.effective_at < v_day_end
       AND movement.branch_id = p_branch_id
       AND movement.order_id IS NOT NULL
       AND event.event_type NOT IN (
         'invoice_reprice', 'credit_reprice', 'provisional_reprice'
       );

    v_sale_consumption_value := v_food_cost;

    SELECT COALESCE(sum(allocation.allocated_value), 0)::numeric(15, 2)
      INTO v_goods_in
      FROM public.inventory_value_allocations AS allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = allocation.valuation_event_id
       AND event.tenant_id = allocation.tenant_id
      JOIN public.stock_movements AS movement
        ON movement.id = event.stock_movement_id
       AND movement.tenant_id = event.tenant_id
     WHERE allocation.tenant_id = v_tenant
       AND allocation.allocation_bucket = 'inventory'
       AND event.event_type IN ('transfer_in', 'transfer_receive')
       AND event.effective_at >= v_day_start
       AND event.effective_at < v_day_end
       AND movement.branch_id = p_branch_id;

    SELECT COALESCE(sum(allocation.allocated_value), 0)::numeric(15, 2)
      INTO v_waste_value
      FROM public.inventory_value_allocations AS allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = allocation.valuation_event_id
       AND event.tenant_id = allocation.tenant_id
      JOIN public.stock_movements AS movement
        ON movement.id = event.stock_movement_id
       AND movement.tenant_id = event.tenant_id
     WHERE allocation.tenant_id = v_tenant
       AND event.effective_at >= v_day_start
       AND event.effective_at < v_day_end
       AND movement.branch_id = p_branch_id
       AND movement.movement_subtype = 'writeoff';

    SELECT COALESCE(sum(allocation.allocated_value), 0)::numeric(15, 2)
      INTO v_manual_consumption_value
      FROM public.inventory_value_allocations AS allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = allocation.valuation_event_id
       AND event.tenant_id = allocation.tenant_id
      JOIN public.stock_movements AS movement
        ON movement.id = event.stock_movement_id
       AND movement.tenant_id = event.tenant_id
     WHERE allocation.tenant_id = v_tenant
       AND event.effective_at >= v_day_start
       AND event.effective_at < v_day_end
       AND movement.branch_id = p_branch_id
       AND movement.type = 'consumption'
       AND COALESCE(movement.movement_subtype, '') NOT IN (
         'sale_consumption', 'writeoff', 'sale_consumption_restore'
       )
       AND movement.order_id IS NULL;

    WITH allocation_impacts AS (
      SELECT
        event.effective_at,
        coalesce(to_account.branch_id, from_account.branch_id) AS event_branch_id,
        CASE
          WHEN to_account.id IS NOT NULL THEN allocation.allocated_value
          WHEN from_account.id IS NOT NULL THEN -allocation.allocated_value
          ELSE 0::numeric
        END AS value_impact
      FROM public.inventory_value_allocations AS allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = allocation.valuation_event_id
       AND event.tenant_id = allocation.tenant_id
      LEFT JOIN public.inventory_origin_balances AS to_balance
        ON to_balance.id = allocation.to_balance_id
       AND to_balance.tenant_id = allocation.tenant_id
      LEFT JOIN public.inventory_valuation_accounts AS to_account
        ON to_account.id = to_balance.valuation_account_id
       AND to_account.tenant_id = to_balance.tenant_id
      LEFT JOIN public.inventory_origin_balances AS from_balance
        ON from_balance.id = allocation.from_balance_id
       AND from_balance.tenant_id = allocation.tenant_id
      LEFT JOIN public.inventory_valuation_accounts AS from_account
        ON from_account.id = from_balance.valuation_account_id
       AND from_account.tenant_id = from_balance.tenant_id
      WHERE allocation.tenant_id = v_tenant
        AND coalesce(to_account.branch_id, from_account.branch_id) = p_branch_id
    )
    SELECT
      coalesce(sum(impact.value_impact) FILTER (
        WHERE impact.effective_at < v_day_start
      ), 0)::numeric(15, 2),
      coalesce(sum(impact.value_impact) FILTER (
        WHERE impact.effective_at < v_day_end
      ), 0)::numeric(15, 2)
    INTO v_inventory_opening, v_inventory_closing
    FROM allocation_impacts AS impact;

    v_inventory_change := COALESCE(v_inventory_closing, 0) - COALESCE(v_inventory_opening, 0);
    v_operating_result := v_net_revenue - v_goods_in - v_operating_expense + v_inventory_change;

    WITH paid_order_ids AS (
      SELECT DISTINCT payment.order_id AS id
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
    needs_recipe AS (
      SELECT DISTINCT item.order_id
      FROM public.order_items AS item
      JOIN paid_order_ids AS paid
        ON paid.id = item.order_id
      WHERE item.tenant_id = v_tenant
        AND item.status <> 'cancelled'
        AND EXISTS (
          SELECT 1
          FROM public.recipes AS recipe
          WHERE recipe.tenant_id = item.tenant_id
            AND recipe.menu_item_id = item.menu_item_id
        )
    ),
    covered_alloc AS (
      SELECT DISTINCT movement.order_id
      FROM public.inventory_value_allocations AS allocation
      JOIN public.inventory_valuation_events AS event
        ON event.id = allocation.valuation_event_id
       AND event.tenant_id = allocation.tenant_id
      JOIN public.stock_movements AS movement
        ON movement.id = event.stock_movement_id
       AND movement.tenant_id = event.tenant_id
      WHERE allocation.tenant_id = v_tenant
        AND allocation.allocation_bucket = 'food_cost'
        AND movement.branch_id = p_branch_id
        AND movement.order_id IS NOT NULL
        AND event.effective_at >= v_day_start
        AND event.effective_at < v_day_end
    )
    SELECT count(*)
      INTO v_covered_orders
      FROM paid_order_ids AS paid
     WHERE paid.id IN (SELECT covered_alloc.order_id FROM covered_alloc)
        OR paid.id NOT IN (SELECT needs_recipe.order_id FROM needs_recipe);

    v_food_cost_coverage := v_paid_orders = 0 OR v_covered_orders >= v_paid_orders;
    IF v_food_cost_coverage THEN
      v_gross_profit := v_net_revenue - v_food_cost;
      IF v_net_revenue > 0 THEN
        v_gross_margin := round((v_gross_profit / v_net_revenue) * 100, 2);
      ELSE
        v_gross_margin := 0;
      END IF;
    ELSE
      v_gross_profit := NULL;
      v_gross_margin := NULL;
    END IF;
  ELSE
    v_food_cost := NULL;
    v_food_cost_coverage := v_paid_orders = 0;
    v_gross_profit := NULL;
    v_gross_margin := NULL;
    v_goods_in := NULL;
    v_inventory_opening := NULL;
    v_inventory_closing := NULL;
    v_inventory_change := NULL;
    v_operating_result := NULL;
    v_sale_consumption_value := NULL;
    v_manual_consumption_value := NULL;
    v_waste_value := NULL;
  END IF;

  RETURN jsonb_build_object(
    'business_date', p_business_date,
    'day_start', v_day_start,
    'day_end', v_day_end,
    'valuation_active', v_valuation_active,
    'net_revenue', v_net_revenue,
    'money_collected', v_money_collected,
    'cash_revenue', v_cash_revenue,
    'noncash_revenue', v_noncash_revenue,
    'payment_mix', v_payment_mix,
    'paid_orders', v_paid_orders,
    'unpaid_orders', v_unpaid_orders,
    'food_cost', v_food_cost,
    'food_cost_coverage', v_food_cost_coverage,
    'gross_profit', v_gross_profit,
    'gross_margin', v_gross_margin,
    'goods_in', v_goods_in,
    'operating_expense', v_operating_expense,
    'inventory_opening', v_inventory_opening,
    'inventory_closing', v_inventory_closing,
    'inventory_change', v_inventory_change,
    'operating_result', v_operating_result,
    'sale_consumption_value', v_sale_consumption_value,
    'manual_consumption_value', v_manual_consumption_value,
    'waste_value', v_waste_value,
    'top_items', v_top_items,
    'closed_session_count', v_closed_session_count,
    'open_session_count', v_open_session_count
  );
END;
$_$;

COMMENT ON FUNCTION public.get_branch_day_report(p_branch_id bigint, p_business_date date) IS 'Daily operational and financial performance summary for a branch.';
