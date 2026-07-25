CREATE OR REPLACE FUNCTION public.get_revenue_by_hour(
  p_branch_id bigint DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  dow smallint,
  hour smallint,
  order_count bigint,
  net_revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_start_date > p_end_date
    OR (p_end_date - p_start_date) + 1 > 90
  THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  SELECT scope.has_tenant_scope, scope.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') scope;

  IF p_branch_id IS NULL THEN
    IF NOT (
      v_has_tenant_scope
      OR COALESCE(cardinality(v_branch_ids), 0) > 0
    ) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    v_has_tenant_scope
    OR p_branch_id = ANY(COALESCE(v_branch_ids, ARRAY[]::bigint[]))
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  v_start_utc :=
    p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc :=
    (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT
    EXTRACT(
      DOW FROM payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::smallint,
    EXTRACT(
      HOUR FROM payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )::smallint,
    count(DISTINCT payment.order_id)::bigint,
    COALESCE(sum(payment.amount), 0)::numeric
  FROM public.payments payment
  JOIN public.orders orders
    ON orders.id = payment.order_id
   AND orders.tenant_id = payment.tenant_id
   AND orders.branch_id = payment.branch_id
  WHERE payment.tenant_id = v_tenant
    AND payment.status = 'completed'
    AND payment.paid_at >= v_start_utc
    AND payment.paid_at < v_end_utc
    AND (
      (p_branch_id IS NOT NULL AND payment.branch_id = p_branch_id)
      OR (
        p_branch_id IS NULL
        AND (
          v_has_tenant_scope
          OR payment.branch_id = ANY(
            COALESCE(v_branch_ids, ARRAY[]::bigint[])
          )
        )
      )
    )
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_by_hour(bigint, date, date) IS
  'Hourly collected revenue from completed payments, bucketed by payments.paid_at in Asia/Ho_Chi_Minh. Order mirror state never suppresses payment truth.';

CREATE OR REPLACE FUNCTION public.get_revenue_by_cashier(
  p_branch_id bigint DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  cashier_id uuid,
  cashier_name text,
  order_count bigint,
  net_revenue numeric,
  cash_revenue numeric,
  qr_revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_start_date > p_end_date
    OR (p_end_date - p_start_date) + 1 > 90
  THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  SELECT scope.has_tenant_scope, scope.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') scope;

  IF p_branch_id IS NULL THEN
    IF NOT (
      v_has_tenant_scope
      OR COALESCE(cardinality(v_branch_ids), 0) > 0
    ) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    v_has_tenant_scope
    OR p_branch_id = ANY(COALESCE(v_branch_ids, ARRAY[]::bigint[]))
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  v_start_utc :=
    p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc :=
    (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH scoped AS (
    SELECT
      payment.order_id,
      payment.method,
      payment.amount,
      COALESCE(session.opened_by, payment.created_by) AS cashier_id
    FROM public.payments payment
    JOIN public.orders orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
     AND orders.branch_id = payment.branch_id
    LEFT JOIN public.pos_sessions session
      ON session.id = orders.pos_session_id
     AND session.tenant_id = orders.tenant_id
     AND session.branch_id = orders.branch_id
    WHERE payment.tenant_id = v_tenant
      AND payment.status = 'completed'
      AND payment.paid_at >= v_start_utc
      AND payment.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND payment.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR payment.branch_id = ANY(
              COALESCE(v_branch_ids, ARRAY[]::bigint[])
            )
          )
        )
      )
  ),
  totals AS (
    SELECT
      scoped.cashier_id,
      count(DISTINCT scoped.order_id)::bigint AS order_count,
      COALESCE(sum(scoped.amount), 0)::numeric AS net_revenue,
      COALESCE(sum(scoped.amount) FILTER (
        WHERE scoped.method = 'cash'
      ), 0)::numeric AS cash_revenue,
      COALESCE(sum(scoped.amount) FILTER (
        WHERE scoped.method = 'vietqr'
      ), 0)::numeric AS qr_revenue
    FROM scoped
    GROUP BY scoped.cashier_id
  )
  SELECT
    totals.cashier_id,
    COALESCE(profile.full_name, '— Không xác định')::text,
    totals.order_count,
    totals.net_revenue,
    totals.cash_revenue,
    totals.qr_revenue
  FROM totals
  LEFT JOIN public.profiles profile
    ON profile.id = totals.cashier_id
   AND profile.tenant_id = v_tenant
  ORDER BY totals.net_revenue DESC;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_by_cashier(bigint, date, date) IS
  'Cashier revenue from completed payment amounts. Order mirror state is reported in the daily drill instead of suppressing collected money.';

CREATE OR REPLACE FUNCTION public.get_revenue_kpis(
  p_branch_id bigint,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  net_revenue numeric,
  subtotal_revenue numeric,
  discount_amount numeric,
  total_tax numeric,
  vat_by_rate jsonb,
  vat_total numeric,
  order_count bigint,
  total_covers bigint,
  cash_revenue numeric,
  vietqr_revenue numeric,
  dine_in_revenue numeric,
  takeaway_revenue numeric,
  voided_amount numeric,
  voided_count bigint,
  refreshed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_start_date > p_end_date
  THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  SELECT scope.has_tenant_scope, scope.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') scope;

  IF p_branch_id IS NULL THEN
    IF NOT (
      v_has_tenant_scope
      OR COALESCE(cardinality(v_branch_ids), 0) > 0
    ) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    v_has_tenant_scope
    OR p_branch_id = ANY(COALESCE(v_branch_ids, ARRAY[]::bigint[]))
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  v_start_utc :=
    p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc :=
    (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH paid AS MATERIALIZED (
    SELECT
      payment.id AS payment_id,
      payment.order_id,
      payment.branch_id,
      payment.tenant_id,
      payment.method,
      payment.amount AS payment_amount,
      payment.paid_at,
      orders.total_amount,
      orders.subtotal,
      orders.discount_amount,
      orders.tax_amount,
      orders.order_type
    FROM public.payments payment
    JOIN public.orders orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
     AND orders.branch_id = payment.branch_id
    WHERE payment.tenant_id = v_tenant
      AND payment.status = 'completed'
      AND payment.paid_at >= v_start_utc
      AND payment.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND payment.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR payment.branch_id = ANY(
              COALESCE(v_branch_ids, ARRAY[]::bigint[])
            )
          )
        )
      )
  ),
  order_facts AS MATERIALIZED (
    SELECT DISTINCT ON (paid.tenant_id, paid.branch_id, paid.order_id)
      paid.order_id AS id,
      paid.tenant_id,
      paid.branch_id,
      paid.total_amount,
      paid.subtotal,
      paid.discount_amount,
      paid.tax_amount,
      paid.order_type
    FROM paid
    ORDER BY
      paid.tenant_id,
      paid.branch_id,
      paid.order_id,
      paid.paid_at,
      paid.payment_id
  ),
  payment_sales AS (
    SELECT
      COALESCE(sum(paid.payment_amount), 0)::numeric AS net_revenue,
      COALESCE(sum(paid.payment_amount) FILTER (
        WHERE paid.method = 'cash'
      ), 0)::numeric AS cash_revenue,
      COALESCE(sum(paid.payment_amount) FILTER (
        WHERE paid.method = 'vietqr'
      ), 0)::numeric AS vietqr_revenue,
      COALESCE(sum(paid.payment_amount) FILTER (
        WHERE paid.order_type = 'dine_in'
      ), 0)::numeric AS dine_in_revenue,
      COALESCE(sum(paid.payment_amount) FILTER (
        WHERE paid.order_type = 'takeaway'
      ), 0)::numeric AS takeaway_revenue
    FROM paid
  ),
  order_sales AS (
    SELECT
      COALESCE(sum(fact.subtotal), 0)::numeric AS subtotal_revenue,
      COALESCE(sum(fact.discount_amount), 0)::numeric AS discount_amount,
      COALESCE(sum(fact.tax_amount), 0)::numeric AS total_tax,
      count(*)::bigint AS order_count
    FROM order_facts fact
  ),
  vat_lines AS (
    SELECT
      round(item.vat_rate::numeric, 2) AS rate,
      sum(
        (item.subtotal * scale.scale)
          - (
            (item.subtotal * scale.scale)
              / (1 + item.vat_rate / 100)
          )
      ) AS vat
    FROM (
      SELECT
        fact.id AS order_id,
        fact.tenant_id,
        CASE
          WHEN sum(item.subtotal) > 0
            THEN fact.total_amount / sum(item.subtotal)
          ELSE 1
        END AS scale
      FROM order_facts fact
      JOIN public.order_items item
        ON item.tenant_id = fact.tenant_id
       AND item.order_id = fact.id
       AND item.status <> 'cancelled'
      GROUP BY fact.id, fact.tenant_id, fact.total_amount
    ) scale
    JOIN public.order_items item
      ON item.tenant_id = scale.tenant_id
     AND item.order_id = scale.order_id
     AND item.status <> 'cancelled'
    GROUP BY round(item.vat_rate::numeric, 2)
  ),
  vat_split AS (
    SELECT
      COALESCE(
        jsonb_object_agg(vat_lines.rate::text, vat_lines.vat),
        '{}'::jsonb
      ) AS vat_by_rate,
      COALESCE(sum(vat_lines.vat), 0)::numeric AS vat_total
    FROM vat_lines
  ),
  refunds AS (
    SELECT
      COALESCE(sum(payment.amount), 0)::numeric AS voided_amount,
      count(DISTINCT payment.order_id)::bigint AS voided_count
    FROM public.payments payment
    WHERE payment.tenant_id = v_tenant
      AND payment.status = 'refunded'
      AND payment.paid_at >= v_start_utc
      AND payment.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND payment.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR payment.branch_id = ANY(
              COALESCE(v_branch_ids, ARRAY[]::bigint[])
            )
          )
        )
      )
  )
  SELECT
    payment_sales.net_revenue,
    order_sales.subtotal_revenue,
    order_sales.discount_amount,
    order_sales.total_tax,
    vat_split.vat_by_rate,
    vat_split.vat_total,
    order_sales.order_count,
    order_sales.order_count,
    payment_sales.cash_revenue,
    payment_sales.vietqr_revenue,
    payment_sales.dine_in_revenue,
    payment_sales.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    now()
  FROM payment_sales
  CROSS JOIN order_sales
  CROSS JOIN vat_split
  CROSS JOIN refunds;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_kpis(bigint, date, date) IS
  'Finance KPIs whose collected-money fields come only from completed payments. Distinct-order sales facts remain visible even when the order payment mirror is stale.';

