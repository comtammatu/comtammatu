-- Inline transfer public wrappers so *_legacy can be dropped, then remove
-- orphan consume_stock_for_order* (payment path posts via
-- post_pos_sale_consumption_if_ready). confirm_goods_receipt_note_legacy is
-- already absent. get_pos_session_report_legacy_20260725 stays until its
-- wrapper is inlined in a dedicated follow-up.

CREATE OR REPLACE FUNCTION public.stock_transfer_confirm_ship(p_transfer_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_role text := public.auth_role();
  v_transfer record;
  v_line record;
  v_source_quantity numeric(15,3);
  v_source_wac numeric(15,2);
  v_quantity_base numeric(15,3);
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'draft' THEN
    RAISE EXCEPTION 'transfer_not_draft' USING ERRCODE = '22023';
  END IF;
  IF v_transfer.from_branch_id = v_transfer.to_branch_id THEN
    RAISE EXCEPTION 'transfer_requires_distinct_branches'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.assert_stock_transfer_warehouse_endpoints(
    p_transfer_id,
    v_tenant
  );

  IF v_role = 'branch_manager' THEN
    RAISE EXCEPTION 'branch_manager_inter_site_ship_forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(
    v_transfer.from_branch_id,
    'inventory:transfer_ship'
  ) THEN
    RAISE EXCEPTION 'forbidden_transfer_ship'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.from_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.from_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = v_transfer.to_location_id
      AND location.tenant_id = v_tenant
      AND location.branch_id = v_transfer.to_branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'transfer_warehouse_location_invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'transfer_lines_required'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
    ORDER BY item.ingredient_id
    FOR UPDATE
  LOOP
    IF v_line.quantity <= 0
       OR v_line.quantity = 'NaN'::numeric
       OR v_line.quantity = 'Infinity'::numeric
       OR v_line.quantity = '-Infinity'::numeric THEN
      RAISE EXCEPTION 'transfer_line_quantity_invalid:%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    v_quantity_base := public.inv_to_base(
      v_line.ingredient_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_source_quantity, v_source_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_transfer.from_branch_id
      AND stock.location_id = v_transfer.from_location_id
      AND stock.ingredient_id = v_line.ingredient_id
    FOR UPDATE;

    IF NOT FOUND
       OR coalesce(v_source_quantity, 0) < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock:%',
        v_line.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      transfer_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_transfer.from_branch_id,
      v_line.ingredient_id,
      'transfer_out',
      -v_quantity_base,
      'Transfer ' || v_transfer.transfer_number,
      v_uid,
      p_transfer_id,
      v_source_wac,
      v_transfer.from_location_id,
      v_line.entry_unit_id,
      v_line.quantity
    );

    UPDATE public.stock_transfer_items
    SET unit_cost_at_ship = v_source_wac
    WHERE id = v_line.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'confirmed_ship',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN public.stock_transfer_mark_in_transit(p_transfer_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id bigint,
  p_items jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    p_items
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id bigint,
  p_new_status text,
  p_expected_status text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id UUID;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_order RECORD;
BEGIN
  v_actor_id := auth.uid();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, table_id, order_type
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = v_actor_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_branch IS NOT NULL AND v_order.branch_id <> v_actor_branch THEN
    RAISE EXCEPTION 'not_in_branch' USING ERRCODE = 'P0003';
  END IF;

  IF v_order.status <> p_expected_status THEN
    RAISE EXCEPTION 'status_changed:% expected % got %',
      v_order.status, p_expected_status, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (p_expected_status = 'new' AND p_new_status = 'confirmed')
    OR (p_expected_status = 'served' AND p_new_status = 'completed')
    OR (p_expected_status NOT IN ('completed') AND p_new_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'invalid_transition:% to %',
      p_expected_status, p_new_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  ) VALUES (
    v_actor_tenant, p_order_id, v_order.status, p_new_status, v_actor_id, p_note
  );

  IF p_new_status = 'cancelled' THEN
    UPDATE public.order_items
    SET status = 'cancelled', updated_at = now()
    WHERE order_id = p_order_id
      AND status NOT IN ('served', 'cancelled');
  END IF;

  -- Stock posting for completed paid orders is owned by
  -- post_pos_sale_consumption_if_ready on the payment path. Do not call the
  -- retired consume_stock_for_order wrapper here.

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'old_status', v_order.status,
    'new_status', p_new_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_ship(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_confirm_ship(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(bigint, jsonb)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.transition_order_status(
  bigint, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(
  bigint, text, text, text
) TO service_role;

DROP FUNCTION IF EXISTS public.stock_transfer_confirm_ship_legacy(bigint);
DROP FUNCTION IF EXISTS public.stock_transfer_receive_legacy(bigint, jsonb);
DROP FUNCTION IF EXISTS public.consume_stock_for_order(bigint);
DROP FUNCTION IF EXISTS public.consume_stock_for_order_service(bigint, uuid);
