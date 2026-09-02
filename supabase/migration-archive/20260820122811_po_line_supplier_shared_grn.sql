-- ADR 0043: PO line supplier_id; nullable PO header; one shared GRN;
-- confirm books one NCC group; invoice matches line NCC.

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS supplier_id bigint;

ALTER TABLE public.purchase_order_items
  DISABLE TRIGGER trg_po_items_retrospective_immutability;

UPDATE public.purchase_order_items AS po_item
SET supplier_id = purchase_order.supplier_id
FROM public.purchase_orders AS purchase_order
WHERE purchase_order.id = po_item.po_id
  AND purchase_order.tenant_id = po_item.tenant_id
  AND po_item.supplier_id IS NULL;

ALTER TABLE public.purchase_order_items
  ENABLE TRIGGER trg_po_items_retrospective_immutability;

ALTER TABLE public.purchase_order_items
  ALTER COLUMN supplier_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'purchase_order_items_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
  END IF;
END;
$$;

ALTER TABLE public.purchase_orders
  ALTER COLUMN supplier_id DROP NOT NULL;

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.grn_items
  DISABLE TRIGGER trg_grn_items_linked_immutability;

UPDATE public.grn_items AS item
SET confirmed_at = coalesce(grn.received_date, grn.updated_at)
FROM public.goods_received_notes AS grn
WHERE grn.id = item.grn_id
  AND grn.tenant_id = item.tenant_id
  AND grn.status = 'confirmed'
  AND item.confirmed_at IS NULL;

ALTER TABLE public.grn_items
  ENABLE TRIGGER trg_grn_items_linked_immutability;

CREATE OR REPLACE FUNCTION public.enforce_supplier_item_line_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_supplier_id bigint;
  v_po_status text;
