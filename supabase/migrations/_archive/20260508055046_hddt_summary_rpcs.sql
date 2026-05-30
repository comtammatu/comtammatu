-- =============================================================
-- HĐĐT Hybrid via MISA — PR-2 RPCs + junction trigger
-- Per owner-approved HĐĐT summary design from 2026-05-08.
--
-- ⚠ NOTE: aggregate_daily_b2c_invoice in this file has 2 bugs caught
-- in smoke test, FIXED in 20260508055230_hddt_aggregate_rpc_fixes.sql:
--   1. orders.paid_at doesn't exist; canonical bucket is payments.paid_at
--   2. pg_advisory_xact_lock(BIGINT, BIGINT) overload missing in PG
-- New environments running migrations from scratch end up with the fixed
-- aggregate function (CREATE OR REPLACE in fix migration overwrites this).
--
-- Adds:
--   1. tax_invoices.created_by → nullable. NULL semantic = system-initiated
--      (cron). All existing rows + B2B realtime path keep passing user.id.
--      Skipped synthetic SYSTEM_CRON profile seed because profiles.id has
--      FK to auth.users — synthetic auth user is fragile across Supabase
--      upgrades. Cleaner to relax the constraint.
--   2. tax_invoice_orders trigger trg_tio_one_active_summary — enforces
--      "1 order in at most 1 active summary HĐ" (Postgres partial unique
--      can't subquery; trigger is the workaround per PR-1 schema comment).
--   3. _compute_vat_breakdown(p_order_ids BIGINT[]) — STABLE helper that
--      mirrors apps/web/app/finance/actions.ts:128-186 per-line VAT
--      aggregation with scale absorbing order-level discount. Reused by
--      aggregate_daily_b2c_invoice + future B2B refactor (PR-3).
--   4. transition_tax_invoice_state_as_system — service-role-only overload
--      of canonical transition RPC. Per D1 (owner 2026-05-08): cron has no
--      auth.uid(), so we need a separate gated entry point. HARD GATE on
--      auth.role() = 'service_role'.
--   5. aggregate_daily_b2c_invoice(p_branch_id, p_summary_date, p_actor) —
--      main batch RPC. Splits "lock + insert draft + junction" from MISA
--      call (caller drives provider via PR-3+). Returns line_items_for_misa
--      ready-to-send payload + summary metadata.
-- =============================================================

-- ─── 1. tax_invoices.created_by → nullable ───

ALTER TABLE public.tax_invoices ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN public.tax_invoices.created_by IS
  'NULL semantic = system-initiated (cron-driven daily B2C summary). B2B realtime + admin manual trigger always pass auth.uid(). FK to profiles preserved when set.';


-- ─── 2. tax_invoice_orders trigger: 1 active summary per order ───

CREATE OR REPLACE FUNCTION public.tio_assert_one_active_summary_per_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tax_invoice_orders tio
    JOIN public.tax_invoices ti ON ti.id = tio.tax_invoice_id
    WHERE tio.order_id = NEW.order_id
      AND tio.tax_invoice_id <> NEW.tax_invoice_id
      AND ti.status NOT IN ('cancelled', 'replaced')
  ) THEN
    RAISE EXCEPTION 'order % already in active summary HĐ', NEW.order_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tio_one_active_summary
BEFORE INSERT ON public.tax_invoice_orders
FOR EACH ROW EXECUTE FUNCTION public.tio_assert_one_active_summary_per_order();


-- ─── 3. VAT breakdown helper ───

