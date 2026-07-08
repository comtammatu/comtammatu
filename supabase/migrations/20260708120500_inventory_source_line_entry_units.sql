-- Add entry_unit_id to the source-line tables used by LIVE stock_movements
-- writers (confirm_supplier_return, branch_manager_approve_consumption_report)
-- so they store a real entry unit and convert quantity to base via inv_to_base.
--
-- Sequence: add nullable column -> backfill (prefer the authoritative source
-- where one exists: grn_items.entry_unit_id for supplier returns; otherwise the
-- ingredient's active base unit) -> patch the three upstream line writers so
-- future inserts populate entry_unit_id -> precheck -> composite FK -> SET NOT
-- NULL.
--
-- Patches are minimal: only the INSERT column lists + SELECT change to carry
-- entry_unit_id. Signatures, return types, guards, and surrounding logic are
-- preserved verbatim from the latest active definitions.

SET search_path = '';
SET check_function_bodies = off;

-- 1. Add nullable entry_unit_id to both source-line tables.
ALTER TABLE public.supplier_return_items
  ADD COLUMN IF NOT EXISTS entry_unit_id bigint;

ALTER TABLE public.attendance_consumption_report_lines
  ADD COLUMN IF NOT EXISTS entry_unit_id bigint;

-- 2. Backfill supplier_return_items: prefer the originating grn_items.entry_unit_id,
--    then fall back to the ingredient's active base unit.
UPDATE public.supplier_return_items sri
SET entry_unit_id = gi.entry_unit_id
FROM public.grn_items gi
WHERE sri.entry_unit_id IS NULL
  AND sri.grn_item_id = gi.id
  AND sri.tenant_id = gi.tenant_id
  AND gi.entry_unit_id IS NOT NULL;

WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id, iu.ingredient_id, iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.supplier_return_items sri
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE sri.entry_unit_id IS NULL
  AND sri.tenant_id = bu.tenant_id
  AND sri.ingredient_id = bu.ingredient_id;

-- 3. Backfill attendance_consumption_report_lines: resolve to the ingredient's
--    active base unit (the HRM checklist flow has no per-line entry unit source).
WITH base_units AS (
  SELECT DISTINCT ON (iu.tenant_id, iu.ingredient_id)
    iu.tenant_id, iu.ingredient_id, iu.unit_id
  FROM public.ingredient_units iu
  JOIN public.units u
    ON u.id = iu.unit_id
   AND u.tenant_id = iu.tenant_id
   AND u.is_active = TRUE
  WHERE iu.is_base = TRUE AND iu.is_active = TRUE
  ORDER BY iu.tenant_id, iu.ingredient_id, iu.sort_order ASC, iu.id ASC
)
UPDATE public.attendance_consumption_report_lines l
SET entry_unit_id = bu.unit_id
FROM base_units bu
WHERE l.entry_unit_id IS NULL
  AND l.tenant_id = bu.tenant_id
  AND l.ingredient_id = bu.ingredient_id;

-- 4. Patch create_supplier_return_from_grn — verbatim from baseline signature
--    (p_resolution DEFAULT 'replacement', p_reason DEFAULT 'damaged'). Only the
--    supplier_return_items INSERT column list + SELECT gain entry_unit_id.
CREATE OR REPLACE FUNCTION public.create_supplier_return_from_grn(
  p_grn_id bigint,
  p_resolution text DEFAULT 'replacement'::text,
  p_reason text DEFAULT 'damaged'::text,
  p_notes text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid        UUID   := auth.uid();
  v_tenant     BIGINT := public.auth_tenant_id();
  v_grn        RECORD;
  v_return_id  BIGINT;
  v_ret_num    TEXT;
  v_total      NUMERIC(15,2) := 0;
  v_lines_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_resolution NOT IN ('replacement','credit_note','cash_refund') THEN
    RAISE EXCEPTION 'invalid_resolution' USING ERRCODE = '22023';
  END IF;

  IF p_reason NOT IN ('damaged','wrong_item','expired','quality_fail','short_delivery_credit','other') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_grn.branch_id, 'supplier_return:create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND (gi.quality_status = 'rejected' OR COALESCE(gi.rejected_quantity,0) > 0)
  ) THEN
    RAISE EXCEPTION 'no_rejected_lines' USING ERRCODE = '22023';
  END IF;

  v_ret_num := 'SR-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.supplier_returns_id_seq')::TEXT, 4, '0');

  INSERT INTO public.supplier_returns (
    tenant_id, branch_id, supplier_id, grn_id, return_number,
    source, reason, resolution, status, notes, total_value, created_by
  ) VALUES (
    v_tenant, v_grn.branch_id, v_grn.supplier_id, p_grn_id, v_ret_num,
    'grn_reject', p_reason, p_resolution, 'draft', p_notes, 0, v_uid
  ) RETURNING id INTO v_return_id;

  WITH rej AS (
    INSERT INTO public.supplier_return_items (
      tenant_id, return_id, ingredient_id, quantity, unit_cost, total_cost,
      grn_item_id, reason_detail, photo_url, entry_unit_id
    )
    SELECT
      v_tenant,
      v_return_id,
      gi.ingredient_id,
      CASE
        WHEN gi.quality_status = 'rejected' AND COALESCE(gi.rejected_quantity,0) = 0
          THEN gi.received_quantity
        ELSE gi.rejected_quantity
      END,
      gi.unit_cost,
      ROUND(
        CASE
          WHEN gi.quality_status = 'rejected' AND COALESCE(gi.rejected_quantity,0) = 0
            THEN gi.received_quantity
          ELSE gi.rejected_quantity
        END * gi.unit_cost, 2
      ),
      gi.id,
      gi.rejection_reason,
      gi.rejected_photo_url,
      COALESCE(gi.entry_unit_id, (
        SELECT iu.unit_id
        FROM public.ingredient_units iu
        JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
        WHERE iu.tenant_id = v_tenant
          AND iu.ingredient_id = gi.ingredient_id
          AND iu.is_base = TRUE
          AND iu.is_active = TRUE
        ORDER BY iu.sort_order ASC, iu.id ASC
        LIMIT 1
      ))
    FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id
      AND gi.tenant_id = v_tenant
      AND (gi.quality_status = 'rejected' OR COALESCE(gi.rejected_quantity,0) > 0)
    RETURNING total_cost
  )
  SELECT COALESCE(SUM(total_cost), 0), COUNT(*) INTO v_total, v_lines_inserted FROM rej;

  UPDATE public.supplier_returns SET total_value = v_total WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_ret_num,
    'lines', v_lines_inserted,
    'total_value', v_total
  );
