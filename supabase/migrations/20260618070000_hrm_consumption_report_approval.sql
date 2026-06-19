BEGIN;

-- Daily kitchen consumption is reported by staff but only applied to
-- Inventory after checkout approver review.

CREATE TABLE IF NOT EXISTS public.attendance_consumption_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attendance_record_id bigint NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id bigint NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  note text,
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  stock_issue_id bigint REFERENCES public.stock_issues(id) ON DELETE SET NULL,
  no_consumption boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_consumption_reports_status_check CHECK (
    status = ANY (ARRAY[
      'draft',
      'submitted',
      'needs_changes',
      'approved',
      'applied',
      'cancelled'
    ]::text[])
  ),
  CONSTRAINT attendance_consumption_reports_note_length CHECK (
    note IS NULL OR char_length(note) <= 1000
  ),
  CONSTRAINT attendance_consumption_reports_review_note_length CHECK (
    review_note IS NULL OR char_length(review_note) <= 1000
  ),
  CONSTRAINT attendance_consumption_reports_no_consumption_stock_check CHECK (
    (NOT no_consumption) OR stock_issue_id IS NULL
  )
);

ALTER TABLE public.attendance_consumption_reports
  ADD COLUMN IF NOT EXISTS no_consumption boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_consumption_reports_attendance
  ON public.attendance_consumption_reports (tenant_id, attendance_record_id);

CREATE INDEX IF NOT EXISTS idx_attendance_consumption_reports_branch_status
  ON public.attendance_consumption_reports (tenant_id, branch_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_consumption_reports_employee
  ON public.attendance_consumption_reports (tenant_id, employee_id);

DROP TRIGGER IF EXISTS trg_attendance_consumption_reports_updated_at
  ON public.attendance_consumption_reports;
CREATE TRIGGER trg_attendance_consumption_reports_updated_at
  BEFORE UPDATE ON public.attendance_consumption_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.shift_checklist_consumption_default_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_item_id bigint NOT NULL REFERENCES public.shift_checklist_template_items(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_checklist_consumption_default_items_sort_positive CHECK (sort_order > 0),
  CONSTRAINT shift_checklist_consumption_default_items_note_length CHECK (
    note IS NULL OR char_length(note) <= 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_checklist_consumption_default_items_active
  ON public.shift_checklist_consumption_default_items (tenant_id, template_item_id, ingredient_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_shift_checklist_consumption_default_items_template
  ON public.shift_checklist_consumption_default_items (tenant_id, template_item_id, sort_order);

DROP TRIGGER IF EXISTS trg_shift_checklist_consumption_default_items_updated_at
  ON public.shift_checklist_consumption_default_items;
CREATE TRIGGER trg_shift_checklist_consumption_default_items_updated_at
  BEFORE UPDATE ON public.shift_checklist_consumption_default_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.attendance_consumption_report_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_id bigint NOT NULL REFERENCES public.attendance_consumption_reports(id) ON DELETE CASCADE,
  ingredient_id bigint NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  default_item_id bigint REFERENCES public.shift_checklist_consumption_default_items(id) ON DELETE SET NULL,
  quantity numeric(15,3) NOT NULL,
  unit text NOT NULL,
  note text,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_consumption_report_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT attendance_consumption_report_lines_unit_not_blank CHECK (btrim(unit) <> ''),
  CONSTRAINT attendance_consumption_report_lines_note_length CHECK (
    note IS NULL OR char_length(note) <= 500
  ),
  CONSTRAINT attendance_consumption_report_lines_sort_positive CHECK (sort_order > 0)
);

ALTER TABLE public.attendance_consumption_report_lines
  ADD COLUMN IF NOT EXISTS default_item_id bigint REFERENCES public.shift_checklist_consumption_default_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_consumption_report_lines_ingredient
  ON public.attendance_consumption_report_lines (tenant_id, report_id, ingredient_id);

CREATE INDEX IF NOT EXISTS idx_attendance_consumption_report_lines_report
  ON public.attendance_consumption_report_lines (tenant_id, report_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_attendance_consumption_report_lines_default_item
  ON public.attendance_consumption_report_lines (tenant_id, default_item_id)
  WHERE default_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_attendance_consumption_report_lines_updated_at
  ON public.attendance_consumption_report_lines;
CREATE TRIGGER trg_attendance_consumption_report_lines_updated_at
  BEFORE UPDATE ON public.attendance_consumption_report_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.attendance_consumption_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_checklist_consumption_default_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_consumption_report_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.attendance_consumption_reports FROM anon, authenticated;
REVOKE ALL ON TABLE public.shift_checklist_consumption_default_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.attendance_consumption_report_lines FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.attendance_consumption_reports_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.shift_checklist_consumption_default_items_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.attendance_consumption_report_lines_id_seq FROM anon, authenticated;

GRANT SELECT ON TABLE public.attendance_consumption_reports TO authenticated;
GRANT SELECT ON TABLE public.shift_checklist_consumption_default_items TO authenticated;
GRANT SELECT ON TABLE public.attendance_consumption_report_lines TO authenticated;
GRANT ALL ON TABLE public.attendance_consumption_reports TO service_role;
GRANT ALL ON TABLE public.shift_checklist_consumption_default_items TO service_role;
GRANT ALL ON TABLE public.attendance_consumption_report_lines TO service_role;
GRANT ALL ON SEQUENCE public.attendance_consumption_reports_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.shift_checklist_consumption_default_items_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.attendance_consumption_report_lines_id_seq TO service_role;

ALTER TABLE public.stock_issues
  DROP CONSTRAINT IF EXISTS stock_issues_source_type_check;
ALTER TABLE public.stock_issues
  ADD CONSTRAINT stock_issues_source_type_check CHECK (
    source_type = ANY (ARRAY[
      'manual',
      'pos_return',
      'kds_cancel_before_cook',
      'kds_cancel_mid_cook',
      'kds_cancel_after_cook',
      'hrm_consumption'
    ]::text[])
  );

DROP POLICY IF EXISTS attendance_consumption_reports_select
  ON public.attendance_consumption_reports;
CREATE POLICY attendance_consumption_reports_select
  ON public.attendance_consumption_reports
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      EXISTS (
        SELECT 1
        FROM public.employees e
        WHERE e.id = attendance_consumption_reports.employee_id
          AND e.tenant_id = attendance_consumption_reports.tenant_id
          AND e.profile_id = auth.uid()
      )
      OR public.has_permission(branch_id, 'hr:approve_checkout')
      OR public.has_permission(branch_id, 'inventory:read')
    )
  );

DROP POLICY IF EXISTS shift_checklist_consumption_default_items_select
  ON public.shift_checklist_consumption_default_items;
CREATE POLICY shift_checklist_consumption_default_items_select
  ON public.shift_checklist_consumption_default_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.shift_checklist_template_items i
      JOIN public.shift_checklist_templates t
        ON t.id = i.template_id
       AND t.tenant_id = i.tenant_id
      WHERE i.id = shift_checklist_consumption_default_items.template_item_id
        AND i.tenant_id = shift_checklist_consumption_default_items.tenant_id
        AND (
          t.branch_id = public.auth_branch_id()
          OR public.has_permission(t.branch_id, 'hr:approve_checkout')
          OR public.has_permission(t.branch_id, 'inventory:read')
        )
    )
  );

