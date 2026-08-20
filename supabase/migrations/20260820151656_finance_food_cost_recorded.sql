-- Recorded POS food cost + coverage for finance:view. One pass instead of
-- paging inventory_value_allocations through PostgREST.

CREATE FUNCTION public.get_finance_food_cost_recorded(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_has_tenant_scope boolean;
  v_scope_branch_ids bigint[];
  v_allowed bigint[] := ARRAY[]::bigint[];
  v_start_utc timestamptz;
  v_end_utc timestamptz;
  v_valuation_active boolean := false;
  v_ingredient_cost numeric(20, 2) := 0;
  v_operating_consumption numeric(20, 2) := 0;
  v_reprice_cost numeric(20, 2) := 0;
  v_paid_order_count integer := 0;
  v_covered_order_count integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_start_date > p_end_date
  THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  SELECT scope.has_tenant_scope, scope.branch_ids
  INTO v_has_tenant_scope, v_scope_branch_ids
  FROM private.finance_scope(v_uid, 'finance:view') scope;

  IF p_branch_id IS NULL THEN
    IF NOT (
      v_has_tenant_scope
      OR COALESCE(cardinality(v_scope_branch_ids), 0) > 0
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    v_has_tenant_scope
    OR p_branch_id = ANY(COALESCE(v_scope_branch_ids, ARRAY[]::bigint[]))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(branch.id), ARRAY[]::bigint[])
  INTO v_allowed
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind = 'branch'
    AND COALESCE(branch.is_active, true)
    AND (
      p_branch_id IS NOT NULL AND branch.id = p_branch_id
      OR (
        p_branch_id IS NULL
        AND (
          v_has_tenant_scope
          OR branch.id = ANY(COALESCE(v_scope_branch_ids, ARRAY[]::bigint[]))
        )
      )
    );

  v_start_utc := p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end_utc := (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

  v_valuation_active := EXISTS (
    SELECT 1
    FROM public.inventory_valuation_cutovers cutover
    WHERE cutover.tenant_id = v_tenant
      AND cutover.status = 'active'
  );

  SELECT COUNT(DISTINCT paid.order_id)::integer
  INTO v_paid_order_count
  FROM public.payments paid
  JOIN public.orders orders
    ON orders.id = paid.order_id
   AND orders.tenant_id = paid.tenant_id
   AND orders.branch_id = paid.branch_id
  WHERE paid.tenant_id = v_tenant
    AND paid.status = 'completed'
    AND paid.paid_at >= v_start_utc
    AND paid.paid_at < v_end_utc
    AND paid.branch_id = ANY (v_allowed);

  IF cardinality(v_allowed) = 0 OR NOT v_valuation_active THEN
    RETURN jsonb_build_object(
      'valuation_active', v_valuation_active,
      'ingredient_cost', '0.00',
      'operating_consumption', '0.00',
      'paid_order_count', v_paid_order_count,
      'covered_order_count', 0,
      'coverage_complete', v_paid_order_count = 0
    );
  END IF;

  WITH sale_events AS (
    SELECT
      movement.order_id,
      movement.branch_id,
      allocation.allocated_value
    FROM public.inventory_value_allocations allocation
    JOIN public.inventory_valuation_events event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    JOIN public.stock_movements movement
      ON movement.id = event.stock_movement_id
     AND movement.tenant_id = event.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.allocation_bucket = 'food_cost'
      AND event.effective_at >= v_start_utc
      AND event.effective_at < v_end_utc
      AND event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND movement.branch_id = ANY (v_allowed)
  )
  SELECT
    COALESCE(SUM(sale_events.allocated_value) FILTER (
      WHERE sale_events.order_id IS NOT NULL
    ), 0),
    COALESCE(SUM(sale_events.allocated_value) FILTER (
      WHERE sale_events.order_id IS NULL
    ), 0)
  INTO v_ingredient_cost, v_operating_consumption
  FROM sale_events;

  WITH reprice AS (
    SELECT
      allocation.source_origin_id,
      SUM(allocation.allocated_value) AS allocated_value
    FROM public.inventory_value_allocations allocation
    JOIN public.inventory_valuation_events event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.allocation_bucket = 'food_cost'
      AND allocation.source_origin_id IS NOT NULL
      AND event.event_type IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND event.effective_at >= v_start_utc
      AND event.effective_at < v_end_utc
    GROUP BY allocation.source_origin_id
  ),
  lineage AS (
    SELECT
      allocation.source_origin_id,
      SUM(allocation.allocated_quantity) AS total_qty,
      SUM(allocation.allocated_quantity) FILTER (
        WHERE movement.order_id IS NOT NULL
          AND movement.branch_id = ANY (v_allowed)
      ) AS sales_qty
    FROM public.inventory_value_allocations allocation
    JOIN public.inventory_valuation_events event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    JOIN public.stock_movements movement
      ON movement.id = event.stock_movement_id
     AND movement.tenant_id = event.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.source_origin_id IN (SELECT reprice.source_origin_id FROM reprice)
      AND event.terminal_bucket = 'food_cost'
    GROUP BY allocation.source_origin_id
  )
  SELECT COALESCE(
    SUM(
      reprice.allocated_value * lineage.sales_qty / lineage.total_qty
    ),
    0
  )
  INTO v_reprice_cost
  FROM reprice
  JOIN lineage
    ON lineage.source_origin_id = reprice.source_origin_id
  WHERE lineage.total_qty > 0;

  v_ingredient_cost := ROUND(v_ingredient_cost + v_reprice_cost, 2);
  v_operating_consumption := ROUND(v_operating_consumption, 2);

  WITH covered_pos AS (
    SELECT DISTINCT movement.order_id
    FROM public.inventory_value_allocations allocation
    JOIN public.inventory_valuation_events event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    JOIN public.stock_movements movement
      ON movement.id = event.stock_movement_id
     AND movement.tenant_id = event.tenant_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.allocation_bucket = 'food_cost'
      AND event.effective_at >= v_start_utc
      AND event.effective_at < v_end_utc
      AND event.event_type NOT IN (
        'invoice_reprice',
        'credit_reprice',
        'provisional_reprice'
      )
      AND movement.order_id IS NOT NULL
      AND movement.branch_id = ANY (v_allowed)
  ),
  paid_orders AS (
    SELECT DISTINCT paid.order_id
    FROM public.payments paid
    JOIN public.orders orders
      ON orders.id = paid.order_id
     AND orders.tenant_id = paid.tenant_id
     AND orders.branch_id = paid.branch_id
    WHERE paid.tenant_id = v_tenant
      AND paid.status = 'completed'
      AND paid.paid_at >= v_start_utc
      AND paid.paid_at < v_end_utc
      AND paid.branch_id = ANY (v_allowed)
  ),
  uncovered AS (
    SELECT paid_orders.order_id
    FROM paid_orders
    WHERE NOT EXISTS (
      SELECT 1 FROM covered_pos WHERE covered_pos.order_id = paid_orders.order_id
    )
  ),
  no_recipe AS (
    SELECT uncovered.order_id
    FROM uncovered
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.order_items item
      JOIN public.recipes recipe
        ON recipe.tenant_id = item.tenant_id
       AND recipe.menu_item_id = item.menu_item_id
      WHERE item.tenant_id = v_tenant
        AND item.order_id = uncovered.order_id
        AND item.status <> 'cancelled'
    )
  )
  SELECT (
    (SELECT COUNT(*) FROM covered_pos)
    + (SELECT COUNT(*) FROM no_recipe)
  )::integer
  INTO v_covered_order_count;

  RETURN jsonb_build_object(
    'valuation_active', v_valuation_active,
    'ingredient_cost', v_ingredient_cost::text,
    'operating_consumption', v_operating_consumption::text,
    'paid_order_count', v_paid_order_count,
    'covered_order_count', v_covered_order_count,
    'coverage_complete', v_paid_order_count = 0
      OR v_covered_order_count >= v_paid_order_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_food_cost_recorded(
  date,
  date,
  bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_finance_food_cost_recorded(
  date,
  date,
  bigint
) TO authenticated;

COMMENT ON FUNCTION public.get_finance_food_cost_recorded(
  date,
  date,
  bigint
) IS
  'Recorded POS food cost and order coverage for finance:view. Sales Chi nhánh only.';
