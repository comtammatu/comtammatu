SET search_path TO '';

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_tr           RECORD;
  v_line         RECORD;
  v_recv         NUMERIC(15,3);
  v_recv_base    NUMERIC(15,3);
  v_note         TEXT;
  v_cost         NUMERIC(15,2);
  v_old_q        NUMERIC(15,3);
  v_old_wac      NUMERIC(15,2);
  v_new_q        NUMERIC(15,3);
  v_new_wac      NUMERIC(15,2);
  v_key          TEXT;
  v_to_loc       RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_tr
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tr.from_branch_id = v_tr.to_branch_id THEN
    RAISE EXCEPTION 'intra_branch_transfer_already_atomic' USING ERRCODE = '22023';
  END IF;

  IF v_role IN ('branch_manager', 'warehouse_manager', 'production_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> v_tr.to_branch_id) THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_tr.to_branch_id, 'inventory:transfer_receive') THEN
    RAISE EXCEPTION 'forbidden_transfer_receive' USING ERRCODE = '42501';
  END IF;

  IF v_tr.status <> 'confirmed_receive' THEN
    RAISE EXCEPTION 'transfer_not_in_confirmed_receive' USING ERRCODE = '22023';
  END IF;

  IF v_tr.to_location_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT id, branch_id
  INTO v_to_loc
  FROM public.inventory_locations
  WHERE id = v_tr.to_location_id
    AND tenant_id = v_tenant
    AND is_active = TRUE;

  IF NOT FOUND OR v_to_loc.branch_id <> v_tr.to_branch_id THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  FOR v_line IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id
      AND tenant_id = v_tenant
  LOOP
    v_recv := v_line.quantity;
    v_note := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::TEXT;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::NUMERIC;
          v_note := (p_items -> v_key) ->> 'note';
        ELSE
          v_recv := (p_items ->> v_key)::NUMERIC;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    IF v_recv <= 0 THEN
      UPDATE public.stock_transfer_items
      SET quantity_received = 0,
          receive_note = v_note
      WHERE id = v_line.id;
      CONTINUE;
    END IF;

    v_recv_base := public.inv_to_base(v_line.ingredient_id, v_line.entry_unit_id, v_recv)::NUMERIC(15,3);
    v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, transfer_id, unit_cost, location_id,
      entry_unit_id, entry_quantity
    ) VALUES (
      v_tenant, v_tr.to_branch_id, v_line.ingredient_id, 'transfer_in', v_recv_base,
      'Transfer ' || v_tr.transfer_number, v_uid, p_transfer_id, v_cost,
      v_tr.to_location_id,
      v_line.entry_unit_id, v_recv
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv_base;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv_base * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_tr.to_branch_id
      AND sl.location_id = v_tr.to_location_id
      AND sl.ingredient_id = v_line.ingredient_id;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv,
        receive_note = v_note
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(bigint, jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    JOIN public.stock_transfer_items sti
      ON sti.tenant_id = sm.tenant_id
     AND sti.transfer_id = sm.transfer_id
     AND sti.ingredient_id = sm.ingredient_id
    LEFT JOIN public.ingredient_units iu
      ON iu.tenant_id = sti.tenant_id
     AND iu.ingredient_id = sti.ingredient_id
     AND iu.unit_id = sti.entry_unit_id
     AND iu.is_active = TRUE
    WHERE sm.type = 'transfer_in'
      AND sm.transfer_id IS NOT NULL
      AND sm.entry_unit_id IS NULL
      AND sm.entry_quantity IS NULL
      AND COALESCE(sti.quantity_received, sti.quantity) > 0
      AND sti.entry_unit_id IS NOT NULL
      AND iu.id IS NULL
  ) THEN
    RAISE EXCEPTION 'transfer_receive_entry_unit_backfill_missing_conversion' USING ERRCODE = '23503';
  END IF;
END$$;

WITH targets AS (
  SELECT
    sm.id AS movement_id,
    sm.tenant_id,
    sm.branch_id,
    sm.location_id,
    sm.ingredient_id,
    sm.quantity_change AS old_quantity_change,
    COALESCE(sti.quantity_received, sti.quantity)::NUMERIC(15,3) AS entry_quantity,
    sti.entry_unit_id,
    ROUND(
      (
        COALESCE(sti.quantity_received, sti.quantity)
        * COALESCE(iu.to_base_factor, 1)
      )::NUMERIC,
      3
    )::NUMERIC(15,3) AS expected_base
  FROM public.stock_movements sm
  JOIN public.stock_transfer_items sti
    ON sti.tenant_id = sm.tenant_id
   AND sti.transfer_id = sm.transfer_id
   AND sti.ingredient_id = sm.ingredient_id
  LEFT JOIN public.ingredient_units iu
    ON iu.tenant_id = sti.tenant_id
   AND iu.ingredient_id = sti.ingredient_id
   AND iu.unit_id = sti.entry_unit_id
   AND iu.is_active = TRUE
  WHERE sm.type = 'transfer_in'
    AND sm.transfer_id IS NOT NULL
    AND sm.entry_unit_id IS NULL
    AND sm.entry_quantity IS NULL
    AND COALESCE(sti.quantity_received, sti.quantity) > 0
    AND ABS(sm.quantity_change - COALESCE(sti.quantity_received, sti.quantity)) <= 0.0005
),
updated_movements AS (
  UPDATE public.stock_movements sm
  SET quantity_change = targets.expected_base,
      entry_unit_id = targets.entry_unit_id,
      entry_quantity = targets.entry_quantity
  FROM targets
  WHERE sm.id = targets.movement_id
  RETURNING
    sm.tenant_id,
    sm.branch_id,
    sm.location_id,
    sm.ingredient_id,
    targets.expected_base - targets.old_quantity_change AS delta
),
level_deltas AS (
  SELECT
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    SUM(delta)::NUMERIC(15,3) AS delta
  FROM updated_movements
  WHERE ABS(delta) > 0.0005
  GROUP BY tenant_id, branch_id, location_id, ingredient_id
)
UPDATE public.stock_levels sl
SET current_quantity = sl.current_quantity + agg.delta,
    updated_at = now()
FROM level_deltas agg
WHERE sl.tenant_id = agg.tenant_id
  AND sl.branch_id IS NOT DISTINCT FROM agg.branch_id
  AND sl.location_id = agg.location_id
  AND sl.ingredient_id = agg.ingredient_id;
