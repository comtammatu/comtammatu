CREATE OR REPLACE FUNCTION private.ensure_grn_draft_for_po(
  p_tenant_id bigint,
  p_po_id bigint,
  p_created_by uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_existing record;
  v_location_id bigint;
  v_grn_id bigint;
  v_grn_number text;
  v_line_count integer;
BEGIN
  SELECT grn.id, grn.grn_number, grn.status
  INTO v_existing
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = p_tenant_id
    AND grn.creation_idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'grn_id', v_existing.id,
      'grn_number', v_existing.grn_number,
      'status', v_existing.status
    );
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_po.purchase_request_id IS NULL THEN
    RAISE EXCEPTION 'legacy_po_not_receivable_in_new_flow'
      USING ERRCODE = '23514';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'purchase_order_not_receivable'
      USING ERRCODE = '23514';
  END IF;

  SELECT grn.id, grn.grn_number, grn.status
  INTO v_existing
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = p_tenant_id
    AND grn.po_id = p_po_id
    AND grn.status = 'draft'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'grn_id', v_existing.id,
      'grn_number', v_existing.grn_number,
      'status', v_existing.status
    );
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.branch_id = v_po.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active
    AND location.is_default_receive
  ORDER BY location.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'receiving_warehouse_required'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items AS po_item
    LEFT JOIN LATERAL (
      SELECT sum(grn_item.po_applied_quantity) AS quantity
      FROM public.grn_items AS grn_item
      JOIN public.goods_received_notes AS grn
        ON grn.id = grn_item.grn_id
       AND grn.tenant_id = grn_item.tenant_id
      WHERE grn_item.tenant_id = p_tenant_id
        AND grn_item.purchase_order_item_id = po_item.id
        AND grn.status = 'confirmed'
    ) AS received ON TRUE
    WHERE po_item.po_id = p_po_id
      AND po_item.tenant_id = p_tenant_id
      AND po_item.quantity > COALESCE(received.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'purchase_order_fully_received'
      USING ERRCODE = '02000';
  END IF;

  v_grn_number := public.next_inventory_doc_number(p_tenant_id, 'grn');
  PERFORM set_config('comtammatu.po_first_grn_insert', 'true', TRUE);

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    po_id,
    supplier_id,
    grn_number,
    received_date,
    expected_receive_date,
    status,
    notes,
    created_by,
    location_id,
    creation_idempotency_key
  )
  VALUES (
    p_tenant_id,
    v_po.branch_id,
    v_po.id,
    v_po.supplier_id,
    v_grn_number,
    NULL,
    v_po.expected_delivery_date,
    'draft',
    NULL,
    p_created_by,
    v_location_id,
    p_idempotency_key
  )
  RETURNING id INTO v_grn_id;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    purchase_order_item_id,
    received_quantity,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url,
    entry_unit_id,
    unit_cost,
    total_cost,
    po_applied_quantity
  )
  SELECT
    p_tenant_id,
    v_grn_id,
    po_item.ingredient_id,
    v_po.supplier_id,
    po_item.id,
    0,
    0,
    NULL,
    NULL,
    po_item.entry_unit_id,
    po_item.unit_price_est,
    0,
    0
  FROM public.purchase_order_items AS po_item
  LEFT JOIN LATERAL (
    SELECT sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items AS grn_item
    JOIN public.goods_received_notes AS grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = p_tenant_id
      AND grn_item.purchase_order_item_id = po_item.id
      AND grn.status = 'confirmed'
  ) AS received ON TRUE
  WHERE po_item.po_id = p_po_id
    AND po_item.tenant_id = p_tenant_id
    AND po_item.quantity > COALESCE(received.quantity, 0)
  ORDER BY po_item.id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'status', 'draft',
    'line_count', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_grn_draft_for_po(
  bigint,
  bigint,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_grn_draft_from_po(
  p_po_id bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_branch_id bigint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_po_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'grn_create_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT purchase_order.branch_id
  INTO v_branch_id
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN private.ensure_grn_draft_for_po(
    v_tenant,
    p_po_id,
    v_uid,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grn_draft_from_po(bigint, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_grn_draft_from_po(bigint, uuid)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ensure_grn_draft_after_po_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM private.ensure_grn_draft_for_po(
    NEW.tenant_id,
    NEW.id,
    COALESCE(auth.uid(), NEW.created_by),
    gen_random_uuid()
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_grn_draft_after_po_status()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ensure_grn_draft_after_po_status
ON public.purchase_orders;

CREATE TRIGGER ensure_grn_draft_after_po_status
AFTER UPDATE OF status ON public.purchase_orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status IN ('sent', 'partially_received')
)
EXECUTE FUNCTION private.ensure_grn_draft_after_po_status();

DO $$
DECLARE
  v_po record;
BEGIN
  FOR v_po IN
    SELECT purchase_order.*
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.status IN ('sent', 'partially_received')
      AND purchase_order.purchase_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.inventory_locations AS location
        WHERE location.tenant_id = purchase_order.tenant_id
          AND location.branch_id = purchase_order.branch_id
          AND location.location_kind = 'warehouse'
          AND location.is_active
          AND location.is_default_receive
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.goods_received_notes AS grn
        WHERE grn.tenant_id = purchase_order.tenant_id
          AND grn.po_id = purchase_order.id
          AND grn.status = 'draft'
      )
      AND EXISTS (
        SELECT 1
        FROM public.purchase_order_items AS po_item
        LEFT JOIN LATERAL (
          SELECT sum(grn_item.po_applied_quantity) AS quantity
          FROM public.grn_items AS grn_item
          JOIN public.goods_received_notes AS grn
            ON grn.id = grn_item.grn_id
           AND grn.tenant_id = grn_item.tenant_id
          WHERE grn_item.tenant_id = purchase_order.tenant_id
            AND grn_item.purchase_order_item_id = po_item.id
            AND grn.status = 'confirmed'
        ) AS received ON TRUE
        WHERE po_item.po_id = purchase_order.id
          AND po_item.tenant_id = purchase_order.tenant_id
          AND po_item.quantity > COALESCE(received.quantity, 0)
      )
    ORDER BY purchase_order.id
  LOOP
    PERFORM private.ensure_grn_draft_for_po(
      v_po.tenant_id,
      v_po.id,
      v_po.created_by,
      gen_random_uuid()
    );
  END LOOP;
END;
$$;
