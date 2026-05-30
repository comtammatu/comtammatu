-- =============================================================
-- S2-b Patch — mv_grn_price_baseline.last_seen_at type mismatch
--
-- S1 declared last_seen_at DATE in the function return, but the
-- MV aggregates TIMESTAMPTZ (goods_received_notes.received_date).
-- Trigger fired -> "structure of query does not match function
-- result type" when plugging into _compute_grn_price_baseline.
--
-- Fix: cast MAX(received_date) to DATE inside the MV. Safer than
-- changing function return signature (keeps DATE semantic at
-- boundary; drops tz detail not needed for baseline staleness).
-- =============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_grn_price_baseline;

CREATE MATERIALIZED VIEW public.mv_grn_price_baseline AS
SELECT
  grn.tenant_id,
  grn.supplier_id,
  gi.ingredient_id,
  gi.unit AS uom,
  AVG(gi.unit_cost)::NUMERIC(15,2) AS avg_30d,
  COUNT(*)::INT                     AS sample_n,
  MAX(grn.received_date)::DATE      AS last_seen_at
FROM public.grn_items gi
JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
WHERE grn.status = 'confirmed'
  AND grn.received_date >= (now() - INTERVAL '30 days')
  AND gi.received_quantity > 0
  AND gi.unit_cost IS NOT NULL
GROUP BY grn.tenant_id, grn.supplier_id, gi.ingredient_id, gi.unit;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_grn_price_baseline
  ON public.mv_grn_price_baseline (tenant_id, supplier_id, ingredient_id, uom);

REVOKE ALL ON public.mv_grn_price_baseline FROM authenticated;
REVOKE ALL ON public.mv_grn_price_baseline FROM anon;