END;
$$;

-- 5. Patch create_supplier_return_from_stock — verbatim from baseline. Only the
--    supplier_return_items INSERT gains entry_unit_id resolved from the
--    ingredient base unit.
CREATE OR REPLACE FUNCTION public.create_supplier_return_from_stock(
  p_branch_id bigint,
  p_supplier_id bigint,
  p_resolution text,
  p_reason text,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_branch  RECORD;
  v_return_id BIGINT;
  v_ret_num   TEXT;
  v_total     NUMERIC(15,2) := 0;
  v_line      JSONB;
  v_ing_id    BIGINT;
  v_qty       NUMERIC(15,3);
  v_unit_cost NUMERIC(15,2);
  v_entry_unit_id BIGINT;
  v_lines_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'supplier_return:create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_resolution NOT IN ('replacement','credit_note','cash_refund') THEN
    RAISE EXCEPTION 'invalid_resolution' USING ERRCODE = '22023';
  END IF;
  IF p_reason NOT IN ('damaged','wrong_item','expired','quality_fail','short_delivery_credit','other') THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'no_lines' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = p_branch_id AND b.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_ret_num := 'SR-' || to_char(now(),'YYMMDD') || '-' || lpad(nextval('public.supplier_returns_id_seq')::TEXT, 4, '0');

  INSERT INTO public.supplier_returns (
    tenant_id, branch_id, supplier_id, grn_id, return_number,
    source, reason, resolution, status, notes, total_value, created_by
  ) VALUES (
    v_tenant, p_branch_id, p_supplier_id, NULL, v_ret_num,
    'post_receipt', p_reason, p_resolution, 'draft', p_notes, 0, v_uid
  ) RETURNING id INTO v_return_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_ing_id    := (v_line->>'ingredient_id')::BIGINT;
    v_qty       := (v_line->>'quantity')::NUMERIC(15,3);
    v_unit_cost := (v_line->>'unit_cost')::NUMERIC(15,2);

    IF v_ing_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_unit_cost IS NULL THEN
      RAISE EXCEPTION 'invalid_line' USING ERRCODE = '22023';
    END IF;

    SELECT iu.unit_id INTO v_entry_unit_id
    FROM public.ingredient_units iu
    JOIN public.units u ON u.id = iu.unit_id AND u.tenant_id = iu.tenant_id AND u.is_active = TRUE
    WHERE iu.tenant_id = v_tenant
      AND iu.ingredient_id = v_ing_id
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.supplier_return_items (
      tenant_id, return_id, ingredient_id, quantity, unit_cost, total_cost,
      reason_detail, photo_url, entry_unit_id
    ) VALUES (
      v_tenant, v_return_id, v_ing_id, v_qty, v_unit_cost,
      ROUND(v_qty * v_unit_cost, 2),
      v_line->>'reason_detail', v_line->>'photo_url',
      v_entry_unit_id
    );
    v_total := v_total + ROUND(v_qty * v_unit_cost, 2);
    v_lines_inserted := v_lines_inserted + 1;
  END LOOP;

  UPDATE public.supplier_returns SET total_value = v_total WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_ret_num,
    'lines', v_lines_inserted,
    'total_value', v_total
  );
