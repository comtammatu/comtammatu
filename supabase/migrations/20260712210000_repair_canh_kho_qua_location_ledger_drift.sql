SET LOCAL search_path = '';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
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
  v_level_count INTEGER;
  v_marker_count INTEGER;
  v_valid_warehouse_marker_count INTEGER;
  v_valid_kitchen_marker_count INTEGER;
  v_row_count INTEGER;
  v_drift_count INTEGER;
  v_other_drift_count INTEGER;
  v_movement_count_before BIGINT;
  v_movement_count_after BIGINT;
  v_ledger_total_before NUMERIC;
  v_ledger_total_after NUMERIC;
  v_level_total_before NUMERIC;
  v_level_total_after NUMERIC;
  v_warehouse_ledger NUMERIC;
  v_kitchen_ledger NUMERIC;
  v_warehouse_level NUMERIC;
  v_kitchen_level NUMERIC;
  v_warehouse_avg_unit_cost NUMERIC;
  v_kitchen_avg_unit_cost NUMERIC;
  v_warehouse_last_counted_at TIMESTAMPTZ;
  v_kitchen_last_counted_at TIMESTAMPTZ;
  v_trigger_hash TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.slug = 'comtammatu'
  ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'ledger_repair:20260712:canh_kho_qua:location_drift',
      0
    )
  );

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

  IF v_target_count <> 1 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_target_cardinality_changed';
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
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_source_cardinality_changed';
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

  IF v_source.created_by IS NULL
     OR v_source.entry_unit_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = v_source.created_by
         AND p.tenant_id = v_tenant_id
         AND p.is_active = TRUE
     )
     OR (
       SELECT count(*)
       FROM public.ingredient_units iu
       WHERE iu.tenant_id = v_tenant_id
         AND iu.ingredient_id = v_ingredient_id
         AND iu.unit_id = v_source.entry_unit_id
         AND iu.is_active = TRUE
         AND iu.is_base = TRUE
         AND iu.to_base_factor = 1
     ) <> 1 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_source_contract_changed';
  END IF;

  SELECT count(*)
  INTO v_level_count
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id
    AND sl.ingredient_id = v_ingredient_id
    AND sl.location_id IN (
      v_warehouse_location_id,
      v_kitchen_location_id
    );

  IF v_level_count <> 2 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_level_cardinality_changed';
  END IF;

  PERFORM 1
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id
    AND sl.ingredient_id = v_ingredient_id
    AND sl.location_id IN (
      v_warehouse_location_id,
      v_kitchen_location_id
    )
  ORDER BY sl.location_id
  FOR UPDATE;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 2 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_level_lock_changed';
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
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_source_changed_after_lock';
  END IF;

  SELECT md5(pg_get_functiondef(p.oid))
  INTO v_trigger_hash
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'trg_update_stock_on_movement'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_trigger_hash IS DISTINCT FROM '5efce52486f524811a9282ca178b0d75'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger trigger_row
       JOIN pg_proc trigger_function
         ON trigger_function.oid = trigger_row.tgfoid
       JOIN pg_namespace trigger_namespace
         ON trigger_namespace.oid = trigger_function.pronamespace
       WHERE trigger_row.tgrelid = 'public.stock_movements'::REGCLASS
         AND trigger_row.tgname = 'trg_stock_movement_update_levels'
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgisinternal = FALSE
         AND trigger_row.tgtype = 5
         AND trigger_namespace.nspname = 'public'
         AND trigger_function.proname = 'trg_update_stock_on_movement'
     ) THEN
    RAISE EXCEPTION 'stock_movement_trigger_contract_changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.stock_levels'::REGCLASS
      AND constraint_row.conname = 'stock_levels_current_quantity_nonneg'
      AND constraint_row.convalidated = TRUE
      AND pg_get_constraintdef(constraint_row.oid) =
        'CHECK ((current_quantity >= (0)::numeric))'
  ) THEN
    RAISE EXCEPTION 'stock_levels_nonnegative_contract_changed';
  END IF;

  SELECT
    max(sl.current_quantity) FILTER (
      WHERE sl.location_id = v_warehouse_location_id
    ),
    max(sl.current_quantity) FILTER (
      WHERE sl.location_id = v_kitchen_location_id
    ),
    max(sl.avg_unit_cost) FILTER (
      WHERE sl.location_id = v_warehouse_location_id
    ),
    max(sl.avg_unit_cost) FILTER (
      WHERE sl.location_id = v_kitchen_location_id
    ),
    max(sl.last_counted_at) FILTER (
      WHERE sl.location_id = v_warehouse_location_id
    ),
    max(sl.last_counted_at) FILTER (
      WHERE sl.location_id = v_kitchen_location_id
    )
  INTO
    v_warehouse_level,
    v_kitchen_level,
    v_warehouse_avg_unit_cost,
    v_kitchen_avg_unit_cost,
    v_warehouse_last_counted_at,
    v_kitchen_last_counted_at
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

  SELECT count(*)
  INTO v_marker_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id
    AND sm.ingredient_id = v_ingredient_id
    AND sm.reason IN (v_marker_warehouse, v_marker_kitchen);

  IF v_marker_count > 0 THEN
    SELECT
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
      RAISE EXCEPTION 'canh_kho_qua_ledger_repair_marker_invalid';
    END IF;

    IF v_warehouse_level IS DISTINCT FROM v_warehouse_ledger
       OR v_kitchen_level IS DISTINCT FROM v_kitchen_ledger THEN
      RAISE EXCEPTION 'canh_kho_qua_ledger_repair_marker_state_drifted';
    END IF;

    RETURN;
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
  SELECT
    count(*) FILTER (
      WHERE abs(pairs.level_quantity - pairs.ledger_quantity) > 0.001
    ),
    count(*) FILTER (
      WHERE abs(pairs.level_quantity - pairs.ledger_quantity) > 0.001
        AND NOT (
          pairs.ingredient_id = v_ingredient_id
          AND pairs.location_id IN (
            v_warehouse_location_id,
            v_kitchen_location_id
          )
        )
    )
  INTO v_drift_count, v_other_drift_count
  FROM pairs;

  IF v_drift_count <> 2
     OR v_other_drift_count <> 0
     OR v_warehouse_level - v_warehouse_ledger <> 9.000
     OR v_kitchen_level - v_kitchen_ledger <> -9.000 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_precondition_changed';
  END IF;

  SELECT count(*), COALESCE(sum(sm.quantity_change), 0)
  INTO v_movement_count_before, v_ledger_total_before
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id;

  SELECT COALESCE(sum(sl.current_quantity), 0)
  INTO v_level_total_before
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id;

  UPDATE public.stock_levels sl
  SET current_quantity = sl.current_quantity + 9.000,
      updated_at = now()
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id
    AND sl.ingredient_id = v_ingredient_id
    AND sl.location_id = v_kitchen_location_id
    AND sl.current_quantity = v_kitchen_level
    AND sl.avg_unit_cost IS NOT DISTINCT FROM v_kitchen_avg_unit_cost
    AND sl.last_counted_at IS NOT DISTINCT FROM v_kitchen_last_counted_at;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_kitchen_stage_failed';
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    location_id,
    type,
    quantity_change,
    reason,
    created_by,
    unit_cost,
    movement_subtype,
    entry_unit_id,
    entry_quantity
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    v_ingredient_id,
    v_kitchen_location_id,
    'adjustment',
    -9.000,
    v_marker_kitchen,
    v_source.created_by,
    v_source.unit_cost,
    NULL,
    v_source.entry_unit_id,
    9.000
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
      AND sl.ingredient_id = v_ingredient_id
      AND sl.location_id = v_kitchen_location_id
      AND sl.current_quantity = v_kitchen_level
      AND sl.avg_unit_cost IS NOT DISTINCT FROM v_kitchen_avg_unit_cost
      AND sl.last_counted_at IS NOT DISTINCT FROM v_kitchen_last_counted_at
  ) THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_kitchen_trigger_failed';
  END IF;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    ingredient_id,
    location_id,
    type,
    quantity_change,
    reason,
    created_by,
    unit_cost,
    movement_subtype,
    entry_unit_id,
    entry_quantity
  )
  VALUES (
    v_tenant_id,
    v_branch_id,
    v_ingredient_id,
    v_warehouse_location_id,
    'adjustment',
    9.000,
    v_marker_warehouse,
    v_source.created_by,
    v_source.unit_cost,
    NULL,
    v_source.entry_unit_id,
    9.000
  );

  UPDATE public.stock_levels sl
  SET current_quantity = v_warehouse_level,
      updated_at = now()
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id
    AND sl.ingredient_id = v_ingredient_id
    AND sl.location_id = v_warehouse_location_id
    AND sl.current_quantity = v_warehouse_level + 9.000
    AND sl.avg_unit_cost IS NOT DISTINCT FROM v_warehouse_avg_unit_cost
    AND sl.last_counted_at IS NOT DISTINCT FROM v_warehouse_last_counted_at;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_warehouse_restore_failed';
  END IF;

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

  IF v_warehouse_ledger IS DISTINCT FROM v_warehouse_level
     OR v_kitchen_ledger IS DISTINCT FROM v_kitchen_level THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_target_postcondition_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
      AND sl.ingredient_id = v_ingredient_id
      AND sl.location_id = v_warehouse_location_id
      AND sl.current_quantity = v_warehouse_level
      AND sl.avg_unit_cost IS NOT DISTINCT FROM v_warehouse_avg_unit_cost
      AND sl.last_counted_at IS NOT DISTINCT FROM v_warehouse_last_counted_at
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant_id
      AND sl.branch_id = v_branch_id
      AND sl.ingredient_id = v_ingredient_id
      AND sl.location_id = v_kitchen_location_id
      AND sl.current_quantity = v_kitchen_level
      AND sl.avg_unit_cost IS NOT DISTINCT FROM v_kitchen_avg_unit_cost
      AND sl.last_counted_at IS NOT DISTINCT FROM v_kitchen_last_counted_at
  ) THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_level_preimage_changed';
  END IF;

  SELECT count(*), COALESCE(sum(sm.quantity_change), 0)
  INTO v_movement_count_after, v_ledger_total_after
  FROM public.stock_movements sm
  WHERE sm.tenant_id = v_tenant_id
    AND sm.branch_id = v_branch_id;

  SELECT COALESCE(sum(sl.current_quantity), 0)
  INTO v_level_total_after
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant_id
    AND sl.branch_id = v_branch_id;

  IF v_movement_count_after <> v_movement_count_before + 2
     OR v_ledger_total_after <> v_ledger_total_before
     OR v_level_total_after <> v_level_total_before
     OR EXISTS (
       SELECT 1
       FROM public.stock_levels sl
       WHERE sl.tenant_id = v_tenant_id
         AND sl.branch_id = v_branch_id
         AND sl.current_quantity < 0
     ) THEN
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_branch_totals_changed';
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
    RAISE EXCEPTION 'canh_kho_qua_ledger_repair_branch_still_drifted';
  END IF;
END;
$migration$;
