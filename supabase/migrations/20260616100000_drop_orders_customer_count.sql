-- drop_orders_customer_count: remove orders.customer_count column and total_covers-from-customer_count derivations

DROP MATERIALIZED VIEW public.mv_daily_revenue;

CREATE OR REPLACE FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) RETURNS TABLE(net_revenue numeric, subtotal_revenue numeric, discount_amount numeric, total_tax numeric, vat_8_amount numeric, vat_10_amount numeric, order_count bigint, total_covers bigint, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, voided_amount numeric, voided_count bigint, refreshed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.branch_id,
      o.tenant_id,
      o.total_amount,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.order_type,
      p.method
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  ),
  sales AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS net_revenue,
      COALESCE(SUM(subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(discount_amount), 0) AS discount_amount,
      COALESCE(SUM(tax_amount), 0) AS total_tax,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(COUNT(id), 0)::BIGINT AS total_covers,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE order_type = 'takeaway'), 0) AS takeaway_revenue
    FROM paid_orders
  ),
  vat_split AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 8.00
          THEN (oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_8_amount,
      COALESCE(SUM(
        CASE WHEN ROUND(oi.vat_rate::numeric, 2) = 10.00
          THEN (oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))
          ELSE 0
        END
      ), 0) AS vat_10_amount
    FROM (
      SELECT
        po.id AS order_id,
        po.tenant_id,
        CASE
          WHEN SUM(oi2.subtotal) > 0 THEN po.total_amount / SUM(oi2.subtotal)
          ELSE 1
        END AS scale
      FROM paid_orders po
      JOIN public.order_items oi2
        ON oi2.tenant_id = po.tenant_id
       AND oi2.order_id = po.id
       AND oi2.status <> 'cancelled'
      GROUP BY po.id, po.tenant_id, po.total_amount
    ) scaled
    JOIN public.order_items oi
      ON oi.tenant_id = scaled.tenant_id
     AND oi.order_id = scaled.order_id
     AND oi.status <> 'cancelled'
  ),
  refunds AS (
    SELECT
      COALESCE(SUM(p.amount), 0) AS voided_amount,
      COUNT(DISTINCT p.order_id)::BIGINT AS voided_count
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'refunded'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
  )
  SELECT
    sales.net_revenue,
    sales.subtotal_revenue,
    sales.discount_amount,
    sales.total_tax,
    vat_split.vat_8_amount,
    vat_split.vat_10_amount,
    sales.order_count,
    sales.total_covers,
    sales.cash_revenue,
    sales.vietqr_revenue,
    sales.momo_revenue,
    sales.dine_in_revenue,
    sales.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    now() AS refreshed_at
  FROM sales
  CROSS JOIN vat_split
  CROSS JOIN refunds;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_rollup(p_branch_id bigint, p_start_date date, p_end_date date, p_granularity text) RETURNS TABLE(period_start date, period_end date, period_label text, branch_id bigint, order_count bigint, total_revenue numeric, total_tax numeric, subtotal_revenue numeric, discount_amount numeric, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, total_covers bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
  v_has_tenant_scope BOOLEAN;
  v_branch_ids BIGINT[];
BEGIN
  IF p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'invalid_granularity (expected day/week/month)'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
    INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH live_daily AS (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS paid_date,
      o.branch_id,
      COUNT(DISTINCT o.id)::BIGINT AS order_count,
      COALESCE(SUM(o.total_amount), 0) AS total_revenue,
      COALESCE(SUM(o.tax_amount), 0) AS total_tax,
      COALESCE(SUM(o.subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(o.discount_amount), 0) AS discount_amount,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'vietqr'), 0) AS vietqr_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE p.method = 'momo'), 0) AS momo_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_type = 'takeaway'), 0) AS takeaway_revenue,
      COALESCE(COUNT(DISTINCT o.id), 0)::BIGINT AS total_covers
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (
        (p_branch_id IS NOT NULL AND o.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (v_has_tenant_scope OR o.branch_id = ANY(v_branch_ids))
        )
      )
    GROUP BY 1, o.branch_id
  ),
  bucketed AS (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN date_trunc('week', d.paid_date)::date
        WHEN 'month' THEN date_trunc('month', d.paid_date)::date
      END AS p_start,
      CASE p_granularity
        WHEN 'day' THEN d.paid_date
        WHEN 'week' THEN (date_trunc('week', d.paid_date) + INTERVAL '6 days')::date
        WHEN 'month' THEN (date_trunc('month', d.paid_date) + INTERVAL '1 month - 1 day')::date
      END AS p_end,
      d.*
    FROM live_daily d
  )
  SELECT
    b.p_start AS period_start,
    b.p_end AS period_end,
    CASE p_granularity
      WHEN 'day' THEN to_char(b.p_start, 'DD/MM/YYYY')
      WHEN 'week' THEN
        'Tuần ' || to_char(b.p_start, 'IW') || ' ('
          || to_char(b.p_start, 'DD/MM') || '-'
          || to_char(b.p_end, 'DD/MM/YYYY') || ')'
      WHEN 'month' THEN 'Tháng ' || to_char(b.p_start, 'MM/YYYY')
    END AS period_label,
    b.branch_id,
    COALESCE(SUM(b.order_count), 0)::BIGINT AS order_count,
    COALESCE(SUM(b.total_revenue), 0) AS total_revenue,
    COALESCE(SUM(b.total_tax), 0) AS total_tax,
    COALESCE(SUM(b.subtotal_revenue), 0) AS subtotal_revenue,
    COALESCE(SUM(b.discount_amount), 0) AS discount_amount,
    COALESCE(SUM(b.cash_revenue), 0) AS cash_revenue,
    COALESCE(SUM(b.vietqr_revenue), 0) AS vietqr_revenue,
    COALESCE(SUM(b.momo_revenue), 0) AS momo_revenue,
    COALESCE(SUM(b.dine_in_revenue), 0) AS dine_in_revenue,
    COALESCE(SUM(b.takeaway_revenue), 0) AS takeaway_revenue,
    COALESCE(SUM(b.total_covers), 0)::BIGINT AS total_covers
  FROM bucketed b
  GROUP BY b.p_start, b.p_end, b.branch_id
  ORDER BY b.p_start, b.branch_id;
