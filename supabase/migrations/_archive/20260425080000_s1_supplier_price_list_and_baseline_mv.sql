-- =============================================================
-- S1 — Supplier Price List (Q6 tier 1) + GRN baseline MV (Q3)
--
-- Sections:
--   (A) suppliers.tax_code partial UNIQUE (anti supplier-swap)
--   (B) supplier_price_list table + priority + RLS
--   (C) mv_grn_price_baseline MV (RLS wrapper — regression rule
--       RLS-NOT-APPLIED-ON-MV) + hourly pg_cron refresh
--   (D) resolve_po_price + batch resolver for PO prefill
--
-- "Manual upsert only, no auto-trigger" — the auto-upsert of
-- grn_last on GRN approve is Q6 S2 scope and intentionally NOT
-- in this migration.
--
-- Current docs: docs/ref/inventory.md + docs/ref/inventory-sop.md
-- Regression: tasks/regressions.md BASELINE-SAMPLE-MIN,
--             RLS-NOT-APPLIED-ON-MV
-- =============================================================


-- =============================================================
-- (A) suppliers.tax_code partial UNIQUE
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tax_code_tenant_unique
  ON public.suppliers (tenant_id, tax_code)
  WHERE tax_code IS NOT NULL;

COMMENT ON INDEX public.suppliers_tax_code_tenant_unique IS
  'Partial UNIQUE — blocks duplicate tax_code inside a tenant to stop supplier-swap gaming for Q3 baseline. NULL tax_code allowed (legacy rows).';


-- =============================================================
-- (B) supplier_price_list
-- =============================================================

CREATE TABLE IF NOT EXISTS public.supplier_price_list (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id    BIGINT NOT NULL REFERENCES public.suppliers(id)   ON DELETE CASCADE,
  ingredient_id  BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  uom            TEXT   NOT NULL,           -- TEXT per S1 decision; migrate to FK when units_of_measure ships
  unit_price     NUMERIC(15,2) NOT NULL CHECK (unit_price > 0),
  currency       TEXT   NOT NULL DEFAULT 'VND',
  source         TEXT   NOT NULL CHECK (source IN ('contract','quotation','grn_last','manual')),
  effective_from DATE   NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,
  min_order_qty  NUMERIC(15,3),
  lead_time_days SMALLINT,
  source_ref     JSONB,
  priority       SMALLINT NOT NULL GENERATED ALWAYS AS (
    CASE source
      WHEN 'contract'  THEN 1
      WHEN 'quotation' THEN 2
      WHEN 'grn_last'  THEN 3
      WHEN 'manual'    THEN 4
    END
  ) STORED,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.supplier_price_list IS
  'Hybrid price list with 3 data sources. Priority: contract > quotation > grn_last > manual. grn_last is auto-upserted by S2 trigger (not yet installed). Resolver resolve_po_price() returns the lowest-priority effective row for PO prefill.';

-- At most one active grn_last row per (tenant, supplier, ingredient, uom)
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_list_grn_last_active
  ON public.supplier_price_list (tenant_id, supplier_id, ingredient_id, uom)
  WHERE source = 'grn_last' AND effective_to IS NULL;

-- Unique per (source, effective_from) for contract/quotation versions
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_list_contract_version
  ON public.supplier_price_list (tenant_id, supplier_id, ingredient_id, uom, source, effective_from)
  WHERE source IN ('contract','quotation');

-- Lookup index for resolver
CREATE INDEX IF NOT EXISTS idx_price_list_lookup
  ON public.supplier_price_list (tenant_id, supplier_id, ingredient_id, uom, priority, effective_from DESC);

ALTER TABLE public.supplier_price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_list_read"
  ON public.supplier_price_list
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_read')
  );

CREATE POLICY "price_list_write"
  ON public.supplier_price_list
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );


-- =============================================================
-- (C) mv_grn_price_baseline + SECURITY DEFINER wrapper + cron
-- =============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_grn_price_baseline;

