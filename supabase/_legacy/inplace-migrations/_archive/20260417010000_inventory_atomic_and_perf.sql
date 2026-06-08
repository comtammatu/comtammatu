-- =============================================================
-- Inventory/POS hardening:
-- 1) Atomic stocktake session creation
-- 2) Atomic stock transfer draft creation
-- 3) Query performance indexes for POS/KDS history boards
-- =============================================================

-- ─── 1. RPC: create_stocktake_session (atomic session + lines) ───

CREATE OR REPLACE FUNCTION public.create_stocktake_session(p_branch_id BIGINT)
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
  v_session_id   BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'branch_manager' AND (v_branch_claim IS NULL OR v_branch_claim <> p_branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    created_by
  ) VALUES (
    v_tenant,
    p_branch_id,
    v_uid
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.stocktake_lines (
    tenant_id,
    session_id,
    ingredient_id,
    system_quantity
  )
  SELECT
    v_tenant,
    v_session_id,
    sl.ingredient_id,
    sl.current_quantity
  FROM public.stock_levels sl
  WHERE sl.tenant_id = v_tenant
    AND sl.branch_id = p_branch_id;

  RETURN jsonb_build_object(
    'id', v_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stocktake_session(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stocktake_session(BIGINT) TO authenticated;

-- ─── 2. RPC: create_stock_transfer_draft (atomic header + lines) ───

CREATE OR REPLACE FUNCTION public.create_stock_transfer_draft(
  p_from_branch_id BIGINT,
  p_to_branch_id BIGINT,
  p_transfer_number TEXT,
  p_notes TEXT DEFAULT NULL,
  p_vehicle_info TEXT DEFAULT NULL,
  p_lines JSONB DEFAULT '[]'::JSONB
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_role NOT IN ('super_manager', 'area_manager', 'branch_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'invalid_transfer_direction' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'branch_manager'
     AND v_branch_claim IS NOT NULL
     AND p_from_branch_id <> v_branch_claim
     AND p_to_branch_id <> v_branch_claim THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stock_transfers (
    tenant_id,
    from_branch_id,
    to_branch_id,
    transfer_number,
    status,
    notes,
    vehicle_info,
    created_by
  ) VALUES (
    v_tenant,
    p_from_branch_id,
    p_to_branch_id,
    p_transfer_number,
    'draft',
    p_notes,
    p_vehicle_info,
    v_uid
  )
  RETURNING id INTO v_transfer_id;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    INSERT INTO public.stock_transfer_items (
      tenant_id,
      transfer_id,
      ingredient_id,
      quantity,
      unit
    )
    SELECT
      v_tenant,
      v_transfer_id,
      (line->>'ingredientId')::BIGINT,
      (line->>'quantity')::NUMERIC(15,3),
      NULLIF(BTRIM(line->>'unit'), '')
    FROM jsonb_array_elements(p_lines) AS line
    WHERE line ? 'ingredientId'
      AND line ? 'quantity'
      AND line ? 'unit'
    ON CONFLICT (transfer_id, ingredient_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit;
  END IF;

  RETURN jsonb_build_object(
    'id', v_transfer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ─── 3. Query performance indexes ───

CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch_pos_session_created
  ON public.orders (tenant_id, branch_id, pos_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kds_tickets_tenant_branch_created
  ON public.kds_tickets (tenant_id, branch_id, created_at ASC);