END;
$$;

-- 6. Patch employee_submit_consumption_report — verbatim from the active 5-arg
--    signature (p_tenant_id, p_attendance_id, p_lines, p_note, p_no_consumption)
--    RETURNS bigint. The report-lines INSERT stores entry_unit_id resolved from
--    the ingredient's active base unit. All validation, checklist,
--    notification, and checklist-item logic is preserved.
CREATE OR REPLACE FUNCTION public.employee_submit_consumption_report(
  p_tenant_id bigint,
  p_attendance_id bigint,
  p_lines jsonb,
  p_note text DEFAULT NULL::text,
  p_no_consumption boolean DEFAULT false
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
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
    AND ci.task_kind = 'consumption_report'
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
   AND ci.task_kind = 'consumption_report'
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
    note,
    sort_order,
    entry_unit_id
  )
  SELECT
    p_tenant_id,
    v_report_id,
    src.ingredient_id,
    src.default_item_id,
    src.quantity,
    NULLIF(btrim(COALESCE(src.note, '')), ''),
    src.sort_order,
    bu.unit_id
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
   AND i.is_active = true
  JOIN LATERAL (
    SELECT iu.unit_id
    FROM public.ingredient_units iu
    JOIN public.units u
      ON u.id = iu.unit_id
     AND u.tenant_id = iu.tenant_id
     AND u.is_active = TRUE
    WHERE iu.tenant_id = p_tenant_id
      AND iu.ingredient_id = src.ingredient_id
      AND iu.is_base = TRUE
      AND iu.is_active = TRUE
    ORDER BY iu.sort_order ASC, iu.id ASC
    LIMIT 1
  ) bu ON TRUE;

  UPDATE public.attendance_checklist_items
  SET is_done = true,
      completed_at = now()
  WHERE tenant_id = p_tenant_id
    AND attendance_record_id = v_attendance.id
    AND task_kind = 'consumption_report';

  RETURN v_report_id;
END;
$$;

-- 7. Precheck: no NULLs may remain before tightening.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.supplier_return_items WHERE entry_unit_id IS NULL) THEN
    RAISE EXCEPTION 'supplier_return_items.entry_unit_id_not_null_precheck_failed' USING ERRCODE = '23502';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance_consumption_report_lines WHERE entry_unit_id IS NULL) THEN
    RAISE EXCEPTION 'attendance_consumption_report_lines.entry_unit_id_not_null_precheck_failed' USING ERRCODE = '23502';
  END IF;
END $$;

-- 8. Composite FK (entry_unit_id, tenant_id) -> units(id, tenant_id), added NOT
--    VALID then validated to avoid a long ACCESS EXCLUSIVE rewrite.
ALTER TABLE public.supplier_return_items
  DROP CONSTRAINT IF EXISTS supplier_return_items_entry_unit_tenant_fkey;
ALTER TABLE public.supplier_return_items
  ADD CONSTRAINT supplier_return_items_entry_unit_tenant_fkey
  FOREIGN KEY (entry_unit_id, tenant_id) REFERENCES public.units(id, tenant_id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.supplier_return_items
  VALIDATE CONSTRAINT supplier_return_items_entry_unit_tenant_fkey;

ALTER TABLE public.attendance_consumption_report_lines
  DROP CONSTRAINT IF EXISTS attendance_consumption_report_lines_entry_unit_tenant_fkey;
ALTER TABLE public.attendance_consumption_report_lines
  ADD CONSTRAINT attendance_consumption_report_lines_entry_unit_tenant_fkey
  FOREIGN KEY (entry_unit_id, tenant_id) REFERENCES public.units(id, tenant_id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.attendance_consumption_report_lines
  VALIDATE CONSTRAINT attendance_consumption_report_lines_entry_unit_tenant_fkey;

-- 9. SET NOT NULL (cheap after backfill + precheck).
ALTER TABLE public.supplier_return_items ALTER COLUMN entry_unit_id SET NOT NULL;
ALTER TABLE public.attendance_consumption_report_lines ALTER COLUMN entry_unit_id SET NOT NULL;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_grn(bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_return_from_grn(bigint, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_return_from_stock(bigint, bigint, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_return_from_stock(bigint, bigint, text, text, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.employee_submit_consumption_report(bigint, bigint, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_submit_consumption_report(bigint, bigint, jsonb, text, boolean) TO authenticated, service_role;
