-- =============================================================
-- S4 — Inventory dashboard MV + alerts + manual refresh + cron
--
-- Sections:
--   (A) mv_inventory_stock_current MV (per location grain) + REVOKE
--   (B) get_inventory_dashboard(p_branch_id)  — summary JSON
--   (C) get_inventory_alerts(p_branch_id, types[], limit, offset)
--   (D) refresh_inventory_dashboard() RPC
--   (E) pg_cron refresh every 5 min (CONCURRENTLY)
--
-- Alert types (MVP):
--   low_stock      : 0 < current < reorder_point (reorder_point set)
--   out_of_stock   : current = 0 and reorder_point > 0
--   negative_stock : current < 0 (data corruption canary)
--
-- Cost fields (stock_value, avg_unit_cost) masked to NULL unless
-- caller holds reports:view_branch or reports:view_tenant.
--
-- Current docs: docs/ref/inventory.md + docs/ref/inventory-sop.md
-- Regression: tasks/regressions.md RLS-NOT-APPLIED-ON-MV
-- =============================================================


-- =============================================================
-- (A) mv_inventory_stock_current
-- =============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_stock_current;

CREATE MATERIALIZED VIEW public.mv_inventory_stock_current AS
SELECT
  sl.tenant_id,
  sl.branch_id,
  sl.location_id,
  il.name           AS location_name,
  il.location_kind,
  sl.ingredient_id,
  ing.name          AS ingredient_name,
  ing.category      AS ingredient_category,
  ing.is_active     AS ingredient_is_active,
  ing.item_kind,
  sl.current_quantity,
  sl.avg_unit_cost,
  (sl.current_quantity * COALESCE(sl.avg_unit_cost, 0))::NUMERIC(15,2) AS stock_value,
  ing.reorder_point,
  ing.min_stock_level,
  ing.max_stock_level,
  ing.shelf_life_days,
  sl.updated_at,
  sl.last_counted_at
FROM public.stock_levels sl
JOIN public.inventory_locations il ON il.id = sl.location_id
JOIN public.ingredients ing         ON ing.id = sl.ingredient_id
WHERE il.is_active = true
  AND ing.is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_inv_stock_current
  ON public.mv_inventory_stock_current (tenant_id, branch_id, location_id, ingredient_id);

CREATE INDEX IF NOT EXISTS idx_mv_inv_stock_alerts
  ON public.mv_inventory_stock_current (branch_id, location_id)
  WHERE reorder_point IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.mv_inventory_stock_current IS
  'Per-location stock snapshot with cost + reorder thresholds. Refreshed every 5 min via pg_cron. Direct access REVOKED per regression rule RLS-NOT-APPLIED-ON-MV — query through get_inventory_dashboard() / get_inventory_alerts() wrappers only.';

REVOKE ALL ON public.mv_inventory_stock_current FROM authenticated;
REVOKE ALL ON public.mv_inventory_stock_current FROM anon;


