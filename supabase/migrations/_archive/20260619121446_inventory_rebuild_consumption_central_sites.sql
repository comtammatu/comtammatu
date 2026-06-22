BEGIN;

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_branch_kind_check;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_branch_kind_check
  CHECK (branch_kind IN ('branch', 'central_supply', 'central_kitchen'));

CREATE OR REPLACE FUNCTION public.set_branch_kind(
  p_branch_id bigint,
  p_kind text DEFAULT 'branch'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant bigint;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id
  INTO v_tenant
  FROM public.profiles p
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('branch', 'central_supply', 'central_kitchen') THEN
    RAISE EXCEPTION 'invalid branch_kind' USING ERRCODE = '22023';
  END IF;

  UPDATE public.branches
  SET branch_kind = p_kind,
      updated_at = now()
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_branch_kind(p_branch_id bigint, p_kind text)
IS 'Sets the operating site kind for a branch-backed inventory site.';

CREATE OR REPLACE FUNCTION public.enforce_po_grn_branch_is_procurement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.branch_kind IN ('branch', 'central_supply', 'central_kitchen')
      AND b.is_active = true
  ) THEN
    RAISE EXCEPTION 'branch must be active procurement site' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_from_kind text;
  v_to_kind text;
BEGIN
  IF NEW.from_branch_id = NEW.to_branch_id THEN
    RAISE EXCEPTION 'intra_branch_transfer_not_supported' USING ERRCODE = '23514';
  END IF;

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

  IF v_from_kind = 'branch' AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind IN ('central_supply', 'central_kitchen') AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'stock_transfers: invalid direction % -> %', v_from_kind, v_to_kind
    USING ERRCODE = '23514';
END;
$$;

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_no_intra_branch_new;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_no_intra_branch_new
  CHECK (from_branch_id <> to_branch_id) NOT VALID;

CREATE OR REPLACE FUNCTION public.commit_intra_branch_transfer(
  p_branch_id bigint,
  p_from_location_id bigint,
  p_to_location_id bigint,
  p_transfer_number text,
  p_notes text DEFAULT NULL::text,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'intra_branch_transfer_not_supported' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.commit_intra_branch_transfer(
  bigint,
  bigint,
  bigint,
  text,
  text,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.commit_intra_branch_transfer(
  bigint,
  bigint,
  bigint,
  text,
  text,
  jsonb
) TO authenticated;

COMMENT ON FUNCTION public.commit_intra_branch_transfer(
  bigint,
  bigint,
  bigint,
  text,
  text,
  jsonb
) IS
  'Branch kitchen consumption must post through stock_movements consumption, not stock transfer.';

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
  WHERE il.tenant_id = p_tenant_id
    AND il.branch_id = v_report.branch_id
    AND il.is_active = true
    AND (
      il.is_default_issue = true
      OR il.location_kind = 'warehouse'
    )
  ORDER BY
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

DO $$
DECLARE
  v_signature text;
  v_sql text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.confirm_goods_receipt_note(bigint)',
    'public.create_grn_from_po(bigint)',
    'public.create_production_order(bigint,text,text,jsonb)',
    'public.confirm_production_order(bigint)'
  ]
  LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure)
    INTO v_sql;

    IF v_signature IN (
      'public.confirm_goods_receipt_note(bigint)',
      'public.create_grn_from_po(bigint)'
    ) THEN
      v_sql := replace(
        v_sql,
        'b.branch_kind = ''branch''',
        'b.branch_kind IN (''branch'', ''central_supply'', ''central_kitchen'')'
      );
      v_sql := replace(
        v_sql,
        'AND b.branch_kind = ''branch''',
        'AND b.branch_kind IN (''branch'', ''central_supply'', ''central_kitchen'')'
      );
      v_sql := replace(
        v_sql,
        'v_branch.branch_kind <> ''branch''',
        'v_branch.branch_kind NOT IN (''branch'', ''central_supply'', ''central_kitchen'')'
      );
    ELSE
      v_sql := replace(
        v_sql,
        'b.branch_kind = ''branch''',
        'b.branch_kind IN (''branch'', ''central_kitchen'')'
      );
      v_sql := replace(
        v_sql,
        'AND b.branch_kind = ''branch''',
        'AND b.branch_kind IN (''branch'', ''central_kitchen'')'
      );
      v_sql := replace(
        v_sql,
        'v_branch.branch_kind <> ''branch''',
        'v_branch.branch_kind NOT IN (''branch'', ''central_kitchen'')'
      );
      v_sql := replace(
        v_sql,
        'v_order.branch_kind <> ''branch''',
        'v_order.branch_kind NOT IN (''branch'', ''central_kitchen'')'
      );
    END IF;

    EXECUTE v_sql;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS production_orders_write ON public.production_orders;
CREATE POLICY production_orders_write
ON public.production_orders
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(branch_id, 'inventory:production_create')
    OR public.has_permission(branch_id, 'inventory:production_confirm')
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = production_orders.branch_id
      AND b.tenant_id = production_orders.tenant_id
      AND b.branch_kind IN ('branch', 'central_kitchen')
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(branch_id, 'inventory:production_create')
    OR public.has_permission(branch_id, 'inventory:production_confirm')
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = production_orders.branch_id
      AND b.tenant_id = production_orders.tenant_id
      AND b.branch_kind IN ('branch', 'central_kitchen')
  )
);

DROP POLICY IF EXISTS production_order_items_write ON public.production_order_items;
CREATE POLICY production_order_items_write
ON public.production_order_items
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders po
    JOIN public.branches b
      ON b.id = po.branch_id
    WHERE po.id = production_order_items.production_order_id
      AND po.tenant_id = production_order_items.tenant_id
      AND po.tenant_id = public.auth_tenant_id()
      AND b.tenant_id = po.tenant_id
      AND b.branch_kind IN ('branch', 'central_kitchen')
      AND (
        public.has_permission(po.branch_id, 'inventory:production_create')
        OR public.has_permission(po.branch_id, 'inventory:production_confirm')
      )
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders po
    JOIN public.branches b
      ON b.id = po.branch_id
    WHERE po.id = production_order_items.production_order_id
      AND po.tenant_id = production_order_items.tenant_id
      AND po.tenant_id = public.auth_tenant_id()
      AND b.tenant_id = po.tenant_id
      AND b.branch_kind IN ('branch', 'central_kitchen')
      AND (
        public.has_permission(po.branch_id, 'inventory:production_create')
        OR public.has_permission(po.branch_id, 'inventory:production_confirm')
      )
  )
);

COMMIT;
