-- =============================================================
-- Smart Inventory Actions — Phase 1
--
-- Goal: From `/inventory/stock` page, user can bulk-select low/out
-- items and create either:
--   • Purchase Orders (procurement branch — central_warehouse / central_kitchen)
--   • Stock Requisitions (operational branch — yêu cầu cấp hàng từ CW/CK)
--
-- Reusable primitives: 2 RPC functions + 2 sequences for collision-free
-- document numbers (replaces UUID-based numbering used elsewhere).
-- =============================================================

-- ─── 1. Sequences for unique document numbers ───
-- Plain sequences; daily date is added in formatting (PO-YYYYMMDD-NNNN).
-- Monotonic across days is acceptable (Vietnamese accounting allows global numbering).

CREATE SEQUENCE IF NOT EXISTS public.po_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.trf_number_seq;

GRANT USAGE ON SEQUENCE public.po_number_seq  TO authenticated;
GRANT USAGE ON SEQUENCE public.trf_number_seq TO authenticated;

-- Helper RPC so JS callers can generate a normalized doc number
-- (e.g. createStockTransfer) without having to inline date+sequence logic.
CREATE OR REPLACE FUNCTION public.next_inventory_doc_number(p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_kind = 'po' THEN
    RETURN 'PO-' || v_today || '-' || LPAD(nextval('public.po_number_seq')::TEXT, 4, '0');
  ELSIF p_kind = 'trf' THEN
    RETURN 'TRF-' || v_today || '-' || LPAD(nextval('public.trf_number_seq')::TEXT, 4, '0');
  ELSE
    RAISE EXCEPTION 'unknown_doc_kind' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.next_inventory_doc_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_inventory_doc_number(TEXT) TO authenticated;

COMMENT ON FUNCTION public.next_inventory_doc_number(TEXT) IS
  'Generate next normalized inventory document number (po | trf). Replaces UUID-based numbering for collision-free Vietnamese-friendly format PO-YYYYMMDD-NNNN / TRF-YYYYMMDD-NNNN.';

-- ─── 2. RPC: create_purchase_orders_from_ingredients ───
-- Input: target procurement branch + array of {ingredientId, quantity, unit?}.
-- Behavior:
--   1. Resolve default supplier per ingredient via supplier_items (latest active by created_at).
--   2. Resolve unit_price_est from supplier_price_list (priority ASC, effective_from DESC).
--   3. Group items by supplier → create one PO draft per supplier.
--   4. Items with no active supplier are returned in `unresolved` array, batch continues.
-- Returns: jsonb { pos: [{po_id, supplier_id, po_number, line_count, missing_price_count}],
--                  unresolved: [{ingredient_id, reason}] }

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_ingredients(
  p_branch_id BIGINT,
  p_items     JSONB,
  p_strategy  TEXT  DEFAULT 'latest_supplier_item',
  p_notes     TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID   := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT   := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_branch_kind  TEXT;
  v_today        TEXT   := to_char(CURRENT_DATE, 'YYYYMMDD');
  v_supplier_id  BIGINT;
  v_po_id        BIGINT;
  v_po_number    TEXT;
  v_line_count   INT;
  v_missing      INT;
  v_pos          JSONB  := '[]'::JSONB;
  v_unresolved   JSONB  := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(NULL, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_strategy IS DISTINCT FROM 'latest_supplier_item' THEN
    RAISE EXCEPTION 'unsupported_strategy' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items_required' USING ERRCODE = '22023';
  END IF;

  -- Branch must be a procurement branch in this tenant.
  SELECT branch_kind INTO v_branch_kind
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = v_tenant;
  IF v_branch_kind IS NULL THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_branch_kind NOT IN ('central_warehouse', 'central_kitchen') THEN
    RAISE EXCEPTION 'branch_not_procurement' USING ERRCODE = '22023';
  END IF;

  -- Branch-scoped procurement roles must match.
  IF v_role IN ('warehouse_manager', 'production_manager')
     AND v_branch_claim IS NOT NULL
     AND p_branch_id <> v_branch_claim THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  -- Stage input items into a temp table for joining.
  CREATE TEMP TABLE _smart_po_input ON COMMIT DROP AS
  SELECT
    (line->>'ingredientId')::BIGINT AS ingredient_id,
    (line->>'quantity')::NUMERIC(15,3) AS quantity,
    NULLIF(BTRIM(line->>'unit'), '') AS unit_override
  FROM jsonb_array_elements(p_items) AS line
  WHERE line ? 'ingredientId' AND line ? 'quantity';

  -- Validate quantities.
  IF EXISTS (SELECT 1 FROM _smart_po_input WHERE quantity IS NULL OR quantity <= 0) THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;

  -- Resolve ingredient → supplier (latest active supplier_items by created_at).
  -- Items with no resolved supplier go to v_unresolved.
  CREATE TEMP TABLE _smart_po_resolved ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      si.ingredient_id,
      si.supplier_id,
      ROW_NUMBER() OVER (PARTITION BY si.ingredient_id ORDER BY si.created_at DESC, si.id DESC) AS rn
    FROM public.supplier_items si
    WHERE si.tenant_id = v_tenant
      AND si.is_active = true
      AND si.ingredient_id IN (SELECT ingredient_id FROM _smart_po_input)
  )
  SELECT
    inp.ingredient_id,
    inp.quantity,
    COALESCE(inp.unit_override, ing.purchase_unit, ing.unit) AS unit,
    r.supplier_id,
    spl.unit_price
  FROM _smart_po_input inp
  JOIN public.ingredients ing
    ON ing.id = inp.ingredient_id AND ing.tenant_id = v_tenant
  LEFT JOIN ranked r
    ON r.ingredient_id = inp.ingredient_id AND r.rn = 1
  LEFT JOIN LATERAL (
    SELECT s.unit_price
    FROM public.supplier_price_list s
    WHERE s.tenant_id = v_tenant
      AND s.supplier_id = r.supplier_id
      AND s.ingredient_id = inp.ingredient_id
      AND s.uom = COALESCE(inp.unit_override, ing.purchase_unit, ing.unit)
      AND (s.effective_to IS NULL OR s.effective_to >= CURRENT_DATE)
    ORDER BY s.priority ASC, s.effective_from DESC
    LIMIT 1
  ) spl ON true;

  -- Collect unresolved (no supplier).
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'reason', 'no_supplier')),
    '[]'::JSONB
  )
  INTO v_unresolved
  FROM _smart_po_resolved
  WHERE supplier_id IS NULL;

  -- If everything is unresolved, surface a clear error so the caller doesn't get an empty success.
  IF NOT EXISTS (SELECT 1 FROM _smart_po_resolved WHERE supplier_id IS NOT NULL) THEN
    RAISE EXCEPTION 'all_items_unresolved' USING ERRCODE = '22023';
  END IF;

  -- Group by supplier → one PO per supplier.
  FOR v_supplier_id IN
    SELECT DISTINCT supplier_id FROM _smart_po_resolved WHERE supplier_id IS NOT NULL ORDER BY supplier_id
  LOOP
    v_po_number := 'PO-' || v_today || '-' || LPAD(nextval('public.po_number_seq')::TEXT, 4, '0');

    INSERT INTO public.purchase_orders (
      tenant_id, branch_id, supplier_id, po_number, status, notes, created_by
    ) VALUES (
      v_tenant, p_branch_id, v_supplier_id, v_po_number, 'draft', p_notes, v_uid
    )
    RETURNING id INTO v_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id, po_id, ingredient_id, quantity, unit, unit_price_est, line_total
    )
    SELECT
      v_tenant,
      v_po_id,
      r.ingredient_id,
      r.quantity,
      r.unit,
      r.unit_price,
      CASE WHEN r.unit_price IS NOT NULL
           THEN ROUND((r.quantity * r.unit_price)::NUMERIC, 2)
           ELSE NULL END
    FROM _smart_po_resolved r
    WHERE r.supplier_id = v_supplier_id;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE unit_price_est IS NULL)
    INTO v_line_count, v_missing
    FROM public.purchase_order_items
    WHERE po_id = v_po_id AND tenant_id = v_tenant;

    v_pos := v_pos || jsonb_build_object(
      'po_id', v_po_id,
      'supplier_id', v_supplier_id,
      'po_number', v_po_number,
      'line_count', v_line_count,
      'missing_price_count', v_missing
    );
  END LOOP;

  RETURN jsonb_build_object('pos', v_pos, 'unresolved', v_unresolved);
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_orders_from_ingredients(BIGINT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_ingredients(BIGINT, JSONB, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_purchase_orders_from_ingredients(BIGINT, JSONB, TEXT, TEXT) IS
  'Smart PO creator: groups input ingredients by default supplier (supplier_items latest active), creates one draft PO per supplier with prices pre-filled from supplier_price_list. Reusable primitive for Stock page bulk action and future Today''s Playbook.';

-- ─── 3. RPC: create_stock_requisitions_from_ingredients ───
-- Input: destination branch (operational) + source procurement branch + array of {ingredientId, quantity, unit?}.
-- Behavior: creates ONE stock_transfers draft (from = source CW/CK, to = destination operational branch).
-- Status flow: draft → confirmed_ship → in_transit → received (CW/CK staff acts on it).

CREATE OR REPLACE FUNCTION public.create_stock_requisitions_from_ingredients(
  p_to_branch_id   BIGINT,
  p_from_branch_id BIGINT,
  p_items          JSONB,
  p_notes          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID   := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT   := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_to_kind      TEXT;
  v_from_kind    TEXT;
  v_today        TEXT   := to_char(CURRENT_DATE, 'YYYYMMDD');
  v_trf_number   TEXT;
  v_transfer_id  BIGINT;
  v_line_count   INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_role NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_to_branch_id IS NULL OR p_from_branch_id IS NULL THEN
    RAISE EXCEPTION 'branches_required' USING ERRCODE = '22023';
  END IF;
  IF p_to_branch_id = p_from_branch_id THEN
    RAISE EXCEPTION 'requisition_same_branch' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items_required' USING ERRCODE = '22023';
  END IF;

  SELECT branch_kind INTO v_to_kind
  FROM public.branches WHERE id = p_to_branch_id AND tenant_id = v_tenant;
  SELECT branch_kind INTO v_from_kind
  FROM public.branches WHERE id = p_from_branch_id AND tenant_id = v_tenant;
  IF v_to_kind IS NULL OR v_from_kind IS NULL THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_from_kind NOT IN ('central_warehouse', 'central_kitchen') THEN
    RAISE EXCEPTION 'source_must_be_procurement' USING ERRCODE = '22023';
  END IF;
  IF v_to_kind = 'branch' AND v_from_kind = 'branch' THEN
    RAISE EXCEPTION 'requisition_branch_to_branch' USING ERRCODE = '22023';
  END IF;

  -- Branch-scoped role check (matches create_stock_transfer_draft semantics).
  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
     AND v_branch_claim IS NOT NULL
     AND p_from_branch_id <> v_branch_claim
     AND p_to_branch_id   <> v_branch_claim THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  v_trf_number := 'TRF-' || v_today || '-' || LPAD(nextval('public.trf_number_seq')::TEXT, 4, '0');

  INSERT INTO public.stock_transfers (
    tenant_id, from_branch_id, to_branch_id, transfer_number, status, notes, created_by
  ) VALUES (
    v_tenant, p_from_branch_id, p_to_branch_id, v_trf_number, 'draft', p_notes, v_uid
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.stock_transfer_items (
    tenant_id, transfer_id, ingredient_id, quantity, unit
  )
  SELECT
    v_tenant,
    v_transfer_id,
    (line->>'ingredientId')::BIGINT,
    (line->>'quantity')::NUMERIC(15,3),
    COALESCE(
      NULLIF(BTRIM(line->>'unit'), ''),
      (SELECT COALESCE(ing.purchase_unit, ing.unit) FROM public.ingredients ing
       WHERE ing.id = (line->>'ingredientId')::BIGINT AND ing.tenant_id = v_tenant)
    )
  FROM jsonb_array_elements(p_items) AS line
  WHERE line ? 'ingredientId' AND line ? 'quantity'
  ON CONFLICT (transfer_id, ingredient_id, tenant_id)
  DO UPDATE SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit;

  SELECT COUNT(*) INTO v_line_count
  FROM public.stock_transfer_items
  WHERE transfer_id = v_transfer_id AND tenant_id = v_tenant;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'no_lines_inserted' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'transfer_id',     v_transfer_id,
    'transfer_number', v_trf_number,
    'from_branch_id',  p_from_branch_id,
    'to_branch_id',    p_to_branch_id,
    'line_count',      v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_requisitions_from_ingredients(BIGINT, BIGINT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_requisitions_from_ingredients(BIGINT, BIGINT, JSONB, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_stock_requisitions_from_ingredients(BIGINT, BIGINT, JSONB, TEXT) IS
  'Smart Requisition creator: from operational branch (or any branch needing stock), creates a stock_transfers draft from a procurement branch (CW/CK) for the listed ingredients. CW/CK staff confirms+ships via existing transfer flow.';