BEGIN
  IF TG_TABLE_NAME = 'purchase_order_items' THEN
    SELECT purchase_order.status
    INTO v_po_status
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = NEW.po_id
      AND purchase_order.tenant_id = NEW.tenant_id;
    IF v_po_status IN ('draft', 'changes_requested') THEN
      RETURN NEW;
    END IF;
    v_supplier_id := NEW.supplier_id;
  ELSIF TG_TABLE_NAME = 'grn_items' THEN
    v_supplier_id := NEW.supplier_id;
  ELSE
    RAISE EXCEPTION 'unsupported_supplier_item_line_table'
      USING ERRCODE = '22023';
  END IF;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_item_parent_not_found'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_items AS supplier_item
    WHERE supplier_item.tenant_id = NEW.tenant_id
      AND supplier_item.supplier_id = v_supplier_id
      AND supplier_item.ingredient_id = NEW.ingredient_id
      AND supplier_item.is_active
  ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_supplier_items_on_document_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'purchase_orders'
     AND NEW.status IN ('sent', 'approved', 'partially_received')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.purchase_order_items AS po_item
       WHERE po_item.po_id = NEW.id
         AND po_item.tenant_id = NEW.tenant_id
         AND NOT EXISTS (
           SELECT 1
           FROM public.supplier_items AS supplier_item
           WHERE supplier_item.tenant_id = NEW.tenant_id
             AND supplier_item.supplier_id = po_item.supplier_id
             AND supplier_item.ingredient_id = po_item.ingredient_id
             AND supplier_item.is_active
         )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'goods_received_notes'
     AND NEW.status = 'confirmed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1
       FROM public.grn_items AS grn_item
       WHERE grn_item.grn_id = NEW.id
         AND grn_item.tenant_id = NEW.tenant_id
         AND grn_item.confirmed_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.supplier_items AS supplier_item
           WHERE supplier_item.tenant_id = NEW.tenant_id
             AND supplier_item.supplier_id = grn_item.supplier_id
             AND supplier_item.ingredient_id = grn_item.ingredient_id
             AND supplier_item.is_active
         )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

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
    IF v_grn.status = 'draft' AND OLD.confirmed_at IS NULL THEN
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

  SELECT po_item.ingredient_id, po_item.supplier_id
  INTO v_po_item
  FROM public.purchase_order_items AS po_item
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

  IF TG_OP = 'UPDATE' AND OLD.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
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
        AND (
          grn_item.confirmed_at IS NOT NULL
          OR grn.status = 'confirmed'
        )
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
    po_item.supplier_id,
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
      AND (
        grn_item.confirmed_at IS NOT NULL
        OR grn.status = 'confirmed'
      )
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

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_po_id bigint,
  p_supplier_id bigint,
  p_branch_id bigint,
  p_notes text,
  p_needed_by date,
  p_lines jsonb,
  p_submit boolean DEFAULT FALSE,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_po public.purchase_orders%ROWTYPE;
  v_po_id bigint;
  v_po_number text;
  v_status text;
  v_header_supplier bigint;
  v_notes text :=
    pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_notes, '')), '');
  v_line_count integer;
  v_grn jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_po_id IS NULL AND p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'purchase_order_idempotency_required'
      USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'purchase_order_line_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL
     OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
     OR pg_catalog.jsonb_array_length(p_lines) < 1
     OR pg_catalog.jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'purchase_order_line_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active
      AND branch.branch_kind IN ('central_supply', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'purchase_order_central_site_required'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
         <> pg_catalog.count(DISTINCT (
           line.ingredient_id,
           coalesce(line.supplier_id, p_supplier_id)
         ))
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint, supplier_id bigint)
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(
        ingredient_id bigint,
        quantity numeric,
        entry_unit_id bigint,
        supplier_id bigint
      )
    LEFT JOIN public.ingredients AS ingredient
      ON ingredient.id = line.ingredient_id
     AND ingredient.tenant_id = v_tenant
     AND ingredient.is_active
    LEFT JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = v_tenant
     AND ingredient_unit.ingredient_id = line.ingredient_id
     AND ingredient_unit.unit_id = line.entry_unit_id
     AND ingredient_unit.is_active
    LEFT JOIN public.suppliers AS supplier
      ON supplier.id = coalesce(line.supplier_id, p_supplier_id)
     AND supplier.tenant_id = v_tenant
     AND supplier.is_active
    WHERE line.ingredient_id IS NULL
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity <> pg_catalog.round(line.quantity, 3)
       OR line.entry_unit_id IS NULL
       OR coalesce(line.supplier_id, p_supplier_id) IS NULL
       OR ingredient.id IS NULL
       OR ingredient_unit.unit_id IS NULL
       OR supplier.id IS NULL
  ) THEN
    RAISE EXCEPTION 'purchase_order_line_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint)
    JOIN public.ingredients AS ingredient
      ON ingredient.id = line.ingredient_id
     AND ingredient.tenant_id = v_tenant
    WHERE ingredient.item_kind = 'finished_good'
  ) THEN
    RAISE EXCEPTION 'finished_good_not_purchased'
      USING ERRCODE = '23514';
  END IF;

  IF p_submit
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_to_recordset(p_lines)
         AS line(ingredient_id bigint, supplier_id bigint)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.supplier_items AS supplier_item
         JOIN public.suppliers AS supplier
           ON supplier.id = supplier_item.supplier_id
          AND supplier.tenant_id = supplier_item.tenant_id
          AND supplier.is_active
         WHERE supplier_item.tenant_id = v_tenant
           AND supplier_item.supplier_id =
             coalesce(line.supplier_id, p_supplier_id)
           AND supplier_item.ingredient_id = line.ingredient_id
           AND supplier_item.is_active
       )
     ) THEN
    RAISE EXCEPTION 'supplier_item_mapping_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    CASE
      WHEN pg_catalog.count(DISTINCT coalesce(line.supplier_id, p_supplier_id))
        = 1
        THEN pg_catalog.min(coalesce(line.supplier_id, p_supplier_id))
      ELSE NULL
    END
  INTO v_header_supplier
  FROM pg_catalog.jsonb_to_recordset(p_lines)
    AS line(supplier_id bigint);

  IF p_po_id IS NULL THEN
    SELECT purchase_order.*
    INTO v_po
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.tenant_id = v_tenant
      AND purchase_order.save_idempotency_key = p_idempotency_key
    ORDER BY purchase_order.id
    LIMIT 1;

    IF FOUND THEN
      SELECT pg_catalog.jsonb_build_object(
        'grn_id', grn.id,
        'grn_number', grn.grn_number,
        'status', grn.status
      )
      INTO v_grn
      FROM public.goods_received_notes AS grn
      WHERE grn.tenant_id = v_tenant
        AND grn.po_id = v_po.id
        AND grn.status = 'draft'
      ORDER BY grn.id
      LIMIT 1;

      RETURN pg_catalog.jsonb_build_object(
        'po_id', v_po.id,
        'po_number', pg_catalog.coalesce(v_po.display_id, v_po.po_number),
        'status', v_po.status,
        'grn_id', v_grn -> 'grn_id'
      );
    END IF;
  ELSE
    SELECT purchase_order.*
    INTO v_po
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = p_po_id
      AND purchase_order.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.has_permission(
      v_po.branch_id,
      'procurement:po_create'
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF v_po.status NOT IN ('draft', 'changes_requested')
       OR v_po.purchase_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'purchase_order_not_editable'
        USING ERRCODE = '23514';
    END IF;
    v_po_id := v_po.id;
    v_po_number := pg_catalog.coalesce(v_po.display_id, v_po.po_number);
  END IF;

  IF v_po_id IS NULL THEN
    v_po_number := public.next_po_display_id(v_tenant);
    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      purchase_request_id,
      po_number,
      display_id,
      status,
      ordered_at,
      expected_delivery_date,
      notes,
      created_by,
      save_idempotency_key,
      submitted_at,
      submitted_by
    )
    VALUES (
      v_tenant,
      p_branch_id,
      v_header_supplier,
      NULL,
      v_po_number,
      v_po_number,
      'draft',
      pg_catalog.now(),
      p_needed_by,
      v_notes,
      v_uid,
      p_idempotency_key,
      NULL,
      NULL
    )
    RETURNING id INTO v_po_id;
  ELSE
    UPDATE public.purchase_orders
    SET branch_id = p_branch_id,
        supplier_id = v_header_supplier,
        expected_delivery_date = p_needed_by,
        notes = v_notes,
        status = 'draft',
        status_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_po_id
      AND tenant_id = v_tenant;

    DELETE FROM public.purchase_order_items
    WHERE po_id = v_po_id
      AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    purchase_request_item_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    supplier_id
  )
  SELECT
    v_tenant,
    v_po_id,
    NULL,
    line.ingredient_id,
    line.quantity::numeric(15, 3),
    line.entry_unit_id,
    coalesce(line.supplier_id, p_supplier_id)
  FROM pg_catalog.jsonb_to_recordset(p_lines)
    AS line(
      ingredient_id bigint,
      quantity numeric,
      entry_unit_id bigint,
      supplier_id bigint
    );
  GET DIAGNOSTICS v_line_count = ROW_COUNT;
  IF v_line_count < 1 THEN
    RAISE EXCEPTION 'purchase_order_line_invalid'
      USING ERRCODE = '22023';
  END IF;

  v_status := 'draft';
  IF p_submit THEN
    UPDATE public.purchase_orders
    SET status = 'approved',
        submitted_at = pg_catalog.now(),
        submitted_by = v_uid,
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_uid,
        updated_at = pg_catalog.now()
    WHERE id = v_po_id
      AND tenant_id = v_tenant;
    v_status := 'approved';
    v_grn := private.ensure_grn_draft_for_po(
      v_tenant,
      v_po_id,
      v_uid,
      pg_catalog.coalesce(p_idempotency_key, pg_catalog.gen_random_uuid())
    );
  END IF;

  PERFORM public.log_audit(
    CASE
      WHEN p_submit THEN 'procurement.po.submitted'
      ELSE 'procurement.po.draft_saved'
    END,
    'purchase_order',
    v_po_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'po_id', v_po_id,
      'po_number', v_po_number,
      'status', v_status,
      'purchase_request_id', NULL,
      'supplier_id', v_header_supplier,
      'branch_id', p_branch_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'po_id', v_po_id,
    'po_number', v_po_number,
    'status', v_status,
    'grn_id', v_grn -> 'grn_id'
  );
