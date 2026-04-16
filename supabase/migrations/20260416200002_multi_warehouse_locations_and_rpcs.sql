-- =============================================================
-- Multi-Warehouse Step 2: Kitchen location seeding, location backfill,
-- intra-branch transfer support, location-aware RPCs.
-- =============================================================

-- ─── 1. Seed kitchen location per branch-kind branch ───
-- Each 'branch' gets a second location (kitchen) for consumption tracking.
-- warehouse/central_kitchen branches keep their single default location.

-- Step A: Clear is_default_consumption on existing warehouse locations for branch-kind
-- branches FIRST (before inserting kitchen locations) to avoid unique index violation.
UPDATE public.inventory_locations wh
SET is_default_consumption = false
WHERE wh.location_kind = 'warehouse'
  AND wh.is_default_consumption = true
  AND EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = wh.branch_id
      AND b.branch_kind = 'branch'
  );

-- Step B: Now insert kitchen locations with is_default_consumption = true
INSERT INTO public.inventory_locations (
  tenant_id, branch_id, code, name, location_kind,
  is_default_receive, is_default_issue, is_default_consumption, sort_order
)
SELECT
  b.tenant_id,
  b.id,
  'kitchen',
  'Kho bếp',
  'kitchen',
  false,    -- not default receive
  false,    -- not default issue
  true,     -- IS default consumption
  10
FROM public.branches b
WHERE b.branch_kind = 'branch'
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_locations il
    WHERE il.branch_id = b.id AND il.location_kind = 'kitchen'
  );

-- ─── 2. Backfill location_id on stock_levels ───
-- Set location_id = default receive location for the branch

UPDATE public.stock_levels sl
SET location_id = il.id
FROM public.inventory_locations il
WHERE sl.location_id IS NULL
  AND il.branch_id = sl.branch_id
  AND il.tenant_id = sl.tenant_id
  AND il.is_default_receive = true
  AND il.is_active = true;

-- ─── 3. Backfill location_id on stock_movements ───

UPDATE public.stock_movements sm
SET location_id = il.id
FROM public.inventory_locations il
WHERE sm.location_id IS NULL
  AND il.branch_id = sm.branch_id
  AND il.tenant_id = sm.tenant_id
  AND il.is_default_receive = true
  AND il.is_active = true;

-- ─── 4. Backfill location_id on stocktake_sessions ───

UPDATE public.stocktake_sessions ss
SET location_id = il.id
FROM public.inventory_locations il
WHERE ss.location_id IS NULL
  AND il.branch_id = ss.branch_id
  AND il.tenant_id = ss.tenant_id
  AND il.is_default_receive = true
  AND il.is_active = true;

-- ─── 5. create_stock_transfer_draft: intra-branch + location support ───

-- Drop old signature to replace cleanly
DROP FUNCTION IF EXISTS public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB);

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

  -- Intra-branch: must have different locations
  IF v_is_intra THEN
    IF p_from_location_id IS NULL OR p_to_location_id IS NULL THEN
      RAISE EXCEPTION 'intra_branch_requires_locations' USING ERRCODE = '22023';
    END IF;
    IF p_from_location_id = p_to_location_id THEN
      RAISE EXCEPTION 'intra_branch_same_location' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Branch-scoped role check
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

  RETURN jsonb_build_object('id', v_transfer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(BIGINT, BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT, BIGINT) TO authenticated;

-- ─── 6. stock_transfer_confirm_ship: intra-branch shortcut ───
-- Intra-branch transfers skip in_transit → go directly to received.

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant    BIGINT := public.auth_tenant_id();
  v_tr        RECORD;
  v_line      RECORD;
  v_sl        NUMERIC(15,3);
  v_wac       NUMERIC(15,2);
  v_is_intra  BOOLEAN;
  v_old_q     NUMERIC(15,3);
  v_old_wac   NUMERIC(15,2);
  v_new_q     NUMERIC(15,3);
  v_new_wac   NUMERIC(15,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;

  v_is_intra := (v_tr.from_branch_id = v_tr.to_branch_id);

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = v_tenant
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_sl, v_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.from_branch_id
      AND sl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND OR COALESCE(v_sl, 0) < v_line.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_line.ingredient_id USING ERRCODE = 'P0001';
    END IF;

    -- Transfer out movement
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_tr.from_branch_id, v_line.ingredient_id, 'transfer_out', -v_line.quantity,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_wac,
      v_tr.from_location_id
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_wac
    WHERE id = v_line.id;

    -- Intra-branch: immediately receive (no in_transit step)
    IF v_is_intra THEN
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, transfer_id, unit_cost, location_id
      ) VALUES (
        v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_line.quantity,
        'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_wac,
        v_tr.to_location_id
      );

      -- WAC unchanged for intra-branch (same cost pool)
      UPDATE public.stock_transfer_items
      SET quantity_received = v_line.quantity
      WHERE id = v_line.id;
    END IF;
  END LOOP;

  IF v_is_intra THEN
    -- Intra-branch: skip all intermediate states → received immediately
    UPDATE public.stock_transfers
    SET status = 'received',
        shipped_at = now(),
        received_at = now(),
        updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'received');
  ELSE
    UPDATE public.stock_transfers
    SET status = 'confirmed_ship', shipped_at = now(), updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'confirmed_ship');
  END IF;
