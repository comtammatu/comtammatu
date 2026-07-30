-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/supplier_invoice_ap_stability_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid := pg_catalog.gen_random_uuid();
  v_accountant uuid := pg_catalog.gen_random_uuid();
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
    '__supplier_ap_' || v_owner::text,
    '__supplier_ap_' || v_owner::text,
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
  VALUES
    (v_tenant, 'owner', 'Chủ', 'Owner', TRUE, TRUE),
    (v_tenant, 'accountant', 'Kế toán', 'Accountant', TRUE, TRUE);

  INSERT INTO public.role_templates (
    tenant_id,
    name,
    position_code,
    permission_keys,
    is_system
  )
  VALUES
    (v_tenant, 'owner', 'owner', '{}'::text[], TRUE),
    (v_tenant, 'accountant', 'accountant', '{}'::text[], TRUE);

  INSERT INTO public.branches (
    tenant_id,
    name,
    branch_kind,
    is_active,
    code
  )
  VALUES (
    v_tenant,
    '__supplier_ap_central_' || v_owner::text,
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
  VALUES
    (
      v_owner,
      'supplier-ap-owner-' || v_owner::text || '@example.invalid',
      pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'position_code', 'owner'
      ),
      pg_catalog.jsonb_build_object('full_name', 'Supplier AP owner')
    ),
    (
      v_accountant,
      'supplier-ap-accountant-' || v_accountant::text || '@example.invalid',
      pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'position_code', 'accountant'
      ),
      pg_catalog.jsonb_build_object('full_name', 'Supplier AP accountant')
    );