END;
$$;

COMMENT ON FUNCTION public.create_purchase_order(
  bigint, bigint, bigint, text, date, jsonb, boolean, uuid
) IS
  'Warehouse PO without YCM. Line supplier_id required (header nullable when mixed). Send mints one Auto-GRN. Mapping at send.';

DROP FUNCTION IF EXISTS public.confirm_goods_receipt_note(bigint);

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(
  p_grn_id bigint,
  p_supplier_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_po record;
  v_item record;
  v_old_quantity numeric(15,3);
  v_old_wac numeric(15,2);
  v_accepted numeric(15,3);
  v_accepted_base numeric(15,3);
  v_previously_applied numeric(15,3);
  v_remaining numeric(15,3);
  v_remaining_base numeric(15,3);
  v_applied numeric(15,3);
  v_applied_base numeric(15,3);
  v_po_factor numeric;
  v_persist_factor numeric;
  v_applied_money numeric(15,2);
  v_applied_cost_base numeric(15,2);
  v_new_quantity numeric(15,3);
  v_new_wac numeric(15,2);
  v_po_complete boolean;
  v_po_status text;
  v_unconfirmed_suppliers integer;
  v_header_status text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_grn.branch_id,
    'procurement:grn_confirm'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status = 'confirmed'
     AND NOT EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.grn_id = p_grn_id
         AND item.tenant_id = v_tenant
         AND item.confirmed_at IS NULL
     ) THEN
    SELECT po.status
    INTO v_po_status
    FROM public.purchase_orders AS po
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant;

    RETURN pg_catalog.jsonb_build_object(
      'grn_id', p_grn_id,
      'status', 'confirmed',
      'po_id', v_grn.po_id,
      'po_status', v_po_status
    );
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = v_grn.po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND
     OR v_po.status NOT IN ('sent', 'approved', 'partially_received')
     OR v_po.branch_id <> v_grn.branch_id
     OR (
       v_po.supplier_id IS NOT NULL
       AND v_grn.supplier_id IS NOT NULL
       AND v_po.supplier_id <> v_grn.supplier_id
     ) THEN
    RAISE EXCEPTION 'grn_purchase_order_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.count(DISTINCT item.supplier_id)
  INTO v_unconfirmed_suppliers
  FROM public.grn_items AS item
  WHERE item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant
    AND item.confirmed_at IS NULL;

  IF p_supplier_id IS NULL
     AND v_unconfirmed_suppliers > 1
     AND EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.grn_id = p_grn_id
         AND item.tenant_id = v_tenant
         AND item.confirmed_at IS NULL
         AND item.received_quantity - item.rejected_quantity <= 0
     ) THEN
    RAISE EXCEPTION 'grn_supplier_confirm_required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR item.supplier_id = p_supplier_id)
      AND (
        item.received_quantity < 0
        OR item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
        OR (
          item.rejected_quantity > 0
          AND (
            nullif(pg_catalog.btrim(item.rejection_reason), '') IS NULL
            OR NOT private.grn_rejection_photo_exists(
              item.tenant_id,
              item.grn_id,
              item.id,
              item.rejected_photo_url
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR item.supplier_id = p_supplier_id)
      AND item.received_quantity - item.rejected_quantity > 0
      AND item.unit_cost <= 0
  ) THEN
    RAISE EXCEPTION 'grn_unit_price_required'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR item.supplier_id = p_supplier_id)
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_accepted_quantity'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.purchase_order_items AS po_item
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant
  ORDER BY po_item.id
  FOR UPDATE;

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_confirm',
    'true',
    TRUE
  );

  FOR v_item IN
    SELECT
      grn_item.*,
      po_item.quantity AS ordered_quantity,
      po_item.entry_unit_id AS po_entry_unit_id
    FROM public.grn_items AS grn_item
    JOIN public.purchase_order_items AS po_item
      ON po_item.id = grn_item.purchase_order_item_id
     AND po_item.tenant_id = grn_item.tenant_id
     AND po_item.po_id = v_po.id
    WHERE grn_item.grn_id = p_grn_id
      AND grn_item.tenant_id = v_tenant
      AND grn_item.confirmed_at IS NULL
      AND (p_supplier_id IS NULL OR grn_item.supplier_id = p_supplier_id)
      AND grn_item.received_quantity - grn_item.rejected_quantity > 0
    ORDER BY grn_item.id
    FOR UPDATE OF grn_item
  LOOP
    v_accepted := v_item.received_quantity - v_item.rejected_quantity;

    SELECT coalesce(pg_catalog.sum(previous_item.po_applied_quantity), 0)
    INTO v_previously_applied
    FROM public.grn_items AS previous_item
    JOIN public.goods_received_notes AS previous_grn
      ON previous_grn.id = previous_item.grn_id
     AND previous_grn.tenant_id = previous_item.tenant_id
    WHERE previous_item.tenant_id = v_tenant
      AND previous_item.purchase_order_item_id =
        v_item.purchase_order_item_id
      AND (
        previous_item.confirmed_at IS NOT NULL
        OR previous_grn.status = 'confirmed'
      );

    v_remaining := greatest(
      v_item.ordered_quantity - v_previously_applied,
      0
    );
    v_accepted_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_accepted
    );
    v_remaining_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.po_entry_unit_id,
      v_remaining
    );
    v_applied_base := least(v_accepted_base, v_remaining_base);

    SELECT ingredient_unit.to_base_factor
    INTO v_po_factor
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_item.ingredient_id
      AND ingredient_unit.unit_id = v_item.po_entry_unit_id
      AND ingredient_unit.is_active;

    SELECT ingredient_unit.to_base_factor
    INTO v_persist_factor
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_item.ingredient_id
      AND ingredient_unit.unit_id = v_item.entry_unit_id
      AND ingredient_unit.is_active;

    IF v_po_factor IS NULL OR v_po_factor <= 0
       OR v_persist_factor IS NULL OR v_persist_factor <= 0 THEN
      RAISE EXCEPTION 'entry_unit_not_configured' USING ERRCODE = '23503';
    END IF;

    v_applied := pg_catalog.round(v_applied_base / v_po_factor, 3);

    IF v_accepted_base > v_remaining_base THEN
      v_applied := pg_catalog.round(v_accepted_base / v_po_factor, 3);
      UPDATE public.purchase_order_items AS po_line
      SET quantity = v_previously_applied + v_applied
      WHERE po_line.id = v_item.purchase_order_item_id
        AND po_line.tenant_id = v_tenant;
      v_applied_base := v_accepted_base;
    END IF;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_quantity, v_old_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_quantity := 0;
      v_old_wac := NULL;
    END IF;

    v_applied_money := private.grn_line_book_total(
      v_tenant,
      v_item.ingredient_id,
      v_accepted,
      v_item.entry_unit_id,
      v_item.unit_cost,
      v_item.unit_cost_unit_id
    );
    v_applied_cost_base := CASE
      WHEN v_accepted_base > 0
        THEN pg_catalog.round(v_applied_money / v_accepted_base, 2)
      ELSE 0
    END;

    INSERT INTO public.stock_movements (
      tenant_id,
      branch_id,
      ingredient_id,
      type,
      quantity_change,
      reason,
      created_by,
      grn_id,
      unit_cost,
      location_id,
      entry_unit_id,
      entry_quantity
    )
    VALUES (
      v_tenant,
      v_grn.branch_id,
      v_item.ingredient_id,
      'grn_receipt',
      v_accepted_base,
      'GRN ' || v_grn.grn_number,
      v_uid,
      p_grn_id,
      v_applied_cost_base,
      v_grn.location_id,
      v_item.entry_unit_id,
      v_accepted
    );

    v_new_quantity := coalesce(v_old_quantity, 0) + v_accepted_base;
    v_new_wac := CASE
      WHEN v_new_quantity > 0 THEN (
        coalesce(v_old_quantity, 0) * coalesce(v_old_wac, 0)
        + v_applied_money
      ) / v_new_quantity
      ELSE coalesce(v_old_wac, 0)
    END;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_new_wac,
        updated_at = v_now
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.grn_items
    SET po_applied_quantity = v_applied,
        total_cost = v_applied_money,
        cost_pending = FALSE,
        confirmed_at = v_now
    WHERE id = v_item.id
      AND tenant_id = v_tenant;
  END LOOP;

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
    v_tenant,
    p_grn_id,
    po_item.ingredient_id,
    po_item.supplier_id,
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
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND (
        grn_item.confirmed_at IS NOT NULL
        OR grn.status = 'confirmed'
      )
  ) AS received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant
    AND (p_supplier_id IS NULL OR po_item.supplier_id = p_supplier_id)
    AND po_item.quantity > coalesce(received.quantity, 0)
    AND NOT EXISTS (
      SELECT 1
      FROM public.grn_items AS open_item
      WHERE open_item.grn_id = p_grn_id
        AND open_item.tenant_id = v_tenant
        AND open_item.purchase_order_item_id = po_item.id
        AND open_item.confirmed_at IS NULL
    );

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.confirmed_at IS NULL
  ) THEN
    v_header_status := 'confirmed';
    UPDATE public.goods_received_notes
    SET status = 'confirmed',
        received_date = v_now,
        received_by = v_uid,
        updated_at = v_now
    WHERE id = p_grn_id
      AND tenant_id = v_tenant;
  ELSE
    v_header_status := 'draft';
    UPDATE public.goods_received_notes
    SET updated_at = v_now
    WHERE id = p_grn_id
      AND tenant_id = v_tenant;
  END IF;

  SELECT pg_catalog.bool_and(
    coalesce(received.quantity, 0) >= po_item.quantity
  )
  INTO v_po_complete
  FROM public.purchase_order_items AS po_item
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items AS grn_item
    JOIN public.goods_received_notes AS grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND (
        grn_item.confirmed_at IS NOT NULL
        OR grn.status = 'confirmed'
      )
  ) AS received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant;

  v_po_status := CASE
    WHEN coalesce(v_po_complete, FALSE) THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.purchase_orders
  SET status = v_po_status,
      updated_at = v_now
  WHERE id = v_po.id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.confirmed',
    'goods_received_note',
    p_grn_id,
    pg_catalog.to_jsonb(v_grn),
    pg_catalog.jsonb_build_object(
      'status', v_header_status,
      'po_id', v_po.id,
      'po_status', v_po_status,
      'supplier_id', p_supplier_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'grn_id', p_grn_id,
    'status', v_header_status,
    'po_id', v_po.id,
    'po_status', v_po_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint, bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint, bigint)
