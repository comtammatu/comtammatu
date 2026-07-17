BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE method = 'momo') THEN
    RAISE EXCEPTION 'momo_payments_require_manual_reconciliation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE payment_method = 'momo') THEN
    RAISE EXCEPTION 'momo_orders_require_manual_reconciliation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.webhook_events WHERE provider = 'momo') THEN
    RAISE EXCEPTION 'momo_webhook_events_require_manual_reconciliation';
  END IF;
END;
$$;

DELETE FROM public.system_settings
WHERE key = 'payment_enable_momo';

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check,
  ADD CONSTRAINT payments_method_check
    CHECK (method IN ('cash', 'vietqr'))
    NOT VALID;

ALTER TABLE public.payments
  VALIDATE CONSTRAINT payments_method_check;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check,
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'vietqr'))
    NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_payment_method_check;

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check,
  ADD CONSTRAINT webhook_events_provider_check
    CHECK (provider IN ('vietqr', 'vnpay', 'sepay'))
    NOT VALID;

ALTER TABLE public.webhook_events
  VALIDATE CONSTRAINT webhook_events_provider_check;

DROP FUNCTION IF EXISTS public.record_momo_pending_result(bigint, bigint, jsonb);
DROP FUNCTION IF EXISTS public.finalize_momo_successful_payment(bigint, bigint, jsonb);
DROP FUNCTION IF EXISTS public.finalize_momo_failed_payment(bigint, bigint, jsonb);

