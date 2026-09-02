-- Production triage 2026-08-20 follow-up: COALESCE is a SQL keyword, not a
-- pg_catalog function. Prior create_purchase_order and the 133724 trigger
-- rewrite used pg_catalog.coalesce(...), which raises 42883
-- (coalesce(text, unknown) / coalesce(text, text) does not exist) and breaks
-- PO create + GRN save / Auto-GRN inserts.

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
    pg_catalog.nullif(pg_catalog.btrim(COALESCE(p_notes, '')), '');
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
        'po_number', COALESCE(v_po.display_id, v_po.po_number),
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
    v_po_number := COALESCE(v_po.display_id, v_po.po_number);
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
      COALESCE(p_idempotency_key, pg_catalog.gen_random_uuid())
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

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean := COALESCE(
    pg_catalog.current_setting('comtammatu.grn_confirm', TRUE),
    'false'::pg_catalog.text
  ) = 'true';
  v_owner_price_patch boolean := COALESCE(
    pg_catalog.current_setting('comtammatu.owner_grn_unit_cost_patch', TRUE),
    'false'::pg_catalog.text
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
  WHERE grn.id = COALESCE(NEW.grn_id, OLD.grn_id)
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


DO $guard$
DECLARE
  v_create text := pg_get_functiondef(
    'public.create_purchase_order(bigint, bigint, bigint, text, date, jsonb, boolean, uuid)'::regprocedure
  );
  v_trigger text := pg_get_functiondef(
    'private.enforce_linked_grn_line_immutability()'::regprocedure
  );
BEGIN
  IF v_create LIKE '%pg_catalog.coalesce%' THEN
    RAISE EXCEPTION 'create_purchase_order still references pg_catalog.coalesce';
  END IF;
  IF v_trigger LIKE '%pg_catalog.coalesce%' THEN
    RAISE EXCEPTION
      'enforce_linked_grn_line_immutability still references pg_catalog.coalesce';
  END IF;
END;
$guard$;