CREATE OR REPLACE FUNCTION public.get_revenue_rollup(
  p_branch_id bigint,
  p_start_date date,
  p_end_date date,
  p_granularity text
)
RETURNS TABLE (
  period_start date,
  period_end date,
  period_label text,
  branch_id bigint,
  order_count bigint,
  total_revenue numeric,
  total_tax numeric,
  subtotal_revenue numeric,
  discount_amount numeric,
  cash_revenue numeric,
  vietqr_revenue numeric,
  dine_in_revenue numeric,
  takeaway_revenue numeric,
  total_covers bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_granularity NOT IN ('day', 'week', 'month')
    OR p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_start_date > p_end_date
  THEN
    RAISE EXCEPTION 'invalid_revenue_scope' USING ERRCODE = '22023';
  END IF;

  SELECT scope.has_tenant_scope, scope.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') scope;

  IF p_branch_id IS NULL THEN
    IF NOT (
      v_has_tenant_scope
      OR COALESCE(cardinality(v_branch_ids), 0) > 0
    ) THEN
      RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    v_has_tenant_scope
    OR p_branch_id = ANY(COALESCE(v_branch_ids, ARRAY[]::bigint[]))
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  v_start_utc :=
    p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc :=
    (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH paid AS MATERIALIZED (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN (
          payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )::date
        WHEN 'week' THEN date_trunc(
          'week',
          payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )::date
        WHEN 'month' THEN date_trunc(
          'month',
          payment.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )::date
      END AS bucket_start,
      payment.id AS payment_id,
      payment.order_id,
      payment.branch_id,
      payment.tenant_id,
      payment.method,
      payment.amount,
      payment.paid_at,
      orders.total_amount,
      orders.tax_amount,
      orders.subtotal,
      orders.discount_amount,
      orders.order_type
    FROM public.payments payment
    JOIN public.orders orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
     AND orders.branch_id = payment.branch_id
    WHERE payment.tenant_id = v_tenant
      AND payment.status = 'completed'
      AND payment.paid_at >= v_start_utc
      AND payment.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND payment.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            v_has_tenant_scope
            OR payment.branch_id = ANY(
              COALESCE(v_branch_ids, ARRAY[]::bigint[])
            )
          )
        )
      )
  ),
  payment_buckets AS (
    SELECT
      paid.bucket_start,
      paid.branch_id,
      COALESCE(sum(paid.amount), 0)::numeric AS total_revenue,
      COALESCE(sum(paid.amount) FILTER (
        WHERE paid.method = 'cash'
      ), 0)::numeric AS cash_revenue,
      COALESCE(sum(paid.amount) FILTER (
        WHERE paid.method = 'vietqr'
      ), 0)::numeric AS vietqr_revenue,
      COALESCE(sum(paid.amount) FILTER (
        WHERE paid.order_type = 'dine_in'
      ), 0)::numeric AS dine_in_revenue,
      COALESCE(sum(paid.amount) FILTER (
        WHERE paid.order_type = 'takeaway'
      ), 0)::numeric AS takeaway_revenue
    FROM paid
    GROUP BY paid.bucket_start, paid.branch_id
  ),
  order_facts AS (
    SELECT DISTINCT ON (
      paid.bucket_start,
      paid.branch_id,
      paid.tenant_id,
      paid.order_id
    )
      paid.bucket_start,
      paid.branch_id,
      paid.tenant_id,
      paid.order_id,
      paid.tax_amount,
      paid.subtotal,
      paid.discount_amount
    FROM paid
    ORDER BY
      paid.bucket_start,
      paid.branch_id,
      paid.tenant_id,
      paid.order_id,
      paid.paid_at,
      paid.payment_id
  ),
  order_buckets AS (
    SELECT
      fact.bucket_start,
      fact.branch_id,
      count(*)::bigint AS order_count,
      COALESCE(sum(fact.tax_amount), 0)::numeric AS total_tax,
      COALESCE(sum(fact.subtotal), 0)::numeric AS subtotal_revenue,
      COALESCE(sum(fact.discount_amount), 0)::numeric AS discount_amount
    FROM order_facts fact
    GROUP BY fact.bucket_start, fact.branch_id
  )
  SELECT
    payment.bucket_start,
    CASE p_granularity
      WHEN 'day' THEN payment.bucket_start
      WHEN 'week' THEN payment.bucket_start + 6
      WHEN 'month' THEN (
        payment.bucket_start + INTERVAL '1 month - 1 day'
      )::date
    END,
    CASE p_granularity
      WHEN 'day' THEN to_char(payment.bucket_start, 'DD/MM/YYYY')
      WHEN 'week' THEN
        'Tuần ' || to_char(payment.bucket_start, 'IW') || ' ('
          || to_char(payment.bucket_start, 'DD/MM') || '-'
          || to_char(payment.bucket_start + 6, 'DD/MM/YYYY') || ')'
      WHEN 'month' THEN
        'Tháng ' || to_char(payment.bucket_start, 'MM/YYYY')
    END,
    payment.branch_id,
    orders.order_count,
    payment.total_revenue,
    orders.total_tax,
    orders.subtotal_revenue,
    orders.discount_amount,
    payment.cash_revenue,
    payment.vietqr_revenue,
    payment.dine_in_revenue,
    payment.takeaway_revenue,
    orders.order_count
  FROM payment_buckets payment
  JOIN order_buckets orders
    ON orders.bucket_start = payment.bucket_start
   AND orders.branch_id = payment.branch_id
  ORDER BY payment.bucket_start, payment.branch_id;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_rollup(
  bigint,
  date,
  date,
  text
) IS
  'Revenue rollup from completed payments and payments.paid_at. Order mirror state never suppresses collected money; daily drill exposes mismatches.';