CREATE OR REPLACE FUNCTION public.create_remote_payment_intent(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_order_id bigint,
  p_method text,
  p_amount numeric,
  p_created_by uuid,
  p_provider_ref text,
  p_provider_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment_id bigint;
  v_existing_payment_id bigint;
  v_existing_status text;
  v_existing_method text;
  v_existing_amount numeric;
  v_existing_provider_ref text;
  v_existing_provider_data jsonb;
  v_requested_provider_ref text;
  v_requested_provider_data jsonb;
  v_line_subtotal numeric(15,2) := 0;
  v_recomputed_total numeric(15,2) := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_created_by
      AND profile.tenant_id = p_tenant_id
      AND COALESCE(profile.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'actor_inactive_or_tenant_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.auth_is_owner(p_created_by)
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_permissions permission
      WHERE permission.user_id = p_created_by
        AND permission.tenant_id = p_tenant_id
        AND permission.permission_key = 'pos:use'
        AND (
          permission.branch_id = p_branch_id
          OR permission.branch_id IS NULL
        )
        AND permission.valid_from <= now()
        AND (
          permission.valid_until IS NULL
          OR permission.valid_until > now()
        )
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_method <> 'vietqr' THEN
    RAISE EXCEPTION 'remote_payment_method_required' USING ERRCODE = '22023';
  END IF;

  v_requested_provider_ref := NULLIF(btrim(p_provider_ref), '');
  IF v_requested_provider_ref IS NULL THEN
    RAISE EXCEPTION 'remote_payment_provider_ref_required' USING ERRCODE = '22023';
  END IF;

  IF p_provider_data IS NULL OR jsonb_typeof(p_provider_data) <> 'object' THEN
    RAISE EXCEPTION 'provider_data_must_be_object' USING ERRCODE = '22023';
  END IF;
  IF p_provider_data ?| ARRAY[
    'bankWebhookReview',
    'source',
    'invoicePayload'
  ] THEN
    RAISE EXCEPTION 'provider_data_contains_reserved_key'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_provider_data ->> 'providerRef'), '')
    IS DISTINCT FROM v_requested_provider_ref
  THEN
    RAISE EXCEPTION 'provider_data_ref_mismatch' USING ERRCODE = '23514';
  END IF;
  v_requested_provider_data := p_provider_data;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT order_row.*
  INTO v_order
  FROM public.orders order_row
  WHERE order_row.id = p_order_id
    AND order_row.tenant_id = p_tenant_id
    AND order_row.branch_id = p_branch_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
    SUM(order_item.quantity::numeric * order_item.unit_price),
    0
  )::numeric(15,2)
  INTO v_line_subtotal
  FROM public.order_items order_item
  WHERE order_item.order_id = v_order.id
    AND order_item.tenant_id = v_order.tenant_id
    AND order_item.status <> 'cancelled';

  v_recomputed_total := ROUND(
    v_line_subtotal
    + COALESCE(v_order.tax_amount, 0)
    + COALESCE(v_order.service_charge, 0)
    - COALESCE(v_order.discount_amount, 0),
    2
  );

  IF ABS(p_amount - v_recomputed_total) > 1
    OR ABS(v_order.total_amount - v_recomputed_total) > 1
  THEN
    RAISE EXCEPTION 'amount_mismatch_recomputed: stored=% expected=% recomputed=%',
      v_order.total_amount,
      p_amount,
      v_recomputed_total
      USING ERRCODE = '23514';
  END IF;

  IF p_amount <> v_order.total_amount THEN
    RAISE EXCEPTION 'amount_mismatch: expected % got %',
      v_order.total_amount,
      p_amount
      USING ERRCODE = '22023';
  END IF;

  IF p_method = 'vietqr' THEN
    IF NULLIF(btrim(v_order.payment_code), '') IS NULL THEN
      RAISE EXCEPTION 'order_payment_code_required' USING ERRCODE = '23514';
    END IF;
    IF lower(v_requested_provider_ref)
      IS DISTINCT FROM lower(btrim(v_order.payment_code))
    THEN
      RAISE EXCEPTION 'vietqr_provider_ref_mismatch'
        USING ERRCODE = '23514';
    END IF;
    v_requested_provider_ref := btrim(v_order.payment_code);
    v_requested_provider_data := jsonb_set(
      v_requested_provider_data,
      '{providerRef}',
      to_jsonb(v_requested_provider_ref),
      true
    );
  END IF;

  SELECT
    payment.id,
    payment.status,
    payment.method,
    payment.amount,
    payment.provider_ref,
    payment.provider_data
  INTO
    v_existing_payment_id,
    v_existing_status,
    v_existing_method,
    v_existing_amount,
    v_existing_provider_ref,
    v_existing_provider_data
  FROM public.payments payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.branch_id = p_branch_id
    AND payment.order_id = p_order_id
    AND payment.status <> 'failed'
  ORDER BY payment.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_status = 'completed' THEN
    RAISE EXCEPTION 'payment_already_completed' USING ERRCODE = 'P0001';
  ELSIF v_existing_status = 'pending' THEN
    IF v_existing_method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'payment_pending_different_method: existing=% requested=%',
        v_existing_method,
        p_method
        USING ERRCODE = '23505';
    END IF;

    IF v_existing_amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'payment_pending_amount_mismatch'
        USING ERRCODE = '23514';
    END IF;

    IF COALESCE(v_existing_provider_data ->> 'source', '') = 'qr_self_order'
      OR EXISTS (
        SELECT 1
        FROM public.self_order_payment_requests request
        WHERE request.tenant_id = p_tenant_id
          AND request.payment_id = v_existing_payment_id
          AND request.status IN ('cash_call', 'vietqr_pending')
      )
    THEN
      RAISE EXCEPTION 'self_order_payment_owned' USING ERRCODE = '55P03';
    END IF;

    IF (
        v_existing_provider_ref IS DISTINCT FROM v_requested_provider_ref
        OR jsonb_typeof(v_existing_provider_data) IS DISTINCT FROM 'object'
        OR NULLIF(btrim(v_existing_provider_data ->> 'providerRef'), '')
          IS DISTINCT FROM v_requested_provider_ref
      )
    THEN
      UPDATE public.payments
      SET provider_ref = v_requested_provider_ref,
          provider_data = v_requested_provider_data,
          updated_at = now()
      WHERE id = v_existing_payment_id
      RETURNING id INTO v_payment_id;
      v_existing_provider_ref := v_requested_provider_ref;
      v_existing_provider_data := v_requested_provider_data;
    ELSE
      v_payment_id := v_existing_payment_id;
    END IF;
  ELSIF v_existing_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'payment_not_pending: status=%', v_existing_status
      USING ERRCODE = '22023';
  ELSE
    INSERT INTO public.payments (
      tenant_id,
      branch_id,
      order_id,
      method,
      amount,
      status,
      provider_ref,
      provider_data,
      paid_at,
      created_by
    ) VALUES (
      p_tenant_id,
      p_branch_id,
      p_order_id,
      p_method,
      p_amount,
      'pending',
      v_requested_provider_ref,
      v_requested_provider_data,
      NULL,
      p_created_by
    )
    RETURNING id INTO v_payment_id;
  END IF;

  UPDATE public.orders
  SET payment_method = p_method,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'status', 'pending',
    'idempotent', COALESCE(v_existing_status = 'pending', false),
    'provider_ref', COALESCE(v_existing_provider_ref, v_requested_provider_ref)
  );