END;
$$;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_non_owner uuid;
  v_unit bigint;
  v_ingredient_a bigint;
  v_ingredient_b bigint;
  v_supplier bigint;
  v_request jsonb;
  v_po_result jsonb;
  v_request_id bigint;
  v_request_item_a bigint;
  v_request_item_b bigint;
  v_po_id bigint;
  v_grn_a bigint;
  v_grn_b bigint;
  v_invoice bigint;
  v_tolerance_invoice bigint;
  v_discrepancy_invoice bigint;
  v_service_invoice bigint;
  v_result jsonb;
  v_payment_result jsonb;
  v_recomputed jsonb;
  v_replay jsonb;
  v_payment_id bigint;
  v_payment_key uuid := pg_catalog.gen_random_uuid();
  v_advance_key uuid := pg_catalog.gen_random_uuid();
  v_denied_key uuid := pg_catalog.gen_random_uuid();
  v_unverified_key uuid := pg_catalog.gen_random_uuid();
  v_missing_vat_key uuid := pg_catalog.gen_random_uuid();
  v_bank_payment_key uuid := pg_catalog.gen_random_uuid();
  v_payment_count integer;
  v_allocation_count integer;
  v_bank_count_before integer;
  v_bank_count_after integer;
  v_paid numeric;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.create_supplier_invoice_with_allocations(bigint,text,date,jsonb,text,date,numeric,jsonb,text)'
  ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.verify_service_supplier_invoice(bigint,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.allocate_supplier_advance(bigint,uuid,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER AP: required RPCs are missing';
  END IF;

  IF pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_invoices',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_invoices',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_invoices',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_payment_allocations',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'SUPPLIER AP: direct DML remains exposed';
  END IF;

  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND COALESCE(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  SELECT branch.id
  INTO v_branch
  FROM public.branches branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
    AND branch.is_active
  ORDER BY branch.id
  LIMIT 1;

  SELECT profile.id
  INTO v_non_owner
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = v_tenant
    AND position.code <> 'owner'
    AND COALESCE(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  IF v_tenant IS NULL
     OR v_owner IS NULL
     OR v_branch IS NULL
     OR v_non_owner IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER AP: seeded owner/site fixture missing';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (
    v_tenant,
    '__supplier_ap_' || substr(pg_catalog.gen_random_uuid()::text, 1, 8),
    'Supplier AP test unit'
  )
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
    '__supplier_ap_a_' || pg_catalog.gen_random_uuid()::text,
    '__SAP-A-' || pg_catalog.gen_random_uuid()::text,
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
    '__supplier_ap_b_' || pg_catalog.gen_random_uuid()::text,
    '__SAP-B-' || pg_catalog.gen_random_uuid()::text,
    0,
    'raw_material',
    'central_supply',
    TRUE
  )
  RETURNING id INTO v_ingredient_b;

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
    (v_tenant, v_ingredient_b, v_unit, 1, TRUE, TRUE);

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (
    v_tenant,
    '__supplier_ap_' || pg_catalog.gen_random_uuid()::text,
    TRUE
  )
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
    (v_tenant, v_supplier, v_ingredient_b, TRUE, v_owner);

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

  v_request := public.save_purchase_request(
    NULL,
    v_branch,
    CURRENT_DATE + 1,
    'Supplier invoice AP matching fixture',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_a,
        'entry_unit_id', v_unit,
        'quantity', 4
      ),
      pg_catalog.jsonb_build_object(
        'ingredient_id', v_ingredient_b,
        'entry_unit_id', v_unit,
        'quantity', 6
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  v_request_id := (v_request->>'request_id')::bigint;

  SELECT item.id
  INTO v_request_item_a
  FROM public.purchase_request_items item
  WHERE item.tenant_id = v_tenant
    AND item.purchase_request_id = v_request_id
    AND item.ingredient_id = v_ingredient_a;

  SELECT item.id
  INTO v_request_item_b
  FROM public.purchase_request_items item
  WHERE item.tenant_id = v_tenant
    AND item.purchase_request_id = v_request_id
    AND item.ingredient_id = v_ingredient_b;

  v_po_result := public.save_purchase_orders_from_request(
    v_request_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'supplier_id', v_supplier,
        'expected_delivery_date', CURRENT_DATE + 1,
        'notes', '',
        'lines', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'request_item_id', v_request_item_a,
            'quantity', 4,
            'unit_price', 100
          ),
          pg_catalog.jsonb_build_object(
            'request_item_id', v_request_item_b,
            'quantity', 6,
            'unit_price', 100
          )
        )
      )
    ),
    TRUE,
    pg_catalog.gen_random_uuid()
  );
  v_po_id := (v_po_result #>> '{purchase_orders,0,po_id}')::bigint;

  SELECT grn.id
  INTO v_grn_a
  FROM public.goods_received_notes grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_po_id
    AND grn.status = 'draft'
  ORDER BY grn.id
  LIMIT 1;

  PERFORM public.save_goods_receipt_note(
    v_grn_a,
    pg_catalog.now(),
    NULL,
    (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'line_id', item.id,
          'received_quantity', CASE
            WHEN item.ingredient_id = v_ingredient_a THEN 4
            ELSE 0
          END,
          'rejected_quantity', 0,
          'rejection_reason', NULL,
          'rejected_photo_url', NULL
        )
        ORDER BY item.id
      )
      FROM public.grn_items item
      WHERE item.tenant_id = v_tenant
        AND item.grn_id = v_grn_a
    )
  );
  PERFORM public.confirm_goods_receipt_note(v_grn_a);

  SELECT grn.id
  INTO v_grn_b
  FROM public.goods_received_notes grn
  WHERE grn.tenant_id = v_tenant
    AND grn.po_id = v_po_id
    AND grn.status = 'draft'
  ORDER BY grn.id
  LIMIT 1;

  PERFORM public.save_goods_receipt_note(
    v_grn_b,
    pg_catalog.now(),
    NULL,
    (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'line_id', item.id,
          'received_quantity', 6,
          'rejected_quantity', 0,
          'rejection_reason', NULL,
          'rejected_photo_url', NULL
        )
        ORDER BY item.id
      )
      FROM public.grn_items item
      WHERE item.tenant_id = v_tenant
        AND item.grn_id = v_grn_b
    )
  );
  PERFORM public.confirm_goods_receipt_note(v_grn_b);

  v_invoice := public.create_supplier_invoice_with_allocations(
    v_supplier,
    '__SAP-GOODS-' || pg_catalog.gen_random_uuid()::text,
    CURRENT_DATE,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', 995,
      'vat_amount', 0
    )),
    NULL,
    CURRENT_DATE + 7,
    5,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('grn_id', v_grn_a, 'po_id', v_po_id),
      pg_catalog.jsonb_build_object('grn_id', v_grn_b, 'po_id', v_po_id)
    ),
    'goods'
  );

  SELECT pg_catalog.jsonb_build_object(
    'matching_status', invoice.matching_status,
    'reason', invoice.matching_reason_code,
    'expected_amount', invoice.matching_expected_amount,
    'received_amount', invoice.matching_received_amount,
    'difference_amount', invoice.matching_difference_amount
  )
  INTO v_result
  FROM public.supplier_invoices invoice
  WHERE invoice.id = v_invoice;

  v_recomputed := public.recompute_supplier_invoice_matching(v_invoice);
  IF v_result <> v_recomputed - 'invoice_id'
     OR v_recomputed->>'matching_status' <> 'discrepancy'
     OR (v_recomputed->>'expected_amount')::numeric <> 995
     OR (v_recomputed->>'received_amount')::numeric <> 0 THEN
    RAISE EXCEPTION
      'SUPPLIER AP: create/recompute matching mismatch create=% recompute=%',
      v_result,
      v_recomputed;
  END IF;
  PERFORM public.accept_supplier_invoice_discrepancy(
    v_invoice,
    'Legacy header allocation accepted for compatibility test'
  );

  v_tolerance_invoice := public.create_supplier_invoice_with_allocations(
    v_supplier,
    '__SAP-TOL-' || pg_catalog.gen_random_uuid()::text,
    CURRENT_DATE,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', 996,
      'vat_amount', 0
    )),
    NULL,
    CURRENT_DATE + 7,
    5,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('grn_id', v_grn_a, 'po_id', v_po_id),
      pg_catalog.jsonb_build_object('grn_id', v_grn_b, 'po_id', v_po_id)
    ),
    'goods'
  );

  IF (
    SELECT invoice.matching_status
    FROM public.supplier_invoices invoice
    WHERE invoice.id = v_tolerance_invoice
  ) <> 'discrepancy' THEN
    RAISE EXCEPTION
      'SUPPLIER AP: legacy header allocation was not flagged';
  END IF;

  v_discrepancy_invoice :=
    public.create_supplier_invoice_with_allocations(
      v_supplier,
      '__SAP-DIFF-' || pg_catalog.gen_random_uuid()::text,
      CURRENT_DATE,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'vat_rate', 0,
        'taxable_amount', 997,
        'vat_amount', 0
      )),
      NULL,
      CURRENT_DATE + 7,
      5,
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('grn_id', v_grn_a, 'po_id', v_po_id),
        pg_catalog.jsonb_build_object('grn_id', v_grn_b, 'po_id', v_po_id)
      ),
      'goods'
    );

  IF (
    SELECT invoice.matching_status
    FROM public.supplier_invoices invoice
    WHERE invoice.id = v_discrepancy_invoice
  ) <> 'discrepancy' THEN
    RAISE EXCEPTION 'SUPPLIER AP: greater-than-1 VND discrepancy failed';
  END IF;

  PERFORM public.accept_supplier_invoice_discrepancy(
    v_discrepancy_invoice,
    'Accepted by AP stability test'
  );

  v_service_invoice := public.create_supplier_invoice_with_allocations(
    v_supplier,
    '__SAP-SERVICE-' || pg_catalog.gen_random_uuid()::text,
    CURRENT_DATE,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', 200,
      'vat_amount', 0
    )),
    NULL,
    CURRENT_DATE + 7,
    0,
    '[]'::jsonb,
    'service'
  );

  UPDATE public.supplier_invoices
  SET vat_invoice_attachment_path =
    v_tenant::text || '/supplier-ap-test/service.pdf'
  WHERE id = v_service_invoice;

  BEGIN
    PERFORM public.record_supplier_payment_allocated(
      v_tenant,
      v_supplier,
      200,
      'bank_transfer',
      v_unverified_key,
      NULL,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'invoice_id', v_service_invoice,
        'amount', 200
      ))
    );
    RAISE EXCEPTION 'SUPPLIER AP: unverified service payment succeeded';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM <> 'supplier_payment_allocation_invalid' THEN
        RAISE;
      END IF;
  END;

  PERFORM public.verify_service_supplier_invoice(
    v_service_invoice,
    'Service document checked against supplier evidence'
  );

  UPDATE public.supplier_invoices
  SET vat_invoice_attachment_path = NULL
  WHERE id = v_service_invoice;

  BEGIN
    PERFORM public.record_supplier_payment_allocated(
      v_tenant,
      v_supplier,
      200,
      'bank_transfer',
      v_missing_vat_key,
      NULL,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'invoice_id', v_service_invoice,
        'amount', 200
      ))
    );
    RAISE EXCEPTION 'SUPPLIER AP: payment without VAT evidence succeeded';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM <> 'supplier_payment_allocation_invalid' THEN
        RAISE;
      END IF;
  END;

  UPDATE public.supplier_invoices
  SET vat_invoice_attachment_path =
    v_tenant::text || '/supplier-ap-test/service.pdf'
  WHERE id = v_service_invoice;

  UPDATE public.supplier_invoices
  SET vat_invoice_attachment_path =
    v_tenant::text || '/supplier-ap-test/goods.pdf'
  WHERE id = v_invoice;

  UPDATE public.supplier_invoices
  SET vat_invoice_attachment_path =
    v_tenant::text || '/supplier-ap-test/discrepancy.pdf'
  WHERE id = v_discrepancy_invoice;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    v_non_owner::text,
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_non_owner::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'branch_id', v_branch
      )
    )::text,
    TRUE
  );

  BEGIN
    PERFORM public.record_supplier_payment_allocated(
      v_tenant,
      v_supplier,
      990,
      'bank_transfer',
      v_denied_key,
      NULL,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'invoice_id', v_invoice,
        'amount', 990
      ))
    );
    RAISE EXCEPTION 'SUPPLIER AP: non-owner payment succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      IF SQLERRM <> 'forbidden_owner_only' THEN
        RAISE;
      END IF;
  END;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    v_owner::text,
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

  SELECT count(*)
  INTO v_bank_count_before
  FROM public.bank_transactions transaction_row
  WHERE transaction_row.tenant_id = v_tenant;

  PERFORM public.record_supplier_payment_allocated(
    v_tenant,
    v_supplier,
    992,
    'bank_transfer',
    v_bank_payment_key,
    'External bank movement is reconciled separately',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_discrepancy_invoice,
      'amount', 992
    ))
  );

  SELECT count(*)
  INTO v_bank_count_after
  FROM public.bank_transactions transaction_row
  WHERE transaction_row.tenant_id = v_tenant;

  IF v_bank_count_after <> v_bank_count_before THEN
    RAISE EXCEPTION
      'SUPPLIER AP: bank payment created a second bank movement';
  END IF;

  v_payment_result := public.record_supplier_payment_allocated(
    v_tenant,
    v_supplier,
    1190,
    'cash',
    v_payment_key,
    'Goods payment with visible advance',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice,
      'amount', 990
    ))
  );
  v_replay := public.record_supplier_payment_allocated(
    v_tenant,
    v_supplier,
    1190,
    'cash',
    v_payment_key,
    'Goods payment with visible advance',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice,
      'amount', 990
    ))
  );
  v_payment_id := (v_payment_result->>'payment_id')::bigint;

  IF v_payment_result <> v_replay
     OR (v_payment_result->>'allocated_amount')::numeric <> 990
     OR (v_payment_result->>'advance_amount')::numeric <> 200 THEN
    RAISE EXCEPTION
      'SUPPLIER AP: payment replay/advance failed %',
      v_payment_result;
  END IF;

  v_result := public.allocate_supplier_advance(
    v_payment_id,
    v_advance_key,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_service_invoice,
      'amount', 200
    ))
  );
  v_replay := public.allocate_supplier_advance(
    v_payment_id,
    v_advance_key,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_service_invoice,
      'amount', 200
    ))
  );

  IF v_result <> v_replay
     OR (v_result->>'advance_amount')::numeric <> 0 THEN
    RAISE EXCEPTION 'SUPPLIER AP: advance allocation replay failed %', v_result;
  END IF;

  v_replay := public.record_supplier_payment(
    v_tenant,
    v_invoice,
    1190,
    'cash',
    v_payment_key,
    'Goods payment with visible advance'
  );
  IF v_replay <> v_payment_result THEN
    RAISE EXCEPTION
      'SUPPLIER AP: original payment replay changed after advance % <> %',
      v_payment_result,
      v_replay;
  END IF;

  SELECT count(*), sum(payment.amount)
  INTO v_payment_count, v_paid
  FROM public.supplier_payments payment
  WHERE payment.id = v_payment_id
    AND payment.tenant_id = v_tenant;

  SELECT count(*)
  INTO v_allocation_count
  FROM public.supplier_payment_allocations allocation
  WHERE allocation.supplier_payment_id = v_payment_id
    AND allocation.tenant_id = v_tenant;

  IF v_payment_count <> 1
     OR v_paid <> 1190
     OR v_allocation_count <> 2
     OR (
       SELECT invoice.paid_amount
       FROM public.supplier_invoices invoice
       WHERE invoice.id = v_service_invoice
     ) <> 200 THEN
    RAISE EXCEPTION
      'SUPPLIER AP: advance changed money twice or duplicated allocations';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_logs audit
    WHERE audit.tenant_id = v_tenant
      AND audit.action = 'supplier_invoice.created'
      AND audit.entity_id = v_invoice
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.audit_logs audit
    WHERE audit.tenant_id = v_tenant
      AND audit.action = 'supplier_payment.advance_allocated'
      AND audit.entity_id = v_payment_id
  ) THEN
    RAISE EXCEPTION 'SUPPLIER AP: required audit evidence missing';
  END IF;
END;
$$;

ROLLBACK;