-- =============================================================
-- (B) get_inventory_dashboard(p_branch_id)
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_inventory_dashboard(p_branch_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant     BIGINT := public.auth_tenant_id();
  v_can_cost   BOOLEAN;
  v_summary    JSONB;
  v_locations  JSONB;
  v_alerts     JSONB;
  v_in_transit JSONB;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
       public.has_permission(p_branch_id, 'inventory:read')
    OR public.has_permission(NULL, 'reports:view_branch')
    OR public.has_permission(NULL, 'reports:view_tenant')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_can_cost := public.has_permission(NULL, 'reports:view_branch')
             OR public.has_permission(NULL, 'reports:view_tenant');

  -- Summary for the branch
  SELECT jsonb_build_object(
    'total_skus',      COALESCE(COUNT(DISTINCT m.ingredient_id), 0),
    'location_count',  COALESCE(COUNT(DISTINCT m.location_id), 0),
    'total_quantity',  COALESCE(SUM(m.current_quantity), 0),
    'total_value_vnd', CASE WHEN v_can_cost THEN COALESCE(SUM(m.stock_value), 0) ELSE NULL END,
    'alerts_count',    (
      SELECT COUNT(*) FROM public.mv_inventory_stock_current a
      WHERE a.tenant_id = v_tenant AND a.branch_id = p_branch_id
        AND a.reorder_point IS NOT NULL
        AND a.current_quantity < a.reorder_point
    )
  ) INTO v_summary
  FROM public.mv_inventory_stock_current m
  WHERE m.tenant_id = v_tenant AND m.branch_id = p_branch_id;

  -- Per-location breakdown
  SELECT COALESCE(jsonb_agg(loc ORDER BY (loc->>'location_kind'), (loc->>'location_name')), '[]'::JSONB)
  INTO v_locations
  FROM (
    SELECT jsonb_build_object(
      'location_id',     m.location_id,
      'location_name',   MAX(m.location_name),
      'location_kind',   MAX(m.location_kind),
      'sku_count',       COUNT(DISTINCT m.ingredient_id),
      'total_quantity',  SUM(m.current_quantity),
      'total_value_vnd', CASE WHEN v_can_cost THEN SUM(m.stock_value) ELSE NULL END,
      'alerts_count',    COUNT(*) FILTER (
          WHERE m.reorder_point IS NOT NULL AND m.current_quantity < m.reorder_point)
    ) AS loc
    FROM public.mv_inventory_stock_current m
    WHERE m.tenant_id = v_tenant AND m.branch_id = p_branch_id
    GROUP BY m.location_id
  ) t;

  -- Top 5 alerts
  SELECT COALESCE(jsonb_agg(a ORDER BY (a->>'severity_rank'), (a->>'shortage_ratio') DESC), '[]'::JSONB)
  INTO v_alerts
  FROM (
    SELECT jsonb_build_object(
      'alert_type', CASE
        WHEN m.current_quantity < 0            THEN 'negative_stock'
        WHEN m.current_quantity = 0            THEN 'out_of_stock'
        ELSE                                        'low_stock' END,
      'severity_rank', CASE
        WHEN m.current_quantity < 0 THEN 0
        WHEN m.current_quantity = 0 THEN 1
        ELSE 2 END,
      'ingredient_id',    m.ingredient_id,
      'ingredient_name',  m.ingredient_name,
      'location_id',      m.location_id,
      'location_name',    m.location_name,
      'current_quantity', m.current_quantity,
      'reorder_point',    m.reorder_point,
      'shortage_ratio',   CASE WHEN m.reorder_point > 0
                               THEN (m.reorder_point - m.current_quantity) / m.reorder_point
                               ELSE 0 END
    ) AS a
    FROM public.mv_inventory_stock_current m
    WHERE m.tenant_id = v_tenant AND m.branch_id = p_branch_id
      AND m.reorder_point IS NOT NULL
      AND m.current_quantity < m.reorder_point
    ORDER BY
      CASE WHEN m.current_quantity < 0 THEN 0
           WHEN m.current_quantity = 0 THEN 1 ELSE 2 END,
      CASE WHEN m.reorder_point > 0
           THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END DESC
    LIMIT 5
  ) t;

  -- In-transit snapshot (from stock_transfers in shipped status)
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'ingredient_name')), '[]'::JSONB)
  INTO v_in_transit
  FROM (
    SELECT jsonb_build_object(
      'ingredient_id',   sti.ingredient_id,
      'ingredient_name', ing.name,
      'total_quantity',  SUM(sti.quantity),
      'transfer_count',  COUNT(DISTINCT st.id)
    ) AS row
    FROM public.stock_transfers st
    JOIN public.stock_transfer_items sti ON sti.transfer_id = st.id
    JOIN public.ingredients ing ON ing.id = sti.ingredient_id
    WHERE st.tenant_id = v_tenant
      AND st.status IN ('confirmed_ship','in_transit','confirmed_receive')
      AND (st.from_branch_id = p_branch_id OR st.to_branch_id = p_branch_id)
    GROUP BY sti.ingredient_id, ing.name
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'branch_id',  p_branch_id,
    'computed_at', now(),
    'can_view_cost', v_can_cost,
    'summary',     v_summary,
    'locations',   v_locations,
    'top_alerts',  v_alerts,
    'in_transit',  v_in_transit
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_inventory_dashboard(BIGINT) TO authenticated;


-- =============================================================
-- (C) get_inventory_alerts
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_inventory_alerts(
  p_branch_id BIGINT,
  p_types     TEXT[] DEFAULT ARRAY['low_stock','out_of_stock','negative_stock'],
  p_limit     INT DEFAULT 50,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  alert_type       TEXT,
  severity_rank    INT,
  ingredient_id    BIGINT,
  ingredient_name  TEXT,
  location_id      BIGINT,
  location_name    TEXT,
  current_quantity NUMERIC,
  reorder_point    NUMERIC,
  shortage_ratio   NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT (
       public.has_permission(p_branch_id, 'inventory:read')
    OR public.has_permission(NULL, 'reports:view_branch')
    OR public.has_permission(NULL, 'reports:view_tenant')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (CASE
       WHEN m.current_quantity < 0 THEN 'negative_stock'
       WHEN m.current_quantity = 0 THEN 'out_of_stock'
       ELSE                              'low_stock'
     END)::TEXT AS alert_type,
    (CASE
       WHEN m.current_quantity < 0 THEN 0
       WHEN m.current_quantity = 0 THEN 1
       ELSE 2
     END)::INT AS severity_rank,
    m.ingredient_id,
    m.ingredient_name,
    m.location_id,
    m.location_name,
    m.current_quantity,
    m.reorder_point,
    (CASE WHEN m.reorder_point > 0
          THEN (m.reorder_point - m.current_quantity) / m.reorder_point
          ELSE 0 END)::NUMERIC AS shortage_ratio
  FROM public.mv_inventory_stock_current m
  WHERE m.tenant_id = v_tenant
    AND m.branch_id = p_branch_id
    AND m.reorder_point IS NOT NULL
    AND m.current_quantity < m.reorder_point
    AND (
      'low_stock' = ANY(p_types)      AND m.current_quantity > 0
      OR 'out_of_stock' = ANY(p_types) AND m.current_quantity = 0
      OR 'negative_stock' = ANY(p_types) AND m.current_quantity < 0
    )
  ORDER BY
    CASE WHEN m.current_quantity < 0 THEN 0
         WHEN m.current_quantity = 0 THEN 1 ELSE 2 END,
    CASE WHEN m.reorder_point > 0
         THEN (m.reorder_point - m.current_quantity) / m.reorder_point ELSE 0 END DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_inventory_alerts(BIGINT, TEXT[], INT, INT) TO authenticated;


-- =============================================================
-- (D) refresh_inventory_dashboard — manual refresh RPC
-- =============================================================

CREATE OR REPLACE FUNCTION public.refresh_inventory_dashboard()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT (
       public.has_permission(NULL, 'reports:view_branch')
    OR public.has_permission(NULL, 'reports:view_tenant')
    OR public.has_permission(NULL, 'settings:branch')
    OR public.has_permission(NULL, 'settings:tenant')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;
  RETURN now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_inventory_dashboard() TO authenticated;


-- =============================================================
-- (E) pg_cron: refresh every 5 min
-- =============================================================

DO $sched$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_inventory_stock_current') THEN
    PERFORM cron.schedule(
      'refresh_mv_inventory_stock_current',
      '*/5 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_stock_current;'
    );
  END IF;
END $sched$;

-- Seed initial refresh (non-concurrent so it works on first run even without prior rows)
REFRESH MATERIALIZED VIEW public.mv_inventory_stock_current;
