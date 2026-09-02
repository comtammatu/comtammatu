-- Migration: include_branch_kitchen_in_inventory_value_period
-- Include branch kitchen locations alongside warehouse and CK production storage
-- in fallback period inventory valuation (BRANCH-INVENTORY-TOPOLOGY-MANDATORY).

CREATE OR REPLACE FUNCTION public.get_inventory_value_period(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL::bigint
) RETURNS TABLE(branch_id bigint, opening_value numeric, closing_value numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_read_inventory_monetary('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL AND NOT public.auth_is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'system_valuation_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  WITH allowed_branches AS (
    SELECT branch.id
    FROM public.branches branch
    WHERE branch.tenant_id = v_tenant
      AND branch.is_active
      AND (p_branch_id IS NULL OR branch.id = p_branch_id)
  ),
  stock_locations AS (
    SELECT location.id, location.branch_id
    FROM public.inventory_locations location
    JOIN public.branches branch ON branch.id = location.branch_id
    WHERE location.tenant_id = v_tenant
      AND location.branch_id IN (SELECT allowed.id FROM allowed_branches allowed)
      AND location.is_active
      AND (
        location.location_kind = 'warehouse'
        OR (
          branch.branch_kind = 'branch'
          AND location.location_kind = 'kitchen'
        )
        OR (
          branch.branch_kind = 'central_kitchen'
          AND location.location_kind = 'production_storage'
        )
      )
  ),
  current_value AS (
    SELECT
      stock.branch_id,
      COALESCE(SUM(
        stock.current_quantity
        * COALESCE(stock.avg_unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_levels stock
    JOIN stock_locations location ON location.id = stock.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = stock.ingredient_id
     AND ingredient.tenant_id = stock.tenant_id
    WHERE stock.tenant_id = v_tenant
    GROUP BY stock.branch_id
  ),
  after_period_value AS (
    SELECT
      movement.branch_id,
      COALESCE(SUM(
        movement.quantity_change
        * COALESCE(movement.unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_movements movement
    JOIN stock_locations location ON location.id = movement.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = movement.ingredient_id
     AND ingredient.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= v_end
    GROUP BY movement.branch_id
  ),
  period_value AS (
    SELECT
      movement.branch_id,
      COALESCE(SUM(
        movement.quantity_change
        * COALESCE(movement.unit_cost, ingredient.unit_cost, 0)
      ), 0) AS amount
    FROM public.stock_movements movement
    JOIN stock_locations location ON location.id = movement.location_id
    LEFT JOIN public.ingredients ingredient
      ON ingredient.id = movement.ingredient_id
     AND ingredient.tenant_id = movement.tenant_id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= v_start
      AND movement.created_at < v_end
    GROUP BY movement.branch_id
  )
  SELECT
    branch.id,
    COALESCE(current_value.amount, 0)
      - COALESCE(after_period_value.amount, 0)
      - COALESCE(period_value.amount, 0),
    COALESCE(current_value.amount, 0)
      - COALESCE(after_period_value.amount, 0)
  FROM allowed_branches branch
  LEFT JOIN current_value ON current_value.branch_id = branch.id
  LEFT JOIN after_period_value ON after_period_value.branch_id = branch.id
  LEFT JOIN period_value ON period_value.branch_id = branch.id
  ORDER BY branch.id;
END;
$$;

COMMENT ON FUNCTION public.get_inventory_value_period(p_start_date date, p_end_date date, p_branch_id bigint) IS 'Returns opening and period-end operational inventory value by reversing post-period and in-period stock movements from current stock value across stock-bearing locations (warehouse, branch kitchen, and CK production storage). Movement unit cost falls back to the ingredient reference cost.';

REVOKE ALL ON FUNCTION public.get_inventory_value_period(date, date, bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_inventory_value_period(date, date, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_inventory_value_period(date, date, bigint) TO service_role;