TO authenticated, service_role;

COMMENT ON FUNCTION public.confirm_goods_receipt_note(bigint, bigint) IS
  'Book unconfirmed GRN lines for one NCC (or remaining priced set). Shared GRN stays draft until every line is booked. Kept qty amends the PO line.';

CREATE OR REPLACE FUNCTION public.close_purchase_order(
  p_po_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.has_permission(v_po.branch_id, 'procurement:po_approve')
    OR public.has_permission(v_po.branch_id, 'procurement:grn_confirm')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'partially_received' THEN
    RAISE EXCEPTION 'purchase_order_not_closable'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.grn_items AS item
  USING public.goods_received_notes AS grn
  WHERE item.grn_id = grn.id
    AND item.tenant_id = v_tenant
    AND grn.tenant_id = v_tenant
    AND grn.po_id = p_po_id
    AND grn.status = 'draft'
    AND item.confirmed_at IS NULL;

  UPDATE public.goods_received_notes AS grn
  SET status = 'confirmed',
      received_date = coalesce(grn.received_date, pg_catalog.now()),
      received_by = coalesce(grn.received_by, v_uid),
      notes = pg_catalog.concat_ws(
        E'\n',
        nullif(grn.notes, ''),
        'Đóng phần còn lại của PO: ' || pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = p_po_id
    AND grn.status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM public.grn_items AS item
      WHERE item.grn_id = grn.id
        AND item.tenant_id = v_tenant
        AND item.confirmed_at IS NOT NULL
    );

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = pg_catalog.concat_ws(
        E'\n',
        nullif(notes, ''),
        'Đóng phần còn lại của PO: ' || pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';

  UPDATE public.purchase_orders
  SET status = 'closed',
      status_reason = pg_catalog.btrim(p_reason),
      closed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.po.closed',
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status', 'closed',
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_po_id,
    'status', 'closed'
  );
END;
$$;

COMMENT ON FUNCTION public.close_purchase_order(bigint, text) IS
  'Close remainder: drop unconfirmed GRN lines; confirm the shared GRN if bookings exist, else cancel the draft.';

DO $patch_invoice$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_supplier_invoice_draft_unchecked'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_invoice_id bigint, p_invoice jsonb, p_lines jsonb, p_allocations jsonb, p_idempotency_key uuid';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'save_supplier_invoice_draft_unchecked missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    $old$       OR grn.status <> 'confirmed'
       OR purchase_order.supplier_id IS DISTINCT FROM v_supplier_id$old$,
    $new$       OR NOT (
         grn.status = 'confirmed'
         OR grn_item.confirmed_at IS NOT NULL
       )
       OR coalesce(
            grn_item.supplier_id,
            po_item.supplier_id,
            purchase_order.supplier_id
          ) IS DISTINCT FROM v_supplier_id$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'invoice booked-line match patch failed';
  END IF;

  v_def := v_updated;
  v_updated := replace(
    v_def,
    $old$    LEFT JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = v_tenant
     AND grn_item.purchase_order_item_id = po_item.id$old$,
    $new$    LEFT JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = grn.id
     AND grn_item.tenant_id = v_tenant
     AND grn_item.purchase_order_item_id = po_item.id
     AND (
       grn_item.confirmed_at IS NOT NULL
       OR grn.status = 'confirmed'
     )$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'invoice booked-line join patch failed';
  END IF;

  v_def := v_updated;
  v_updated := replace(
    v_def,
    $old$    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = requested.grn_id
     AND grn_item.tenant_id = v_tenant
     AND grn_item.purchase_order_item_id =
       requested.purchase_order_item_id$old$,
    $new$    JOIN public.grn_items AS grn_item
      ON grn_item.grn_id = requested.grn_id
     AND grn_item.tenant_id = v_tenant
     AND grn_item.purchase_order_item_id =
       requested.purchase_order_item_id
     AND grn_item.confirmed_at IS NOT NULL$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'invoice over-allocation booked-line patch failed';
  END IF;

  EXECUTE v_updated;
END;
$patch_invoice$;

COMMENT ON FUNCTION public.save_supplier_invoice_draft_unchecked(
  bigint, jsonb, jsonb, jsonb, uuid
) IS
  'Goods invoice allocations match booked GRN lines by line NCC, including a shared draft GRN.';

DO $patch_grn_list$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'list_goods_receipt_notes'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_query text, p_status text, p_supplier_id bigint, p_date_field text, p_date_from date, p_date_to date, p_po_id bigint, p_purchase_request_id bigint, p_branch_id bigint, p_limit integer, p_offset integer';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'list_goods_receipt_notes missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    $old$    JOIN public.suppliers supplier
      ON supplier.id = purchase_order.supplier_id
     AND supplier.tenant_id = purchase_order.tenant_id$old$,
    $new$    LEFT JOIN public.suppliers supplier
      ON supplier.id = purchase_order.supplier_id
     AND supplier.tenant_id = purchase_order.tenant_id$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'GRN list mixed-NCC supplier join patch failed';
  END IF;

  v_def := v_updated;
  v_updated := replace(
    v_def,
    $old$      AND (p_supplier_id IS NULL OR purchase_order.supplier_id = p_supplier_id)$old$,
    $new$      AND (
        p_supplier_id IS NULL
        OR purchase_order.supplier_id = p_supplier_id
        OR EXISTS (
          SELECT 1
          FROM public.grn_items AS line_item
          WHERE line_item.grn_id = grn.id
            AND line_item.tenant_id = grn.tenant_id
            AND line_item.supplier_id = p_supplier_id
        )
      )$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'GRN list mixed-NCC supplier filter patch failed';
  END IF;

  v_def := v_updated;
  v_updated := replace(
    v_def,
    $old$          'supplierName', paged.supplier_name,$old$,
    $new$          'supplierName', CASE
            WHEN paged.list_supplier_id IS NULL THEN 'Nhiều NCC'
            ELSE paged.supplier_name
          END,$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'GRN list mixed-NCC supplier label patch failed';
  END IF;

  EXECUTE v_updated;
END;
$patch_grn_list$;


