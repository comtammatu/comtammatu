-- =============================================================
-- POS Session Report — read-only aggregate RPC
--
-- Cung cấp 1 round-trip aggregate cho 1 ca POS để branch_manager+ nắm
-- đầy đủ thông tin mà SessionDetailCard hiện tại còn thiếu:
--   * Top items có decompose combo (main + sides + modifiers như món riêng)
--   * Breakdown theo category
--   * Tổng số món bao gồm modifier (owner D1+D2 cơm tấm, 2026-04-30)
--   * AOV + distribution bins
--   * Peak hour theo Asia/Ho_Chi_Minh (KHÔNG UTC — POS-CLOSE-SHIFT-PEAK-HOUR-VN-TZ)
--   * Discount summary + top discounted bills
--   * Void item count (cancelled order_items, không phải cancelled order)
--
-- Owner decisions (2026-04-30):
--   1. Combo decompose: CÓ — sides JSONB là combo components, decompose
--      thành món con riêng trong top_items.
--   2. Modifier vào tổng món: CÓ — modifier (vd "thêm trứng") cộng vào
--      total_items count.
--   3. Tip: KHÔNG track (chưa có cột; bỏ qua).
--   4. Reason enum: KHÔNG — discount_note giữ free-text.
--   5. Debt method: KHÔNG — chỉ cash/vietqr/momo, unpaid carry-forward.
--   6. Cashier không xem report — page hiện đã gate qua
--      canManageBranchFloorSettings (super/area/branch_manager).
--   7. Phiếu in giữ nguyên — KHÔNG mở rộng payload-schema.
--
-- Architecture: Option A (4-agent debate) — single SECURITY INVOKER RPC
-- trả JSONB. KHÔNG snapshot table — closed sessions effectively immutable
-- (orders.payment_status='paid' không còn mutate; refund qua reversal có
-- audit riêng). Skip materialized view (RLS-NOT-APPLIED-ON-MV).
--
-- Reference: tasks/regressions.md
--   POS-CLOSE-SHIFT-CASH-ONLY-EXPECTED (cash vs noncash split)
--   POS-CLOSE-SHIFT-PAID-FILTER-AND-VARIANCE-GATE (paid filter)
-- =============================================================

-- ─── 1. Indexes ──────────────────────────────────────────────────────────

-- Covering filter cho mọi aggregate query trong RPC.
CREATE INDEX IF NOT EXISTS idx_orders_pos_session_payment_status
  ON public.orders(pos_session_id, payment_status, status)
  WHERE pos_session_id IS NOT NULL;

-- Hourly bucket / peak-hour grouping.
CREATE INDEX IF NOT EXISTS idx_orders_pos_session_created_at
  ON public.orders(pos_session_id, created_at)
  WHERE pos_session_id IS NOT NULL;


