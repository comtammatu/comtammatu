-- Patch the three LIVE stock_movements writers that omit entry_unit_id /
-- entry_quantity (and, for supplier return + HRM consumption, skip inv_to_base).
-- Without this, the NOT NULL constraint added in 20260707191741 raises 23502 at
-- INSERT, and supplier return / HRM consumption can silently write a non-base
-- quantity into quantity_change.
--
-- confirm_supplier_return: guard + INSERT now convert via inv_to_base and write
--   entry_unit_id + entry_quantity. unit_cost is normalised to per-base-unit so
--   it stays comparable to GRN-posted WAC.
-- branch_manager_approve_consumption_report: loop INSERT into stock_issue_items
--   + stock_movements now carries entry_unit_id + entry_quantity and converts
--   quantity to base. The source-location CTE and per-line guard compare on
--   base (HRM lines are authored in base after phase C, and the migration #2
--   backfill resolves historical rows to base, so the existing CTE math holds).
-- confirm_production_run raw-material leg: the aggregated need is already in
--   base; the movement INSERT now resolves the ingredient's active base unit and
--   writes entry_unit_id + entry_quantity = the per-ingredient base need.

SET search_path = '';
SET check_function_bodies = off;

-- ============================================================
-- 1) confirm_supplier_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_supplier_return(p_return_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_ret     RECORD;
  v_item    RECORD;
  v_old_q   NUMERIC(15,3);
  v_mv_id   BIGINT;
  v_lines_processed INT := 0;
  v_loc_id  BIGINT;
  v_qty_base NUMERIC(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_ret
  FROM public.supplier_returns
  WHERE id = p_return_id AND tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_ret.branch_id, 'supplier_return:confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_ret.status <> 'draft' THEN
    RAISE EXCEPTION 'return_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_ret.source = 'post_receipt' THEN
    SELECT id INTO v_loc_id
    FROM public.inventory_locations
    WHERE branch_id = v_ret.branch_id
      AND tenant_id = v_tenant
      AND is_default_receive = TRUE
      AND is_active = TRUE
    LIMIT 1;

    IF v_loc_id IS NULL THEN
      RAISE EXCEPTION 'no_default_location_for_branch' USING ERRCODE = 'P0002',
        DETAIL = format('branch_id=%s', v_ret.branch_id);
    END IF;

    FOR v_item IN
      SELECT sri.*, COALESCE(sri.entry_unit_id, (
        SELECT iu.unit_id
        FROM public.ingredient_units iu
        JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = sri.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
        ORDER BY iu.sort_order ASC, iu.id ASC
        LIMIT 1
      )) AS resolved_entry_unit_id
      FROM public.supplier_return_items sri
      WHERE sri.return_id = p_return_id AND sri.tenant_id = v_tenant
      ORDER BY sri.ingredient_id
    LOOP
      IF v_item.resolved_entry_unit_id IS NULL THEN
        RAISE EXCEPTION 'entry_unit_not_found:%', v_item.ingredient_id USING ERRCODE = '23503';
      END IF;

      v_qty_base := ROUND(public.inv_to_base(v_item.ingredient_id, v_item.resolved_entry_unit_id, v_item.quantity), 3);

      SELECT current_quantity INTO v_old_q
      FROM public.stock_levels
      WHERE tenant_id = v_tenant
        AND branch_id = v_ret.branch_id
        AND ingredient_id = v_item.ingredient_id
        AND location_id = v_loc_id
      FOR UPDATE;

      IF NOT FOUND OR COALESCE(v_old_q, 0) < v_qty_base THEN
        RAISE EXCEPTION 'insufficient_stock_for_return' USING ERRCODE = '23514',
          DETAIL = format('ingredient_id=%s, requested_base=%s, available=%s',
                          v_item.ingredient_id, v_qty_base, COALESCE(v_old_q, 0));
      END IF;

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, location_id, type, quantity_change,
        reason, created_by, unit_cost, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant, v_ret.branch_id, v_item.ingredient_id, v_loc_id, 'supplier_return',
        -v_qty_base,
        'Tra NCC ' || v_ret.return_number, v_uid,
        CASE WHEN v_qty_base <> 0
             THEN ROUND((v_item.quantity * v_item.unit_cost) / v_qty_base, 2)
             ELSE v_item.unit_cost
        END,
        v_item.resolved_entry_unit_id,
        v_item.quantity
      ) RETURNING id INTO v_mv_id;

      UPDATE public.supplier_return_items
      SET stock_movement_id = v_mv_id
      WHERE id = v_item.id;

      v_lines_processed := v_lines_processed + 1;
    END LOOP;
  END IF;

  UPDATE public.supplier_returns
  SET status = 'sent',
      confirmed_by = v_uid,
      confirmed_at = now(),
      updated_at = now()
  WHERE id = p_return_id;

  RETURN jsonb_build_object(
    'return_id', p_return_id,
    'status', 'sent',
    'lines_processed', v_lines_processed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_supplier_return(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_supplier_return(bigint) TO authenticated, service_role;

-- ============================================================
-- 2) branch_manager_approve_consumption_report
--    Only the per-line loop changes: entry_unit_id resolved from the report
--    line, guard + INSERT convert via inv_to_base, stock_issue_items carries
--    entry_unit_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.branch_manager_approve_consumption_report(
  p_tenant_id bigint,
  p_report_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_report record;
  v_line record;
  v_issue_id bigint;
  v_issue_number text;
  v_source_location_id bigint;
  v_current_quantity numeric(15,3);
  v_wac numeric(15,2);
  v_line_count integer;
  v_qty_base numeric(15,3);
  v_entry_unit_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR v_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_report
  FROM public.attendance_consumption_reports r
  WHERE r.id = p_report_id
    AND r.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consumption_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_report.branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  IF v_report.status IN ('approved', 'applied') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'report_id', p_report_id,
      'stock_issue_id', v_report.stock_issue_id,
      'status', v_report.status
    );
  END IF;

  IF v_report.status <> 'submitted' THEN
    RAISE EXCEPTION 'consumption_report_not_submitted' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_line_count
  FROM public.attendance_consumption_report_lines
  WHERE tenant_id = p_tenant_id
    AND report_id = p_report_id;

  IF v_report.no_consumption = true AND v_line_count = 0 THEN
    UPDATE public.attendance_consumption_reports
    SET status = 'approved',
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_note = NULL
    WHERE id = p_report_id
      AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
      'ok', true,
      'report_id', p_report_id,
      'stock_issue_id', NULL,
      'no_consumption', true,
      'line_count', 0
    );
  END IF;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'consumption_lines_required' USING ERRCODE = '22023';
  END IF;

  -- Source-location resolution: HRM report lines are authored in the
  -- ingredient base unit (phase C removed purchase_unit; migration #2 backfills
  -- entry_unit_id to base for historical rows), so l.quantity is already base
  -- and the CTE comparison against stock_levels.current_quantity is correct.
  WITH report_lines AS (
    SELECT l.ingredient_id, l.quantity
    FROM public.attendance_consumption_report_lines l
    WHERE l.tenant_id = p_tenant_id
      AND l.report_id = p_report_id
  ),
  candidate_locations AS (
    SELECT
      il.id,
      il.is_default_consumption,
      il.is_default_issue,
      il.sort_order,
      CASE
        WHEN b.branch_kind = 'branch' AND il.location_kind = 'kitchen' THEN 0
        ELSE 1
      END AS location_priority,
      CASE il.location_kind WHEN 'warehouse' THEN 0 ELSE 1 END AS warehouse_priority
    FROM public.inventory_locations il
    JOIN public.branches b
      ON b.id = il.branch_id
     AND b.tenant_id = il.tenant_id
    WHERE il.tenant_id = p_tenant_id
      AND il.branch_id = v_report.branch_id
      AND il.is_active = true
      AND (
        (b.branch_kind = 'branch' AND il.location_kind = 'kitchen')
        OR il.is_default_issue = true
        OR il.location_kind = 'warehouse'
      )
  ),
  candidate_stock AS (
    SELECT
      cl.id,
      cl.location_priority,
      cl.is_default_consumption,
      cl.is_default_issue,
      cl.warehouse_priority,
      cl.sort_order,
      COUNT(sl.ingredient_id) AS matched_lines,
      BOOL_AND(sl.avg_unit_cost IS NOT NULL) AS wac_ready,
      BOOL_AND(COALESCE(sl.current_quantity, 0) >= rl.quantity) AS stock_ready
    FROM candidate_locations cl
    CROSS JOIN report_lines rl
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = p_tenant_id
     AND sl.branch_id = v_report.branch_id
     AND sl.location_id = cl.id
     AND sl.ingredient_id = rl.ingredient_id
    GROUP BY
      cl.id,
      cl.location_priority,
      cl.is_default_consumption,
      cl.is_default_issue,
      cl.warehouse_priority,
      cl.sort_order
  )
  SELECT cs.id
  INTO v_source_location_id
  FROM candidate_stock cs
  WHERE cs.matched_lines = v_line_count
    AND cs.wac_ready
    AND cs.stock_ready
  ORDER BY
    cs.location_priority,
    cs.is_default_consumption DESC,
    cs.is_default_issue DESC,
    cs.warehouse_priority,
    cs.sort_order NULLS LAST,
    cs.id
  LIMIT 1;

  IF v_source_location_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.inventory_locations il
      JOIN public.branches b
        ON b.id = il.branch_id
       AND b.tenant_id = il.tenant_id
      WHERE il.tenant_id = p_tenant_id
        AND il.branch_id = v_report.branch_id
        AND il.is_active = true
        AND (
          (b.branch_kind = 'branch' AND il.location_kind = 'kitchen')
          OR il.is_default_issue = true
          OR il.location_kind = 'warehouse'
        )
    ) THEN
      RAISE EXCEPTION 'consumption_location_missing' USING ERRCODE = '23502';
    END IF;

    IF EXISTS (
      WITH report_lines AS (
        SELECT l.ingredient_id, l.quantity
        FROM public.attendance_consumption_report_lines l
        WHERE l.tenant_id = p_tenant_id
          AND l.report_id = p_report_id
      ),
      candidate_locations AS (
        SELECT il.id
        FROM public.inventory_locations il
        JOIN public.branches b
          ON b.id = il.branch_id
         AND b.tenant_id = il.tenant_id
        WHERE il.tenant_id = p_tenant_id
          AND il.branch_id = v_report.branch_id
          AND il.is_active = true
          AND (
            (b.branch_kind = 'branch' AND il.location_kind = 'kitchen')
            OR il.is_default_issue = true
            OR il.location_kind = 'warehouse'
          )
      ),
      candidate_stock AS (
        SELECT
          cl.id,
          COUNT(sl.ingredient_id) AS matched_lines,
          BOOL_AND(sl.avg_unit_cost IS NOT NULL) AS wac_ready,
          BOOL_AND(COALESCE(sl.current_quantity, 0) >= rl.quantity) AS stock_ready
        FROM candidate_locations cl
        CROSS JOIN report_lines rl
        LEFT JOIN public.stock_levels sl
          ON sl.tenant_id = p_tenant_id
         AND sl.branch_id = v_report.branch_id
         AND sl.location_id = cl.id
         AND sl.ingredient_id = rl.ingredient_id
        GROUP BY cl.id
      )
      SELECT 1
      FROM candidate_stock cs
      WHERE cs.matched_lines = v_line_count
        AND cs.stock_ready
        AND NOT cs.wac_ready
    ) THEN
      RAISE EXCEPTION 'wac_not_ready' USING ERRCODE = '22023';
    END IF;

    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = '22023';
  END IF;

  v_issue_number := 'THB-' || p_report_id::text;

  INSERT INTO public.stock_issues (
    tenant_id,
    branch_id,
    issue_number,
    issue_type,
    status,
    notes,
    issued_at,
    created_by,
    source_location_id,
    target_location_id,
    approval_status,
    approved_by,
    approved_at,
    source_type,
    source_ref
  )
  VALUES (
    p_tenant_id,
    v_report.branch_id,
    v_issue_number,
    'consumption',
    'draft',
    COALESCE(v_report.note, 'Tiêu hao bếp trong ngày'),
    now(),
    v_uid,
    v_source_location_id,
    NULL,
    'approved',
    v_uid,
    now(),
    'hrm_consumption',
    jsonb_build_object(
      'source', 'attendance_consumption_report',
      'source_label', 'HRM - Tiêu hao bếp trong ngày',
      'report_id', p_report_id,
      'attendance_record_id', v_report.attendance_record_id,
      'employee_id', v_report.employee_id,
      'branch_id', v_report.branch_id,
      'reviewed_by', v_uid,
      'reviewed_at', now()
    )
  )
  RETURNING id INTO v_issue_id;

  FOR v_line IN
    SELECT l.*, i.name AS ingredient_name
    FROM public.attendance_consumption_report_lines l
    JOIN public.ingredients i
      ON i.id = l.ingredient_id
     AND i.tenant_id = l.tenant_id
     AND i.is_active = true
    WHERE l.tenant_id = p_tenant_id
      AND l.report_id = p_report_id
    ORDER BY l.sort_order, l.id
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_current_quantity, v_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = p_tenant_id
      AND sl.branch_id = v_report.branch_id
      AND sl.location_id = v_source_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR v_wac IS NULL THEN
      RAISE EXCEPTION 'wac_not_ready_for_%', v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    v_entry_unit_id := COALESCE(v_line.entry_unit_id, (
      SELECT iu.unit_id
      FROM public.ingredient_units iu
      JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
      WHERE iu.tenant_id = p_tenant_id
        AND iu.ingredient_id = v_line.ingredient_id
        AND iu.is_base = TRUE
        AND iu.is_active = TRUE
      ORDER BY iu.sort_order ASC, iu.id ASC
      LIMIT 1
    ));

    IF v_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_line.ingredient_id USING ERRCODE = '23503';
    END IF;

    v_qty_base := ROUND(public.inv_to_base(v_line.ingredient_id, v_entry_unit_id, v_line.quantity), 3);

    IF COALESCE(v_current_quantity, 0) < v_qty_base THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.stock_issue_items (
      tenant_id,
      issue_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_cost,
      reason
    )
    VALUES (
      p_tenant_id,
      v_issue_id,
      v_line.ingredient_id,
      v_line.quantity,
      v_entry_unit_id,
      v_wac,
      v_line.note
    );

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      movement_subtype,
      quantity_change,
      unit_cost,
      reason,
      created_by,
      issue_id,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      p_tenant_id,
      v_report.branch_id,
      v_line.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_qty_base,
      v_wac,
      COALESCE(v_line.note, v_report.note, 'Tiêu hao bếp trong ngày'),
      v_uid,
      v_issue_id,
      v_source_location_id,
      v_entry_unit_id,
      v_line.quantity
    );
  END LOOP;

  UPDATE public.stock_issues
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = v_issue_id
    AND tenant_id = p_tenant_id;

  UPDATE public.attendance_consumption_reports
  SET status = 'applied',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_note = NULL,
      stock_issue_id = v_issue_id
  WHERE id = p_report_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'report_id', p_report_id,
    'stock_issue_id', v_issue_id,
    'line_count', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.branch_manager_approve_consumption_report(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branch_manager_approve_consumption_report(bigint, bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.branch_manager_approve_consumption_report(bigint, bigint) IS
  'Checkout approver approves a submitted consumption report and atomically posts Inventory consumption movements (entry_unit -> base via inv_to_base) from the first stock location that can cover all report lines.';

-- ============================================================
-- 3) confirm_production_run raw-material leg
--    Re-declares the full function with the raw-material movement INSERT now
--    carrying entry_unit_id + entry_quantity resolved from the ingredient's
--    active base unit. The output leg is unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_production_run(
  p_run_id bigint,
  p_actual_quantity numeric DEFAULT NULL::numeric,
  p_actual_ingredients jsonb DEFAULT NULL::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_run RECORD;
  v_recipe RECORD;
  v_has_recipe boolean := false;
  v_effective_ingredients jsonb;
  v_raw_need_measure numeric(15,3);
  v_raw_need_purchase numeric(15,3);
  v_actual_usage numeric(15,3);
  v_need_map jsonb := '{}'::jsonb;
  v_key text;
  v_need_qty numeric(15,3);
  v_old_q numeric(15,3);
  v_old_wac numeric(15,2);
  v_new_q numeric(15,3);
  v_new_wac numeric(15,2);
  v_output_cost numeric(15,2) := 0;
  v_cost_total numeric(15,2);
  v_out_base numeric(15,3);
  v_out_unit_cost numeric(15,2);
  v_target_location_id bigint;
  v_source_location_id bigint;
  v_shortages jsonb;
  v_raw_entry_unit_id bigint;
  v_actual_quantity numeric(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_inventory_production_operator() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('inventory:production_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pr.*, b.branch_kind INTO v_run
  FROM public.production_runs pr
  JOIN public.branches b ON b.id = pr.branch_id AND b.tenant_id = pr.tenant_id
  WHERE pr.id = p_run_id AND pr.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_run.status NOT IN ('draft', 'in_progress') THEN
    RAISE EXCEPTION 'production_run_not_draft' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(v_run.branch_id, 'inventory:production_confirm') THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  v_effective_ingredients := COALESCE(p_actual_ingredients, v_run.ingredients_override);

  SELECT il.id INTO v_source_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_run.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;
  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'production_location_missing:%', v_run.branch_id USING ERRCODE = 'P0002';
  END IF;

  SELECT il.id INTO v_target_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_run.target_branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = TRUE
    AND il.is_active = TRUE
  LIMIT 1;
  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'production_location_missing:%', v_run.target_branch_id USING ERRCODE = 'P0002';
  END IF;

  v_actual_quantity := ROUND(COALESCE(p_actual_quantity, v_run.planned_quantity), 3);

  FOR v_recipe IN
    SELECT pr.ingredient_id, pr.quantity, pr.yield_factor, pr.entry_unit_id,
           COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
    FROM public.production_recipes pr
    JOIN public.ingredients ing ON ing.id = pr.ingredient_id AND ing.tenant_id = pr.tenant_id
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_run.branch_id
     AND sl.location_id = v_source_location_id
     AND sl.ingredient_id = pr.ingredient_id
    WHERE pr.tenant_id = v_tenant
      AND pr.finished_good_id = v_run.finished_good_id
  LOOP
    v_has_recipe := true;
    v_raw_need_measure := (v_run.planned_quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);

    IF v_effective_ingredients IS NOT NULL THEN
      v_actual_usage := NULL;
      SELECT (elem->>'actual_quantity')::NUMERIC(15,3) INTO v_actual_usage
      FROM jsonb_array_elements(v_effective_ingredients) elem
      WHERE (elem->>'ingredient_id')::BIGINT = v_recipe.ingredient_id;

      IF v_actual_usage IS NOT NULL THEN
        v_raw_need_measure := v_actual_usage;
      END IF;
    END IF;

    IF v_recipe.entry_unit_id IS NOT NULL THEN
      v_raw_need_purchase := ROUND(public.inv_to_base(v_recipe.ingredient_id, v_recipe.entry_unit_id, v_raw_need_measure), 3);
    ELSE
      v_raw_need_purchase := ROUND(v_raw_need_measure, 3);
    END IF;

    v_key := v_recipe.ingredient_id::text;
    v_need_map := jsonb_set(v_need_map, ARRAY[v_key], to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase), TRUE);
    v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
  END LOOP;

  IF NOT v_has_recipe THEN
    RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
  END IF;

  WITH shortages AS (
    SELECT (need.ingredient_id)::BIGINT AS ingredient_id, ing.name AS ingredient_name,
           (
             SELECT u.name
             FROM public.ingredient_units iu
             JOIN public.units u ON u.id = iu.unit_id
             WHERE iu.ingredient_id = ing.id AND iu.is_base = true
             LIMIT 1
           ) AS unit,
           ROUND((need.need_qty)::NUMERIC, 3) AS needed,
           ROUND(COALESCE(sl.current_quantity, 0)::NUMERIC, 3) AS on_hand
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    JOIN public.ingredients ing ON ing.id = (need.ingredient_id)::BIGINT
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_run.branch_id
     AND sl.location_id = v_source_location_id
     AND sl.ingredient_id = (need.ingredient_id)::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < (need.need_qty)::NUMERIC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::JSONB) INTO v_shortages FROM shortages s;

  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001', DETAIL = v_shortages::TEXT;
  END IF;

  v_cost_total := v_output_cost;

  -- Raw-material consumption: aggregate need is already in base. Resolve the
  -- entry_unit_id to the ingredient's active base unit and mirror the base
  -- quantity as the entry quantity (entry == base for raw consumption by
  -- design), so the entry/base pair is populated and satisfies NOT NULL.
  FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_run.branch_id
      AND sl.location_id = v_source_location_id
      AND sl.ingredient_id = v_key::BIGINT;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    SELECT iu.unit_id INTO v_raw_entry_unit_id
    FROM public.ingredient_units iu
    JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = v_key::BIGINT
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1;

    IF v_raw_entry_unit_id IS NULL THEN
      RAISE EXCEPTION 'entry_unit_not_found:%', v_key::BIGINT USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_run_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_run.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
      'Production ' || v_run.production_number, v_uid, p_run_id, COALESCE(v_old_wac, 0), v_source_location_id,
      v_raw_entry_unit_id, v_need_qty
    );
  END LOOP;

  -- Output finished good to TARGET branch (unchanged: already writes entry cols).
  IF v_run.entry_unit_id IS NOT NULL THEN
    v_out_base := public.inv_to_base(v_run.finished_good_id, v_run.entry_unit_id, v_actual_quantity);
  ELSE
    v_out_base := v_actual_quantity;
  END IF;

  v_out_unit_cost := CASE WHEN v_out_base <> 0 THEN ROUND(v_cost_total / v_out_base, 2) ELSE 0 END;

  SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;
  IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, ingredient_id, type, quantity_change,
    reason, created_by, production_run_id, unit_cost, location_id,
    entry_unit_id, entry_quantity
  ) VALUES (
    v_tenant, v_run.target_branch_id, v_run.finished_good_id, 'production_output', v_out_base,
    'Production ' || v_run.production_number, v_uid, p_run_id, v_out_unit_cost, v_target_location_id,
    v_run.entry_unit_id, v_actual_quantity
  );

  v_new_q := COALESCE(v_old_q, 0) + v_out_base;
  v_new_wac := CASE WHEN v_new_q > 0 THEN (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_cost_total) / v_new_q ELSE v_out_unit_cost END;

  UPDATE public.stock_levels sl
  SET avg_unit_cost = v_new_wac, updated_at = now()
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = v_run.target_branch_id
    AND sl.location_id = v_target_location_id
    AND sl.ingredient_id = v_run.finished_good_id;

  UPDATE public.ingredients
  SET unit_cost = v_out_unit_cost, updated_at = now()
  WHERE id = v_run.finished_good_id AND tenant_id = v_tenant;

  UPDATE public.production_runs
  SET status = 'completed',
      actual_quantity = v_actual_quantity,
      completed_at = now(),
      updated_at = now(),
      ingredients_override = v_effective_ingredients
  WHERE id = p_run_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'production_run_id', p_run_id,
    'status', 'completed',
    'actual_quantity', v_actual_quantity,
    'output_quantity_base', v_out_base,
    'unit_cost', v_out_unit_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) TO authenticated, service_role;
