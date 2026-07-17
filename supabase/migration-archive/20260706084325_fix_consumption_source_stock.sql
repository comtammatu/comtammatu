CREATE OR REPLACE FUNCTION public.branch_manager_approve_consumption_report(
  p_tenant_id bigint,
  p_report_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    IF v_current_quantity < v_line.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.stock_issue_items (
      tenant_id,
      issue_id,
      ingredient_id,
      quantity,
      unit,
      unit_cost,
      reason
    )
    VALUES (
      p_tenant_id,
      v_issue_id,
      v_line.ingredient_id,
      v_line.quantity,
      v_line.unit,
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
      location_id
    )
    VALUES (
      p_tenant_id,
      v_report.branch_id,
      v_line.ingredient_id,
      'consumption',
      'sale_consumption',
      -v_line.quantity,
      v_wac,
      COALESCE(v_line.note, v_report.note, 'Tiêu hao bếp trong ngày'),
      v_uid,
      v_issue_id,
      v_source_location_id
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

REVOKE ALL ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) TO service_role;

COMMENT ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) IS
  'Checkout approver approves a submitted consumption report and atomically posts Inventory consumption movements from the first stock location that can cover all report lines.';
