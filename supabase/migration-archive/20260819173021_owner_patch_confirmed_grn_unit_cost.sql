-- ISS-05 / OD-1: Owner patches confirmed GRN lines that booked unit_cost = 0.
-- Writes document Đơn giá, appends quantity_delta = 0 restatement, equalizes
-- company WAC. Does not re-confirm GRN, rewrite stock_movements, or invoice_reprice.
-- Types: corepack pnpm db:types waits until this file is applied on Production.

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean := coalesce(
    pg_catalog.current_setting('comtammatu.grn_confirm', TRUE),
    'false'
  ) = 'true';
  v_owner_price_patch boolean := coalesce(
    pg_catalog.current_setting('comtammatu.owner_grn_unit_cost_patch', TRUE),
    'false'
  ) = 'true';
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       to_jsonb(NEW) - 'entry_to_base_factor' - 'entry_unit_code'
     ) IS NOT DISTINCT FROM (
       to_jsonb(OLD) - 'entry_to_base_factor' - 'entry_unit_code'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = coalesce(NEW.grn_id, OLD.grn_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_grn.status = 'draft' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.grn_id IS DISTINCT FROM OLD.grn_id
       OR NEW.purchase_order_item_id IS DISTINCT FROM
         OLD.purchase_order_item_id
       OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     ) THEN
    RAISE EXCEPTION 'grn_line_identity_immutable'
      USING ERRCODE = '23514';
  END IF;

  SELECT po_item.*, purchase_order.supplier_id
  INTO v_po_item
  FROM public.purchase_order_items AS po_item
  JOIN public.purchase_orders AS purchase_order
    ON purchase_order.id = po_item.po_id
   AND purchase_order.tenant_id = po_item.tenant_id
  WHERE po_item.id = NEW.purchase_order_item_id
    AND po_item.tenant_id = v_grn.tenant_id
    AND po_item.po_id = v_grn.po_id;

  IF NOT FOUND
     OR NEW.ingredient_id <> v_po_item.ingredient_id
     OR NEW.supplier_id <> v_po_item.supplier_id THEN
    RAISE EXCEPTION 'grn_line_po_mismatch' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = NEW.tenant_id
      AND ingredient_unit.ingredient_id = NEW.ingredient_id
      AND ingredient_unit.unit_id = NEW.entry_unit_id
      AND ingredient_unit.is_active
  ) THEN
    RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503';
  END IF;

  IF v_confirming THEN
    RETURN NEW;
  END IF;

  IF v_owner_price_patch AND TG_OP = 'UPDATE' THEN
    IF NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
       OR NEW.rejected_quantity IS DISTINCT FROM OLD.rejected_quantity
       OR NEW.entry_unit_id IS DISTINCT FROM OLD.entry_unit_id
       OR NEW.po_applied_quantity IS DISTINCT FROM OLD.po_applied_quantity
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
       OR NEW.rejected_photo_url IS DISTINCT FROM OLD.rejected_photo_url THEN
      RAISE EXCEPTION 'confirmed_grn_lines_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.unit_cost > 0 THEN
    NEW.total_cost := private.grn_line_book_total(
      NEW.tenant_id,
      NEW.ingredient_id,
      NEW.received_quantity - NEW.rejected_quantity,
      NEW.entry_unit_id,
      NEW.unit_cost,
      NEW.unit_cost_unit_id
    );
  ELSE
    NEW.total_cost := 0;
  END IF;
  NEW.po_applied_quantity := 0;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION private.enforce_linked_grn_line_immutability() IS
  'Linked GRN line immutability. Draft lines may persist in any active unit of the PO ingredient. Owner-only session flag comtammatu.owner_grn_unit_cost_patch may update confirmed unit_cost / unit_cost_unit_id.';