CREATE OR REPLACE FUNCTION public.get_orders_summary(
  p_status text DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_count bigint,
  in_progress_count bigint,
  paid_count bigint,
  paid_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH allowed AS (
    SELECT branch.id
    FROM public.branches branch
    WHERE branch.tenant_id = public.auth_tenant_id()
      AND (
        public.has_permission(branch.id, 'orders:read')
        OR public.has_permission(branch.id, 'kds:use')
      )
  ),
  scoped_orders AS MATERIALIZED (
    SELECT orders.id, orders.tenant_id, orders.status
    FROM public.orders orders
    WHERE orders.tenant_id = public.auth_tenant_id()
      AND orders.branch_id IN (SELECT allowed.id FROM allowed)
      AND (p_status IS NULL OR orders.status = p_status)
      AND (p_branch_id IS NULL OR orders.branch_id = p_branch_id)
      AND (p_from IS NULL OR orders.created_at >= p_from)
      AND (p_to IS NULL OR orders.created_at < p_to)
  ),
  collected AS (
    SELECT
      payment.order_id,
      sum(payment.amount)::numeric AS amount
    FROM public.payments payment
    JOIN scoped_orders orders
      ON orders.id = payment.order_id
     AND orders.tenant_id = payment.tenant_id
    WHERE payment.status = 'completed'
      AND payment.paid_at IS NOT NULL
    GROUP BY payment.order_id
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (
      WHERE orders.status NOT IN ('completed', 'cancelled')
    )::bigint,
    count(collected.order_id)::bigint,
    COALESCE(sum(collected.amount), 0)::numeric(15, 2)
  FROM scoped_orders orders
  LEFT JOIN collected
    ON collected.order_id = orders.id;
$$;

COMMENT ON FUNCTION public.get_orders_summary(
  text,
  bigint,
  timestamptz,
  timestamptz
) IS
  'Order-list counters. Paid count and revenue come from completed payments with paid_at; order.payment_status remains only a display mirror.';