END;
$$;

COMMENT ON FUNCTION public.create_remote_payment_intent(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  jsonb
) IS 'Service-only atomic creation or reuse of a pending VietQR intent with trusted provider metadata and an explicitly authorized POS actor.';

REVOKE ALL ON FUNCTION public.create_remote_payment_intent(
  bigint,
  bigint,
  bigint,
  text,
  numeric,
  uuid,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_remote_payment_intent(
  bigint,
  bigint,
  bigint,
  text,
  numeric,

DROP FUNCTION IF EXISTS public.get_daily_revenue(bigint, date, date);
DROP FUNCTION IF EXISTS public.get_revenue_kpis(bigint, date, date);
DROP FUNCTION IF EXISTS public.get_revenue_rollup(bigint, date, date, text);

-- Align Finance revenue with the operational data contract:
-- - money collected and method breakdowns come from payments.amount
-- - sales/tax/discount/order counts come from distinct paid orders
-- Payment-method breakdowns expose cash and VietQR explicitly.

DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_revenue;

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
WITH paid_payments AS MATERIALIZED (
  SELECT
    (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS date,
    p.id AS payment_id,
    p.order_id,
    p.branch_id,
    p.tenant_id,
    p.method AS payment_method,
    p.amount AS payment_amount,
    p.paid_at,
    o.total_amount,
    o.tax_amount,
    o.subtotal,
    o.discount_amount,
    o.order_type
  FROM public.payments p
  JOIN public.orders o
    ON o.id = p.order_id
   AND o.tenant_id = p.tenant_id
   AND o.branch_id = p.branch_id
  WHERE p.status = 'completed'
    AND p.paid_at IS NOT NULL
    AND o.status <> 'cancelled'
    AND o.payment_status = 'paid'
),
payment_daily AS (
  SELECT
    pp.date,
    pp.branch_id,
    pp.tenant_id,
    COALESCE(SUM(pp.payment_amount), 0) AS total_revenue,
    COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.payment_method = 'cash'), 0) AS cash_revenue,
    COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.payment_method = 'vietqr'), 0) AS vietqr_revenue
  FROM paid_payments pp
  GROUP BY pp.date, pp.branch_id, pp.tenant_id
),
order_facts AS MATERIALIZED (
  SELECT DISTINCT ON (pp.date, pp.branch_id, pp.tenant_id, pp.order_id)
    pp.date,
    pp.branch_id,
    pp.tenant_id,
    pp.order_id,
    pp.total_amount,
    pp.tax_amount,
    pp.subtotal,
    pp.discount_amount,
    pp.order_type
  FROM paid_payments pp
  ORDER BY pp.date, pp.branch_id, pp.tenant_id, pp.order_id, pp.paid_at, pp.payment_id
),
order_daily AS (
  SELECT
    od.date,
    od.branch_id,
    od.tenant_id,
    COUNT(*)::BIGINT AS order_count,
    COALESCE(SUM(od.tax_amount), 0) AS total_tax,
    COALESCE(SUM(od.subtotal), 0) AS subtotal_revenue,
    COALESCE(SUM(od.discount_amount), 0) AS discount_amount,
    COALESCE(SUM(od.total_amount) FILTER (WHERE od.order_type = 'dine_in'), 0) AS dine_in_revenue,
    COALESCE(SUM(od.total_amount) FILTER (WHERE od.order_type = 'takeaway'), 0) AS takeaway_revenue,
    COALESCE(COUNT(od.order_id), 0)::BIGINT AS total_covers
  FROM order_facts od
  GROUP BY od.date, od.branch_id, od.tenant_id
)
SELECT
  pd.date,
  pd.branch_id,
  pd.tenant_id,
  od.order_count,
  pd.total_revenue,
  od.total_tax,
  od.subtotal_revenue,
  od.discount_amount,
  pd.cash_revenue,
  pd.vietqr_revenue,
  od.dine_in_revenue,
  od.takeaway_revenue,
  od.total_covers
