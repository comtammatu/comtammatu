BEGIN;

DO $test$
DECLARE
  v_marker_warehouse CONSTANT TEXT :=
    'ledger_repair:20260712:canh_kho_qua:main_warehouse';
  v_marker_kitchen CONSTANT TEXT :=
    'ledger_repair:20260712:canh_kho_qua:kitchen';
  v_tenant_id BIGINT;
  v_branch_id BIGINT;
  v_ingredient_id BIGINT;
  v_warehouse_location_id BIGINT;
  v_kitchen_location_id BIGINT;
  v_source public.stock_movements%ROWTYPE;
  v_target_count INTEGER;
  v_source_count INTEGER;
  v_marker_count INTEGER;
  v_valid_warehouse_marker_count INTEGER;
  v_valid_kitchen_marker_count INTEGER;
  v_drift_count INTEGER;
  v_warehouse_level NUMERIC;
  v_kitchen_level NUMERIC;
  v_warehouse_ledger NUMERIC;
  v_kitchen_ledger NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE slug = 'comtammatu'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements
      WHERE reason IN (v_marker_warehouse, v_marker_kitchen)
    ) THEN
      RAISE EXCEPTION 'TEST FAILED: repair markers exist without target tenant';
    END IF;
    RETURN;
  END IF;

  SELECT
    count(*),
    min(t.id),
    min(b.id),
    min(i.id),
    min(warehouse.id),
    min(kitchen.id)
  INTO
    v_target_count,
    v_tenant_id,
    v_branch_id,
    v_ingredient_id,
    v_warehouse_location_id,
    v_kitchen_location_id
  FROM public.tenants t
  JOIN public.branches b
    ON b.tenant_id = t.id
   AND b.code = 'PH'
   AND b.branch_kind = 'branch'
  JOIN public.ingredients i
    ON i.tenant_id = t.id
   AND i.name = 'Canh Khổ Qua'
  JOIN public.inventory_locations warehouse
    ON warehouse.tenant_id = t.id
   AND warehouse.branch_id = b.id
   AND warehouse.code = 'main_warehouse'
   AND warehouse.location_kind = 'warehouse'
   AND warehouse.is_active = TRUE
  JOIN public.inventory_locations kitchen
    ON kitchen.tenant_id = t.id
   AND kitchen.branch_id = b.id
   AND kitchen.code = 'kitchen'
   AND kitchen.location_kind = 'kitchen'
   AND kitchen.is_active = FALSE
  WHERE t.slug = 'comtammatu';

  IF v_target_count = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements
      WHERE reason IN (v_marker_warehouse, v_marker_kitchen)
    ) THEN
      RAISE EXCEPTION 'TEST FAILED: repair markers exist without target rows';
    END IF;
    RETURN;
  END IF;

  IF v_target_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: target cardinality is %', v_target_count;
  END IF;

  SELECT count(*)
  INTO v_source_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id
    AND sm.ingredient_id = v_ingredient_id
    AND sm.location_id = v_kitchen_location_id
    AND sm.type = 'adjustment'
    AND sm.quantity_change = 9.000
    AND sm.reason = 'canh kho qua'
    AND sm.created_at = '2026-07-10 23:11:15.421439+00'::TIMESTAMPTZ
    AND sm.entry_quantity = 9.000;

  IF v_source_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: source cardinality is %', v_source_count;
  END IF;

  SELECT sm.*
  INTO STRICT v_source
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id
    AND sm.ingredient_id = v_ingredient_id
    AND sm.location_id = v_kitchen_location_id
    AND sm.type = 'adjustment'
    AND sm.quantity_change = 9.000
    AND sm.reason = 'canh kho qua'
    AND sm.created_at = '2026-07-10 23:11:15.421439+00'::TIMESTAMPTZ
    AND sm.entry_quantity = 9.000;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE sm.location_id = v_warehouse_location_id
        AND sm.quantity_change = 9.000
        AND sm.type = 'adjustment'
        AND sm.movement_subtype IS NULL
        AND sm.created_by = v_source.created_by
        AND sm.entry_unit_id = v_source.entry_unit_id
        AND sm.entry_quantity = 9.000
        AND sm.unit_cost IS NOT DISTINCT FROM v_source.unit_cost
        AND sm.reason = v_marker_warehouse
    ),
    count(*) FILTER (
      WHERE sm.location_id = v_kitchen_location_id
        AND sm.quantity_change = -9.000
        AND sm.type = 'adjustment'
        AND sm.movement_subtype IS NULL
        AND sm.created_by = v_source.created_by
        AND sm.entry_unit_id = v_source.entry_unit_id
        AND sm.entry_quantity = 9.000
        AND sm.unit_cost IS NOT DISTINCT FROM v_source.unit_cost
        AND sm.reason = v_marker_kitchen
    )
  INTO
    v_marker_count,
    v_valid_warehouse_marker_count,
    v_valid_kitchen_marker_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id
    AND sm.ingredient_id = v_ingredient_id
    AND sm.reason IN (v_marker_warehouse, v_marker_kitchen);

  IF v_marker_count <> 2
     OR v_valid_warehouse_marker_count <> 1
     OR v_valid_kitchen_marker_count <> 1 THEN
    RAISE EXCEPTION
      'TEST FAILED: repair markers are malformed: total %, warehouse %, kitchen %',
      v_marker_count,
      v_valid_warehouse_marker_count,
      v_valid_kitchen_marker_count;
  END IF;

  SELECT
    max(sl.current_quantity) FILTER (
      WHERE sl.location_id = v_warehouse_location_id
    ),
    max(sl.current_quantity) FILTER (
      WHERE sl.location_id = v_kitchen_location_id
    )
  INTO v_warehouse_level, v_kitchen_level
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id
    AND sl.ingredient_id = v_ingredient_id
    AND sl.location_id IN (
      v_warehouse_location_id,
      v_kitchen_location_id
    );

  SELECT
    COALESCE(sum(sm.quantity_change) FILTER (
      WHERE sm.location_id = v_warehouse_location_id
    ), 0),
    COALESCE(sum(sm.quantity_change) FILTER (
      WHERE sm.location_id = v_kitchen_location_id
    ), 0)
  INTO v_warehouse_ledger, v_kitchen_ledger
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id
    AND sm.ingredient_id = v_ingredient_id
    AND sm.location_id IN (
      v_warehouse_location_id,
      v_kitchen_location_id
    );

  IF v_warehouse_level IS DISTINCT FROM v_warehouse_ledger
     OR v_kitchen_level IS DISTINCT FROM v_kitchen_ledger THEN
    RAISE EXCEPTION
      'TEST FAILED: target drift remains: warehouse %/%, kitchen %/%',
      v_warehouse_level,
      v_warehouse_ledger,
      v_kitchen_level,
      v_kitchen_ledger;
  END IF;

  WITH ledger AS (
    SELECT
      sm.ingredient_id,
      sm.location_id,
      sum(sm.quantity_change)::NUMERIC AS ledger_quantity
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_tenant_id
      AND sm.branch_id = v_branch_id
    GROUP BY sm.ingredient_id, sm.location_id
  ),
  levels AS (
    SELECT
      sl.ingredient_id,
      sl.location_id,
      sl.current_quantity::NUMERIC AS level_quantity
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
  ),
  pairs AS (
    SELECT
      COALESCE(ledger.ingredient_id, levels.ingredient_id) AS ingredient_id,
      COALESCE(ledger.location_id, levels.location_id) AS location_id,
      COALESCE(ledger.ledger_quantity, 0) AS ledger_quantity,
      COALESCE(levels.level_quantity, 0) AS level_quantity
    FROM ledger
    FULL JOIN levels USING (ingredient_id, location_id)
  )
  SELECT count(*) FILTER (
    WHERE abs(pairs.level_quantity - pairs.ledger_quantity) > 0.001
  )
  INTO v_drift_count
  FROM pairs;

  IF v_drift_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: branch still has % ledger drift rows', v_drift_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
      AND sl.current_quantity < 0
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: branch contains negative stock level';
  END IF;
END;
$test$;

ROLLBACK;
