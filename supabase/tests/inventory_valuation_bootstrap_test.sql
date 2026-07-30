\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_definition text;
  v_constraint text;
  v_authenticated_acl aclitem[];
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO v_constraint
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conname =
    'supplier_invoice_receipt_allocations_valuation_status_check'
    AND constraint_row.conrelid =
      'public.supplier_invoice_receipt_allocations'::pg_catalog.regclass;
  IF v_constraint !~ '''opening''' THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: opening provenance status is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid), procedure.proacl
  INTO v_definition, v_authenticated_acl
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.get_inventory_valuation_bootstrap_readiness()'::pg_catalog.regprocedure;
  IF v_definition !~ 'public.auth_is_owner'
     OR v_definition !~ 'inventory:valuation_read'
     OR v_definition !~ 'private.inventory_valuation_bootstrap_readiness'
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: readiness authorization is incomplete';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_inventory_valuation_bootstrap_readiness()',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.get_inventory_valuation_bootstrap_readiness()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: readiness grants are incorrect';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.inventory_valuation_bootstrap_allocation_values(bigint)'::pg_catalog.regprocedure;
  IF v_definition !~ 'document_discount_amount'
     OR v_definition !~ 'position = ranked.line_count'
     OR v_definition !~ 'UNBOUNDED PRECEDING AND 1 PRECEDING'
     OR v_definition !~ 'inv_to_base_for_tenant'
     OR v_definition !~ 'allocation_position = provisional.allocation_count'
     OR v_definition !~ 'ORDER BY line.id, allocation.grn_item_id, allocation.id'
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: net allocation formula is incomplete';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.inventory_valuation_bootstrap_readiness(bigint)'::pg_catalog.regprocedure;
  IF v_definition !~ 'inventory_valuation_bootstrap_missing_invoice_coverage'
     OR v_definition !~ 'inventory_valuation_bootstrap_unsupported_movement'
     OR v_definition !~ 'inventory_valuation_bootstrap_ledger_not_pristine'
     OR v_definition !~ 'inventory_valuation_bootstrap_zero_value_pool'
     OR v_definition !~ 'inventory_valuation_bootstrap_cutover_exists'
     OR v_definition !~ 'inventory_valuation_quantity_drift'
     OR v_definition !~ 'coalesce\(billed.billed_base_quantity, 0\)'
     OR v_definition !~ 'grn_receipt'
     OR v_definition !~ 'grn_amend'
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: readiness blockers are incomplete';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'private.bootstrap_inventory_valuation_from_invoices(bigint)'::pg_catalog.regprocedure;
  IF v_definition !~ 'UPDATE public.stock_levels'
     OR v_definition !~ 'valuation_status = ''opening'''
     OR v_definition !~ 'inventory_valuation_bootstrap_value_not_representable'
     OR v_definition ~ 'UPDATE public.stock_movements'
     OR v_definition ~ 'UPDATE public.grn_items'
     OR v_definition ~ 'unit_price_est'
     OR v_definition ~ 'ingredients.unit_cost'
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: mutation boundary is invalid';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.activate_inventory_valuation_cutover(uuid)'::pg_catalog.regprocedure;
  IF v_definition !~ 'inventory_valuation_shadow_period_incomplete'
     OR v_definition !~ 'interval ''7 days'''
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: seven-day shadow gate is missing';
  END IF;

  IF pg_catalog.has_function_privilege(
    'service_role',
    'private.prepare_inventory_valuation_cutover_prebootstrap(uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.activate_inventory_valuation_cutover_prebootstrap(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: service role can bypass public wrappers';
  END IF;

  IF private.inventory_valuation_bootstrap_value_is_representable(
    2000000,
    1.01
  ) OR NOT private.inventory_valuation_bootstrap_value_is_representable(
    10,
    500
  ) THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: cent representability helper is invalid';
  END IF;
END;
$$;

DO $$
DECLARE
  v_owner uuid := pg_catalog.gen_random_uuid();
  v_tenant bigint;
  v_branch bigint;
  v_location bigint;
  v_unit bigint;
  v_ingredient_a bigint;
  v_ingredient_b bigint;
  v_ingredient_c bigint;
  v_supplier bigint;
  v_po bigint;
  v_po_item_a bigint;
  v_po_item_b bigint;
  v_po_item_c bigint;
  v_grn bigint;
  v_grn_item_a bigint;
  v_grn_item_b bigint;
  v_grn_item_c bigint;
  v_invoice_partial bigint;
  v_invoice_final bigint;
  v_line_partial bigint;
  v_line_final_a bigint;
  v_line_final_b bigint;
  v_over_invoice bigint;
  v_over_line bigint;
  v_prepare_key uuid := pg_catalog.gen_random_uuid();
  v_activate_key uuid := pg_catalog.gen_random_uuid();
  v_readiness jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_history_before text;
  v_history_after text;
  v_amount numeric;
  v_count integer;
  v_blocked boolean;
BEGIN
  ALTER TABLE public.tenants
    ALTER CONSTRAINT tenants_owner_user_id_fkey
    DEFERRABLE INITIALLY DEFERRED;
  SET CONSTRAINTS tenants_owner_user_id_fkey DEFERRED;

  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    '__valuation_bootstrap_' || v_owner::text,
    '__valuation_bootstrap_' || v_owner::text,
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
  VALUES (
    v_tenant,
    'owner',
    'owner',
    ARRAY['inventory:valuation_read']::text[],
    TRUE
  );

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active,
    code
  )
  VALUES (
    v_tenant,
    '__valuation_bootstrap_central__',
    'central_supply',
    TRUE,
    NULL
  )
  RETURNING id INTO v_branch;

  SELECT location.id
  INTO v_location
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_branch
    AND location.is_active
    AND location.location_kind = 'warehouse'
  ORDER BY location.id
  LIMIT 1;

  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    v_owner,
    'valuation-bootstrap-' || v_owner::text || '@example.invalid',
    pg_catalog.jsonb_build_object(
      'tenant_id', v_tenant,
      'position_code', 'owner',
      'branch_id', v_branch
    ),
    pg_catalog.jsonb_build_object(
      'full_name',
      'Valuation bootstrap owner'
    )
  );

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, 'bootstrap_unit', 'Bootstrap unit')
  RETURNING id INTO v_unit;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active
  )
  VALUES (
    v_tenant,
    'Bootstrap ingredient A',
    '__VALUATION-BOOTSTRAP-A__',
    0,
    'raw_material',
    'central_supply',
    TRUE
  )
  RETURNING id INTO v_ingredient_a;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active
  )
  VALUES (
    v_tenant,
    'Bootstrap ingredient B',
    '__VALUATION-BOOTSTRAP-B__',
    0,
    'raw_material',
    'central_supply',
    TRUE
  )
  RETURNING id INTO v_ingredient_b;

  INSERT INTO public.ingredients (
    tenant_id,
    name,
    sku,
    unit_cost,
    item_kind,
    default_fulfill_site_kind,
    is_active
  )
  VALUES (
    v_tenant,
    'Bootstrap zero accepted ingredient',
    '__VALUATION-BOOTSTRAP-ZERO__',
    0,
    'raw_material',
    'central_supply',
    TRUE
  )
  RETURNING id INTO v_ingredient_c;

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
    (v_tenant, v_ingredient_c, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (v_tenant, 'Bootstrap supplier', TRUE)
  RETURNING id INTO v_supplier;

  INSERT INTO public.supplier_items (
    tenant_id,
    supplier_id,
    ingredient_id,
    is_active,
    created_by
  )
  VALUES
    (v_tenant, v_supplier, v_ingredient_a, TRUE, v_owner),
    (v_tenant, v_supplier, v_ingredient_b, TRUE, v_owner),
    (v_tenant, v_supplier, v_ingredient_c, TRUE, v_owner);

  INSERT INTO public.purchase_orders (
    tenant_id,
    branch_id,
    supplier_id,
    po_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch,
    v_supplier,
    '__VALUATION-BOOTSTRAP-PO__',
    'draft',
    v_owner
  )
  RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    ingredient_id,
    quantity,
    unit_price_est,
    line_total,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_po,
    v_ingredient_a,
    10,
    0,
    0,
    v_unit
  )
  RETURNING id INTO v_po_item_a;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    ingredient_id,
    quantity,
    unit_price_est,
    line_total,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_po,
    v_ingredient_b,
    5,
    0,
    0,
    v_unit
  )
  RETURNING id INTO v_po_item_b;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    ingredient_id,
    quantity,
    unit_price_est,
    line_total,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_po,
    v_ingredient_c,
    1,
    0,
    0,
    v_unit
  )
  RETURNING id INTO v_po_item_c;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.role',
    'service_role',
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'comtammatu.grn_recovery_insert',
    'true',
    TRUE
  );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    location_id,
    po_id,
    supplier_id,
    grn_number,
    status,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch,
    v_location,
    v_po,
    v_supplier,
    '__VALUATION-BOOTSTRAP-GRN__',
    'draft',
    v_owner
  )
  RETURNING id INTO v_grn;

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_recovery_insert',
    'false',
    TRUE
  );

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    purchase_order_item_id,
    received_quantity,
    rejected_quantity,
    unit_cost,
    total_cost,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_grn,
    v_ingredient_a,
    v_supplier,
    v_po_item_a,
    10,
    0,
    0,
    0,
    v_unit
  )
  RETURNING id INTO v_grn_item_a;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    purchase_order_item_id,
    received_quantity,
    rejected_quantity,
    unit_cost,
    total_cost,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_grn,
    v_ingredient_b,
    v_supplier,
    v_po_item_b,
    5,
    0,
    0,
    0,
    v_unit
  )
  RETURNING id INTO v_grn_item_b;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    purchase_order_item_id,
    received_quantity,
    rejected_quantity,
    unit_cost,
    total_cost,
    entry_unit_id
  )
  VALUES (
    v_tenant,
    v_grn,
    v_ingredient_c,
    v_supplier,
    v_po_item_c,
    0,
    0,
    0,
    0,
    v_unit
  )
  RETURNING id INTO v_grn_item_c;

  UPDATE public.purchase_orders
  SET status = 'sent'
  WHERE id = v_po;

  UPDATE public.goods_received_notes
  SET status = 'confirmed'
  WHERE id = v_grn;

  UPDATE public.purchase_orders
  SET status = 'received'
  WHERE id = v_po;

  INSERT INTO public.stock_movements (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    type,
    quantity_change,
    grn_id,
    grn_item_id,
    entry_unit_id,
    entry_quantity,
    unit_cost,
    reason,
    created_by
  )
  VALUES
    (
      v_tenant,
      v_branch,
      v_location,
      v_ingredient_a,
      'grn_receipt',
      1,
      v_grn,
      v_grn_item_a,
      v_unit,
      1,
      0,
      '__valuation_bootstrap_initial__',
      v_owner
    ),
    (
      v_tenant,
      v_branch,
      v_location,
      v_ingredient_a,
      'grn_amend',
      9,
      v_grn,
      v_grn_item_a,
      v_unit,
      9,
      0,
      '__valuation_bootstrap_amend__',
      v_owner
    ),
    (
      v_tenant,
      v_branch,
      v_location,
      v_ingredient_b,
      'grn_receipt',
      5,
      v_grn,
      v_grn_item_b,
      v_unit,
      5,
      0,
      '__valuation_bootstrap_receipt_b__',
      v_owner
    );

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    grn_id,
    po_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    matching_status,
    created_by,
    invoice_kind,
    document_status,
    document_discount_amount,
    vat_breakdown,
    confirmed_at,
    confirmed_by
  )
  VALUES (
    v_tenant,
    v_supplier,
    v_grn,
    v_po,
    '__VALUATION-BOOTSTRAP-PARTIAL__',
    pg_catalog.now(),
    50,
    0,
    0,
    50,
    'matched',
    v_owner,
    'goods',
    'confirmed',
    0,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 50,
        'vat_amount', 0
      )
    ),
    pg_catalog.now(),
    v_owner
  )
  RETURNING id INTO v_invoice_partial;

  INSERT INTO public.supplier_invoice_lines (
    tenant_id,
    supplier_invoice_id,
    ingredient_id,
    description,
    quantity,
    unit_price,
    line_discount_amount,
    allocated_document_discount,
    line_total,
    unit_id,
    vat_rate,
    vat_amount
  )
  VALUES (
    v_tenant,
    v_invoice_partial,
    v_ingredient_a,
    'Bootstrap partial line',
    1,
    50,
    0,
    0,
    50,
    v_unit,
    0,
    0
  )
  RETURNING id INTO v_line_partial;

  INSERT INTO public.supplier_invoice_receipt_allocations (
    tenant_id,
    supplier_invoice_id,
    grn_id,
    grn_item_id,
    po_id,
    purchase_order_item_id,
    invoice_line_id,
    billed_quantity,
    matched_quantity
  )
  VALUES (
    v_tenant,
    v_invoice_partial,
    v_grn,
    v_grn_item_a,
    v_po,
    v_po_item_a,
    v_line_partial,
    1,
    1
  );

  INSERT INTO public.inventory_valuation_cutovers (
    tenant_id,
    status,
    idempotency_key
  )
  VALUES (v_tenant, 'inactive', pg_catalog.gen_random_uuid());

  v_readiness :=
    private.inventory_valuation_bootstrap_readiness(v_tenant);
  IF (v_readiness->>'can_prepare')::boolean
     OR NOT (
       v_readiness->'blockers'
       ? 'inventory_valuation_bootstrap_cutover_exists'
     ) THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: inactive cutover row was not blocked: %',
      v_readiness;
  END IF;

  DELETE FROM public.inventory_valuation_cutovers
  WHERE tenant_id = v_tenant;

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

  SELECT pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'grn',
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(item) ORDER BY item.id
        )
        FROM public.grn_items AS item
        WHERE item.tenant_id = v_tenant
      ),
      'movements',
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(movement) ORDER BY movement.id
        )
        FROM public.stock_movements AS movement
        WHERE movement.tenant_id = v_tenant
      )
    )::text
  )
  INTO v_history_before;

  v_blocked := FALSE;
  BEGIN
    PERFORM public.prepare_inventory_valuation_cutover(v_prepare_key);
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      IF SQLERRM <> 'inventory_valuation_bootstrap_missing_invoice_coverage'
      THEN
        RAISE;
      END IF;
      v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: partial invoice coverage did not block';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = v_tenant;
  IF v_count <> 0 OR EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND coalesce(stock.avg_unit_cost, 0) <> 0
  ) OR EXISTS (
    SELECT 1
    FROM public.supplier_invoice_receipt_allocations AS allocation
    WHERE allocation.tenant_id = v_tenant
      AND (
        allocation.valuation_status <> 'pending'
        OR allocation.confirmed_net_inventory_amount IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: blocked preparation did not roll back';
  END IF;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    grn_id,
    po_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    matching_status,
    created_by,
    invoice_kind,
    document_status,
    document_discount_amount,
    vat_breakdown,
    confirmed_at,
    confirmed_by
  )
  VALUES (
    v_tenant,
    v_supplier,
    v_grn,
    v_po,
    '__VALUATION-BOOTSTRAP-FINAL__',
    pg_catalog.now(),
    950,
    0,
    0,
    949.99,
    'matched',
    v_owner,
    'goods',
    'confirmed',
    0.01,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 950,
        'vat_amount', 0
      )
    ),
    pg_catalog.now(),
    v_owner
  )
  RETURNING id INTO v_invoice_final;

  INSERT INTO public.supplier_invoice_lines (
    tenant_id,
    supplier_invoice_id,
    ingredient_id,
    description,
    quantity,
    unit_price,
    line_discount_amount,
    allocated_document_discount,
    line_total,
    unit_id,
    vat_rate,
    vat_amount
  )
  VALUES (
    v_tenant,
    v_invoice_final,
    v_ingredient_a,
    'Bootstrap amended remainder',
    9,
    50,
    0,
    0,
    450,
    v_unit,
    0,
    0
  )
  RETURNING id INTO v_line_final_a;

  INSERT INTO public.supplier_invoice_lines (
    tenant_id,
    supplier_invoice_id,
    ingredient_id,
    description,
    quantity,
    unit_price,
    line_discount_amount,
    allocated_document_discount,
    line_total,
    unit_id,
    vat_rate,
    vat_amount
  )
  VALUES (
    v_tenant,
    v_invoice_final,
    v_ingredient_b,
    'Bootstrap second pool',
    5,
    100,
    0,
    0,
    500,
    v_unit,
    0,
    0
  )
  RETURNING id INTO v_line_final_b;

  INSERT INTO public.supplier_invoice_receipt_allocations (
    tenant_id,
    supplier_invoice_id,
    grn_id,
    grn_item_id,
    po_id,
    purchase_order_item_id,
    invoice_line_id,
    billed_quantity,
    matched_quantity
  )
  VALUES
    (
      v_tenant,
      v_invoice_final,
      v_grn,
      v_grn_item_a,
      v_po,
      v_po_item_a,
      v_line_final_a,
      9,
      9
    ),
    (
      v_tenant,
      v_invoice_final,
      v_grn,
      v_grn_item_b,
      v_po,
      v_po_item_b,
      v_line_final_b,
      5,
      5
    );

  v_blocked := FALSE;
  BEGIN
    INSERT INTO public.supplier_invoices (
      tenant_id,
      supplier_id,
      grn_id,
      po_id,
      invoice_number,
      invoice_date,
      subtotal,
      vat_rate,
      vat_amount,
      total_amount,
      matching_status,
      created_by,
      invoice_kind,
      document_status,
      document_discount_amount,
      vat_breakdown,
      confirmed_at,
      confirmed_by
    )
    VALUES (
      v_tenant,
      v_supplier,
      v_grn,
      v_po,
      '__VALUATION-BOOTSTRAP-OVERBILL__',
      pg_catalog.now(),
      50,
      0,
      0,
      50,
      'matched',
      v_owner,
      'goods',
      'confirmed',
      0,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'vat_rate', 0,
          'taxable_amount', 50,
          'vat_amount', 0
        )
      ),
      pg_catalog.now(),
      v_owner
    )
    RETURNING id INTO v_over_invoice;

    INSERT INTO public.supplier_invoice_lines (
      tenant_id,
      supplier_invoice_id,
      ingredient_id,
      description,
      quantity,
      unit_price,
      line_discount_amount,
      allocated_document_discount,
      line_total,
      unit_id,
      vat_rate,
      vat_amount
    )
    VALUES (
      v_tenant,
      v_over_invoice,
      v_ingredient_a,
      'Bootstrap overbilling probe',
      1,
      50,
      0,
      0,
      50,
      v_unit,
      0,
      0
    )
    RETURNING id INTO v_over_line;

    INSERT INTO public.supplier_invoice_receipt_allocations (
      tenant_id,
      supplier_invoice_id,
      grn_id,
      grn_item_id,
      po_id,
      purchase_order_item_id,
      invoice_line_id,
      billed_quantity,
      matched_quantity
    )
    VALUES (
      v_tenant,
      v_over_invoice,
      v_grn,
      v_grn_item_a,
      v_po,
      v_po_item_a,
      v_over_line,
      1,
      1
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: overbilling was not rejected';
  END IF;

  v_readiness :=
    private.inventory_valuation_bootstrap_readiness(v_tenant);
  IF NOT (v_readiness->>'can_prepare')::boolean
     OR (v_readiness->>'missing_grn_item_count')::integer <> 0
     OR (v_readiness->>'fully_billed_grn_item_count')::integer <> 3
     OR (v_readiness->>'confirmed_net_inventory_value')::numeric <> 999.99
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: complete readiness is invalid: %',
      v_readiness;
  END IF;

  PERFORM pg_catalog.set_config(
    'comtammatu.test_valuation_bootstrap_tenant',
    v_tenant::text,
    TRUE
  );

  CREATE OR REPLACE FUNCTION
  private.test_inventory_valuation_bootstrap_distort_wac()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $test$
  BEGIN
    IF NEW.tenant_id = pg_catalog.current_setting(
      'comtammatu.test_valuation_bootstrap_tenant'
    )::bigint THEN
      NEW.avg_unit_cost := NEW.avg_unit_cost + 0.01;
    END IF;
    RETURN NEW;
  END;
  $test$;

  CREATE TRIGGER zz_test_inventory_valuation_bootstrap_distort_wac
  BEFORE UPDATE OF avg_unit_cost
  ON public.stock_levels
  FOR EACH ROW
  EXECUTE FUNCTION
    private.test_inventory_valuation_bootstrap_distort_wac();

  v_blocked := FALSE;
  BEGIN
    PERFORM public.prepare_inventory_valuation_cutover(
      pg_catalog.gen_random_uuid()
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      IF SQLERRM <>
        'inventory_valuation_bootstrap_value_not_representable' THEN
        RAISE;
      END IF;
      v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: post-mutation cent mismatch did not block';
  END IF;

  DROP TRIGGER zz_test_inventory_valuation_bootstrap_distort_wac
    ON public.stock_levels;
  DROP FUNCTION
    private.test_inventory_valuation_bootstrap_distort_wac();

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND coalesce(stock.avg_unit_cost, 0) <> 0
  ) OR EXISTS (
    SELECT 1
    FROM public.supplier_invoice_receipt_allocations AS allocation
    WHERE allocation.tenant_id = v_tenant
      AND (
        allocation.valuation_status <> 'pending'
        OR allocation.confirmed_net_inventory_amount IS NOT NULL
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.inventory_valuation_cutovers AS cutover
    WHERE cutover.tenant_id = v_tenant
  ) OR EXISTS (
    SELECT 1
    FROM public.inventory_valuation_events AS event
    WHERE event.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: post-mutation failure did not roll back';
  END IF;

  v_result := public.prepare_inventory_valuation_cutover(v_prepare_key);
  v_replay := public.prepare_inventory_valuation_cutover(v_prepare_key);
  IF v_result->>'status' <> 'shadow'
     OR (v_result->>'opening_quantity')::numeric <> 15
     OR (v_result->>'opening_value')::numeric <> 999.99
     OR (v_result->>'replayed')::boolean
     OR NOT (v_replay->>'replayed')::boolean
  THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: prepare/idempotency result is invalid: % / %',
      v_result,
      v_replay;
  END IF;

  SELECT pg_catalog.sum(account.book_value)
  INTO v_amount
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = v_tenant;
  IF v_amount <> 999.99 THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: account total mismatch: %',
      v_amount;
  END IF;

  SELECT pg_catalog.sum(balance.book_value)
  INTO v_amount
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_tenant;
  IF v_amount <> 999.99 THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: origin total mismatch: %',
      v_amount;
  END IF;

  SELECT
    pg_catalog.sum(allocation.confirmed_net_inventory_amount)
  INTO v_amount
  FROM public.supplier_invoice_receipt_allocations AS allocation
  WHERE allocation.tenant_id = v_tenant
    AND allocation.valuation_status = 'opening';
  IF v_amount <> 999.99 THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: allocation total mismatch: %',
      v_amount;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_count
  FROM public.inventory_valuation_events AS event
  WHERE event.tenant_id = v_tenant
    AND event.event_type = 'opening';
  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: expected two opening events, got %',
      v_count;
  END IF;

  SELECT pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'grn',
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(item) ORDER BY item.id
        )
        FROM public.grn_items AS item
        WHERE item.tenant_id = v_tenant
      ),
      'movements',
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(movement) ORDER BY movement.id
        )
        FROM public.stock_movements AS movement
        WHERE movement.tenant_id = v_tenant
      )
    )::text
  )
  INTO v_history_after;
  IF v_history_after IS DISTINCT FROM v_history_before THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: historical GRN or movement rows changed';
  END IF;

  v_blocked := FALSE;
  BEGIN
    PERFORM public.activate_inventory_valuation_cutover(v_activate_key);
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      IF SQLERRM <> 'inventory_valuation_shadow_period_incomplete' THEN
        RAISE;
      END IF;
      v_blocked := TRUE;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: activation bypassed seven-day shadow';
  END IF;

  UPDATE public.inventory_valuation_cutovers
  SET prepared_at = pg_catalog.now() - interval '8 days'
  WHERE tenant_id = v_tenant;

  v_result :=
    public.activate_inventory_valuation_cutover(v_activate_key);
  IF v_result->>'status' <> 'active' THEN
    RAISE EXCEPTION
      'VALUATION BOOTSTRAP: activation failed after shadow: %',
      v_result;
  END IF;
END;
$$;

ROLLBACK;
