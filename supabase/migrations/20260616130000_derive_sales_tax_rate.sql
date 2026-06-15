-- derive_sales_tax_rate: source the INTERNAL order_items.vat_rate snapshot from
-- a tier-based GTGT resolver (annual-revenue group) instead of a hardcoded 8.00
-- fallback / menu_items.vat_rate; generalize get_revenue_kpis VAT buckets to a
-- rate-keyed jsonb; drop the now-dead 8.00 column defaults. Customer/CQT-facing
-- HĐĐT emit is untouched — this is internal reporting only.

BEGIN;

-- resolve_gtgt_rate: HKD GTGT % on revenue (direct method, ăn uống) for the
-- internal vat_rate snapshot. Canonical SoT = packages/shared/src/tax/
-- sales-tax-versions.ts; keep in parity. Tiers (NĐ 68/2026 + NĐ 141/2026):
--   annual gross < 1 tỷ  → 0 (không chịu GTGT)
--   annual gross < 3 tỷ  → 2.40 in [2025-07-01,2026-12-31] else 3.00 (group2)
--   annual gross ≥ 3 tỷ  → 2.40 in window else 3.00 (group3/4)
-- TNCN is not modeled here — this fn yields only the GTGT rate. STABLE so the
-- planner can cache the result across rows within a statement (the BEFORE
-- INSERT trigger calls it once per row otherwise).
CREATE OR REPLACE FUNCTION public.resolve_gtgt_rate(
  p_tenant_id bigint,
  p_at_date date DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year_start  date;
  v_days_elapsed int;
  v_ytd_gross   numeric;
  v_annual      numeric;
  v_in_window   boolean;
  v_base        numeric;
BEGIN
  v_year_start := date_trunc('year', p_at_date)::date;
  v_days_elapsed := (p_at_date - v_year_start) + 1;

  -- YTD gross paid revenue (rate-independent → use orders.total_amount), keyed
  -- on the completed payment whose paid_at VN-date falls in the current year.
  SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_ytd_gross
  FROM public.payments p
  JOIN public.orders o
    ON o.id = p.order_id
   AND o.tenant_id = p.tenant_id
   AND o.branch_id = p.branch_id
  WHERE p.tenant_id = p_tenant_id
    AND p.status = 'completed'
    AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= v_year_start
    AND (p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_at_date
    AND o.status <> 'cancelled'
    AND o.payment_status = 'paid';

  -- Annualize YTD: gross / days_elapsed * 365.
  v_annual := v_ytd_gross / NULLIF(v_days_elapsed, 0) * 365;

  -- Exempt tier: < 1 tỷ/năm.
  IF v_annual < 1000000000 THEN
    RETURN 0::numeric(5,2);
  END IF;

  -- Temporary GTGT reduction window (NQ 204/2025 + NĐ 174/2025): ăn uống
  -- trực tiếp 3% → 2,4% for dates in [2025-07-01, 2026-12-31].
  v_in_window := p_at_date >= DATE '2025-07-01' AND p_at_date <= DATE '2026-12-31';

  -- Chargeable tiers (group2 <3 tỷ, group3/4 ≥3 tỷ) share the same base rate.
  v_base := CASE WHEN v_in_window THEN 2.40 ELSE 3.00 END;

  RETURN v_base::numeric(5,2);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_gtgt_rate(bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_gtgt_rate(bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_gtgt_rate(bigint, date) TO service_role;

-- populate_order_item_vat_rate: source the per-line internal vat_rate snapshot
-- from resolve_gtgt_rate(tenant) instead of menu_items.vat_rate / hardcoded
-- 8.00. NULL-guards preserved: caller-supplied vat_rate (incl. explicit 0.00 for
-- a VAT-exempt line) is never overwritten.
CREATE OR REPLACE FUNCTION public.populate_order_item_vat_rate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only fill when caller didn't explicitly set it. Treats 0.00 as
  -- a legitimate value (VAT-exempt item) so we don't overwrite it.
  IF NEW.vat_rate IS NULL THEN
    NEW.vat_rate := public.resolve_gtgt_rate(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.populate_order_item_vat_rate() IS 'Fills order_items.vat_rate from resolve_gtgt_rate(tenant) at INSERT time — the HKD revenue-tier GTGT % (canonical SoT packages/shared/src/tax/sales-tax-versions.ts). Rule VAT-PER-LINE-NOT-PER-INVOICE — every order line carries its own VAT rate snapshot so invoice issuance can aggregate correctly even for mixed-rate orders.';

-- get_revenue_kpis: generalize VAT buckets. Drop vat_8_amount/vat_10_amount;
-- add vat_by_rate (jsonb rate→summed vat) + vat_total (sum of per-line vat).
-- RETURNS signature change → DROP then CREATE. Everything else byte-identical
-- to 20260616100000.
DROP FUNCTION IF EXISTS public.get_revenue_kpis(bigint, date, date);

CREATE FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) RETURNS TABLE(net_revenue numeric, subtotal_revenue numeric, discount_amount numeric, total_tax numeric, vat_by_rate jsonb, vat_total numeric, order_count bigint, total_covers bigint, cash_revenue numeric, vietqr_revenue numeric, momo_revenue numeric, dine_in_revenue numeric, takeaway_revenue numeric, voided_amount numeric, voided_count bigint, refreshed_at timestamp with time zone)
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
  vat_lines AS (
    SELECT
      ROUND(oi.vat_rate::numeric, 2) AS rate,
      SUM((oi.subtotal * scaled.scale) - ((oi.subtotal * scaled.scale) / (1 + oi.vat_rate / 100))) AS vat
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
    sales.net_revenue,
    sales.subtotal_revenue,
    sales.discount_amount,
    sales.total_tax,
    vat_split.vat_by_rate,
    vat_split.vat_total,
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

REVOKE ALL ON FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) TO service_role;
GRANT ALL ON FUNCTION public.get_revenue_kpis(p_branch_id bigint, p_start_date date, p_end_date date) TO authenticated;

-- Drop the dead 8.00 defaults. order_items.vat_rate is now filled by the
-- BEFORE INSERT trigger; tax_invoices.vat_rate is always set by the issuer;
-- menu_items.vat_rate stops being the rate source (the trigger derives). The
-- columns stay NOT NULL — every existing row already has a value and writers
-- supply one. supplier_invoices.vat_rate (input docs) is out of scope.
ALTER TABLE public.order_items ALTER COLUMN vat_rate DROP DEFAULT;
ALTER TABLE public.tax_invoices ALTER COLUMN vat_rate DROP DEFAULT;
ALTER TABLE public.menu_items ALTER COLUMN vat_rate DROP DEFAULT;

COMMIT;