END;
$$;

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
 SELECT ((p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date AS date,
    o.branch_id,
    o.tenant_id,
    count(*) AS order_count,
    COALESCE(sum(o.total_amount), (0)::numeric) AS total_revenue,
    COALESCE(sum(o.tax_amount), (0)::numeric) AS total_tax,
    COALESCE(sum(o.subtotal), (0)::numeric) AS subtotal_revenue,
    COALESCE(sum(o.discount_amount), (0)::numeric) AS discount_amount,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'cash'::text)), (0)::numeric) AS cash_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'vietqr'::text)), (0)::numeric) AS vietqr_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.payment_method = 'momo'::text)), (0)::numeric) AS momo_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.order_type = 'dine_in'::text)), (0)::numeric) AS dine_in_revenue,
    COALESCE(sum(o.total_amount) FILTER (WHERE (o.order_type = 'takeaway'::text)), (0)::numeric) AS takeaway_revenue,
    COALESCE(count(o.id), (0)::bigint) AS total_covers
   FROM (public.orders o
     JOIN public.payments p ON (((p.order_id = o.id) AND (p.tenant_id = o.tenant_id) AND (p.status = 'completed'::text) AND (p.paid_at IS NOT NULL))))
  WHERE ((o.status <> 'cancelled'::text) AND (o.payment_status = 'paid'::text))
  GROUP BY (((p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date), o.branch_id, o.tenant_id
  WITH NO DATA;

CREATE INDEX idx_mv_daily_revenue_branch_date ON public.mv_daily_revenue USING btree (branch_id, date);
CREATE UNIQUE INDEX idx_mv_daily_revenue_pk ON public.mv_daily_revenue USING btree (date, branch_id, tenant_id);

GRANT ALL ON TABLE public.mv_daily_revenue TO service_role;

CREATE OR REPLACE FUNCTION public.merge_orders(p_source_order_id bigint, p_target_order_id bigint, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_target               RECORD;
  v_lock_lo              BIGINT;
  v_lock_hi              BIGINT;
  v_flag_enabled         TEXT;
  v_moved_count          INT;
  v_target_subtotal      NUMERIC(15,2);
  v_target_discount_type   TEXT;
  v_target_discount_value  NUMERIC(15,2);
  v_target_discount_note   TEXT;
  v_target_total           NUMERIC(15,2);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_source_order_id = p_target_order_id THEN
    RAISE EXCEPTION 'merge_self' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT t.id INTO v_lock_lo
    FROM public.orders t
    WHERE t.id = p_target_order_id
      AND t.merge_request_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      SELECT subtotal, total_amount INTO v_target_subtotal, v_target_total
      FROM public.orders WHERE id = p_target_order_id;
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'target_order_id',  p_target_order_id,
        'target_subtotal',  COALESCE(v_target_subtotal, 0),
        'target_total',     COALESCE(v_target_total, 0),
        'idempotent',       true
      );
    END IF;
  END IF;

  v_lock_lo := LEAST(p_source_order_id, p_target_order_id);
  v_lock_hi := GREATEST(p_source_order_id, p_target_order_id);
  PERFORM pg_advisory_xact_lock(v_lock_lo);
  PERFORM pg_advisory_xact_lock(v_lock_hi);

  IF v_lock_lo = p_source_order_id THEN
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;
  ELSE
    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.order_number
    INTO v_target FROM public.orders o WHERE o.id = p_target_order_id FOR UPDATE;

    SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
           o.payment_status, o.subtotal, o.service_charge,
           o.discount_type, o.discount_value, o.discount_amount, o.discount_note,
           o.merged_into_order_id, o.note, o.order_number
    INTO v_source FROM public.orders o WHERE o.id = p_source_order_id FOR UPDATE;
  END IF;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'source order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'target order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant OR v_target.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_source.branch_id <> v_target.branch_id THEN
    RAISE EXCEPTION 'merge_different_branch' USING ERRCODE = '22023';
  END IF;

  IF v_prof_role IN ('owner') THEN
    PERFORM 1 FROM public.branches b
    WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.order_type <> 'dine_in' OR v_target.order_type <> 'dine_in' THEN
    RAISE EXCEPTION 'merge_dine_in_only' USING ERRCODE = '22023';
  END IF;

  IF v_source.table_id IS NULL OR v_target.table_id IS NULL
     OR v_source.table_id <> v_target.table_id
  THEN
    RAISE EXCEPTION 'merge_different_tables' USING ERRCODE = '22023';
  END IF;

  IF v_source.status IN ('completed', 'cancelled')
     OR v_target.status IN ('completed', 'cancelled')
  THEN
    RAISE EXCEPTION 'merge_terminal' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid'
     OR COALESCE(v_target.payment_status, 'unpaid') = 'paid'
  THEN
    RAISE EXCEPTION 'merge_paid' USING ERRCODE = '22023';
  END IF;

  IF v_source.merged_into_order_id IS NOT NULL OR v_target.merged_into_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'merge_already_merged' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
  WHERE order_id IN (p_source_order_id, p_target_order_id)
    AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'merge_payment_pending' USING ERRCODE = '22023';
  END IF;

  IF (v_source.discount_type = 'pct' AND COALESCE(v_source.discount_amount, 0) > 0)
     OR (v_target.discount_type = 'pct' AND COALESCE(v_target.discount_amount, 0) > 0)
  THEN
    RAISE EXCEPTION 'merge_pct_discount_blocked' USING ERRCODE = '22023';
  END IF;

  IF v_source.discount_type = 'vnd' AND v_target.discount_type = 'vnd' THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := COALESCE(v_source.discount_value, 0)
                             + COALESCE(v_target.discount_value, 0);
    v_target_discount_note  := COALESCE(v_target.discount_note, '')
      || ' + ' || COALESCE(v_source.discount_note, '');
  ELSIF v_source.discount_type = 'vnd' AND v_target.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_source.discount_value;
    v_target_discount_note  := v_source.discount_note;
  ELSIF v_target.discount_type = 'vnd' AND v_source.discount_type IS NULL THEN
    v_target_discount_type  := 'vnd';
    v_target_discount_value := v_target.discount_value;
    v_target_discount_note  := v_target.discount_note;
  ELSE
    v_target_discount_type  := NULL;
    v_target_discount_value := NULL;
    v_target_discount_note  := NULL;
  END IF;

  UPDATE public.order_items
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  UPDATE public.kds_tickets
     SET order_id   = p_target_order_id,
         updated_at = now()
   WHERE order_id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_target_subtotal
  FROM public.order_items
  WHERE order_id = p_target_order_id AND status <> 'cancelled';

  -- Set only the trigger inputs. pos_normalize_order_discount_totals fires on
  -- subtotal/discount_* and computes discount_amount, item_discount_amount,
  -- order_discount_amount, and total_amount (including the re-pointed items'
  -- per-item discounts), nulling the order-level metadata if it resolves to 0.
  UPDATE public.orders
     SET subtotal             = v_target_subtotal,
         discount_type        = v_target_discount_type,
         discount_value       = v_target_discount_value,
         discount_note        = v_target_discount_note,
         note                 = CASE
                                  WHEN v_source.note IS NOT NULL AND length(trim(v_source.note)) > 0
                                  THEN COALESCE(v_target.note || E'\n', '')
                                       || '[Gộp từ ' || v_source.order_number || ']: ' || v_source.note
                                  ELSE v_target.note
                                END,
         merge_request_key    = p_idempotency_key,
         updated_at           = now()
   WHERE id = p_target_order_id;

  UPDATE public.orders
     SET status               = 'cancelled',
         subtotal             = 0,
         discount_type        = NULL,
         discount_value       = NULL,
         discount_note        = NULL,
         merged_into_order_id = p_target_order_id,
         updated_at           = now()
   WHERE id = p_source_order_id;

  SELECT total_amount INTO v_target_total
  FROM public.orders WHERE id = p_target_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, 'cancelled', v_uid,
     'merged_into: ' || v_target.order_number || ' (#' || p_target_order_id::TEXT
       || '), moved ' || v_moved_count::TEXT || ' items'),
    (v_target.tenant_id, p_target_order_id, v_target.status, v_target.status, v_uid,
     'merged_from: ' || v_source.order_number || ' (#' || p_source_order_id::TEXT
       || '), received ' || v_moved_count::TEXT || ' items');

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'target_order_id',  p_target_order_id,
    'moved_count',      v_moved_count,
    'target_subtotal',  v_target_subtotal,
    'target_total',     COALESCE(v_target_total, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.split_order(p_source_order_id bigint, p_item_partials jsonb, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid                  UUID;
  v_prof_tenant          BIGINT;
  v_prof_branch          BIGINT;
  v_prof_role            TEXT;
  v_source               RECORD;
  v_active_total_rows    INT;
  v_full_move_count      INT := 0;
  v_total_units_moved    INT := 0;
  v_remaining_rows       INT;
  v_new_order_id         BIGINT;
  v_new_order_number     TEXT;
  v_seq                  INT;
  v_date_part            TEXT;
  v_flag_enabled         TEXT;
  v_existing_id          BIGINT;
  v_existing_number      TEXT;
  v_source_subtotal      NUMERIC(15,2);
  v_source_discount      NUMERIC(15,2);
  v_source_total         NUMERIC(15,2);
  v_new_subtotal         NUMERIC(15,2);
  v_new_total            NUMERIC(15,2);
  v_partial              JSONB;
  v_partial_item_id      BIGINT;
  v_partial_qty          INT;
  v_src_row              public.order_items%ROWTYPE;
  v_new_item_id          BIGINT;
  v_branch_code          TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'super_manager', 'area_manager', 'branch_manager', 'cashier', 'waiter')
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_item_partials IS NULL
     OR jsonb_typeof(p_item_partials) <> 'array'
     OR jsonb_array_length(p_item_partials) = 0
  THEN
    RAISE EXCEPTION 'split_no_items' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_existing_id, v_existing_number
      FROM public.orders o
     WHERE o.split_from_order_id = p_source_order_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'source_order_id',  p_source_order_id,
        'new_order_id',     v_existing_id,
        'new_order_number', v_existing_number,
        'idempotent',       true
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(p_source_order_id);

  SELECT o.id, o.tenant_id, o.branch_id, o.table_id, o.order_type, o.status,
         o.payment_status, o.pos_session_id, o.service_charge,
         o.discount_type, o.discount_value
    INTO v_source
    FROM public.orders o
   WHERE o.id = p_source_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner', 'super_manager', 'area_manager') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NULL OR v_source.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  ELSE
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = v_source.branch_id AND b.tenant_id = v_prof_tenant;
  END IF;

  SELECT value INTO v_flag_enabled
    FROM public.system_settings
   WHERE tenant_id = v_source.tenant_id AND key = 'pos_split_merge_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'split_merge_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_source.status NOT IN ('new', 'confirmed', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'split_source_not_eligible' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_source.payment_status, 'unpaid') = 'paid' THEN
    RAISE EXCEPTION 'split_source_paid' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payments
   WHERE order_id = p_source_order_id AND status NOT IN ('failed', 'completed');
  IF FOUND THEN
    RAISE EXCEPTION 'split_payment_pending' USING ERRCODE = '22023';
  END IF;

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := NULLIF(v_partial ->> 'item_id', '')::BIGINT;
    v_partial_qty := NULLIF(v_partial ->> 'quantity', '')::INT;

    IF v_partial_item_id IS NULL OR v_partial_qty IS NULL OR v_partial_qty < 1 THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id
       AND order_id = p_source_order_id
       AND status <> 'cancelled'
       FOR UPDATE;

    IF NOT FOUND OR v_partial_qty > v_src_row.quantity THEN
      RAISE EXCEPTION 'split_items_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_partial_qty = v_src_row.quantity THEN
      v_full_move_count := v_full_move_count + 1;
    END IF;

    v_total_units_moved := v_total_units_moved + v_partial_qty;
  END LOOP;

  SELECT COUNT(*) INTO v_active_total_rows
    FROM public.order_items
   WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_remaining_rows := v_active_total_rows - v_full_move_count;
  IF v_remaining_rows < 1 THEN
    RAISE EXCEPTION 'split_would_empty_source' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    v_source.tenant_id,
    v_source.branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD'
  );

  IF v_source.order_type = 'dine_in' THEN
    v_new_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_new_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_new_order_number := v_new_order_number || '-' || v_branch_code;
  END IF;

  INSERT INTO public.orders (
    tenant_id, branch_id, table_id, order_number, order_type,
    status, subtotal, total_amount, note, created_by,
    pos_session_id, idempotency_key, split_from_order_id
  )
  VALUES (
    v_source.tenant_id, v_source.branch_id, v_source.table_id,
    v_new_order_number, v_source.order_type,
    v_source.status,
    0, 0, NULL, v_uid,
    v_source.pos_session_id, p_idempotency_key, p_source_order_id
  )
  RETURNING id INTO v_new_order_id;

  FOR v_partial IN SELECT value FROM jsonb_array_elements(p_item_partials)
  LOOP
    v_partial_item_id := (v_partial ->> 'item_id')::BIGINT;
    v_partial_qty := (v_partial ->> 'quantity')::INT;

    SELECT * INTO v_src_row
      FROM public.order_items
     WHERE id = v_partial_item_id;

    IF v_partial_qty = v_src_row.quantity THEN
      UPDATE public.order_items
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE id = v_partial_item_id
         AND order_id = p_source_order_id;

      UPDATE public.kds_tickets
         SET order_id   = v_new_order_id,
             updated_at = now()
       WHERE order_item_id = v_partial_item_id
         AND order_id = p_source_order_id;
    ELSE
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'true', true);
      INSERT INTO public.order_items (
        tenant_id, order_id, menu_item_id, variant_id,
        item_name, variant_name, quantity, unit_price,
        modifiers, sides, subtotal, note, status,
        sent_to_kitchen_at
      )
      VALUES (
        v_src_row.tenant_id, v_new_order_id,
        v_src_row.menu_item_id, v_src_row.variant_id,
        v_src_row.item_name, v_src_row.variant_name,
        v_partial_qty, v_src_row.unit_price,
        v_src_row.modifiers, v_src_row.sides,
        v_src_row.unit_price * v_partial_qty,
        v_src_row.note, v_src_row.status,
        v_src_row.sent_to_kitchen_at
      )
      RETURNING id INTO v_new_item_id;
      PERFORM set_config('comtammatu.skip_quota_enforcement', 'false', true);

      UPDATE public.order_items
         SET quantity   = v_src_row.quantity - v_partial_qty,
             subtotal   = v_src_row.unit_price * (v_src_row.quantity - v_partial_qty),
             updated_at = now()
       WHERE id = v_partial_item_id;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        status, bumped_at, bumped_by, created_at
      )
      SELECT
        kt.tenant_id, kt.branch_id, kt.station_id,
        v_new_order_id, v_new_item_id,
        kt.status, kt.bumped_at, kt.bumped_by, kt.created_at
      FROM public.kds_tickets kt
      WHERE kt.order_item_id = v_partial_item_id
        AND kt.order_id = p_source_order_id;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_source_subtotal
    FROM public.order_items
   WHERE order_id = p_source_order_id AND status <> 'cancelled';

  v_source_discount := public.compute_discount_amount(
    v_source.discount_type, v_source.discount_value, v_source_subtotal
  );

  v_source_total := v_source_subtotal
                  + COALESCE(v_source.service_charge, 0)
                  - v_source_discount;

  UPDATE public.orders
     SET subtotal        = v_source_subtotal,
         discount_amount = v_source_discount,
         total_amount    = v_source_total,
         updated_at      = now()
   WHERE id = p_source_order_id;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
    FROM public.order_items
   WHERE order_id = v_new_order_id AND status <> 'cancelled';

  v_new_total := v_new_subtotal;

  UPDATE public.orders
     SET subtotal     = v_new_subtotal,
         total_amount = v_new_total,
         updated_at   = now()
   WHERE id = v_new_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES
    (v_source.tenant_id, p_source_order_id, v_source.status, v_source.status, v_uid,
     'split_to: ' || v_new_order_number
       || ' (moved ' || v_total_units_moved::TEXT || ' units across '
       || jsonb_array_length(p_item_partials)::TEXT || ' lines)'),
    (v_source.tenant_id, v_new_order_id, NULL, v_source.status, v_uid,
     'split_from: order#' || p_source_order_id::TEXT);

  RETURN jsonb_build_object(
    'source_order_id',  p_source_order_id,
    'new_order_id',     v_new_order_id,
    'new_order_number', v_new_order_number,
    'moved_count',      v_total_units_moved,
    'source_subtotal',  v_source_subtotal,
    'source_total',     v_source_total,
    'new_subtotal',     v_new_subtotal,
    'new_total',        v_new_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id bigint,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_cash_change numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_qr_content   TEXT;
  v_payment_qr   JSONB;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_permission_any('pos:print')
    OR public.has_permission_any('pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'receipt'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_cash_received IS NOT NULL OR p_cash_change IS NOT NULL THEN
    UPDATE public.orders
       SET cash_received = p_cash_received,
           cash_change   = p_cash_change
     WHERE id = p_order_id;
  END IF;

  SELECT value INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' THEN
    SELECT value INTO v_vietqr_bank FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
    SELECT value INTO v_vietqr_acc FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
    SELECT value INTO v_vietqr_name FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';

    BEGIN
      v_qr_content := public.print_vietqr_emvco(
        v_vietqr_bank,
        v_vietqr_acc,
        v_vietqr_name,
        v_order.total_amount,
        'DH ' || v_order.order_number
      );
    EXCEPTION WHEN OTHERS THEN
      v_qr_content := NULL;
      RAISE WARNING '[enqueue_receipt_print] vietqr emv build failed for order %: %',
        p_order_id, SQLERRM;
    END;

    IF v_qr_content IS NOT NULL THEN
      v_payment_qr := jsonb_build_object(
        'type',         'vietqr',
        'content',      v_qr_content,
        'header_label', upper(COALESCE(v_vietqr_bank, ''))
                          || ' (BIN ' || public.print_vietqr_bank_bin(v_vietqr_bank) || ')',
        'account_no',   v_vietqr_acc,
        'account_name', v_vietqr_name,
        'amount',       v_order.total_amount,
        'description',  'DH ' || v_order.order_number
      );
    END IF;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'receipt',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'payment_qr',       v_payment_qr,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT || ':receipt';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload    = EXCLUDED.payload,
    printer_id = EXCLUDED.printer_id,
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired','printed')
               THEN 'pending'
               ELSE public.print_jobs.status
             END,
    last_error       = NULL,
    claimed_by_agent = NULL,
    claimed_at       = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid, uuid);

DROP FUNCTION IF EXISTS public.create_order(bigint, bigint, uuid, jsonb, text, bigint, bigint, integer, text, uuid);

CREATE FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text DEFAULT 'dine_in'::text, p_table_id bigint DEFAULT NULL::bigint, p_pos_session_id bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_created_by       UUID;
  v_order_id         BIGINT;
  v_order_number     TEXT;
  v_date_part        TEXT;
  v_subtotal         NUMERIC(15,2) := 0;
  v_seq              INT;
  v_table_number     INT;
  v_item             JSONB;
  v_base_price       NUMERIC(15,2);
  v_variant_adj      NUMERIC(15,2);
  v_modifier_sum     NUMERIC(15,2);
  v_sides_sum        NUMERIC(15,2);
  v_enriched_sides   JSONB;
  v_unit_price       NUMERIC(15,2);
  v_item_subtotal    NUMERIC(15,2);
  v_menu_item_id     BIGINT;
  v_variant_id       BIGINT;
  v_quantity         INT;
  v_prof_tenant      BIGINT;
  v_prof_branch      BIGINT;
  v_prof_role        TEXT;
  v_branch_code      TEXT;
  v_item_discount    NUMERIC(15,2);
BEGIN
  v_created_by := auth.uid();
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
    INTO v_prof_tenant, v_prof_branch, v_prof_role
    FROM public.profiles p
    LEFT JOIN public.positions po ON po.id = p.position_id
   WHERE p.id = v_created_by;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner') THEN
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid branch' USING ERRCODE = 'P0002';
    END IF;
  ELSIF v_prof_branch IS NOT NULL THEN
    IF p_branch_id IS DISTINCT FROM v_prof_branch THEN
      RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT b.code INTO v_branch_code
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id;
  ELSE
    RAISE EXCEPTION 'branch scope required' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array' USING ERRCODE = '22023';
  END IF;

  IF p_order_type NOT IN ('dine_in', 'takeaway') THEN
    RAISE EXCEPTION 'p_order_type must be dine_in or takeaway' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT t.number INTO v_table_number
      FROM public.tables t
     WHERE t.id = p_table_id AND t.branch_id = p_branch_id AND t.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Table does not belong to this branch' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_pos_session_id IS NOT NULL THEN
    PERFORM 1 FROM public.pos_sessions
     WHERE id = p_pos_session_id
       AND branch_id = p_branch_id
       AND tenant_id = p_tenant_id
       AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'POS session does not belong to this branch or is not open' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_order_number
      FROM public.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
    END IF;
  END IF;

  INSERT INTO public.order_daily_counters (
    tenant_id, branch_id, counter_date, last_seq
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    1
  )
  ON CONFLICT (tenant_id, branch_id, counter_date)
  DO UPDATE SET
    last_seq   = public.order_daily_counters.last_seq + 1,
    updated_at = now()
  RETURNING last_seq INTO v_seq;

  v_date_part := to_char(
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh',
    'YYMMDD'
  );

  IF p_order_type = 'dine_in' THEN
    v_order_number := 'TC-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  ELSE
    v_order_number := 'MV-' || v_date_part || '-' || lpad(v_seq::TEXT, 3, '0');
  END IF;

  IF v_branch_code IS NOT NULL THEN
    v_order_number := v_order_number || '-' || v_branch_code;
  END IF;

  BEGIN
    INSERT INTO public.orders (
      tenant_id, branch_id, table_id, order_number, order_type,
      subtotal, total_amount, note, created_by,
      pos_session_id, idempotency_key
    )
    VALUES (
      p_tenant_id, p_branch_id, p_table_id, v_order_number, p_order_type,
      0, 0, p_note, v_created_by,
      p_pos_session_id, p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT o.id, o.order_number INTO v_order_id, v_order_number
          FROM public.orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.idempotency_key = p_idempotency_key;
        IF FOUND THEN
          RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
        END IF;
      END IF;
      RAISE;
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_menu_item_id := (v_item ->> 'menu_item_id')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::BIGINT;
    v_quantity     := (v_item ->> 'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
    END IF;

    SELECT base_price INTO v_base_price
      FROM public.menu_items
     WHERE id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or inactive', v_menu_item_id USING ERRCODE = 'P0002';
    END IF;

    v_variant_adj := 0;
    IF v_variant_id IS NOT NULL THEN
      SELECT price_adjustment INTO v_variant_adj
        FROM public.menu_item_variants
       WHERE id = v_variant_id AND item_id = v_menu_item_id AND tenant_id = p_tenant_id AND is_active = TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found or inactive', v_variant_id USING ERRCODE = 'P0002';
      END IF;
    END IF;

    v_modifier_sum := public.pos_order_modifier_sum(
      p_tenant_id,
      v_menu_item_id,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB)
    );

    SELECT sides_sum, enriched_sides
      INTO v_sides_sum, v_enriched_sides
      FROM public.pos_enrich_order_sides(
        p_tenant_id,
        v_menu_item_id,
        COALESCE(v_item -> 'sides', '[]'::JSONB)
      );

    v_unit_price    := v_base_price + v_variant_adj + v_modifier_sum + COALESCE(v_sides_sum, 0);
    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal      := v_subtotal + v_item_subtotal;

    INSERT INTO public.order_items (
      tenant_id, order_id, menu_item_id, variant_id,
      item_name, variant_name, quantity, unit_price,
      modifiers, sides, subtotal, note,
      discount_type, discount_value, discount_note
    )
    VALUES (
      p_tenant_id, v_order_id, v_menu_item_id, v_variant_id,
      v_item ->> 'item_name', v_item ->> 'variant_name',
      v_quantity, v_unit_price,
      COALESCE(v_item -> 'modifiers', '[]'::JSONB),
      COALESCE(v_enriched_sides, '[]'::JSONB),
      v_item_subtotal, v_item ->> 'note',
      NULLIF(v_item ->> 'discount_type', ''),
      CASE WHEN NULLIF(v_item ->> 'discount_value', '') IS NOT NULL
           THEN (v_item ->> 'discount_value')::NUMERIC
           ELSE NULL END,
      NULLIF(trim(COALESCE(v_item ->> 'discount_note', '')), '')
    );
  END LOOP;

  UPDATE public.orders
     SET subtotal = v_subtotal, total_amount = v_subtotal
   WHERE id = v_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by
  )
  VALUES (p_tenant_id, v_order_id, NULL, 'new', v_created_by);

  IF p_order_type = 'dine_in' AND p_table_id IS NOT NULL THEN
    UPDATE public.tables
       SET status = 'occupied'
     WHERE id = p_table_id AND branch_id = p_branch_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Failed to update table status' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM public.route_order_to_kds(v_order_id);

  SELECT COALESCE(o.item_discount_amount, 0) INTO v_item_discount
    FROM public.orders o WHERE o.id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'item_discount_amount', v_item_discount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text, p_table_id bigint, p_pos_session_id bigint, p_note text, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text, p_table_id bigint, p_pos_session_id bigint, p_note text, p_idempotency_key uuid) TO service_role;
