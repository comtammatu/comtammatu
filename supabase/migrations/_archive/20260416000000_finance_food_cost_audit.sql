-- M6.S4: Food Cost Materialized View + Audit Logs
-- Depends on: orders, order_items, recipes, ingredients, grn_items

-- ─── 1. mv_food_cost ───
-- Calculates food cost per menu item per week per branch
-- Recipe cost = SUM(recipe.quantity × latest GRN unit_cost per ingredient)
-- Food cost % = ingredient_cost / revenue × 100

CREATE MATERIALIZED VIEW public.mv_food_cost AS
WITH latest_grn_cost AS (
  -- Latest unit cost per ingredient per tenant from GRN items
  SELECT DISTINCT ON (gi.ingredient_id, gi.tenant_id)
    gi.ingredient_id,
    gi.tenant_id,
    gi.unit_cost
  FROM public.grn_items gi
  JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
  WHERE grn.status = 'confirmed'
    AND gi.quality_status = 'accepted'
  ORDER BY gi.ingredient_id, gi.tenant_id, grn.received_date DESC NULLS LAST
),
recipe_cost AS (
  -- Cost per menu item = SUM(recipe qty × ingredient unit cost)
  SELECT
    r.menu_item_id,
    r.tenant_id,
    SUM(r.quantity * COALESCE(lgc.unit_cost, i.unit_cost, 0)) AS cost_per_unit
  FROM public.recipes r
  JOIN public.ingredients i ON i.id = r.ingredient_id
  LEFT JOIN latest_grn_cost lgc
    ON lgc.ingredient_id = r.ingredient_id
    AND lgc.tenant_id = r.tenant_id
  GROUP BY r.menu_item_id, r.tenant_id
)
SELECT
  date_trunc('week', o.created_at)::date AS period_start,
  (date_trunc('week', o.created_at) + interval '6 days')::date AS period_end,
  o.branch_id,
  o.tenant_id,
  oi.menu_item_id,
  oi.item_name,
  SUM(oi.quantity) AS quantity_sold,
  SUM(oi.subtotal) AS revenue,
  SUM(oi.quantity * COALESCE(rc.cost_per_unit, 0)) AS ingredient_cost,
  CASE
    WHEN SUM(oi.subtotal) > 0
    THEN ROUND(SUM(oi.quantity * COALESCE(rc.cost_per_unit, 0)) / SUM(oi.subtotal) * 100, 2)
    ELSE 0
  END AS food_cost_pct
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN recipe_cost rc
  ON rc.menu_item_id = oi.menu_item_id
  AND rc.tenant_id = oi.tenant_id
WHERE o.status NOT IN ('cancelled')
  AND oi.status NOT IN ('cancelled')
GROUP BY period_start, period_end, o.branch_id, o.tenant_id, oi.menu_item_id, oi.item_name;

CREATE UNIQUE INDEX idx_mv_food_cost_pk
  ON public.mv_food_cost(period_start, branch_id, tenant_id, menu_item_id);

GRANT SELECT ON public.mv_food_cost TO authenticated;


-- ─── 2. audit_logs ───

CREATE TABLE public.audit_logs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,         -- 'create' | 'update' | 'delete' | 'approve' | 'cancel'
  entity_type     TEXT NOT NULL,         -- 'tax_invoice' | 'journal_entry' | 'payroll_period' | ...
  entity_id       BIGINT,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only owner/super_manager can view audit logs
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

-- Any authenticated user can insert (actions/triggers log automatically)
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.auth_tenant_id());

GRANT SELECT, INSERT ON TABLE public.audit_logs TO authenticated;


-- ─── 3. RPC: refresh_finance_views ───
-- Refreshes all finance materialized views concurrently

CREATE OR REPLACE FUNCTION public.refresh_finance_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_top_items;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_food_cost;
END;
$$;
