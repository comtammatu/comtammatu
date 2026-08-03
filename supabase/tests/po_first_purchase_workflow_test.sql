\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner uuid := pg_catalog.gen_random_uuid();
  v_tenant bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.positions AS position
      ON position.id = profile.position_id
     AND position.tenant_id = profile.tenant_id
    WHERE position.code = 'owner'
      AND coalesce(profile.is_active, TRUE)
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.tenants
    ALTER CONSTRAINT tenants_owner_user_id_fkey
    DEFERRABLE INITIALLY DEFERRED;
  SET CONSTRAINTS tenants_owner_user_id_fkey DEFERRED;

  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    '__po_first_' || v_owner::text,
    '__po_first_' || v_owner::text,
    v_owner
  )
  RETURNING id INTO v_tenant;

  INSERT INTO public.positions (
    tenant_id,
    code,
    label_vi,
    label_en,
    is_active,
    is_system
  )
  VALUES (v_tenant, 'owner', 'Chủ', 'Owner', TRUE, TRUE);

  INSERT INTO public.role_templates (
    tenant_id,
    name,
    position_code,
    permission_keys,
    is_system
  )
  VALUES (v_tenant, 'owner', 'owner', '{}'::text[], TRUE);

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active,
    code
  )
  VALUES (
    v_tenant,
    '__po_first_central_' || v_owner::text,
    'central_supply',
    TRUE,
    NULL
  );

  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_owner,
    'po-first-owner-' || v_owner::text || '@example.invalid',
    pg_catalog.jsonb_build_object(
      'tenant_id', v_tenant,
      'position_code', 'owner'
    ),
    pg_catalog.jsonb_build_object('full_name', 'PO first owner')
  );