CREATE OR REPLACE FUNCTION private.suggest_same_supplier_confirmed_grn_unit_cost(
  p_tenant_id bigint,
  p_grn_item_id bigint
) RETURNS TABLE (
  unit_cost numeric,
  unit_cost_unit_id bigint,
  source_grn_item_id bigint,
  source_grn_id bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item public.grn_items%ROWTYPE;
  v_grn public.goods_received_notes%ROWTYPE;
  v_at timestamptz;
BEGIN
  SELECT item.*
  INTO v_item
  FROM public.grn_items AS item
  WHERE item.id = p_grn_item_id
    AND item.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = v_item.grn_id
    AND grn.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_at := coalesce(v_grn.received_date, v_grn.created_at);

  RETURN QUERY
  SELECT
    candidate.unit_cost,
    candidate.unit_cost_unit_id,
    candidate.id,
    candidate.grn_id
  FROM public.grn_items AS candidate
  JOIN public.goods_received_notes AS candidate_grn
    ON candidate_grn.id = candidate.grn_id
   AND candidate_grn.tenant_id = candidate.tenant_id
  WHERE candidate.tenant_id = p_tenant_id
    AND candidate.id <> v_item.id
    AND candidate.ingredient_id = v_item.ingredient_id
    AND candidate.supplier_id = v_item.supplier_id
    AND candidate_grn.status = 'confirmed'
    AND candidate_grn.id <> v_grn.id
    AND candidate.unit_cost > 0
    AND candidate.unit_cost_unit_id IS NOT NULL
    AND candidate.received_quantity - candidate.rejected_quantity > 0
    AND (
      coalesce(candidate_grn.received_date, candidate_grn.created_at) < v_at
      OR (
        coalesce(candidate_grn.received_date, candidate_grn.created_at) = v_at
        AND candidate_grn.id < v_grn.id
      )
    )
  ORDER BY
    coalesce(candidate_grn.received_date, candidate_grn.created_at) DESC,
    candidate_grn.id DESC,
    candidate.id DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION private.suggest_same_supplier_confirmed_grn_unit_cost(
  bigint, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.suggest_same_supplier_confirmed_grn_unit_cost(
  bigint, bigint
) TO service_role;

CREATE OR REPLACE FUNCTION public.list_unpriced_confirmed_grn_lines()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_rows jsonb;
BEGIN
  IF v_actor IS NULL
     OR v_tenant IS NULL
     OR NOT public.auth_is_owner(v_actor) THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(row_payload.payload ORDER BY row_payload.sort_at, row_payload.grn_item_id),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      item.id AS grn_item_id,
      coalesce(grn.received_date, grn.created_at) AS sort_at,
      pg_catalog.jsonb_build_object(
        'grnItemId', item.id,
        'grnId', grn.id,
        'grnNumber', grn.grn_number,
        'ingredientId', item.ingredient_id,
        'ingredientName', ingredient.name,
        'supplierId', item.supplier_id,
        'supplierName', supplier.name,
        'branchId', grn.branch_id,
        'branchName', branch.name,
        'acceptedQuantity', item.received_quantity - item.rejected_quantity,
        'entryUnitId', item.entry_unit_id,
        'entryUnitName', entry_unit.name,
        'unitCostUnitId', item.unit_cost_unit_id,
        'unitCostUnitName', price_unit.name,
        'receivedDate', grn.received_date,
        'suggestedUnitCost', suggestion.unit_cost,
        'suggestedUnitCostUnitId', suggestion.unit_cost_unit_id,
        'suggestedUnitName', suggested_unit.name,
        'suggestedSourceGrnId', suggestion.source_grn_id,
        'suggestedSourceGrnNumber', suggested_grn.grn_number,
        'unitOptions', (
          SELECT coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'unitId', ingredient_unit.unit_id,
                'label', option_unit.name
              )
              ORDER BY ingredient_unit.sort_order, ingredient_unit.id
            ),
            '[]'::jsonb
          )
          FROM public.ingredient_units AS ingredient_unit
          JOIN public.units AS option_unit
            ON option_unit.id = ingredient_unit.unit_id
           AND option_unit.tenant_id = ingredient_unit.tenant_id
          WHERE ingredient_unit.tenant_id = item.tenant_id
            AND ingredient_unit.ingredient_id = item.ingredient_id
            AND ingredient_unit.is_active
        )
      ) AS payload
    FROM public.grn_items AS item
    JOIN public.goods_received_notes AS grn
      ON grn.id = item.grn_id
     AND grn.tenant_id = item.tenant_id
    JOIN public.ingredients AS ingredient
      ON ingredient.id = item.ingredient_id
     AND ingredient.tenant_id = item.tenant_id
    JOIN public.suppliers AS supplier
      ON supplier.id = item.supplier_id
     AND supplier.tenant_id = item.tenant_id
    JOIN public.branches AS branch
      ON branch.id = grn.branch_id
     AND branch.tenant_id = grn.tenant_id
    LEFT JOIN public.units AS entry_unit
      ON entry_unit.id = item.entry_unit_id
     AND entry_unit.tenant_id = item.tenant_id
    LEFT JOIN public.units AS price_unit
      ON price_unit.id = item.unit_cost_unit_id
     AND price_unit.tenant_id = item.tenant_id
    LEFT JOIN LATERAL private.suggest_same_supplier_confirmed_grn_unit_cost(
      item.tenant_id,
      item.id
    ) AS suggestion ON TRUE
    LEFT JOIN public.units AS suggested_unit
      ON suggested_unit.id = suggestion.unit_cost_unit_id
     AND suggested_unit.tenant_id = item.tenant_id
    LEFT JOIN public.goods_received_notes AS suggested_grn
      ON suggested_grn.id = suggestion.source_grn_id
     AND suggested_grn.tenant_id = item.tenant_id
    WHERE item.tenant_id = v_tenant
      AND grn.status = 'confirmed'
      AND item.unit_cost = 0
      AND item.received_quantity - item.rejected_quantity > 0
  ) AS row_payload;

  RETURN pg_catalog.jsonb_build_object(
    'rows', v_rows,
    'total', pg_catalog.jsonb_array_length(v_rows)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_unpriced_confirmed_grn_lines()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_unpriced_confirmed_grn_lines()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.list_unpriced_confirmed_grn_lines() IS
  'Owner-only queue of confirmed GRN lines with unit_cost = 0. Prefills last same-supplier priced confirmed GRN; never auto-writes.';

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

  v_wac := private.project_company_wac(v_tenant, v_item.ingredient_id);

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
  'Owner-only ISS-05 repair: write confirmed GRN unit_cost, append quantity_delta=0 restatement, equalize company WAC. Does not insert grn_receipt qty.';