FROM payment_daily pd
JOIN order_daily od
  ON od.date = pd.date
 AND od.branch_id = pd.branch_id
 AND od.tenant_id = pd.tenant_id
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk
  ON public.mv_daily_revenue(date, branch_id, tenant_id);

CREATE INDEX idx_mv_daily_revenue_branch_date
  ON public.mv_daily_revenue(branch_id, date);

REVOKE ALL ON TABLE public.mv_daily_revenue FROM PUBLIC;
REVOKE ALL ON TABLE public.mv_daily_revenue FROM anon;
REVOKE ALL ON TABLE public.mv_daily_revenue FROM authenticated;
GRANT ALL ON TABLE public.mv_daily_revenue TO service_role;

REFRESH MATERIALIZED VIEW public.mv_daily_revenue;

INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
VALUES ('mv_daily_revenue', now())
ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

CREATE OR REPLACE FUNCTION public.get_daily_revenue(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  branch_id BIGINT,
  tenant_id BIGINT,
  order_count BIGINT,
  total_revenue NUMERIC,
  total_tax NUMERIC,
  cash_revenue NUMERIC,
  vietqr_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid UUID;
  v_tenant BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc TIMESTAMPTZ;
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

  IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH paid_payments AS MATERIALIZED (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS paid_date,
      p.id AS payment_id,
      p.order_id,
      p.branch_id,
      p.tenant_id,
      p.method,
      p.amount AS payment_amount,
      p.paid_at,
      o.tax_amount
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    WHERE p.tenant_id = v_tenant
      AND p.branch_id = p_branch_id
      AND p.status = 'completed'
      AND p.paid_at >= v_start_utc
      AND p.paid_at < v_end_utc
      AND o.status <> 'cancelled'
      AND o.payment_status = 'paid'
  ),
  payment_daily AS (
    SELECT
      pp.paid_date,
      pp.branch_id,
      pp.tenant_id,
      COALESCE(SUM(pp.payment_amount), 0) AS total_revenue,
      COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.method = 'vietqr'), 0) AS vietqr_revenue
    FROM paid_payments pp
    GROUP BY pp.paid_date, pp.branch_id, pp.tenant_id
  ),
  order_daily AS (
    SELECT
      oq.paid_date,
      oq.branch_id,
      oq.tenant_id,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(oq.tax_amount), 0) AS total_tax
    FROM (
      SELECT DISTINCT ON (pp.paid_date, pp.branch_id, pp.tenant_id, pp.order_id)
        pp.paid_date,
        pp.branch_id,
        pp.tenant_id,
        pp.order_id,
        pp.tax_amount,
        pp.paid_at,
        pp.payment_id
      FROM paid_payments pp
      ORDER BY pp.paid_date, pp.branch_id, pp.tenant_id, pp.order_id, pp.paid_at, pp.payment_id
    ) oq
    GROUP BY oq.paid_date, oq.branch_id, oq.tenant_id
  )
  SELECT
    pd.paid_date AS date,
    pd.branch_id,
    pd.tenant_id,
    od.order_count,
    pd.total_revenue,
    od.total_tax,
    pd.cash_revenue,
    pd.vietqr_revenue
  FROM payment_daily pd
  JOIN order_daily od
    ON od.paid_date = pd.paid_date
   AND od.branch_id = pd.branch_id
   AND od.tenant_id = pd.tenant_id
  ORDER BY pd.paid_date;
