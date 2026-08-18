-- ADR 0041: Auto-GRN drafts stay unpriced. Warehouse books unit_cost on the
-- receipt. Seeding WAC/reference into unit_cost without unit_cost_unit_id
-- raises grn_unit_price_unit_required and blocks review_purchase_demand.

CREATE OR REPLACE FUNCTION private.ensure_grn_draft_for_po(
  p_tenant_id bigint,
  p_po_id bigint,
  p_created_by uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
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
    AND grn.po_id = p_po_id
    AND grn.status = 'draft'
  ORDER BY grn.id
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'grn_id', v_existing.id,
      'grn_number', v_existing.grn_number,
      'status', v_existing.status
    );
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_po.status NOT IN ('sent', 'approved', 'partially_received') THEN
    RAISE EXCEPTION 'purchase_order_not_receivable'
      USING ERRCODE = '23514';
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
      SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
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
      AND po_item.quantity > coalesce(received.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'purchase_order_fully_received'
      USING ERRCODE = '02000';
  END IF;

  v_grn_number := public.next_inventory_doc_number(p_tenant_id, 'grn');
  PERFORM pg_catalog.set_config(
    'comtammatu.po_first_grn_insert',
    'true',
    TRUE
  );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    po_id,
    supplier_id,
    grn_number,
    expected_receive_date,
    status,
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
    v_po.expected_delivery_date,
    'draft',
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
    entry_unit_id,
    unit_cost,
    unit_cost_unit_id,
    total_cost,
    po_applied_quantity,
    cost_pending,
    provisional_cost_source
  )
  SELECT
    p_tenant_id,
    v_grn_id,
    po_item.ingredient_id,
    v_po.supplier_id,
    po_item.id,
    0,
    0,
    po_item.entry_unit_id,
    0,
    po_item.entry_unit_id,
    0,
    0,
    TRUE,
    'pending'
  FROM public.purchase_order_items AS po_item
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
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
    AND po_item.quantity > coalesce(received.quantity, 0)
  ORDER BY po_item.id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'status', 'draft',
    'line_count', v_line_count
  );
END;
$$;