GRANT ALL ON FUNCTION public.create_order(p_tenant_id bigint, p_branch_id bigint, p_created_by uuid, p_items jsonb, p_order_type text, p_table_id bigint, p_pos_session_id bigint, p_note text, p_idempotency_key uuid) TO authenticated;

CREATE FUNCTION public.create_order_with_daily_limit_hold(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_created_by uuid,
  p_items jsonb,
  p_order_type text DEFAULT 'dine_in'::text,
  p_table_id bigint DEFAULT NULL::bigint,
  p_pos_session_id bigint DEFAULT NULL::bigint,
  p_note text DEFAULT NULL::text,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_daily_limit_hold_token uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_order_id bigint;
BEGIN
  IF p_daily_limit_hold_token IS NOT NULL THEN
    PERFORM set_config(
      'comtammatu.daily_limit_hold_token',
      p_daily_limit_hold_token::text,
      true
    );
  END IF;

  v_result := public.create_order(
    p_tenant_id,
    p_branch_id,
    p_created_by,
    p_items,
    p_order_type,
    p_table_id,
    p_pos_session_id,
    p_note,
    p_idempotency_key
  );

  v_order_id := NULLIF(v_result ->> 'order_id', '')::bigint;

  IF p_daily_limit_hold_token IS NOT NULL AND v_order_id IS NOT NULL THEN
    UPDATE public.branch_menu_item_daily_holds h
    SET committed_at = COALESCE(h.committed_at, now()),
        order_id = COALESCE(h.order_id, v_order_id),
        updated_at = now()
    WHERE h.tenant_id = p_tenant_id
      AND h.branch_id = p_branch_id
      AND h.hold_token = p_daily_limit_hold_token
      AND h.held_by = v_uid
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now();
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, text, uuid, uuid) IS
  'Wrapper around create_order that sets transaction-local daily-limit hold token so the quota trigger excludes the caller hold, then commits matching active holds to the new order.';

