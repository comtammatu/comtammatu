-- Allow store-branch inter-site receive to land in warehouse or kitchen.

DROP FUNCTION IF EXISTS public.stock_transfer_receive(bigint, jsonb);
DROP FUNCTION IF EXISTS private.execute_stock_transfer_receive(bigint, jsonb);

CREATE OR REPLACE FUNCTION private.execute_stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb, p_to_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
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
  v_key          TEXT;
  v_to_loc       RECORD;
  v_shortfall    NUMERIC(15,3);
  v_shortfall_base NUMERIC(15,3);
  v_class        TEXT;
  v_dest_id      BIGINT;
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

  v_dest_id := COALESCE(p_to_location_id, v_tr.to_location_id);

  IF v_dest_id IS NULL THEN
    RAISE EXCEPTION 'transfer_to_location_missing' USING ERRCODE = '23502';
  END IF;

  SELECT loc.id, loc.branch_id, loc.location_kind, branch.branch_kind
  INTO v_to_loc
  FROM public.inventory_locations AS loc
  JOIN public.branches AS branch
    ON branch.id = loc.branch_id
   AND branch.tenant_id = loc.tenant_id
  WHERE loc.id = v_dest_id
    AND loc.tenant_id = v_tenant
    AND loc.is_active = TRUE;

  IF NOT FOUND
     OR v_to_loc.branch_id <> v_tr.to_branch_id
     OR v_to_loc.location_kind NOT IN ('warehouse', 'kitchen')
     OR (
       v_to_loc.location_kind = 'kitchen'
       AND v_to_loc.branch_kind IS DISTINCT FROM 'branch'
     ) THEN
    RAISE EXCEPTION 'transfer_to_location_invalid' USING ERRCODE = '23514';
  END IF;

  IF v_dest_id IS DISTINCT FROM v_tr.to_location_id THEN
    UPDATE public.stock_transfers
    SET to_location_id = v_dest_id,
        updated_at = now()
    WHERE id = p_transfer_id;
    v_tr.to_location_id := v_dest_id;
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


  PERFORM public.log_audit(
    'inventory.transfer.received',
    'stock_transfer',
    p_transfer_id,
    jsonb_build_object('status', 'confirmed_receive'),
    jsonb_build_object(
      'status', 'received',
      'transfer_number', v_tr.transfer_number,
      'to_location_id', v_tr.to_location_id
    )
  );

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'received'
  );

END;
$$;

COMMENT ON FUNCTION private.execute_stock_transfer_receive(p_transfer_id bigint, p_items jsonb, p_to_location_id bigint) IS 'Receives a confirmed_receive transfer. Qty via movement trigger; company WAC via valuation poster. Optional p_to_location_id may retarget a store kitchen. Does not recompute site avg_unit_cost.';

REVOKE ALL ON FUNCTION private.execute_stock_transfer_receive(bigint, jsonb, bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id bigint, p_items jsonb DEFAULT NULL::jsonb, p_to_location_id bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_line public.stock_transfer_items%ROWTYPE;
  v_payload jsonb;
  v_received numeric;
  v_note text;
  v_key text;
  v_value jsonb;
  v_ingredient_id bigint;
  v_received_quantity numeric;
  v_sent_quantity numeric;
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

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'object' THEN
      RAISE EXCEPTION 'transfer_receive_items_invalid'
        USING ERRCODE = '22023';
    END IF;

    FOR v_key, v_value IN
      SELECT item.key, item.value
      FROM jsonb_each(p_items) AS item(key, value)
    LOOP
      v_ingredient_id := v_key::bigint;
      v_received_quantity := CASE
        WHEN jsonb_typeof(v_value) = 'object'
          THEN nullif(v_value ->> 'qty', '')::numeric
        ELSE nullif(v_value #>> '{}', '')::numeric
      END;

      SELECT transfer_item.quantity
      INTO v_sent_quantity
      FROM public.stock_transfer_items AS transfer_item
      JOIN public.stock_transfers AS transfer
        ON transfer.id = transfer_item.transfer_id
       AND transfer.tenant_id = transfer_item.tenant_id
      WHERE transfer_item.transfer_id = p_transfer_id
        AND transfer_item.tenant_id = v_tenant
        AND transfer_item.ingredient_id = v_ingredient_id
      FOR UPDATE OF transfer_item;

      IF NOT FOUND
         OR v_received_quantity IS NULL
         OR v_received_quantity < 0
         OR v_received_quantity > v_sent_quantity
         OR v_received_quantity = 'NaN'::numeric
         OR v_received_quantity = 'Infinity'::numeric
         OR v_received_quantity = '-Infinity'::numeric THEN
        RAISE EXCEPTION 'invalid_receive_qty:%', v_ingredient_id
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  RETURN private.execute_stock_transfer_receive(
    p_transfer_id,
    p_items,
    p_to_location_id
  );
END;
$$;

COMMENT ON FUNCTION public.stock_transfer_receive(p_transfer_id bigint, p_items jsonb, p_to_location_id bigint) IS 'Validates receive quantities then posts the inbound transfer, optionally retargeting a store warehouse or kitchen.';

REVOKE ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb, bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb, bigint) TO authenticated;
GRANT ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb, bigint) TO service_role;
