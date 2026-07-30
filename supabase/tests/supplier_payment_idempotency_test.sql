-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/supplier_payment_idempotency_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_supplier bigint;
  v_invoice bigint;
  v_key uuid := pg_catalog.gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_payment_id bigint;
  v_payment_count integer;
  v_allocation_count integer;
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.record_supplier_payment_allocated(bigint,bigint,numeric,text,uuid,text,jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'current allocated supplier payment RPC is missing';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_supplier_payment_allocated(bigint,bigint,numeric,text,uuid,text,jsonb)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.record_supplier_payment_allocated(bigint,bigint,numeric,text,uuid,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'supplier payment RPC grants are invalid';
  END IF;

  IF pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_payments',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.supplier_payment_allocations',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'direct supplier payment DML remains exposed';
  END IF;

  SELECT profile.tenant_id, profile.id, branch.id
  INTO v_tenant, v_owner, v_branch
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  JOIN public.branches branch
    ON branch.tenant_id = profile.tenant_id
   AND branch.is_active
   AND branch.branch_kind IN ('central_supply', 'central_kitchen')
  WHERE position.code = 'owner'
    AND COALESCE(profile.is_active, TRUE)
  ORDER BY branch.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'seeded owner/site fixture missing';
  END IF;

  INSERT INTO public.suppliers (tenant_id, name, is_active)
  VALUES (
    v_tenant,
    '__supplier_payment_' || pg_catalog.gen_random_uuid()::text,
    TRUE
  )
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
        'branch_id', v_branch
      )
    )::text,
    TRUE
  );

  v_invoice := public.create_supplier_invoice_with_allocations(
    v_supplier,
    '__SPAY-SERVICE-' || pg_catalog.gen_random_uuid()::text,
    CURRENT_DATE,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'vat_rate', 0,
      'taxable_amount', 1000,
      'vat_amount', 0
    )),
    NULL,
    CURRENT_DATE + 7,
    0,
    '[]'::jsonb,
    'service'
  );

  PERFORM public.verify_service_supplier_invoice(
    v_invoice,
    'Service evidence checked'
  );

  UPDATE public.supplier_invoices
  SET vat_invoice_attachment_path = 'supplier-invoices/test.pdf'
  WHERE id = v_invoice
    AND tenant_id = v_tenant;

  v_result := public.record_supplier_payment_allocated(
    v_tenant,
    v_supplier,
    1200,
    'bank_transfer',
    v_key,
    'BANK-REF',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice,
      'amount', 1000
    ))
  );
  v_payment_id := (v_result->>'payment_id')::bigint;

  IF v_payment_id IS NULL
     OR (v_result->>'allocated_amount')::numeric <> 1000
     OR (v_result->>'advance_amount')::numeric <> 200
     OR v_result->>'payment_status' <> 'partial' THEN
    RAISE EXCEPTION 'supplier payment result is invalid: %', v_result;
  END IF;

  v_replay := public.record_supplier_payment_allocated(
    v_tenant,
    v_supplier,
    1200,
    'bank_transfer',
    v_key,
    'BANK-REF',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'invoice_id', v_invoice,
      'amount', 1000
    ))
  );

  IF v_replay <> v_result THEN
    RAISE EXCEPTION 'exact replay changed result: % <> %', v_result, v_replay;
  END IF;

  BEGIN
    PERFORM public.record_supplier_payment_allocated(
      v_tenant,
      v_supplier,
      1201,
      'bank_transfer',
      v_key,
      'BANK-REF',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'invoice_id', v_invoice,
        'amount', 1000
      ))
    );
    RAISE EXCEPTION 'changed-payload replay unexpectedly succeeded';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'supplier_payment_idempotency_conflict' THEN
        RAISE;
      END IF;
  END;

  SELECT count(*)
  INTO v_payment_count
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant
    AND payment.idempotency_key = v_key;

  SELECT count(*)
  INTO v_allocation_count
  FROM public.supplier_payment_allocations allocation
  WHERE allocation.tenant_id = v_tenant
    AND allocation.supplier_payment_id = v_payment_id;

  IF v_payment_count <> 1 OR v_allocation_count <> 1 THEN
    RAISE EXCEPTION
      'supplier payment replay duplicated rows payments=% allocations=%',
      v_payment_count,
      v_allocation_count;
  END IF;
END;
$$;

ROLLBACK;
