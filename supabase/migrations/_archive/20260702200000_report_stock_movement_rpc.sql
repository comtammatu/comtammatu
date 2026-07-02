-- Stock movement report as a period-bound SECURITY DEFINER RPC, replacing the
-- unbounded JS aggregation in fetchStockMovementReport.

CREATE OR REPLACE FUNCTION public.get_stock_movement_report(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS TABLE(
  ingredient_id bigint,
  ingredient_name text,
  unit text,
  opening numeric,
  grn_receipt numeric,
  transfer_in numeric,
  transfer_out numeric,
  consumption numeric,
  production_consumption numeric,
  production_output numeric,
  adjustment numeric,
  closing numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_start  TIMESTAMPTZ;
  v_end    TIMESTAMPTZ;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NULL THEN
    IF NOT (
      public.has_permission_any('inventory:read')
      OR public.has_permission_any('reports:view_branch')
      OR public.has_permission_any('reports:view_tenant')
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Branch containment via has_permission (a branch_manager only holds
    -- inventory:read for its own branch); mirrors get_inventory_dashboard.
    IF NOT (
      public.has_permission(p_branch_id, 'inventory:read')
      OR public.has_permission(NULL, 'reports:view_branch')
      OR public.has_permission(NULL, 'reports:view_tenant')
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- VN calendar day -> UTC boundaries, matching getVNDayUtcRange.
  v_start := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH loc AS (
    SELECT il.id
    FROM public.inventory_locations il
    JOIN public.branches b ON b.id = il.branch_id
    WHERE il.tenant_id = v_tenant
      AND il.is_active = true
      AND (p_branch_id IS NULL OR il.branch_id = p_branch_id)
      AND (
        il.location_kind = 'warehouse'
        OR (b.branch_kind = 'central_kitchen' AND il.location_kind = 'production_storage')
      )
  ),
  cur AS (
    SELECT sl.ingredient_id, SUM(sl.current_quantity) AS current_quantity
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.location_id IN (SELECT id FROM loc)
      AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
    GROUP BY sl.ingredient_id
  ),
  aft AS (
    SELECT sm.ingredient_id, SUM(sm.quantity_change) AS after_sum
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.location_id IN (SELECT id FROM loc)
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
      AND sm.created_at >= v_end
    GROUP BY sm.ingredient_id
  ),
  per AS (
    -- Every stock_movements.type must land in exactly one report column so
    -- opening = closing - period_total holds: grn_amend folds into grn_receipt;
    -- supplier_return + refund_restore fold into adjustment.
    SELECT
      sm.ingredient_id,
      SUM(sm.quantity_change) FILTER (WHERE sm.type IN ('grn_receipt', 'grn_amend')) AS grn_receipt,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'transfer_in') AS transfer_in,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'transfer_out') AS transfer_out,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'consumption') AS consumption,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'production_consumption') AS production_consumption,
      SUM(sm.quantity_change) FILTER (WHERE sm.type = 'production_output') AS production_output,
      SUM(sm.quantity_change) FILTER (WHERE sm.type IN ('adjustment', 'count_adjustment', 'supplier_return', 'refund_restore')) AS adjustment
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant
      AND sm.location_id IN (SELECT id FROM loc)
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
      AND sm.created_at >= v_start
      AND sm.created_at < v_end
    GROUP BY sm.ingredient_id
  ),
  computed AS (
    SELECT
      ing.id AS ingredient_id,
      ing.name AS ingredient_name,
      COALESCE(ing.purchase_unit, ing.unit) AS unit,
      COALESCE(cur.current_quantity, 0) - COALESCE(aft.after_sum, 0) AS closing,
      COALESCE(per.grn_receipt, 0)
        + COALESCE(per.transfer_in, 0)
        + COALESCE(per.transfer_out, 0)
        + COALESCE(per.consumption, 0)
        + COALESCE(per.production_consumption, 0)
        + COALESCE(per.production_output, 0)
        + COALESCE(per.adjustment, 0) AS period_total,
      COALESCE(per.grn_receipt, 0) AS grn_receipt,
      COALESCE(per.transfer_in, 0) AS transfer_in,
      COALESCE(per.transfer_out, 0) AS transfer_out,
      COALESCE(per.consumption, 0) AS consumption,
      COALESCE(per.production_consumption, 0) AS production_consumption,
      COALESCE(per.production_output, 0) AS production_output,
      COALESCE(per.adjustment, 0) AS adjustment
    FROM public.ingredients ing
    LEFT JOIN cur ON cur.ingredient_id = ing.id
    LEFT JOIN aft ON aft.ingredient_id = ing.id
    LEFT JOIN per ON per.ingredient_id = ing.id
    WHERE ing.tenant_id = v_tenant
      AND ing.is_active = true
  )
  SELECT
    c.ingredient_id,
    c.ingredient_name,
    c.unit,
    (c.closing - c.period_total) AS opening,
    c.grn_receipt,
    c.transfer_in,
    c.transfer_out,
    c.consumption,
    c.production_consumption,
    c.production_output,
    c.adjustment,
    c.closing
  FROM computed c
  WHERE (c.closing - c.period_total) <> 0
     OR c.closing <> 0
     OR c.period_total <> 0
  ORDER BY c.ingredient_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stock_movement_report(date, date, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stock_movement_report(date, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_movement_report(date, date, bigint) TO service_role;

CREATE INDEX IF NOT EXISTS idx_stock_movements_report
  ON public.stock_movements (tenant_id, location_id, created_at)
  INCLUDE (ingredient_id, type, quantity_change);
