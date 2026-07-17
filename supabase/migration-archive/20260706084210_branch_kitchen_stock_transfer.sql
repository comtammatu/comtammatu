ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_no_intra_branch_new;

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_from_kind text;
  v_to_kind text;
BEGIN
  SELECT b.branch_kind
  INTO v_from_kind
  FROM public.branches b
  WHERE b.id = NEW.from_branch_id
    AND b.tenant_id = NEW.tenant_id;

  SELECT b.branch_kind
  INTO v_to_kind
  FROM public.branches b
  WHERE b.id = NEW.to_branch_id
    AND b.tenant_id = NEW.tenant_id;

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'stock_transfers: invalid branch reference' USING ERRCODE = '23514';
  END IF;

  IF NEW.from_branch_id = NEW.to_branch_id THEN
    IF v_from_kind = 'branch' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'stock_transfers: same-site transfer only allowed inside branch'
      USING ERRCODE = '23514';
  END IF;

  IF v_from_kind = 'branch' AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind = 'branch' AND v_to_kind IN ('central_supply', 'central_kitchen') THEN
    RETURN NEW;
  END IF;

  IF v_from_kind IN ('central_supply', 'central_kitchen') AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind = 'central_supply' AND v_to_kind = 'central_kitchen' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind = 'central_kitchen' AND v_to_kind = 'central_supply' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'stock_transfers: invalid direction % -> %', v_from_kind, v_to_kind
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION public.enforce_stock_transfer_direction() IS
  'Allowed transfers: branch same-site kitchen handoff, branch-to-branch, branch-to-central, central-to-branch, central_supply-to-central_kitchen, and central_kitchen-to-central_supply.';

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
    IF NOT (
      public.has_permission(p_branch_id, 'inventory:read')
      OR public.has_permission(NULL, 'reports:view_branch')
      OR public.has_permission(NULL, 'reports:view_tenant')
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

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
        OR (b.branch_kind = 'branch' AND il.location_kind = 'kitchen')
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

  SELECT il.id
  INTO v_source_location_id
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
  ORDER BY
    CASE WHEN b.branch_kind = 'branch' AND il.location_kind = 'kitchen' THEN 0 ELSE 1 END,
    il.is_default_consumption DESC,
    il.is_default_issue DESC,
    CASE il.location_kind WHEN 'warehouse' THEN 0 ELSE 1 END,
    il.sort_order NULLS LAST,
    il.id
  LIMIT 1;

  IF v_source_location_id IS NULL THEN
    RAISE EXCEPTION 'consumption_location_missing' USING ERRCODE = '23502';
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