CREATE MATERIALIZED VIEW public.mv_grn_price_baseline AS
SELECT
  grn.tenant_id,
  grn.supplier_id,
  gi.ingredient_id,
  gi.unit AS uom,
  AVG(gi.unit_cost)::NUMERIC(15,2)  AS avg_30d,
  COUNT(*)::INT                      AS sample_n,
  MAX(grn.received_date)             AS last_seen_at
FROM public.grn_items gi
JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
WHERE grn.status = 'confirmed'
  AND grn.received_date >= (now() - INTERVAL '30 days')::DATE
  AND gi.received_quantity > 0
  AND gi.unit_cost IS NOT NULL
GROUP BY grn.tenant_id, grn.supplier_id, gi.ingredient_id, gi.unit;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_grn_price_baseline
  ON public.mv_grn_price_baseline (tenant_id, supplier_id, ingredient_id, uom);

COMMENT ON MATERIALIZED VIEW public.mv_grn_price_baseline IS
  'Rolling 30-day average GRN unit_cost per (tenant, supplier, ingredient, uom). Refreshed hourly via pg_cron. Access ONLY through get_grn_price_baseline() — direct SELECT revoked per regression rule RLS-NOT-APPLIED-ON-MV.';

-- Enforce regression rule: revoke direct access from authenticated role
REVOKE ALL ON public.mv_grn_price_baseline FROM authenticated;
REVOKE ALL ON public.mv_grn_price_baseline FROM anon;