REVOKE ALL ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, text, uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_orders_for_day(bigint, date);

CREATE FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) RETURNS TABLE(order_id bigint, order_number text, branch_id bigint, branch_name text, paid_at timestamp with time zone, paid_hour integer, order_type text, subtotal numeric, discount_amount numeric, tax_amount numeric, total_amount numeric, payment_method text, item_count bigint, invoice_status text, invoice_number text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid    UUID;
  v_tenant BIGINT;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required for drill-down'
      USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id INTO v_tenant
    FROM public.profiles pr WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      o.id AS order_id,
      o.order_number,
      o.branch_id,
      b.name AS branch_name,
      p.paid_at,
      EXTRACT(HOUR FROM (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::INT
        AS paid_hour,
      o.order_type,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.total_amount,
      o.payment_method,
      (SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = o.id AND oi.status <> 'cancelled')::BIGINT
        AS item_count,
      ti.status         AS invoice_status,
      ti.invoice_number
    FROM public.orders o
    JOIN public.branches b
      ON b.id = o.branch_id
     AND b.tenant_id = o.tenant_id
    JOIN public.payments p
      ON p.order_id  = o.id
     AND p.tenant_id = o.tenant_id
     AND p.status    = 'completed'
     AND p.paid_at IS NOT NULL
    LEFT JOIN public.tax_invoices ti
      ON ti.order_id  = o.id
     AND ti.tenant_id = o.tenant_id
     AND ti.status NOT IN ('cancelled', 'replaced')
    WHERE o.tenant_id = v_tenant
      AND o.branch_id = p_branch_id
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
      AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_date
    ORDER BY p.paid_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) TO service_role;
GRANT ALL ON FUNCTION public.get_orders_for_day(p_branch_id bigint, p_date date) TO authenticated;

ALTER TABLE public.orders DROP COLUMN customer_count;