-- ─── 2. RPC ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_pos_session_report(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_session              RECORD;
  v_totals               RECORD;
  v_payment_mix          JSONB;
  v_top_items            JSONB;
  v_categories           JSONB;
  v_total_items          INT;
  v_hourly               JSONB;
  v_peak_hour            JSONB;
  v_aov_bins             JSONB;
  v_discount_count       INT;
  v_discount_total       NUMERIC(15,2);
  v_top_discount_orders  JSONB;
  v_void_item_count      INT;
BEGIN
  -- ─── Load session (RLS filters cross-tenant; defense-in-depth check below)
  SELECT
    s.id, s.tenant_id, s.branch_id, s.terminal_id,
    s.opened_at, s.closed_at, s.opening_cash, s.closing_cash,
    s.expected_cash, s.cash_difference, s.status, s.note,
    s.variance_approval_note,
    t.name AS terminal_name,
    pop.full_name AS opened_by_name,
    pcl.full_name AS closed_by_name
  INTO v_session
  FROM public.pos_sessions s
  LEFT JOIN public.pos_terminals t  ON t.id  = s.terminal_id
  LEFT JOIN public.profiles pop     ON pop.id = s.opened_by
  LEFT JOIN public.profiles pcl     ON pcl.id = s.closed_by
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- ─── 1. Totals + bill counts (single pass over orders)
  SELECT
    COUNT(*) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
    ) AS paid_count,
    COUNT(*) FILTER (
      WHERE payment_status <> 'paid' AND status <> 'cancelled'
    ) AS unpaid_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
    COALESCE(SUM(subtotal) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
    ), 0) AS gross,
    COALESCE(SUM(discount_amount) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
    ), 0) AS discount_total,
    COALESCE(SUM(tax_amount) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
    ), 0) AS tax_total,
    COALESCE(SUM(service_charge) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
    ), 0) AS service_total,
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
    ), 0) AS net,
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
        AND payment_method = 'cash'
    ), 0) AS cash_revenue,
    COALESCE(SUM(total_amount) FILTER (
      WHERE payment_status = 'paid' AND status <> 'cancelled'
        AND (payment_method IS NULL OR payment_method <> 'cash')
    ), 0) AS noncash_revenue
  INTO v_totals
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id;

  -- ─── 2. Payment mix
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'method', payment_method,
      'count',  cnt,
      'amount', amount
    ) ORDER BY amount DESC
  ), '[]'::JSONB)
  INTO v_payment_mix
  FROM (
    SELECT
      payment_method,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) pm;

  -- ─── 3. Item decomposition: main + sides + modifiers
  -- Owner D1+D2: combo decompose (sides as separate items), modifier vào
  -- tổng món count.
  WITH paid_items AS (
    SELECT
      oi.menu_item_id, oi.item_name,
      mi.category_id, mc.name AS category_name,
      oi.quantity, oi.subtotal, oi.modifiers, oi.sides
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN public.menu_items mi      ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
    WHERE o.pos_session_id = p_session_id
      AND o.tenant_id = v_session.tenant_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND oi.status <> 'cancelled'
  ),
  main_agg AS (
    SELECT
      item_name AS name,
      'main'::TEXT AS source,
      COALESCE(SUM(quantity), 0)::INT AS qty,
      COALESCE(SUM(subtotal), 0) AS revenue
    FROM paid_items
    GROUP BY item_name
  ),
  side_agg AS (
    SELECT
      COALESCE(s ->> 'name', 'Side')::TEXT AS name,
      'side'::TEXT AS source,
      COALESCE(SUM(
        COALESCE((s ->> 'quantity')::INT, 1) * pi.quantity
      ), 0)::INT AS qty,
      COALESCE(SUM(
        COALESCE((s ->> 'price')::NUMERIC, 0)
        * COALESCE((s ->> 'quantity')::INT, 1)
        * pi.quantity
      ), 0) AS revenue
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.sides) AS s
    GROUP BY s ->> 'name'
  ),
  mod_agg AS (
    SELECT
      COALESCE(m ->> 'name', 'Modifier')::TEXT AS name,
      'modifier'::TEXT AS source,
      COALESCE(SUM(pi.quantity), 0)::INT AS qty,
      COALESCE(SUM(
        COALESCE((m ->> 'price')::NUMERIC, 0) * pi.quantity
      ), 0) AS revenue
    FROM paid_items pi
    CROSS JOIN LATERAL jsonb_array_elements(pi.modifiers) AS m
    GROUP BY m ->> 'name'
  ),
  all_items AS (
    SELECT name, source, qty, revenue FROM main_agg
    UNION ALL
    SELECT name, source, qty, revenue FROM side_agg
    UNION ALL
    SELECT name, source, qty, revenue FROM mod_agg
  ),
  cat_agg AS (
    SELECT
      COALESCE(category_id, 0) AS category_id,
      COALESCE(category_name, 'Khác') AS category_name,
      COALESCE(SUM(quantity), 0)::INT AS qty,
      COALESCE(SUM(subtotal), 0) AS revenue
    FROM paid_items
    GROUP BY category_id, category_name
  )
  SELECT
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'name', name, 'source', source,
          'qty', qty, 'revenue', revenue
        ) ORDER BY qty DESC, revenue DESC
      ), '[]'::JSONB)
      FROM (
        SELECT name, source, qty, revenue
        FROM all_items
        ORDER BY qty DESC, revenue DESC
        LIMIT 10
      ) ti
    ),
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'category_id', category_id,
          'category_name', category_name,
          'qty', qty, 'revenue', revenue
        ) ORDER BY revenue DESC
      ), '[]'::JSONB)
      FROM cat_agg
    ),
    COALESCE((SELECT SUM(qty) FROM all_items), 0)::INT
  INTO v_top_items, v_categories, v_total_items;

  -- ─── 4. Hourly bucket — Asia/Ho_Chi_Minh (POS-CLOSE-SHIFT-PEAK-HOUR-VN-TZ)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('hour', hour, 'order_count', cnt, 'revenue', revenue)
    ORDER BY hour
  ), '[]'::JSONB)
  INTO v_hourly
  FROM (
    SELECT
      EXTRACT(
        HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
      )::INT AS hour,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY 1
  ) h;

  SELECT
    CASE WHEN cnt > 0 THEN
      jsonb_build_object(
        'hour', hour, 'order_count', cnt, 'revenue', revenue
      )
    ELSE NULL END
  INTO v_peak_hour
  FROM (
    SELECT
      EXTRACT(
        HOUR FROM (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
      )::INT AS hour,
      COUNT(*)::INT AS cnt,
      COALESCE(SUM(total_amount), 0) AS revenue
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY 1
    ORDER BY revenue DESC, cnt DESC
    LIMIT 1
  ) p;

  -- ─── 5. AOV bins
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', label, 'count', cnt) ORDER BY ord
  ), '[]'::JSONB)
  INTO v_aov_bins
  FROM (
    SELECT label, ord, COUNT(*)::INT AS cnt
    FROM (
      SELECT
        CASE
          WHEN total_amount <= 50000  THEN '≤50.000đ'
          WHEN total_amount <= 100000 THEN '50.000–100.000đ'
          WHEN total_amount <= 200000 THEN '100.000–200.000đ'
          WHEN total_amount <= 500000 THEN '200.000–500.000đ'
          ELSE '>500.000đ'
        END AS label,
        CASE
          WHEN total_amount <= 50000  THEN 1
          WHEN total_amount <= 100000 THEN 2
          WHEN total_amount <= 200000 THEN 3
          WHEN total_amount <= 500000 THEN 4
          ELSE 5
        END AS ord
      FROM public.orders
      WHERE pos_session_id = p_session_id
        AND tenant_id = v_session.tenant_id
        AND payment_status = 'paid'
        AND status <> 'cancelled'
    ) b
    GROUP BY label, ord
  ) g;

  -- ─── 6. Discount summary + top 10 discounted bills
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(discount_amount), 0)
  INTO v_discount_count, v_discount_total
  FROM public.orders
  WHERE pos_session_id = p_session_id
    AND tenant_id = v_session.tenant_id
    AND discount_amount > 0
    AND status <> 'cancelled';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id',     order_id,
      'order_number', order_number,
      'amount',       amount,
      'note',         note,
      'type',         type,
      'value',        value
    ) ORDER BY amount DESC
  ), '[]'::JSONB)
  INTO v_top_discount_orders
  FROM (
    SELECT
      id              AS order_id,
      order_number,
      discount_amount AS amount,
      discount_note   AS note,
      discount_type   AS type,
      discount_value  AS value
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND tenant_id = v_session.tenant_id
      AND discount_amount > 0
      AND status <> 'cancelled'
    ORDER BY discount_amount DESC
    LIMIT 10
  ) d;

  -- ─── 7. Void item count (cancelled order_items inside session orders)
  SELECT COUNT(*)::INT
  INTO v_void_item_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.pos_session_id = p_session_id
    AND o.tenant_id = v_session.tenant_id
    AND oi.status = 'cancelled';

  -- ─── 8. Build response
  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id',                     v_session.id,
      'opened_at',              v_session.opened_at,
      'closed_at',              v_session.closed_at,
      'status',                 v_session.status,
      'terminal_name',          v_session.terminal_name,
      'opened_by_name',         v_session.opened_by_name,
      'closed_by_name',         v_session.closed_by_name,
      'opening_cash',           v_session.opening_cash,
      'closing_cash',           v_session.closing_cash,
      'expected_cash',          v_session.expected_cash,
      'cash_difference',        v_session.cash_difference,
      'note',                   v_session.note,
      'variance_approval_note', v_session.variance_approval_note
    ),
    'totals', jsonb_build_object(
      'gross_revenue',         v_totals.gross,
      'discount_total',        v_totals.discount_total,
      'tax_total',             v_totals.tax_total,
      'service_charge_total',  v_totals.service_total,
      'net_revenue',           v_totals.net,
      'cash_revenue',          v_totals.cash_revenue,
      'noncash_revenue',       v_totals.noncash_revenue,
      'paid_order_count',      v_totals.paid_count,
      'unpaid_order_count',    v_totals.unpaid_count,
      'cancelled_order_count', v_totals.cancelled_count,
      'void_item_count',       v_void_item_count,
      'total_items',           v_total_items,
      'aov',                   CASE
        WHEN v_totals.paid_count > 0
        THEN ROUND(v_totals.net / v_totals.paid_count, 2)
        ELSE 0
      END
    ),
    'payment_mix',         v_payment_mix,
    'top_items',           v_top_items,
    'category_breakdown',  v_categories,
    'aov_bins',            v_aov_bins,
    'hourly',              v_hourly,
    'peak_hour',           v_peak_hour,
    'discounts', jsonb_build_object(
      'count',      v_discount_count,
      'total',      v_discount_total,
      'top_orders', v_top_discount_orders
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pos_session_report(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pos_session_report(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.get_pos_session_report(BIGINT) IS
  'Aggregate read-only report cho 1 ca POS. SECURITY INVOKER + tenant '
  'recheck. Decompose combo (sides + modifiers as separate items). Hourly '
  'theo Asia/Ho_Chi_Minh tz (POS-CLOSE-SHIFT-PEAK-HOUR-VN-TZ). Filter '
  'payment_status=paid + status<>cancelled cho mọi revenue metric '
  '(POS-CLOSE-SHIFT-PAID-FILTER). Cash vs noncash split '
  '(POS-CLOSE-SHIFT-CASH-ONLY-EXPECTED). Returns JSONB.';
