DO $$
DECLARE
  v_definition text;
  v_owner uuid := pg_catalog.gen_random_uuid();
  v_tenant bigint;
  v_supplier bigint;
  v_result jsonb;
  v_invoice_id bigint;
  v_invoice public.supplier_invoices%ROWTYPE;
  v_line public.supplier_invoice_lines%ROWTYPE;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_definition
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'save_supplier_invoice_draft'
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_invoice_id bigint, p_invoice jsonb, p_lines jsonb, p_allocations jsonb, p_idempotency_key uuid';

  IF v_definition IS NULL
    OR v_definition NOT LIKE '%gross_line_total%'
    OR v_definition NOT LIKE '%unit_price%'
    OR v_definition LIKE '%pricing_mode%'
    OR v_definition NOT LIKE '%supplier_invoice_line_invalid%' THEN
    RAISE EXCEPTION 'supplier invoice additive VAT contract is missing';
  END IF;

  BEGIN
    ALTER TABLE public.tenants
      ALTER CONSTRAINT tenants_owner_user_id_fkey
      DEFERRABLE INITIALLY DEFERRED;
    SET CONSTRAINTS tenants_owner_user_id_fkey DEFERRED;

    INSERT INTO public.tenants (name, slug, owner_user_id)
    VALUES (
      '__net_vat_' || v_owner::text,
      '__net_vat_' || v_owner::text,
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

    INSERT INTO auth.users (
      id,
      email,
      raw_app_meta_data,
      raw_user_meta_data
    )
    VALUES (
      v_owner,
      'net-vat-' || v_owner::text || '@example.invalid',
      pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant,
        'position_code', 'owner'
      ),
      pg_catalog.jsonb_build_object('full_name', 'Net VAT test owner')
    );

    INSERT INTO public.suppliers (tenant_id, name, is_active)
    VALUES (v_tenant, '__net_vat_supplier_' || v_owner::text, TRUE)
    RETURNING id INTO v_supplier;

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
          'position_code', 'owner'
        )
      )::text,
      TRUE
    );

    v_result := public.save_supplier_invoice_draft(
      NULL,
      pg_catalog.jsonb_build_object(
        'supplier_id', v_supplier,
        'invoice_kind', 'service',
        'invoice_date', CURRENT_DATE,
        'due_date', CURRENT_DATE + 7,
        'document_discount_amount', '0.00',
        'subtotal', '555556.00',
        'vat_amount', '44444.00',
        'total_amount', '600000.00',
        'matching_notes', 'Net VAT runtime regression'
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'line_key', 'net-vat-success',
          'ingredient_id', NULL,
          'description', 'Net VAT success',
          'quantity', '1.000',
          'unit_id', NULL,
          'unit_price', '555556.00',
          'gross_line_total', '600000.00',
          'line_discount', '0.00',
          'vat_rate', 8,
          'vat_amount', '44444.00',
          'line_total', '555556.00'
        )
      ),
      '[]'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    v_invoice_id := (v_result->>'invoice_id')::bigint;

    SET CONSTRAINTS trg_supplier_invoice_lines_gross_contract IMMEDIATE;

    SELECT invoice.*
    INTO STRICT v_invoice
    FROM public.supplier_invoices AS invoice
    WHERE invoice.id = v_invoice_id
      AND invoice.tenant_id = v_tenant;

    SELECT line.*
    INTO STRICT v_line
    FROM public.supplier_invoice_lines AS line
    WHERE line.supplier_invoice_id = v_invoice_id
      AND line.tenant_id = v_tenant;

    IF v_invoice.subtotal <> 555556.00
      OR v_invoice.vat_amount <> 44444.00
      OR v_invoice.total_amount <> 600000.00
      OR v_line.unit_price <> 555556.00
      OR v_line.gross_line_total <> 600000.00
      OR v_line.line_total <> 555556.00
      OR v_line.vat_amount <> 44444.00
      OR v_line.line_total + v_line.vat_amount
        <> v_line.gross_line_total THEN
      RAISE EXCEPTION
        'supplier invoice additive VAT totals were not persisted exactly';
    END IF;

    RAISE EXCEPTION '__rollback_net_vat_fixture__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__rollback_net_vat_fixture__' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.save_supplier_invoice_draft(
      NULL,
      pg_catalog.jsonb_build_object(
        'document_discount_amount', '0.00',
        'subtotal', '555556.00',
        'vat_amount', '600001.00',
        'total_amount', '600000.00'
      ),
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'line_key', 'net-vat-regression',
          'ingredient_id', NULL,
          'description', 'Net VAT regression',
          'quantity', '1.000',
          'unit_id', NULL,
          'unit_price', '555556.00',
          'gross_line_total', '600000.00',
          'line_discount', '0.00',
          'vat_rate', 8,
          'vat_amount', '600001.00',
          'line_total', '0.00'
        )
      ),
      '[]'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    RAISE EXCEPTION 'supplier invoice accepted VAT above gross total';
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      IF SQLERRM NOT LIKE '%supplier_invoice_line_invalid%' THEN
        RAISE;
      END IF;
  END;
END;
$$;
