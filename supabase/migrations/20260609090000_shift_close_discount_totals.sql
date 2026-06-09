-- Phiếu chốt ca: expose paid-order discount total and sort sold-item
-- breakdown by revenue desc. This is a forward migration; do not edit the
-- production baseline.

CREATE OR REPLACE FUNCTION public.enqueue_shift_close_print(p_session_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                 UUID;
  v_session             RECORD;
  v_branch              RECORD;
  v_cashier_name        TEXT;
  v_approver_name       TEXT;
  v_branch_tax          TEXT;
  v_printer_id          BIGINT;
  v_breakdown           JSONB;
  v_total_revenue       NUMERIC(15,2);
  v_discount_total      NUMERIC(15,2);
  v_item_breakdown      JSONB;
  v_total_item_quantity INT;
  v_payload             JSONB;
  v_idempotency         TEXT;
  v_job_id              BIGINT;
  v_now                 TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, opening_cash, closing_cash,
         expected_cash, cash_difference, opened_at, closed_at, closed_by,
         note, variance_approval_note, variance_approver_user_id
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'session not closed yet' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('pos:close_shift') THEN
    RAISE EXCEPTION 'permission denied: pos:close_shift' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_session.branch_id;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_session.closed_by;

  IF v_session.variance_approver_user_id IS NOT NULL THEN
    SELECT full_name INTO v_approver_name
    FROM public.profiles WHERE id = v_session.variance_approver_user_id;
  END IF;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_session.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_session.tenant_id,
    v_session.branch_id,
    'shift_close_report'
  );

  IF v_printer_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'method',  payment_method,
      'count',   cnt,
      'amount',  amount
    ) ORDER BY payment_method), '[]'::jsonb),
    COALESCE(SUM(amount), 0)
  INTO v_breakdown, v_total_revenue
  FROM (
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*) AS cnt,
      SUM(total_amount) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) AS grp;

  SELECT COALESCE(SUM(discount_amount), 0)
  INTO v_discount_total
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id
    AND payment_status = 'paid'
    AND status <> 'cancelled';

  WITH paid_items AS (
    SELECT
      oi.item_name,
      oi.quantity,
      oi.unit_price,
      CASE
        WHEN jsonb_typeof(oi.modifiers) = 'array' THEN oi.modifiers
        ELSE '[]'::jsonb
      END AS modifiers,
      CASE
        WHEN jsonb_typeof(oi.sides) = 'array' THEN oi.sides
        ELSE '[]'::jsonb
      END AS sides
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.pos_session_id = p_session_id
      AND o.tenant_id = v_session.tenant_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ),
  item_unit_prices AS (
    SELECT
      pi.item_name,
      pi.quantity,
      pi.unit_price,
      pi.modifiers,
      pi.sides,
      COALESCE((
        SELECT SUM(COALESCE(NULLIF(m->>'price', '')::numeric, 0))
        FROM jsonb_array_elements(pi.modifiers) AS m
      ), 0) AS modifier_unit_sum,
      COALESCE((
        SELECT SUM(
          COALESCE(NULLIF(s->>'price', '')::numeric, 0)
          * COALESCE(NULLIF(s->>'quantity', '')::numeric, 1)
        )
        FROM jsonb_array_elements(pi.sides) AS s
      ), 0) AS side_unit_sum
    FROM paid_items pi
  ),
  main_agg AS (
    SELECT
      item_name AS name,
      'main'::TEXT AS source,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(GREATEST(0, COALESCE(unit_price, 0) - modifier_unit_sum - side_unit_sum) * COALESCE(quantity, 0)), 0) AS revenue,
      1 AS source_order
    FROM item_unit_prices
    GROUP BY item_name
  ),
  side_agg AS (
    SELECT
      COALESCE(NULLIF(s->>'name', ''), NULLIF(s->>'side_item_name', ''), 'Side')::TEXT AS name,
      'side'::TEXT AS source,
      COALESCE(SUM(COALESCE(NULLIF(s->>'quantity', '')::numeric, 1) * COALESCE(pi.quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(
        COALESCE(NULLIF(s->>'price', '')::numeric, 0)
        * COALESCE(NULLIF(s->>'quantity', '')::numeric, 1)
        * COALESCE(pi.quantity, 0)
      ), 0) AS revenue,
      2 AS source_order
    FROM item_unit_prices pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS s
    GROUP BY COALESCE(NULLIF(s->>'name', ''), NULLIF(s->>'side_item_name', ''), 'Side')
  ),
  mod_agg AS (
    SELECT
      COALESCE(NULLIF(m->>'name', ''), 'Modifier')::TEXT AS name,
      'modifier'::TEXT AS source,
      COALESCE(SUM(COALESCE(pi.quantity, 0)), 0)::INT AS qty,
      COALESCE(SUM(COALESCE(NULLIF(m->>'price', '')::numeric, 0) * COALESCE(pi.quantity, 0)), 0) AS revenue,
      3 AS source_order
    FROM item_unit_prices pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.modifiers) AS m
    GROUP BY COALESCE(NULLIF(m->>'name', ''), 'Modifier')
  ),
  all_items AS (
    SELECT name, source, qty, revenue, source_order FROM main_agg
    UNION ALL
    SELECT name, source, qty, revenue, source_order FROM side_agg
    UNION ALL
    SELECT name, source, qty, revenue, source_order FROM mod_agg
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', name,
        'source', source,
        'qty', qty,
        'revenue', revenue
      )
      ORDER BY revenue DESC, qty DESC, source_order, name
    ), '[]'::jsonb),
    COALESCE(SUM(qty), 0)::INT
  INTO v_item_breakdown, v_total_item_quantity
  FROM all_items;

  v_payload := jsonb_build_object(
    'kind',                  'shift_close_report',
    'branch_name',           COALESCE(v_branch.name, ''),
    'branch_address',        COALESCE(v_branch.address, ''),
    'branch_phone',          COALESCE(v_branch.phone, ''),
    'branch_tax_code',       COALESCE(v_branch_tax, ''),
    'session_id',            p_session_id,
    'cashier_name',          COALESCE(v_cashier_name, ''),
    'opened_at',             to_char(v_session.opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'closed_at',             to_char(v_session.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'opening_cash',          v_session.opening_cash,
    'closing_cash',          v_session.closing_cash,
    'expected_cash',         v_session.expected_cash,
    'cash_difference',       v_session.cash_difference,
    'note',                  v_session.note,
    'variance_note',         v_session.variance_approval_note,
    'variance_approver',     v_approver_name,
    'paid_order_count',      (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND payment_status = 'paid'
         AND status <> 'cancelled'
    ),
    'unpaid_order_count',    (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND payment_status <> 'paid'
         AND status <> 'cancelled'
    ),
    'cancelled_order_count', (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND tenant_id = v_session.tenant_id
         AND status = 'cancelled'
    ),
    'payment_breakdown',     v_breakdown,
    'total_revenue',         v_total_revenue,
    'discount_total',        COALESCE(v_discount_total, 0),
    'total_item_quantity',   COALESCE(v_total_item_quantity, 0),
    'item_breakdown',        COALESCE(v_item_breakdown, '[]'::jsonb),
    'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'session:' || p_session_id::TEXT || ':shift_close';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_session.tenant_id, v_session.branch_id, v_printer_id, 'shift_close_report',
    NULL, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    status  = CASE WHEN public.print_jobs.status IN ('failed', 'expired')
                   THEN 'pending' ELSE public.print_jobs.status END,
    last_error = NULL,
    claimed_by_agent = NULL,
    claimed_at = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

COMMENT ON FUNCTION public.enqueue_shift_close_print(p_session_id bigint) IS
  'Enqueue data-driven shift-close print payload. Includes paid-order discount_total and sold-item breakdown ordered by revenue desc.';

CREATE OR REPLACE FUNCTION public.print_template_shift_summary_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_paid NUMERIC := public.print_template_payload_number(p_payload, 'paid_order_count');
  v_unpaid NUMERIC := public.print_template_payload_number(p_payload, 'unpaid_order_count');
  v_cancelled NUMERIC := public.print_template_payload_number(p_payload, 'cancelled_order_count');
  v_revenue NUMERIC := public.print_template_payload_number(p_payload, 'total_revenue');
  v_discount NUMERIC := public.print_template_payload_number(p_payload, 'discount_total');
BEGIN
  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('='),
    public.print_template_text_block('TỔNG KẾT CA', 'center', true),
    public.print_template_divider_block('-'),
    public.print_template_row_block(
      'TỔNG ĐÃ THU',
      public.print_template_money(v_revenue),
      true,
      true
    )
  );

  IF v_discount > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Chiết khấu',
        '-' || public.print_template_money(v_discount)
      )
    );
  END IF;

  v_out := v_out || jsonb_build_array(
    public.print_template_row_block(
      'Đơn đã thu tiền',
      trim(to_char(v_paid, 'FM999999')) || ' đơn'
    )
  );

  IF v_unpaid > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn chưa thu/chuyển ca',
        trim(to_char(v_unpaid, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  IF v_cancelled > 0 THEN
    v_out := v_out || jsonb_build_array(
      public.print_template_row_block(
        'Đơn đã hủy',
        trim(to_char(v_cancelled, 'FM999999')) || ' đơn'
      )
    );
  END IF;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.print_template_shift_summary_blocks(p_payload jsonb) IS
  'Build shift-close summary print blocks. Displays discount_total when present.';

CREATE OR REPLACE FUNCTION public.print_template_shift_item_breakdown_blocks(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_out JSONB := '[]'::jsonb;
  v_items JSONB := CASE
    WHEN jsonb_typeof(p_payload->'item_breakdown') = 'array' THEN p_payload->'item_breakdown'
    ELSE '[]'::jsonb
  END;
  v_row JSONB;
  v_name TEXT;
  v_display_name TEXT;
  v_qty NUMERIC;
  v_revenue NUMERIC;
  v_total NUMERIC := 0;
  v_name_width CONSTANT INT := 27;
  v_qty_width CONSTANT INT := 5;
  v_amount_width CONSTANT INT := 16;
BEGIN
  IF jsonb_array_length(v_items) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT COALESCE(SUM(COALESCE(NULLIF(value->>'qty', '')::numeric, 0)), 0)
  INTO v_total
  FROM jsonb_array_elements(v_items);

  v_out := v_out || jsonb_build_array(
    public.print_template_divider_block('-'),
    public.print_template_text_block('SỐ LƯỢNG BÁN THEO MÓN', 'center', true),
    public.print_template_row_block('Tổng SL bán', trim(to_char(v_total, 'FM999999'))),
    public.print_template_divider_block('-'),
    public.print_template_text_block(
      rpad('Món', v_name_width)
      || lpad('SL', v_qty_width)
      || lpad('Thành tiền', v_amount_width),
      NULL,
      true
    ),
    public.print_template_divider_block('-')
  );

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_items)
    ORDER BY
      COALESCE(NULLIF(value->>'revenue', '')::numeric, 0) DESC,
      COALESCE(NULLIF(value->>'qty', '')::numeric, 0) DESC,
      COALESCE(NULLIF(value->>'name', ''), 'Món')
  LOOP
    v_name := COALESCE(NULLIF(v_row->>'name', ''), 'Món');
    v_display_name := CASE
      WHEN char_length(v_name) > v_name_width THEN left(v_name, v_name_width - 1) || '.'
      ELSE v_name
    END;
    v_qty := COALESCE(NULLIF(v_row->>'qty', '')::numeric, 0);
    v_revenue := COALESCE(NULLIF(v_row->>'revenue', '')::numeric, 0);

    v_out := v_out || jsonb_build_array(
      public.print_template_text_block(
        rpad(v_display_name, v_name_width)
        || lpad(trim(to_char(v_qty, 'FM999999')), v_qty_width)
        || lpad(public.print_template_money(v_revenue), v_amount_width)
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.print_template_shift_item_breakdown_blocks(p_payload jsonb) IS
  'Build shift-close sold-item breakdown blocks ordered by revenue desc.';
