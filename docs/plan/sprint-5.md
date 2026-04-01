# Sprint 5: Dashboard Advanced + Reports

> Depends on: Sprint 2 (orders data), Sprint 3 (procurement data)
> Sessions: 4 | Estimate: 3-4 ngày

---

## Goal

Owner nhìn toàn bộ business health từ 1 dashboard: doanh thu, food cost %, so sánh branches, trending items. Materialized views cho performance.

---

## Schema

### Materialized Views

```sql
-- Daily revenue per branch
CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
SELECT
  branch_id,
  tenant_id,
  DATE(created_at) as report_date,
  COUNT(*) as order_count,
  SUM(total) as total_revenue,
  SUM(discount_total) as total_discounts,
  AVG(total) as avg_order_value
FROM public.orders
WHERE status = 'completed'
GROUP BY branch_id, tenant_id, DATE(created_at);

CREATE UNIQUE INDEX ON mv_daily_revenue(branch_id, report_date);
GRANT SELECT ON mv_daily_revenue TO authenticated;

-- Top items per branch
CREATE MATERIALIZED VIEW public.mv_top_items AS
SELECT
  oi.menu_item_id,
  mi.name as item_name,
  o.branch_id,
  o.tenant_id,
  DATE(o.created_at) as report_date,
  SUM(oi.quantity) as total_qty,
  SUM(oi.item_total) as total_revenue
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
JOIN public.menu_items mi ON mi.id = oi.menu_item_id
WHERE o.status = 'completed'
GROUP BY oi.menu_item_id, mi.name, o.branch_id, o.tenant_id, DATE(o.created_at);

CREATE UNIQUE INDEX ON mv_top_items(menu_item_id, branch_id, report_date);
GRANT SELECT ON mv_top_items TO authenticated;

-- Food cost per branch (from GRN)
CREATE MATERIALIZED VIEW public.mv_food_cost AS
SELECT
  gi.ingredient_id,
  i.name as ingredient_name,
  grn.branch_id,
  grn.tenant_id,
  DATE(grn.created_at) as report_date,
  SUM(gi.quantity_received) as total_qty,
  SUM(gi.line_total) as total_cost
FROM public.grn_items gi
JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
JOIN public.ingredients i ON i.id = gi.ingredient_id
WHERE grn.status = 'confirmed'
GROUP BY gi.ingredient_id, i.name, grn.branch_id, grn.tenant_id, DATE(grn.created_at);

CREATE UNIQUE INDEX ON mv_food_cost(ingredient_id, branch_id, report_date);
GRANT SELECT ON mv_food_cost TO authenticated;
```

### Refresh function

```sql
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_items;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_food_cost;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_materialized_views() TO authenticated;
```

---

## Sessions

### S1: Revenue Dashboard (Advanced)

**Acceptance Criteria:**

- [ ] Daily/weekly/monthly revenue charts
- [ ] Branch comparison (side by side)
- [ ] Revenue trend (vs previous period)
- [ ] Filter by date range + branch

### S2: Top Items + Menu Performance

**Acceptance Criteria:**

- [ ] Top 10 items by quantity sold
- [ ] Top 10 items by revenue
- [ ] Items with declining sales (vs previous period)
- [ ] Category breakdown (pie chart)

### S3: Food Cost Analysis

**Acceptance Criteria:**

- [ ] Food cost % = total GRN cost / total revenue
- [ ] Cost breakdown by ingredient
- [ ] Cost trend over time
- [ ] Alert khi food cost % > threshold (e.g. 35%)
- [ ] Branch comparison food cost

### S4: MV Refresh + Cron

**Acceptance Criteria:**

- [ ] API route `/api/cron/refresh-views` (Vercel cron)
- [ ] Refresh every 15 minutes
- [ ] Manual refresh button in admin
- [ ] Verify MV data matches live data (sanity check)

---

## Definition of Done

- [ ] Owner dashboard shows revenue, food cost %, top items across branches
- [ ] Data from MVs matches live queries (within 15min lag)
- [ ] Charts render correctly with real data
- [ ] Filter by date range + branch works