END;
$$;

-- ─── 7. confirm_goods_receipt_note: use branch_kind instead of is_headquarters ───

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_grn           RECORD;
  v_item          RECORD;
  v_branch        RECORD;
  v_old_q         NUMERIC(15,3);
  v_old_wac       NUMERIC(15,2);
  v_recv          NUMERIC(15,3);
  v_cost          NUMERIC(15,2);
  v_new_q         NUMERIC(15,3);
  v_new_wac       NUMERIC(15,2);
  v_location_id   BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  -- Validate branch is warehouse or central_kitchen
  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id
    AND b.tenant_id = v_tenant
    AND b.branch_kind IN ('warehouse', 'central_kitchen');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_warehouse_or_central_kitchen' USING ERRCODE = '23514';
  END IF;

  -- Resolve default receive location for this branch
  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = true
    AND il.is_active = true
  LIMIT 1;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.quality_status = 'rejected' OR v_item.received_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_recv := v_item.received_quantity;
    v_cost := v_item.unit_cost;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  RETURN jsonb_build_object('grn_id', p_grn_id, 'status', 'confirmed');
END;
$$;

-- ─── 8. create_stocktake_session: add optional location_id ───

DROP FUNCTION IF EXISTS public.create_stocktake_session(BIGINT);

CREATE OR REPLACE FUNCTION public.create_stocktake_session(
  p_branch_id   BIGINT,
  p_location_id BIGINT DEFAULT NULL
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
  v_session_id   BIGINT;
  v_loc_id       BIGINT;
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

  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> p_branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  -- Resolve location: use provided or default receive location
  IF p_location_id IS NOT NULL THEN
    SELECT il.id INTO v_loc_id
    FROM public.inventory_locations il
    WHERE il.id = p_location_id
      AND il.branch_id = p_branch_id
      AND il.tenant_id = v_tenant
      AND il.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'location_not_found_or_inactive' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT il.id INTO v_loc_id
    FROM public.inventory_locations il
    WHERE il.branch_id = p_branch_id
      AND il.tenant_id = v_tenant
      AND il.is_default_receive = true
      AND il.is_active = true
    LIMIT 1;
  END IF;

  INSERT INTO public.stocktake_sessions (
    tenant_id,
    branch_id,
    location_id,
    created_by
  ) VALUES (
    v_tenant,
    p_branch_id,
    v_loc_id,
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

  RETURN jsonb_build_object('id', v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_stocktake_session(BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stocktake_session(BIGINT, BIGINT) TO authenticated;

-- ─── 9. Add warehouse_manager + production_manager to stock RLS ───
-- Update manage policies to include new roles

DROP POLICY IF EXISTS "purchase_orders_manage" ON public.purchase_orders;
CREATE POLICY "purchase_orders_manage" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  );

DROP POLICY IF EXISTS "grn_manage" ON public.goods_received_notes;
CREATE POLICY "grn_manage" ON public.goods_received_notes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  );

DROP POLICY IF EXISTS "stock_transfers_manage" ON public.stock_transfers;
CREATE POLICY "stock_transfers_manage" ON public.stock_transfers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  );

DROP POLICY IF EXISTS "supplier_invoices_manage" ON public.supplier_invoices;
CREATE POLICY "supplier_invoices_manage" ON public.supplier_invoices
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  );

DROP POLICY IF EXISTS "suppliers_manage" ON public.suppliers;
CREATE POLICY "suppliers_manage" ON public.suppliers
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'warehouse_manager', 'production_manager')
  );
