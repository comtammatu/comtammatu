-- ISS-05: document Đơn giá on a confirmed GRN must not re-add invoice
-- value already stored on a partial/finalized origin. Matching booked
-- value is value_delta 0 and skips WAC equalize (book_value >= 0).

CREATE OR REPLACE FUNCTION public.owner_patch_confirmed_grn_unit_cost(
  p_grn_item_id bigint,
  p_unit_cost numeric,
  p_unit_cost_unit_id bigint,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_item public.grn_items%ROWTYPE;
  v_grn public.goods_received_notes%ROWTYPE;
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_origin_count integer;
  v_accepted numeric;
  v_new_total numeric(20, 2);
  v_old_value numeric(20, 2);
  v_delta numeric(20, 2);
  v_event_id bigint;
  v_now timestamptz := pg_catalog.now();
  v_year integer;
  v_month integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_wac numeric;
  v_receipt_qty numeric;
  v_idempotency uuid;
BEGIN
  IF v_actor IS NULL
     OR v_tenant IS NULL
     OR NOT public.auth_is_owner(v_actor)
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '23514';
  END IF;
  IF p_grn_item_id IS NULL THEN
    RAISE EXCEPTION 'grn_item_required' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'grn_unit_price_invalid' USING ERRCODE = '23514';
  END IF;
  IF p_unit_cost_unit_id IS NULL THEN
    RAISE EXCEPTION 'grn_unit_price_unit_required' USING ERRCODE = '23514';
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.grn_items AS item
  WHERE item.id = p_grn_item_id
    AND item.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = v_item.grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'grn_not_confirmed' USING ERRCODE = '23514';
  END IF;

  v_accepted := v_item.received_quantity - v_item.rejected_quantity;
  IF v_accepted <= 0 THEN
    RAISE EXCEPTION 'grn_has_no_accepted_quantity' USING ERRCODE = '23514';
  END IF;

  IF v_item.unit_cost > 0 THEN
    RAISE EXCEPTION 'grn_unit_cost_already_booked' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_item.ingredient_id
      AND ingredient_unit.unit_id = p_unit_cost_unit_id
      AND ingredient_unit.is_active
  ) THEN
    RAISE EXCEPTION 'grn_unit_price_unit_invalid' USING ERRCODE = '23514';
  END IF;

  v_new_total := private.grn_line_book_total(
    v_tenant,
    v_item.ingredient_id,
    v_accepted,
    v_item.entry_unit_id,
    p_unit_cost,
    p_unit_cost_unit_id
  );

  SELECT count(*)
  INTO v_origin_count
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant
    AND origin.ingredient_id = v_item.ingredient_id
    AND origin.source_kind = 'grn_receipt'
    AND (
      origin.grn_item_id = v_item.id
      OR (
        origin.grn_item_id IS NULL
        AND origin.source_id IN (
          SELECT movement.id
          FROM public.stock_movements AS movement
          WHERE movement.tenant_id = v_tenant
            AND movement.grn_id = v_item.grn_id
            AND movement.ingredient_id = v_item.ingredient_id
            AND movement.type = 'grn_receipt'
        )
      )
    );

  IF v_origin_count <> 1 THEN
    RAISE EXCEPTION 'grn_cost_origin_missing' USING ERRCODE = 'P0002';
  END IF;

  SELECT origin.*
  INTO STRICT v_origin
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant
    AND origin.ingredient_id = v_item.ingredient_id
    AND origin.source_kind = 'grn_receipt'
    AND (
      origin.grn_item_id = v_item.id
      OR (
        origin.grn_item_id IS NULL
        AND origin.source_id IN (
          SELECT movement.id
          FROM public.stock_movements AS movement
          WHERE movement.tenant_id = v_tenant
            AND movement.grn_id = v_item.grn_id
            AND movement.ingredient_id = v_item.ingredient_id
            AND movement.type = 'grn_receipt'
        )
      )
    )
  FOR UPDATE;

  SELECT coalesce(pg_catalog.sum(movement.quantity_change), 0)
  INTO v_receipt_qty
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = v_tenant
    AND movement.grn_id = v_item.grn_id
    AND movement.ingredient_id = v_item.ingredient_id
    AND movement.type = 'grn_receipt';

  v_old_value := CASE
    WHEN coalesce(v_origin.finalized_value, 0) > 0
      THEN v_origin.finalized_value
    WHEN v_origin.cost_status = 'finalized'
      THEN coalesce(v_origin.finalized_value, 0)
    ELSE coalesce(v_origin.provisional_value, 0)
  END;
  v_delta := v_new_total - v_old_value;

  PERFORM pg_catalog.set_config(
    'comtammatu.owner_grn_unit_cost_patch',
    'true',
    TRUE
  );

  UPDATE public.grn_items
  SET unit_cost = p_unit_cost,
      unit_cost_unit_id = p_unit_cost_unit_id
  WHERE id = v_item.id
    AND tenant_id = v_tenant;

  PERFORM pg_catalog.set_config(
    'comtammatu.owner_grn_unit_cost_patch',
    'false',
    TRUE
  );

  SELECT item.*
  INTO v_item
  FROM public.grn_items AS item
  WHERE item.id = p_grn_item_id
    AND item.tenant_id = v_tenant;

  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_idempotency := pg_catalog.md5(
    'owner-grn-unit-cost:'
      || v_tenant::text || ':'
      || v_item.id::text || ':'
      || p_idempotency_key::text || ':'
      || v_new_total::text
  )::uuid;

  IF v_delta <> 0 THEN
    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      quantity_delta,
      value_delta,
      grn_item_id,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      metadata
    )
    VALUES (
      v_tenant,
      v_item.ingredient_id,
      'provisional_reprice',
      0,
      v_delta,
      v_item.id,
      v_now,
      v_year,
      v_month,
      v_idempotency,
      pg_catalog.jsonb_build_object(
        'origin_id', v_origin.id,
        'source_kind', 'grn_receipt',
        'grn_item_id', v_item.id,
        'grn_id', v_grn.id,
        'owner_patch', TRUE,
        'reason', v_reason,
        'unit_cost', p_unit_cost,
        'unit_cost_unit_id', p_unit_cost_unit_id,
        'actor_id', v_actor
      )
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      SELECT event.id
      INTO v_event_id
      FROM public.inventory_valuation_events AS event
      WHERE event.tenant_id = v_tenant
        AND event.idempotency_key = v_idempotency;
    ELSE
      PERFORM private.propagate_inventory_origin_reprice(
        v_tenant,
        v_event_id,
        v_origin.id,
        v_delta
      );
    END IF;
  END IF;

  UPDATE public.inventory_cost_origins
  SET provisional_value = v_new_total,
      cost_status = CASE
        WHEN cost_status = 'pending' THEN 'provisional'
        ELSE cost_status
      END,
      finalized_value = CASE
        WHEN cost_status = 'finalized' THEN v_new_total
        ELSE finalized_value
      END,
      finalized_quantity = CASE
        WHEN cost_status = 'finalized' THEN original_quantity
        ELSE finalized_quantity
      END,
      grn_item_id = coalesce(grn_item_id, v_item.id)
  WHERE id = v_origin.id
    AND tenant_id = v_tenant;

  IF v_delta <> 0 THEN
    v_wac := private.project_company_wac(v_tenant, v_item.ingredient_id);
  ELSE
    v_wac := private.ingredient_company_wac(v_tenant, v_item.ingredient_id);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'grn_item_id', v_item.id,
    'grn_id', v_grn.id,
    'unit_cost', v_item.unit_cost,
    'unit_cost_unit_id', v_item.unit_cost_unit_id,
    'total_cost', v_item.total_cost,
    'book_total', v_new_total,
    'quantity_delta', 0,
    'value_delta', v_delta,
    'receipt_quantity', v_receipt_qty,
    'event_id', v_event_id,
    'company_wac', v_wac
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_patch_confirmed_grn_unit_cost(
  bigint, numeric, bigint, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_patch_confirmed_grn_unit_cost(
  bigint, numeric, bigint, text, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.owner_patch_confirmed_grn_unit_cost(
  bigint, numeric, bigint, text, uuid
) IS
  'Owner-only ISS-05 repair: write confirmed GRN unit_cost, append quantity_delta=0 restatement against already-booked origin value, equalize company WAC only when value_delta <> 0. Does not insert grn_receipt qty.';