-- SECURITY DEFINER wrapper re-checks tenant + permission
CREATE OR REPLACE FUNCTION public.get_grn_price_baseline(
  p_supplier_id   BIGINT,
  p_ingredient_id BIGINT,
  p_uom           TEXT DEFAULT NULL
)
RETURNS TABLE (
  avg_30d       NUMERIC(15,2),
  sample_n      INT,
  last_seen_at  DATE,
  baseline_source TEXT  -- 'same_supplier' | 'any_supplier' | 'none'
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant       BIGINT := public.auth_tenant_id();
  v_primary      RECORD;
  v_fallback     RECORD;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL, 'procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Primary: same supplier
  SELECT b.avg_30d, b.sample_n, b.last_seen_at
    INTO v_primary
  FROM public.mv_grn_price_baseline b
  WHERE b.tenant_id     = v_tenant
    AND b.supplier_id   = p_supplier_id
    AND b.ingredient_id = p_ingredient_id
    AND (p_uom IS NULL OR b.uom = p_uom);

  IF FOUND AND v_primary.sample_n >= 3 THEN
    RETURN QUERY SELECT v_primary.avg_30d, v_primary.sample_n, v_primary.last_seen_at, 'same_supplier'::TEXT;
    RETURN;
  END IF;

  -- Fallback: any supplier, same ingredient + uom
  SELECT (SUM(b.avg_30d * b.sample_n) / NULLIF(SUM(b.sample_n), 0))::NUMERIC(15,2) AS avg_30d,
         SUM(b.sample_n)::INT AS sample_n,
         MAX(b.last_seen_at)  AS last_seen_at
    INTO v_fallback
  FROM public.mv_grn_price_baseline b
  WHERE b.tenant_id     = v_tenant
    AND b.ingredient_id = p_ingredient_id
    AND (p_uom IS NULL OR b.uom = p_uom);

  IF v_fallback.sample_n IS NOT NULL AND v_fallback.sample_n >= 3 THEN
    RETURN QUERY SELECT v_fallback.avg_30d, v_fallback.sample_n, v_fallback.last_seen_at, 'any_supplier'::TEXT;
    RETURN;
  END IF;

  -- No valid baseline — caller must require manual approval (Q3 rule)
  RETURN QUERY SELECT NULL::NUMERIC(15,2), 0::INT, NULL::DATE, 'none'::TEXT;
END;
$function$;

COMMENT ON FUNCTION public.get_grn_price_baseline(BIGINT, BIGINT, TEXT) IS
  'Resolver for GRN price variance baseline. Enforces sample_n>=3 (BASELINE-SAMPLE-MIN). Fallback chain: same_supplier -> any_supplier -> none (manual approve required).';

GRANT EXECUTE ON FUNCTION public.get_grn_price_baseline(BIGINT, BIGINT, TEXT)
  TO authenticated;

-- Hourly refresh
DO $sched$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_grn_price_baseline') THEN
    PERFORM cron.schedule(
      'refresh_mv_grn_price_baseline',
      '5 * * * *',   -- HH:05 every hour
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_grn_price_baseline;'
    );
  END IF;
END $sched$;


-- =============================================================
-- (D) resolve_po_price + batch resolver
-- =============================================================

CREATE OR REPLACE FUNCTION public.resolve_po_price(
  p_supplier_id   BIGINT,
  p_ingredient_id BIGINT,
  p_uom           TEXT
)
RETURNS TABLE (
  unit_price     NUMERIC(15,2),
  source         TEXT,
  effective_from DATE,
  min_order_qty  NUMERIC(15,3),
  lead_time_days SMALLINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL, 'procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT spl.unit_price, spl.source, spl.effective_from, spl.min_order_qty, spl.lead_time_days
  FROM public.supplier_price_list spl
  WHERE spl.tenant_id     = v_tenant
    AND spl.supplier_id   = p_supplier_id
    AND spl.ingredient_id = p_ingredient_id
    AND spl.uom           = p_uom
    AND spl.effective_from <= CURRENT_DATE
    AND (spl.effective_to IS NULL OR spl.effective_to >= CURRENT_DATE)
  ORDER BY spl.priority ASC, spl.effective_from DESC
  LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION public.resolve_po_price(BIGINT, BIGINT, TEXT) IS
  'Resolve active price for PO prefill. Returns single row: contract > quotation > grn_last > manual. No row = not priced.';

GRANT EXECUTE ON FUNCTION public.resolve_po_price(BIGINT, BIGINT, TEXT)
  TO authenticated;

-- Batch resolver for multi-line PO prefill
-- Input: [{"ingredient_id": 5, "uom": "kg"}, ...]
CREATE OR REPLACE FUNCTION public.resolve_po_prices_batch(
  p_supplier_id BIGINT,
  p_items       JSONB
)
RETURNS TABLE (
  ingredient_id  BIGINT,
  uom            TEXT,
  unit_price     NUMERIC(15,2),
  source         TEXT,
  effective_from DATE,
  min_order_qty  NUMERIC(15,3),
  lead_time_days SMALLINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL, 'procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH inputs AS (
    SELECT (v->>'ingredient_id')::BIGINT AS ing_id,
           (v->>'uom')::TEXT             AS u
    FROM jsonb_array_elements(p_items) AS v
  ),
  ranked AS (
    SELECT i.ing_id, i.u,
           spl.unit_price, spl.source, spl.effective_from,
           spl.min_order_qty, spl.lead_time_days,
           ROW_NUMBER() OVER (
             PARTITION BY i.ing_id, i.u
             ORDER BY spl.priority ASC, spl.effective_from DESC
           ) AS rn
    FROM inputs i
    LEFT JOIN public.supplier_price_list spl
      ON  spl.tenant_id     = v_tenant
      AND spl.supplier_id   = p_supplier_id
      AND spl.ingredient_id = i.ing_id
      AND spl.uom           = i.u
      AND spl.effective_from <= CURRENT_DATE
      AND (spl.effective_to IS NULL OR spl.effective_to >= CURRENT_DATE)
  )
  SELECT r.ing_id, r.u, r.unit_price, r.source, r.effective_from, r.min_order_qty, r.lead_time_days
  FROM ranked r
  WHERE r.rn = 1;
END;
$function$;

COMMENT ON FUNCTION public.resolve_po_prices_batch(BIGINT, JSONB) IS
  'Batch version of resolve_po_price. LEFT JOIN preserves input rows even when no price is known (NULL unit_price signals missing).';

GRANT EXECUTE ON FUNCTION public.resolve_po_prices_batch(BIGINT, JSONB)
  TO authenticated;
