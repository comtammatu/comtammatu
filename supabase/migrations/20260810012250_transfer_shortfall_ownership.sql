-- ADR 0028: attribute transfer shortfall to the shipping site by default;
-- require explicit transit_loss ("Nhan thieu") classification for in-transit
-- damage. Short receive cannot close unclassified.

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_subtype_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_subtype_check CHECK (
    (movement_subtype IS NULL)
    OR (movement_subtype = ANY (ARRAY[
      'storage_loss'::text,
      'sale_consumption'::text,
      'sale_consumption_restore'::text,
      'cancelled_after_kds_ready'::text,
      'writeoff'::text,
      'other'::text,
      'transfer_source_variance'::text,
      'transfer_transit_loss'::text
    ]))
  );

CREATE OR REPLACE FUNCTION private.execute_stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
  v_shortfall    NUMERIC(15,3);
  v_shortfall_base NUMERIC(15,3);
  v_class        TEXT;
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

  IF v_role IN ('branch_manager', 'branch_manager', 'branch_manager')
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
    v_class := NULL;

    IF p_items IS NOT NULL THEN
      v_key := v_line.ingredient_id::TEXT;
      IF (p_items ? v_key) THEN
        IF jsonb_typeof(p_items -> v_key) = 'object' THEN
          v_recv := ((p_items -> v_key) ->> 'qty')::NUMERIC;
          v_note := (p_items -> v_key) ->> 'note';
          v_class := NULLIF(btrim((p_items -> v_key) ->> 'shortfall_class'), '');
        ELSE
          v_recv := (p_items ->> v_key)::NUMERIC;
          v_class := NULL;
        END IF;
      END IF;
    END IF;

    IF v_recv < 0 OR v_recv > v_line.quantity THEN
      RAISE EXCEPTION 'invalid_receive_qty:%', v_line.ingredient_id USING ERRCODE = '22023';
    END IF;

    v_shortfall := v_line.quantity - COALESCE(v_recv, 0);
    IF v_shortfall > 0 THEN
      IF v_class IS NULL OR v_class NOT IN ('source_variance', 'transit_loss') THEN
        RAISE EXCEPTION 'short_receive_classification_required:%', v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;
      IF length(COALESCE(v_note, '')) < 5 THEN
        RAISE EXCEPTION 'short_receive_reason_required:%', v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_recv > 0 THEN
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
    END IF; -- v_recv > 0

    IF v_shortfall > 0 THEN
      IF v_tr.from_location_id IS NULL THEN
        RAISE EXCEPTION 'transfer_from_location_missing' USING ERRCODE = '23502';
      END IF;

      v_shortfall_base := public.inv_to_base(
        v_line.ingredient_id, v_line.entry_unit_id, v_shortfall
      )::NUMERIC(15,3);
      v_cost := COALESCE(v_line.unit_cost_at_ship, 0);

      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, movement_subtype,
        quantity_change, reason, created_by, transfer_id, unit_cost,
        location_id, entry_unit_id, entry_quantity
      ) VALUES (
        v_tenant,
        v_tr.from_branch_id,
        v_line.ingredient_id,
        'adjustment',
        CASE
          WHEN v_class = 'transit_loss' THEN 'transfer_transit_loss'
          ELSE 'transfer_source_variance'
        END,
        0,
        CASE
          WHEN v_class = 'transit_loss' THEN
            'Transfer ' || v_tr.transfer_number
              || ' transit_loss: ' || v_note
          ELSE
            'Transfer ' || v_tr.transfer_number
              || ' source_variance: ' || v_note
        END,
        v_uid,
        p_transfer_id,
        v_cost,
        v_tr.from_location_id,
        v_line.entry_unit_id,
        v_shortfall
      );
    END IF;

    UPDATE public.stock_transfer_items
    SET quantity_received = v_recv,
        receive_note = CASE
          WHEN v_shortfall > 0 THEN
            COALESCE(v_note, '') || ' [shortfall_class=' || v_class || ']'
          ELSE v_note
        END
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

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_line public.stock_transfer_items%ROWTYPE;
  v_payload jsonb;
  v_received numeric;
  v_note text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
  LOOP
    v_payload := p_items -> v_line.ingredient_id::text;
    v_received := CASE
      WHEN v_payload IS NULL THEN v_line.quantity
      WHEN jsonb_typeof(v_payload) = 'object'
        THEN (v_payload ->> 'qty')::numeric
      ELSE (v_payload #>> '{}')::numeric
    END;
    v_note := CASE
      WHEN jsonb_typeof(v_payload) = 'object'
        THEN NULLIF(btrim(v_payload ->> 'note'), '')
      ELSE NULL
    END;

    IF v_received < v_line.quantity THEN
      IF length(COALESCE(v_note, '')) < 5 THEN
        RAISE EXCEPTION 'short_receive_reason_required:%',
          v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(v_payload) <> 'object'
         OR NULLIF(btrim(v_payload ->> 'shortfall_class'), '')
            NOT IN ('source_variance', 'transit_loss') THEN
        RAISE EXCEPTION 'short_receive_classification_required:%',
          v_line.ingredient_id
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  RETURN public.stock_transfer_receive_legacy(p_transfer_id, p_items);
END;
$$;