CREATE OR REPLACE FUNCTION public._compute_vat_breakdown(
  p_order_ids BIGINT[]
)
RETURNS TABLE (
  vat_rate      NUMERIC(5,2),
  line_gross    NUMERIC(15,2),
  line_subtotal NUMERIC(15,2),
  line_vat      NUMERIC(15,2)
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH order_items_sum AS (
    SELECT
      oi.order_id,
      SUM(oi.subtotal) AS items_sum
    FROM public.order_items oi
    WHERE oi.order_id = ANY(p_order_ids)
      AND oi.status <> 'cancelled'
    GROUP BY oi.order_id
  ),
  scaled AS (
    SELECT
      oi.vat_rate,
      (oi.subtotal * (o.total_amount / NULLIF(ois.items_sum, 0))) AS gross
    FROM public.order_items oi
    JOIN public.orders o            ON o.id = oi.order_id
    JOIN order_items_sum ois        ON ois.order_id = oi.order_id
    WHERE oi.order_id = ANY(p_order_ids)
      AND oi.status <> 'cancelled'
      AND ois.items_sum > 0
  ),
  by_rate AS (
    SELECT
      scaled.vat_rate,
      SUM(scaled.gross)::numeric(15,2) AS line_gross
    FROM scaled
    GROUP BY scaled.vat_rate
  )
  SELECT
    by_rate.vat_rate,
    by_rate.line_gross,
    (by_rate.line_gross / (1 + by_rate.vat_rate / 100))::numeric(15,2) AS line_subtotal,
    (by_rate.line_gross
       - (by_rate.line_gross / (1 + by_rate.vat_rate / 100))::numeric(15,2)
    )::numeric(15,2) AS line_vat
  FROM by_rate
  ORDER BY by_rate.vat_rate;
$$;

REVOKE ALL ON FUNCTION public._compute_vat_breakdown(BIGINT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._compute_vat_breakdown(BIGINT[]) TO authenticated, service_role;


-- ─── 4. Service-role transition overload ───

CREATE OR REPLACE FUNCTION public.transition_tax_invoice_state_as_system(
  p_tax_invoice_id BIGINT,
  p_to_status      TEXT,
  p_actor          UUID DEFAULT NULL,
  p_payload        JSONB DEFAULT NULL,
  p_note           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_allowed BOOLEAN := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invoice
  FROM public.tax_invoices
  WHERE id = p_tax_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tax_invoice_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_allowed := (
    (v_invoice.status = 'draft'     AND p_to_status IN ('signing', 'cancelled'))
    OR (v_invoice.status = 'signing'   AND p_to_status IN ('submitted', 'issued', 'draft', 'cancelled'))
    OR (v_invoice.status = 'submitted' AND p_to_status IN ('issued', 'cancelled'))
    OR (v_invoice.status = 'issued'    AND p_to_status IN ('cancelled', 'replaced'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'illegal_transition: % -> %', v_invoice.status, p_to_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.tax_invoices
  SET
    status = p_to_status,
    issued_at = CASE WHEN p_to_status = 'issued'    THEN now() ELSE issued_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled' THEN now() ELSE cancelled_at END,
    signing_started_at = CASE WHEN p_to_status = 'signing'   THEN now() ELSE signing_started_at END,
    provider_data = CASE
      WHEN p_payload IS NULL THEN provider_data
      WHEN provider_data IS NULL THEN p_payload
      ELSE provider_data || p_payload
    END,
    updated_at = now()
  WHERE id = p_tax_invoice_id;

  INSERT INTO public.tax_invoice_events
    (tax_invoice_id, tenant_id, from_status, to_status, actor_id, payload, note)
  VALUES
    (p_tax_invoice_id, v_invoice.tenant_id, v_invoice.status, p_to_status, p_actor, p_payload, p_note);

  RETURN jsonb_build_object(
    'tax_invoice_id', p_tax_invoice_id,
    'from_status', v_invoice.status,
    'to_status', p_to_status,
    'actor', p_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_tax_invoice_state_as_system(BIGINT, TEXT, UUID, JSONB, TEXT)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.transition_tax_invoice_state_as_system(BIGINT, TEXT, UUID, JSONB, TEXT)
  TO service_role;


-- ─── 5. Daily B2C aggregation RPC (BUGGY — SUPERSEDED by 20260508055230) ───

CREATE OR REPLACE FUNCTION public.aggregate_daily_b2c_invoice(
  p_branch_id    BIGINT,
  p_summary_date DATE,
  p_actor        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id = p_branch_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

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

  -- ⚠ BUG 2: pg_advisory_xact_lock(BIGINT, BIGINT) overload missing.
  PERFORM pg_advisory_xact_lock(p_branch_id, EXTRACT(EPOCH FROM p_summary_date)::BIGINT);

  SELECT id INTO v_invoice_id
  FROM public.tax_invoices
  WHERE branch_id = p_branch_id
    AND summary_date = p_summary_date
    AND invoice_kind = 'daily_summary'
    AND status NOT IN ('cancelled', 'replaced');
  IF FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_exists', 'tax_invoice_id', v_invoice_id);
  END IF;

  -- ⚠ BUG 1: orders.paid_at doesn't exist. Canonical bucket is payments.paid_at.
  SELECT array_agg(o.id ORDER BY o.id)
  INTO v_eligible
  FROM public.orders o
  WHERE o.tenant_id = v_tenant_id
    AND o.branch_id = p_branch_id
    AND (o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_summary_date
    AND o.payment_status = 'paid'
    AND o.status NOT IN ('cancelled', 'refunded')
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
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_eligible_orders', 'order_count', 0);
  END IF;

  v_order_count := array_length(v_eligible, 1);

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('vat_rate', vat_rate, 'line_gross', line_gross, 'line_subtotal', line_subtotal, 'line_vat', line_vat) ORDER BY vat_rate), '[]'::jsonb),
    COALESCE(SUM(line_subtotal), 0),
    COALESCE(SUM(line_vat), 0)
  INTO v_breakdown, v_subtotal, v_vat_amount
  FROM public._compute_vat_breakdown(v_eligible);

  v_total := v_subtotal + v_vat_amount;

  SELECT vat_rate INTO v_pred_rate FROM public._compute_vat_breakdown(v_eligible) ORDER BY line_gross DESC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'name', CASE
      WHEN vat_rate = 8  THEN 'Đồ ăn (8%)'
      WHEN vat_rate = 10 THEN 'Đồ uống có cồn (10%)'
      WHEN vat_rate = 5  THEN 'Hàng hoá khác (5%)'
      ELSE 'Hàng hoá VAT ' || vat_rate || '%'
    END,
    'unit', 'Phần', 'quantity', 1, 'unit_price', line_subtotal,
    'amount', line_subtotal, 'vat_rate', vat_rate, 'vat_amount', line_vat
  ) ORDER BY vat_rate)
  INTO v_line_items
  FROM public._compute_vat_breakdown(v_eligible);

  INSERT INTO public.tax_invoices (
    tenant_id, branch_id, order_id, status, invoice_kind, summary_date, summary_orders_count,
    buyer_name, buyer_tax_code, buyer_address, subtotal, vat_rate, vat_amount, total_amount,
    provider, provider_ref, provider_data, created_by
  ) VALUES (
    v_tenant_id, p_branch_id, NULL, 'draft', 'daily_summary', p_summary_date, v_order_count,
    'Khách hàng không lấy hóa đơn', NULL, NULL, v_subtotal, v_pred_rate, v_vat_amount, v_total,
    'misa', NULL, jsonb_build_object('vat_breakdown', v_breakdown), v_actor
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.tax_invoice_orders
    (tax_invoice_id, order_id, tenant_id, branch_id, vat_rate, line_subtotal, line_vat_amount)
  SELECT
    v_invoice_id, per_order.order_id, v_tenant_id, p_branch_id,
    per_order.pred_rate, per_order.order_subtotal, per_order.order_vat
  FROM (
    SELECT
      o.id AS order_id,
      SUM((oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0))) / (1 + oi.vat_rate / 100))::numeric(15,2) AS order_subtotal,
      SUM((oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0)))
        - (oi.subtotal * (o.total_amount / NULLIF(items_sum.s, 0))) / (1 + oi.vat_rate / 100))::numeric(15,2) AS order_vat,
      (SELECT oi3.vat_rate FROM public.order_items oi3
        WHERE oi3.order_id = o.id AND oi3.status <> 'cancelled'
        GROUP BY oi3.vat_rate ORDER BY SUM(oi3.subtotal) DESC LIMIT 1) AS pred_rate
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN LATERAL (
      SELECT COALESCE(SUM(subtotal), 0) AS s FROM public.order_items WHERE order_id = o.id AND status <> 'cancelled'
    ) items_sum ON true
    WHERE o.id = ANY(v_eligible) AND oi.status <> 'cancelled' AND items_sum.s > 0
    GROUP BY o.id, o.total_amount, items_sum.s
  ) per_order;

  RETURN jsonb_build_object(
    'tax_invoice_id', v_invoice_id, 'order_count', v_order_count,
    'subtotal', v_subtotal, 'vat_amount', v_vat_amount, 'total_amount', v_total,
    'header_vat_rate', v_pred_rate, 'vat_breakdown', v_breakdown,
    'order_ids', v_eligible, 'line_items_for_misa', COALESCE(v_line_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aggregate_daily_b2c_invoice(BIGINT, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_b2c_invoice(BIGINT, DATE, UUID) TO authenticated, service_role;


-- ─── 6. Function comments ───

COMMENT ON FUNCTION public._compute_vat_breakdown(BIGINT[]) IS
  'Per-line VAT aggregation across input orders. Mirrors apps/web/app/finance/actions.ts:128-186. Scale absorbs order-level discount. Returns 1 row per VAT rate present.';

COMMENT ON FUNCTION public.transition_tax_invoice_state_as_system(BIGINT, TEXT, UUID, JSONB, TEXT) IS
  'Service-role-only overload of transition_tax_invoice_state. Use from cron routes that need to drive HĐĐT state machine without auth.uid(). Per D1 owner decision 2026-05-08.';

COMMENT ON FUNCTION public.aggregate_daily_b2c_invoice(BIGINT, DATE, UUID) IS
  'Daily B2C summary HĐ aggregation per TT 78/2021 §11.4. Creates draft tax_invoices row + tax_invoice_orders junction. Caller drives MISA + state transition. Idempotent via advisory lock + UNIQUE partial. Skip-and-continue: returns {skipped:true, reason} for already_exists / no_eligible_orders.';