END;
$$;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_unit bigint;
  v_ingredient_a bigint;
  v_ingredient_b bigint;
  v_missing_ingredient bigint;
  v_supplier_a bigint;
  v_supplier_b bigint;
  v_key uuid := pg_catalog.gen_random_uuid();
  v_missing_result jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_review jsonb;
  v_invoice_result jsonb;
  v_followup_result jsonb;
  v_followup_review jsonb;
  v_group_key uuid;
  v_po_id bigint;
  v_grn_id bigint;
  v_po_item_id bigint;
  v_line_ingredient_id bigint;
  v_line_unit_id bigint;
  v_line_quantity numeric;
  v_invoice_id bigint;
  v_po_count integer;
  v_grn_count integer;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.save_purchase_order_group(uuid,bigint,date,text,jsonb,boolean,uuid)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.review_purchase_order(bigint,text,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'PO FIRST: required RPCs are missing';
  END IF;

  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id
  INTO v_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'PO FIRST: seeded owner/site fixture missing';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__po_first_' || pg_catalog.substr(
      pg_catalog.gen_random_uuid()::text,
      1,
      8
    ),
    'PO first test unit'
  )
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active,
    receipt_unit_id,
    issue_unit_id,
    production_unit_id
  )
  VALUES
    (
      v_tenant,
      '__po_first_a_' || pg_catalog.gen_random_uuid()::text,
      '__POF-A-' || pg_catalog.gen_random_uuid()::text,
      0,
      'raw_material',
      'central_supply',
      TRUE,
      v_unit,
      v_unit,
      v_unit
    ),
    (
      v_tenant,
      '__po_first_b_' || pg_catalog.gen_random_uuid()::text,
      '__POF-B-' || pg_catalog.gen_random_uuid()::text,
      0,
      'raw_material',
      'central_supply',
      TRUE,
      v_unit,
      v_unit,
      v_unit
    ),
    (
      v_tenant,
      '__po_first_missing_' || pg_catalog.gen_random_uuid()::text,
      '__POF-M-' || pg_catalog.gen_random_uuid()::text,
      0,
      'raw_material',
      'central_supply',
      TRUE,
      v_unit,
      v_unit,
      v_unit
    );

  SELECT ingredient.id
  INTO v_ingredient_a
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.sku LIKE '__POF-A-%'
  ORDER BY ingredient.id DESC
  LIMIT 1;

  SELECT ingredient.id
  INTO v_ingredient_b
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.sku LIKE '__POF-B-%'
  ORDER BY ingredient.id DESC
  LIMIT 1;

  SELECT ingredient.id
  INTO v_missing_ingredient
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = v_tenant
    AND ingredient.sku LIKE '__POF-M-%'
  ORDER BY ingredient.id DESC
  LIMIT 1;

  INSERT INTO public.ingredient_units (
    tenant_id,
    ingredient_id,
    unit_id,
    to_base_factor,
    is_base,
    is_active
  )
  VALUES
    (v_tenant, v_ingredient_a, v_unit, 1, TRUE, TRUE),
    (v_tenant, v_ingredient_b, v_unit, 1, TRUE, TRUE),
    (v_tenant, v_missing_ingredient, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES
    (
      v_tenant,
      '__po_first_supplier_a_' || pg_catalog.gen_random_uuid()::text,
      TRUE
    ),
    (
      v_tenant,
      '__po_first_supplier_b_' || pg_catalog.gen_random_uuid()::text,
      TRUE
    );

  SELECT supplier.id
  INTO v_supplier_a
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND supplier.name LIKE '__po_first_supplier_a_%'
  ORDER BY supplier.id DESC
  LIMIT 1;

  SELECT supplier.id
  INTO v_supplier_b
  FROM public.suppliers AS supplier
  WHERE supplier.tenant_id = v_tenant
    AND supplier.name LIKE '__po_first_supplier_b_%'
  ORDER BY supplier.id DESC
  LIMIT 1;

  INSERT INTO public.supplier_items (
    tenant_id,
    supplier_id,
    ingredient_id,
    is_active,
    is_preferred,
    created_by
  )
  VALUES
    (v_tenant, v_supplier_a, v_ingredient_a, TRUE, TRUE, v_owner),
    (v_tenant, v_supplier_b, v_ingredient_b, TRUE, TRUE, v_owner);

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    v_owner::text,
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.role',
    'authenticated',
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'branch_id', v_branch
      )
    )::text,
    TRUE
  );

  v_missing_result := public.save_purchase_order_group(
    NULL,
    v_branch,
    CURRENT_DATE + 1,
    'Missing supplier must block the whole group',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_a,
        'entry_unit_id', v_unit,
        'quantity', 2
      ),
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_missing_ingredient,
        'entry_unit_id', v_unit,
        'quantity', 3
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );

  IF (v_missing_result->>'ok')::boolean
     OR v_missing_result->>'error_code' <> 'supplier_default_missing'
     OR pg_catalog.jsonb_array_length(
       v_missing_result->'missing_supplier_items'
     ) <> 1 THEN
    RAISE EXCEPTION 'PO FIRST: missing supplier response is invalid: %',
      v_missing_result;
  END IF;

  v_result := public.save_purchase_order_group(
    NULL,
    v_branch,
    CURRENT_DATE + 1,
    'Two suppliers, one atomic group',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_a,
        'entry_unit_id', v_unit,
        'quantity', 2
      ),
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_b,
        'entry_unit_id', v_unit,
        'quantity', 3
      )
    ),
    TRUE,
    v_key
  );
  v_replay := public.save_purchase_order_group(
    NULL,
    v_branch,
    CURRENT_DATE + 1,
    'Replay must return the same group',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_a,
        'entry_unit_id', v_unit,
        'quantity', 999
      )
    ),
    TRUE,
    v_key
  );

  IF v_result <> v_replay
     OR NOT (v_result->>'ok')::boolean
     OR pg_catalog.jsonb_array_length(v_result->'purchase_orders') <> 2 THEN
    RAISE EXCEPTION 'PO FIRST: atomic group/replay contract failed: % / %',
      v_result,
      v_replay;
  END IF;

  v_group_key := (v_result->>'purchase_group_key')::uuid;

  SELECT count(*)
  INTO v_po_count
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = v_tenant
    AND po.purchase_group_key = v_group_key
    AND po.status = 'pending_approval'
    AND po.display_id ~ '-0[12]$';

  IF v_po_count <> 2
     OR EXISTS (
       SELECT 1
       FROM public.purchase_order_items AS item
       JOIN public.purchase_orders AS po
         ON po.id = item.po_id
        AND po.tenant_id = item.tenant_id
       WHERE po.tenant_id = v_tenant
         AND po.purchase_group_key = v_group_key
         AND (
           item.unit_price_est IS NOT NULL
           OR item.line_total IS NOT NULL
         )
     ) THEN
    RAISE EXCEPTION 'PO FIRST: split code or price-free PO contract failed';
  END IF;

  SELECT po.id
  INTO v_po_id
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = v_tenant
    AND po.purchase_group_key = v_group_key
  ORDER BY po.group_sequence
  LIMIT 1;

  v_review := public.review_purchase_order(v_po_id, 'approve', NULL);
  PERFORM public.review_purchase_order(v_po_id, 'approve', NULL);

  SELECT count(*)
  INTO v_grn_count
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_po_id
    AND grn.status = 'draft';

  IF v_review->>'status' <> 'approved' OR v_grn_count <> 1 THEN
    RAISE EXCEPTION 'PO FIRST: approve did not create exactly one GRN: %',
      v_review;
  END IF;

  v_grn_id := (v_review->'grn'->>'grn_id')::bigint;

  SELECT
    po_item.id,
    po_item.ingredient_id,
    po_item.entry_unit_id,
    po_item.quantity
  INTO
    v_po_item_id,
    v_line_ingredient_id,
    v_line_unit_id,
    v_line_quantity
  FROM public.purchase_order_items AS po_item
  WHERE po_item.tenant_id = v_tenant
    AND po_item.po_id = v_po_id
  ORDER BY po_item.id
  LIMIT 1;

  UPDATE public.grn_items
  SET received_quantity = v_line_quantity
  WHERE tenant_id = v_tenant
    AND grn_id = v_grn_id
    AND purchase_order_item_id = v_po_item_id;

  PERFORM public.confirm_goods_receipt_note(v_grn_id);

  v_invoice_result := public.save_supplier_invoice_draft(
    NULL,
    pg_catalog.jsonb_build_object(
      'supplier_id',
      (
        SELECT po.supplier_id
        FROM public.purchase_orders AS po
        WHERE po.id = v_po_id
      ),
      'invoice_kind', 'goods',
      'invoice_date', CURRENT_DATE,
      'due_date', CURRENT_DATE + 7,
      'document_discount_amount', 0,
      'subtotal', v_line_quantity * 100,
      'vat_amount', v_line_quantity * 8,
      'total_amount', v_line_quantity * 108,
      'matching_notes', 'PO first invoice test'
    ),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_key', 'line-1',
        'ingredient_id', v_line_ingredient_id,
        'description', 'PO first ingredient',
        'quantity', v_line_quantity,
        'unit_id', v_line_unit_id,
        'unit_price', 100,
        'gross_line_total', v_line_quantity * 108,
        'line_discount', 0,
        'vat_rate', 8,
        'vat_amount', v_line_quantity * 8,
        'line_total', v_line_quantity * 100
      )
    ),
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_key', 'line-1',
        'grn_id', v_grn_id,
        'po_id', v_po_id,
        'purchase_order_item_id', v_po_item_id,
        'quantity', v_line_quantity
      )
    ),
    pg_catalog.gen_random_uuid()
  );
  v_invoice_id := (v_invoice_result->>'invoice_id')::bigint;

  IF v_invoice_result->>'matching_status' <> 'matched' THEN
    RAISE EXCEPTION 'PO FIRST: invoice line matching failed: %',
      v_invoice_result;
  END IF;

  PERFORM public.confirm_supplier_invoice(
    v_invoice_id,
    pg_catalog.gen_random_uuid()
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_ingredient_price_history AS price
    WHERE price.tenant_id = v_tenant
      AND price.supplier_invoice_id = v_invoice_id
      AND price.ingredient_id = v_line_ingredient_id
      AND price.unit_id = v_line_unit_id
      AND price.unit_price = 100
  ) THEN
    RAISE EXCEPTION
      'PO FIRST: confirmed invoice did not publish price history';
  END IF;

  v_followup_result := public.save_purchase_order_group(
    NULL,
    v_branch,
    CURRENT_DATE + 2,
    'Latest supplier invoice cost snapshot',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_line_ingredient_id,
        'entry_unit_id', v_line_unit_id,
        'quantity', 1
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );

  v_followup_review := public.review_purchase_order(
    (v_followup_result->'purchase_orders'->0->>'po_id')::bigint,
    'approve',
    NULL
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.tenant_id = v_tenant
      AND item.grn_id =
        (v_followup_review->'grn'->>'grn_id')::bigint
      AND item.ingredient_id = v_line_ingredient_id
      AND item.entry_unit_id = v_line_unit_id
      AND item.unit_cost = 0
      AND item.cost_pending = TRUE
      AND item.provisional_cost_source = 'pending'
  ) THEN
    RAISE EXCEPTION
      'PO FIRST: new receipt reused historical invoice cost';
  END IF;
END;
$$;

ROLLBACK;