DROP POLICY IF EXISTS attendance_consumption_report_lines_select
  ON public.attendance_consumption_report_lines;
CREATE POLICY attendance_consumption_report_lines_select
  ON public.attendance_consumption_report_lines
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.attendance_consumption_reports r
      WHERE r.id = attendance_consumption_report_lines.report_id
        AND r.tenant_id = attendance_consumption_report_lines.tenant_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.employees e
            WHERE e.id = r.employee_id
              AND e.tenant_id = r.tenant_id
              AND e.profile_id = auth.uid()
          )
          OR public.has_permission(r.branch_id, 'hr:approve_checkout')
          OR public.has_permission(r.branch_id, 'inventory:read')
        )
    )
  );

DROP FUNCTION IF EXISTS public.employee_submit_consumption_report(
  bigint,
  bigint,
  jsonb,
  text
);

CREATE OR REPLACE FUNCTION public.employee_submit_consumption_report(
  p_tenant_id bigint,
  p_attendance_id bigint,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_no_consumption boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_attendance record;
  v_report_id bigint;
  v_checklist_item_id bigint;
  v_line_count integer;
  v_distinct_line_count integer;
  v_no_consumption boolean := COALESCE(p_no_consumption, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR v_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'invalid_consumption_lines' USING ERRCODE = '22023';
  END IF;

  IF v_no_consumption AND jsonb_array_length(p_lines) <> 0 THEN
    RAISE EXCEPTION 'no_consumption_with_lines' USING ERRCODE = '22023';
  END IF;

  IF NOT v_no_consumption AND jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'consumption_lines_required' USING ERRCODE = '22023';
  END IF;

  SELECT ar.id, ar.tenant_id, ar.branch_id, ar.employee_id, ar.check_in, ar.check_out,
         ar.checkout_requested_at
  INTO v_attendance
  FROM public.attendance_records ar
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = ar.tenant_id
  WHERE ar.id = p_attendance_id
    AND ar.tenant_id = p_tenant_id
    AND e.profile_id = v_uid
  FOR UPDATE OF ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attendance.check_in IS NULL OR v_attendance.check_out IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_not_open' USING ERRCODE = '22023';
  END IF;

  IF v_attendance.checkout_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'checkout_already_requested' USING ERRCODE = '22023';
  END IF;

  SELECT ci.id
  INTO v_checklist_item_id
  FROM public.attendance_checklist_items ci
  WHERE ci.tenant_id = p_tenant_id
    AND ci.attendance_record_id = v_attendance.id
    AND ci.title = 'Tiêu hao bếp trong ngày'
  LIMIT 1;

  IF v_checklist_item_id IS NULL THEN
    RAISE EXCEPTION 'consumption_checklist_not_assigned' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO v_line_count
  FROM jsonb_to_recordset(p_lines) AS src(
    default_item_id bigint,
    ingredient_id bigint,
    quantity numeric,
    note text
  )
  JOIN public.ingredients i
    ON i.id = src.ingredient_id
   AND i.tenant_id = p_tenant_id
   AND i.is_active = true
  LEFT JOIN public.shift_checklist_consumption_default_items d
    ON d.id = src.default_item_id
   AND d.tenant_id = p_tenant_id
   AND d.ingredient_id = src.ingredient_id
   AND d.is_active = true
  LEFT JOIN public.attendance_checklist_items ci
    ON ci.tenant_id = p_tenant_id
   AND ci.attendance_record_id = v_attendance.id
   AND ci.title = 'Tiêu hao bếp trong ngày'
   AND ci.template_item_id = d.template_item_id
  WHERE src.quantity > 0
    AND (src.default_item_id IS NULL OR ci.id IS NOT NULL);

  SELECT count(DISTINCT src.ingredient_id)
  INTO v_distinct_line_count
  FROM jsonb_to_recordset(p_lines) AS src(
    default_item_id bigint,
    ingredient_id bigint,
    quantity numeric,
    note text
  );

  IF v_line_count <> jsonb_array_length(p_lines)
     OR v_distinct_line_count <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'invalid_consumption_line' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.attendance_consumption_reports (
    tenant_id,
    attendance_record_id,
    branch_id,
    employee_id,
    status,
    note,
    submitted_by,
    submitted_at,
    reviewed_by,
    reviewed_at,
    review_note,
    stock_issue_id,
    no_consumption
  )
  VALUES (
    p_tenant_id,
    v_attendance.id,
    v_attendance.branch_id,
    v_attendance.employee_id,
    'submitted',
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    v_uid,
    now(),
    NULL,
    NULL,
    NULL,
    NULL,
    v_no_consumption
  )
  ON CONFLICT (tenant_id, attendance_record_id)
  DO UPDATE SET
    status = 'submitted',
    note = EXCLUDED.note,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    reviewed_by = NULL,
    reviewed_at = NULL,
    review_note = NULL,
    stock_issue_id = NULL,
    no_consumption = EXCLUDED.no_consumption
  WHERE attendance_consumption_reports.status IN ('draft', 'submitted', 'needs_changes')
  RETURNING id INTO v_report_id;

  IF v_report_id IS NULL THEN
    RAISE EXCEPTION 'consumption_report_locked' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.attendance_consumption_report_lines
  WHERE tenant_id = p_tenant_id
    AND report_id = v_report_id;

  INSERT INTO public.attendance_consumption_report_lines (
    tenant_id,
    report_id,
    ingredient_id,
    default_item_id,
    quantity,
    unit,
    note,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_report_id,
    src.ingredient_id,
    src.default_item_id,
    src.quantity,
    i.purchase_unit,
    NULLIF(btrim(COALESCE(src.note, '')), ''),
    src.sort_order
  FROM (
    SELECT
      row_number() OVER ()::integer AS sort_order,
      default_item_id,
      ingredient_id,
      quantity,
      note
    FROM jsonb_to_recordset(p_lines) AS parsed(
      default_item_id bigint,
      ingredient_id bigint,
      quantity numeric,
      note text
    )
  ) src
  JOIN public.ingredients i
    ON i.id = src.ingredient_id
   AND i.tenant_id = p_tenant_id
   AND i.is_active = true;

  UPDATE public.attendance_checklist_items
  SET is_done = true,
      completed_at = now()
  WHERE tenant_id = p_tenant_id
    AND attendance_record_id = v_attendance.id
    AND title = 'Tiêu hao bếp trong ngày';

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branch_manager_request_consumption_adjustment(
  p_tenant_id bigint,
  p_report_id bigint,
  p_review_note text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_report record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL OR v_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(COALESCE(p_review_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'review_note_required' USING ERRCODE = '22023';
  END IF;

  SELECT r.*, ar.id AS attendance_id
  INTO v_report
  FROM public.attendance_consumption_reports r
  JOIN public.attendance_records ar
    ON ar.id = r.attendance_record_id
   AND ar.tenant_id = r.tenant_id
  WHERE r.id = p_report_id
    AND r.tenant_id = p_tenant_id
  FOR UPDATE OF r, ar;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consumption_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_report.branch_id, 'hr:approve_checkout') THEN
    RAISE EXCEPTION 'forbidden_checkout_approval' USING ERRCODE = '42501';
  END IF;

  IF v_report.status NOT IN ('submitted', 'needs_changes') THEN
    RAISE EXCEPTION 'consumption_report_not_reviewable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.attendance_consumption_reports
  SET status = 'needs_changes',
      reviewed_by = v_uid,
      reviewed_at = now(),
      review_note = NULLIF(btrim(p_review_note), '')
  WHERE id = p_report_id
    AND tenant_id = p_tenant_id;

  UPDATE public.attendance_records
  SET checkout_requested_at = NULL,
      checkout_requested_by_role = NULL,
      checkout_approval_target_roles = ARRAY[]::text[],
      updated_at = now()
  WHERE id = v_report.attendance_id
    AND tenant_id = p_tenant_id
    AND check_out IS NULL;

  UPDATE public.attendance_checklist_items
  SET is_done = false,
      completed_at = NULL
  WHERE tenant_id = p_tenant_id
    AND attendance_record_id = v_report.attendance_id
    AND title = 'Tiêu hao bếp trong ngày';

  RETURN p_report_id;
END;
$$;

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
      il.is_default_consumption = true
      OR il.is_default_issue = true
      OR il.location_kind IN ('kitchen', 'warehouse')
    )
  ORDER BY
    il.is_default_consumption DESC,
    il.is_default_issue DESC,
    CASE il.location_kind WHEN 'kitchen' THEN 0 WHEN 'warehouse' THEN 1 ELSE 2 END,
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

REVOKE ALL ON FUNCTION public.employee_submit_consumption_report(
  bigint,
  bigint,
  jsonb,
  text,
  boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_manager_request_consumption_adjustment(
  bigint,
  bigint,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.employee_submit_consumption_report(
  bigint,
  bigint,
  jsonb,
  text,
  boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branch_manager_request_consumption_adjustment(
  bigint,
  bigint,
  text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) TO authenticated;

COMMENT ON TABLE public.attendance_consumption_reports IS
  'Daily kitchen consumption reports submitted from Employee checkout flow. Inventory is only applied after checkout approver review.';

COMMENT ON TABLE public.shift_checklist_consumption_default_items IS
  'Default ingredients/materials suggested for a consumption checklist template item by position or branch.';

COMMENT ON TABLE public.attendance_consumption_report_lines IS
  'Line-level ingredients/materials reported as daily consumption before branch-manager approval.';

COMMENT ON FUNCTION public.employee_submit_consumption_report(
  bigint,
  bigint,
  jsonb,
  text,
  boolean
) IS
  'Employee submits daily kitchen consumption lines or an explicit no-consumption confirmation for an open attendance record. Does not affect Inventory.';

COMMENT ON FUNCTION public.branch_manager_request_consumption_adjustment(
  bigint,
  bigint,
  text
) IS
  'Checkout approver requests correction, reopens the consumption checklist item, and clears pending checkout for employee resubmission.';

COMMENT ON FUNCTION public.branch_manager_approve_consumption_report(
  bigint,
  bigint
) IS
  'Checkout approver approves a submitted consumption report and atomically posts Inventory consumption movements.';

COMMIT;
