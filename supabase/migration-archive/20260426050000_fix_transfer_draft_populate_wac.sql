-- =============================================================
-- Fix: create_stock_transfer_draft không populate unit_cost_at_ship
-- Latest prior version: 20260417050001_multi_warehouse_locations_and_rpcs.sql
--
-- Bug: Draft detail page (Điều chuyển nội bộ) hiển thị Giá WAC + Thành tiền
-- đọc từ stock_transfer_items.unit_cost_at_ship. Cột này chỉ được set khi
-- stock_transfer_confirm_ship chạy — draft luôn hiện 0đ / 0đ / 0đ.
--
-- Fix: Draft cũng snapshot WAC hiện tại từ stock_levels tại kho nguồn
-- (keyed by location_id sau migration per-location). Fallback
-- ingredients.unit_cost nếu chưa có row stock_levels. Ship sau này vẫn
-- re-update unit_cost_at_ship với WAC-tại-thời-điểm-ship (không đổi
-- semantics ship).
-- =============================================================

DROP FUNCTION IF EXISTS public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(
  p_from_branch_id   BIGINT,
  p_to_branch_id     BIGINT,
  p_transfer_number  TEXT,
  p_notes            TEXT DEFAULT NULL,
  p_vehicle_info     TEXT DEFAULT NULL,
  p_lines            JSONB DEFAULT '[]'::JSONB,
  p_from_location_id BIGINT DEFAULT NULL,
  p_to_location_id   BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_transfer_id  BIGINT;
  v_is_intra     BOOLEAN := (p_from_branch_id = p_to_branch_id);
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

  IF v_is_intra THEN
    IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
      RAISE EXCEPTION 'intra_branch_requires_locations' USING ERRCODE = '22023';
    END IF;
    IF p_from_location_id = p_to_location_id THEN
      RAISE EXCEPTION 'intra_branch_same_location' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
     AND v_branch_claim IS NOT NULL
     AND p_from_branch_id <> v_branch_claim
     AND p_to_branch_id <> v_branch_claim THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by
  ) VALUES (
    v_tenant,
    p_from_branch_id,
    p_to_branch_id,
    p_from_location_id,
    p_to_location_id,
    p_transfer_number,
    'draft',
    p_notes,
    CASE WHEN v_is_intra THEN NULL ELSE p_vehicle_info END,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      unit,
      unit_cost_at_ship
    )
    SELECT
      v_tenant,
      v_transfer_id,
      (line->>'ingredientId')::BIGINT,
      (line->>'quantity')::NUMERIC(15,3),
      NULLIF(BTRIM(line->>'unit'), ''),
      COALESCE(
        (
          SELECT sl.avg_unit_cost
          FROM public.stock_levels sl
          WHERE sl.tenant_id     = v_tenant
            AND sl.branch_id     = p_from_branch_id
            AND sl.ingredient_id = (line->>'ingredientId')::BIGINT
            AND (
              p_from_location_id IS NULL
              OR sl.location_id = p_from_location_id
            )
          ORDER BY (sl.location_id = p_from_location_id) DESC NULLS LAST
          LIMIT 1
        ),
        (
          SELECT i.unit_cost
          FROM public.ingredients i
          WHERE i.tenant_id = v_tenant
            AND i.id = (line->>'ingredientId')::BIGINT
        )
      )
    FROM jsonb_array_elements(p_lines) AS line
    WHERE line ? 'ingredientId'
      AND line ? 'quantity'
      AND line ? 'unit'
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      unit_cost_at_ship = EXCLUDED.unit_cost_at_ship;
  END IF;

  RETURN jsonb_build_object('id', v_transfer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT) TO authenticated;

-- Backfill existing drafts: set unit_cost_at_ship from stock_levels where NULL.
-- Chỉ chạy cho status='draft' để tránh ghi đè snapshot ship của các phiếu đã xuất.

UPDATE public.stock_transfer_items sti
SET unit_cost_at_ship = COALESCE(
  (
    SELECT sl.avg_unit_cost
    FROM public.stock_levels sl
    JOIN public.stock_transfers tr ON tr.id = sti.transfer_id
    WHERE sl.tenant_id     = sti.tenant_id
      AND sl.branch_id     = tr.from_branch_id
      AND sl.ingredient_id = sti.ingredient_id
      AND (tr.from_location_id IS NULL OR sl.location_id = tr.from_location_id)
    ORDER BY (sl.location_id = (SELECT from_location_id FROM public.stock_transfers WHERE id = sti.transfer_id)) DESC NULLS LAST
    LIMIT 1
  ),
  (
    SELECT i.unit_cost
    FROM public.ingredients i
    WHERE i.tenant_id = sti.tenant_id
      AND i.id = sti.ingredient_id
  )
)
WHERE sti.unit_cost_at_ship IS NULL
  AND EXISTS (
    SELECT 1 FROM public.stock_transfers tr
    WHERE tr.id = sti.transfer_id
      AND tr.status = 'draft'
  );