END;
$$;

COMMENT ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) IS
  'Live paid-at money collected by day for one branch. total_revenue and method breakdowns use payments.amount; order_count and tax use distinct paid orders.';

CREATE OR REPLACE FUNCTION public.get_revenue_kpis(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  net_revenue NUMERIC,
  subtotal_revenue NUMERIC,
  discount_amount NUMERIC,
  total_tax NUMERIC,
  vat_by_rate JSONB,
  vat_total NUMERIC,
  order_count BIGINT,
  total_covers BIGINT,
  cash_revenue NUMERIC,
  vietqr_revenue NUMERIC,
  dine_in_revenue NUMERIC,
  takeaway_revenue NUMERIC,
  voided_amount NUMERIC,
  voided_count BIGINT,
  refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
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
  WITH paid_payments AS MATERIALIZED (
    SELECT
      p.id AS payment_id,
      p.order_id,
      p.branch_id,
      p.tenant_id,
      p.method,
      p.amount AS payment_amount,
      p.paid_at,
      o.total_amount,
      o.subtotal,
      o.discount_amount,
      o.tax_amount,
      o.order_type
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
  order_facts AS MATERIALIZED (
    SELECT DISTINCT ON (pp.tenant_id, pp.branch_id, pp.order_id)
      pp.order_id AS id,
      pp.tenant_id,
      pp.branch_id,
      pp.total_amount,
      pp.subtotal,
      pp.discount_amount,
      pp.tax_amount,
      pp.order_type
    FROM paid_payments pp
    ORDER BY pp.tenant_id, pp.branch_id, pp.order_id, pp.paid_at, pp.payment_id
  ),
  payment_sales AS (
    SELECT
      COALESCE(SUM(pp.payment_amount), 0) AS net_revenue,
      COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.method = 'vietqr'), 0) AS vietqr_revenue
    FROM paid_payments pp
  ),
  order_sales AS (
    SELECT
      COALESCE(SUM(ofs.subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(ofs.discount_amount), 0) AS discount_amount,
      COALESCE(SUM(ofs.tax_amount), 0) AS total_tax,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(COUNT(ofs.id), 0)::BIGINT AS total_covers,
      COALESCE(SUM(ofs.total_amount) FILTER (WHERE ofs.order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(ofs.total_amount) FILTER (WHERE ofs.order_type = 'takeaway'), 0) AS takeaway_revenue
    FROM order_facts ofs
  ),
  vat_lines AS (
    SELECT
      ROUND(oi.vat_rate::numeric, 2) AS rate,
      SUM((oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))) AS vat
    FROM (
      SELECT
        ofx.id AS order_id,
        ofx.tenant_id,
        CASE
          WHEN SUM(oi2.subtotal) > 0 THEN ofx.total_amount / SUM(oi2.subtotal)
          ELSE 1
        END AS scale
      FROM order_facts ofx
      JOIN public.order_items oi2
        ON oi2.tenant_id = ofx.tenant_id
       AND oi2.order_id = ofx.id
       AND oi2.status <> 'cancelled'
      GROUP BY ofx.id, ofx.tenant_id, ofx.total_amount
    ) scaled
    JOIN public.order_items oi
      ON oi.tenant_id = scaled.tenant_id
     AND oi.order_id = scaled.order_id
     AND oi.status <> 'cancelled'
    GROUP BY ROUND(oi.vat_rate::numeric, 2)
  ),
  vat_split AS (
    SELECT
      COALESCE(jsonb_object_agg(rate::text, vat), '{}'::jsonb) AS vat_by_rate,
      COALESCE(SUM(vat), 0) AS vat_total
    FROM vat_lines
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
    payment_sales.net_revenue,
    order_sales.subtotal_revenue,
    order_sales.discount_amount,
    order_sales.total_tax,
    vat_split.vat_by_rate,
    vat_split.vat_total,
    order_sales.order_count,
    order_sales.total_covers,
    payment_sales.cash_revenue,
    payment_sales.vietqr_revenue,
    order_sales.dine_in_revenue,
    order_sales.takeaway_revenue,
    refunds.voided_amount,
    refunds.voided_count,
    now() AS refreshed_at
  FROM payment_sales
  CROSS JOIN order_sales
  CROSS JOIN vat_split
  CROSS JOIN refunds;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_kpis(BIGINT, DATE, DATE) IS
  'Finance KPI single row. net_revenue/cash/vietqr are money collected from payments.amount; subtotal/discount/tax/order_count are distinct paid-order sales facts.';

CREATE OR REPLACE FUNCTION public.get_revenue_rollup(
  p_branch_id BIGINT,
  p_start_date DATE,
  p_end_date DATE,
  p_granularity TEXT
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  branch_id BIGINT,
  order_count BIGINT,
  total_revenue NUMERIC,
  total_tax NUMERIC,
  subtotal_revenue NUMERIC,
  discount_amount NUMERIC,
  cash_revenue NUMERIC,
  vietqr_revenue NUMERIC,
  dine_in_revenue NUMERIC,
  takeaway_revenue NUMERIC,
  total_covers BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
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
  WITH paid_payments AS MATERIALIZED (
    SELECT
      (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS paid_date,
      p.id AS payment_id,
      p.order_id,
      p.branch_id,
      p.tenant_id,
      p.method,
      p.amount AS payment_amount,
      p.paid_at,
      o.total_amount,
      o.tax_amount,
      o.subtotal,
      o.discount_amount,
      o.order_type
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
  payment_daily AS (
    SELECT
      pp.paid_date,
      pp.branch_id,
      COALESCE(SUM(pp.payment_amount), 0) AS total_revenue,
      COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.method = 'cash'), 0) AS cash_revenue,
      COALESCE(SUM(pp.payment_amount) FILTER (WHERE pp.method = 'vietqr'), 0) AS vietqr_revenue
    FROM paid_payments pp
    GROUP BY pp.paid_date, pp.branch_id
  ),
  order_daily AS (
    SELECT
      oq.paid_date,
      oq.branch_id,
      COUNT(*)::BIGINT AS order_count,
      COALESCE(SUM(oq.tax_amount), 0) AS total_tax,
      COALESCE(SUM(oq.subtotal), 0) AS subtotal_revenue,
      COALESCE(SUM(oq.discount_amount), 0) AS discount_amount,
      COALESCE(SUM(oq.total_amount) FILTER (WHERE oq.order_type = 'dine_in'), 0) AS dine_in_revenue,
      COALESCE(SUM(oq.total_amount) FILTER (WHERE oq.order_type = 'takeaway'), 0) AS takeaway_revenue,
      COALESCE(COUNT(oq.order_id), 0)::BIGINT AS total_covers
    FROM (
      SELECT DISTINCT ON (pp.paid_date, pp.branch_id, pp.tenant_id, pp.order_id)
        pp.paid_date,
        pp.branch_id,
        pp.tenant_id,
        pp.order_id,
        pp.total_amount,
        pp.tax_amount,
        pp.subtotal,
        pp.discount_amount,
        pp.order_type,
        pp.paid_at,
        pp.payment_id
      FROM paid_payments pp
      ORDER BY pp.paid_date, pp.branch_id, pp.tenant_id, pp.order_id, pp.paid_at, pp.payment_id
    ) oq
    GROUP BY oq.paid_date, oq.branch_id
  ),
  live_daily AS (
    SELECT
      pd.paid_date,
      pd.branch_id,
      od.order_count,
      pd.total_revenue,
      od.total_tax,
      od.subtotal_revenue,
      od.discount_amount,
      pd.cash_revenue,
      pd.vietqr_revenue,
      od.dine_in_revenue,
      od.takeaway_revenue,
      od.total_covers
    FROM payment_daily pd
    JOIN order_daily od
      ON od.paid_date = pd.paid_date
     AND od.branch_id = pd.branch_id
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
    COALESCE(SUM(b.dine_in_revenue), 0) AS dine_in_revenue,
    COALESCE(SUM(b.takeaway_revenue), 0) AS takeaway_revenue,
    COALESCE(SUM(b.total_covers), 0)::BIGINT AS total_covers
  FROM bucketed b
  GROUP BY b.p_start, b.p_end, b.branch_id
  ORDER BY b.p_start, b.branch_id;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) IS
  'Live paid-at Finance rollup. total_revenue and method breakdowns use payments.amount; order/tax/discount fields use distinct paid orders.';

REVOKE ALL ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_revenue_kpis(BIGINT, DATE, DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue(BIGINT, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_kpis(BIGINT, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_rollup(BIGINT, DATE, DATE, TEXT) TO authenticated, service_role;

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
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid;
  v_tenant bigint;
  v_days integer;
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_has_tenant_scope boolean;
  v_branch_ids bigint[];
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

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start/end required' USING ERRCODE = '22023';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start > end' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_days > 90 THEN
    RAISE EXCEPTION 'range > 90 days' USING ERRCODE = '22023';
  END IF;

  SELECT fs.has_tenant_scope, fs.branch_ids
  INTO v_has_tenant_scope, v_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') fs;

  IF p_branch_id IS NULL THEN
    IF NOT (v_has_tenant_scope OR cardinality(v_branch_ids) > 0) THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (v_has_tenant_scope OR p_branch_id = ANY(v_branch_ids)) THEN
    RAISE EXCEPTION 'permission denied: finance:view required'
      USING ERRCODE = '42501';
  END IF;

  v_start_utc := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH scoped_payments AS MATERIALIZED (
    SELECT
      p.id AS payment_id,
      p.method,
      p.amount,
      o.id AS order_id,
      o.subtotal,
      o.discount_amount,
      COALESCE(ps.opened_by, p.created_by) AS cashier_id
    FROM public.payments p
    JOIN public.orders o
      ON o.id = p.order_id
     AND o.tenant_id = p.tenant_id
     AND o.branch_id = p.branch_id
    LEFT JOIN public.pos_sessions ps
      ON ps.id = o.pos_session_id
     AND ps.tenant_id = o.tenant_id
     AND ps.branch_id = o.branch_id
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
  order_rows AS (
    SELECT DISTINCT ON (sp.order_id)
      sp.cashier_id,
      sp.order_id,
      sp.subtotal,
      sp.discount_amount
    FROM scoped_payments sp
    ORDER BY sp.order_id, sp.payment_id DESC
  ),
  orders_by_cashier AS (
    SELECT
      row_data.cashier_id,
      COUNT(*)::bigint AS order_count,
      COALESCE(SUM(row_data.subtotal - row_data.discount_amount), 0)::numeric AS net_revenue
    FROM order_rows row_data
    GROUP BY row_data.cashier_id
  ),
  payments_by_cashier AS (
    SELECT
      sp.cashier_id,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'cash'), 0)::numeric AS cash_revenue,
      COALESCE(SUM(sp.amount) FILTER (WHERE sp.method = 'vietqr'), 0)::numeric AS qr_revenue
    FROM scoped_payments sp
    GROUP BY sp.cashier_id
  )
  SELECT
    totals.cashier_id,
    COALESCE(pr.full_name, '— Không xác định')::text AS cashier_name,
    totals.order_count,
    totals.net_revenue,
    COALESCE(methods.cash_revenue, 0)::numeric AS cash_revenue,
    COALESCE(methods.qr_revenue, 0)::numeric AS qr_revenue
  FROM orders_by_cashier totals
  LEFT JOIN payments_by_cashier methods
    ON methods.cashier_id = totals.cashier_id
  LEFT JOIN public.profiles pr
    ON pr.id = totals.cashier_id
  ORDER BY totals.net_revenue DESC;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_by_cashier(bigint, date, date) IS
  'Cashier revenue from completed cash and VietQR payments.';

REVOKE ALL ON FUNCTION public.get_revenue_by_cashier(bigint, date, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_cashier(bigint, date, date)
  TO authenticated, service_role;

COMMIT;
