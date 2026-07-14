-- Run against a non-production database with migrations and dev seed applied:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/supplier_payment_idempotency_acceptance_test.sql

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_branch bigint;
  v_owner uuid;
  v_staff uuid;
  v_supplier bigint;
  v_grn bigint;
  v_invoice_a bigint;
  v_invoice_b bigint;
  v_seed text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  SELECT branch.tenant_id, branch.id
  INTO v_tenant, v_branch
  FROM public.branches branch
  WHERE branch.is_active
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.tenant_id = branch.tenant_id
        AND profile.is_active
        AND public.auth_is_owner(profile.id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.tenant_id = branch.tenant_id
        AND profile.is_active
        AND NOT public.auth_is_owner(profile.id)
    )
  ORDER BY branch.id
  LIMIT 1;

  SELECT profile.id
  INTO v_owner
  FROM public.profiles profile
  WHERE profile.tenant_id = v_tenant
    AND profile.is_active
    AND public.auth_is_owner(profile.id)
  ORDER BY profile.id
  LIMIT 1;

  SELECT profile.id
  INTO v_staff
  FROM public.profiles profile
  WHERE profile.tenant_id = v_tenant
    AND profile.is_active
    AND NOT public.auth_is_owner(profile.id)
  ORDER BY profile.id
  LIMIT 1;

  IF v_tenant IS NULL
    OR v_branch IS NULL
    OR v_owner IS NULL
    OR v_staff IS NULL
  THEN
    RAISE EXCEPTION
      'Supplier-payment idempotency test requires tenant, branch, Owner, and staff seed data';
  END IF;

  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    granted_by,
    valid_from,
    valid_until
  ) VALUES (
    v_staff,
    v_tenant,
    NULL,
    'finance:ap_pay',
    v_owner,
    now(),
    NULL
  ) ON CONFLICT (user_id, permission_key) WHERE branch_id IS NULL
  DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    granted_by = EXCLUDED.granted_by,
    valid_from = EXCLUDED.valid_from,
    valid_until = NULL;

  INSERT INTO public.suppliers (tenant_id, name)
  VALUES (v_tenant, 'Supplier payment idempotency ' || v_seed)
  RETURNING id INTO v_supplier;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    supplier_id,
    grn_number,
    status,
    received_by,
    created_by
  ) VALUES (
    v_tenant,
    v_branch,
    v_supplier,
    'GRN-IDEMP-' || v_seed,
    'confirmed',
    v_owner,
    v_owner
  ) RETURNING id INTO v_grn;

  INSERT INTO public.supplier_invoices (
    tenant_id,
    supplier_id,
    grn_id,
    invoice_number,
    invoice_date,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    matching_status,
    created_by
  ) VALUES
    (
      v_tenant, v_supplier, v_grn, 'INV-IDEMP-A-' || v_seed, now(),
      1000, 0, 0, 1000, 'matched', v_owner
    ),
    (
      v_tenant, v_supplier, v_grn, 'INV-IDEMP-B-' || v_seed, now(),
      1000, 0, 0, 1000, 'matched', v_owner
    );

  SELECT invoice.id
  INTO v_invoice_a
  FROM public.supplier_invoices invoice
  WHERE invoice.invoice_number = 'INV-IDEMP-A-' || v_seed;

  SELECT invoice.id
  INTO v_invoice_b
  FROM public.supplier_invoices invoice
  WHERE invoice.invoice_number = 'INV-IDEMP-B-' || v_seed;

  PERFORM set_config('test.supplier_payment_tenant', v_tenant::text, true);
  PERFORM set_config('test.supplier_payment_owner', v_owner::text, true);
  PERFORM set_config('test.supplier_payment_staff', v_staff::text, true);
  PERFORM set_config('test.supplier_payment_invoice_a', v_invoice_a::text, true);
  PERFORM set_config('test.supplier_payment_invoice_b', v_invoice_b::text, true);
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.supplier_payment_owner'),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.supplier_payment_owner'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.supplier_payment_tenant')::bigint
    )
  )::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant bigint := current_setting('test.supplier_payment_tenant')::bigint;
  v_owner uuid := current_setting('test.supplier_payment_owner')::uuid;
  v_staff uuid := current_setting('test.supplier_payment_staff')::uuid;
  v_invoice_a bigint := current_setting('test.supplier_payment_invoice_a')::bigint;
  v_invoice_b bigint := current_setting('test.supplier_payment_invoice_b')::bigint;
  v_key_a uuid := gen_random_uuid();
  v_key_b uuid := gen_random_uuid();
  v_key_c uuid := gen_random_uuid();
  v_fractional_key uuid := gen_random_uuid();
  v_first jsonb;
  v_replay jsonb;
  v_payment_id bigint;
  v_count integer;
  v_sum numeric;
  v_paid numeric;
  v_status text;
BEGIN
  IF to_regprocedure(
    'public.create_supplier_payment(bigint,bigint,numeric,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy create_supplier_payment signature remains';
  END IF;

  IF to_regprocedure(
    'public.create_supplier_payment(bigint,bigint,numeric,text,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Idempotent create_supplier_payment signature is missing';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_supplier_payment(bigint,bigint,numeric,text,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.create_supplier_payment(bigint,bigint,numeric,text,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.create_supplier_payment(bigint,bigint,numeric,text,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supplier-payment RPC grants are incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'supplier_payments'
      AND attribute.attname = 'idempotency_key'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND NOT attribute.attnotnull
  ) THEN
    RAISE EXCEPTION 'Historical supplier-payment idempotency column is not nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'supplier_payments'
      AND constraint_row.conname = 'supplier_payments_tenant_idempotency_key_key'
      AND constraint_row.contype = 'u'
      AND pg_get_constraintdef(constraint_row.oid)
        = 'UNIQUE (tenant_id, idempotency_key)'
  ) THEN
    RAISE EXCEPTION 'Supplier-payment tenant idempotency constraint is missing';
  END IF;

  BEGIN
    PERFORM public.create_supplier_payment(
      v_tenant, v_invoice_a, 100, 'bank_transfer', NULL, 'NULL-KEY'
    );
    RAISE EXCEPTION 'Supplier payment accepted a NULL idempotency key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%supplier_payment_idempotency_key_required%' THEN
      RAISE;
    END IF;
  END;

  FOR v_count IN 1..2 LOOP
    BEGIN
      PERFORM public.create_supplier_payment(
        v_tenant,
        v_invoice_a,
        100.005,
        'bank_transfer',
        v_fractional_key,
        'FRACTIONAL-AMOUNT'
      );
      RAISE EXCEPTION 'Supplier payment accepted excess amount precision';
    EXCEPTION WHEN SQLSTATE '22023' THEN
      IF SQLERRM NOT LIKE '%invalid_payment_amount%' THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payments payment
    WHERE payment.tenant_id = v_tenant
      AND payment.idempotency_key = v_fractional_key
  ) THEN
    RAISE EXCEPTION 'Rejected excess-precision payment changed the ledger';
  END IF;

  v_first := public.create_supplier_payment(
    v_tenant,
    v_invoice_a,
    100,
    'bank_transfer',
    v_key_a,
    '  BANK-REF-1  '
  );
  v_payment_id := (v_first ->> 'payment_id')::bigint;

  v_replay := public.create_supplier_payment(
    v_tenant,
    v_invoice_a,
    100,
    'bank_transfer',
    v_key_a,
    'BANK-REF-1'
  );

  IF (v_replay ->> 'payment_id')::bigint <> v_payment_id
    OR COALESCE((v_replay ->> 'replayed')::boolean, false) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Exact supplier-payment replay did not return the original payment';
  END IF;

  SELECT count(*), sum(payment.amount)
  INTO v_count, v_sum
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = v_tenant
    AND payment.idempotency_key = v_key_a;

  SELECT invoice.paid_amount, invoice.payment_status
  INTO v_paid, v_status
  FROM public.supplier_invoices invoice
  WHERE invoice.id = v_invoice_a;

  IF v_count <> 1
    OR v_sum <> 100
    OR v_paid <> 100
    OR v_status <> 'partial'
  THEN
    RAISE EXCEPTION 'Exact replay changed supplier-payment totals';
  END IF;

  BEGIN
    PERFORM public.create_supplier_payment(
      v_tenant, v_invoice_a, 101, 'bank_transfer', v_key_a, 'BANK-REF-1'
    );
    RAISE EXCEPTION 'Changed amount reused a supplier-payment key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%supplier_payment_idempotency_conflict%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.create_supplier_payment(
      v_tenant, v_invoice_a, 100, 'cash', v_key_a, 'BANK-REF-1'
    );
    RAISE EXCEPTION 'Changed method reused a supplier-payment key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%supplier_payment_idempotency_conflict%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.create_supplier_payment(
      v_tenant, v_invoice_a, 100, 'bank_transfer', v_key_a, 'BANK-REF-2'
    );
    RAISE EXCEPTION 'Changed note reused a supplier-payment key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%supplier_payment_idempotency_conflict%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    PERFORM public.create_supplier_payment(
      v_tenant, v_invoice_b, 100, 'bank_transfer', v_key_a, 'BANK-REF-1'
    );
    RAISE EXCEPTION 'Changed invoice reused a supplier-payment key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%supplier_payment_idempotency_conflict%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_staff,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );

  BEGIN
    PERFORM public.create_supplier_payment(
      v_tenant, v_invoice_a, 100, 'bank_transfer', v_key_a, 'BANK-REF-1'
    );
    RAISE EXCEPTION 'Changed actor reused a supplier-payment key';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%supplier_payment_idempotency_conflict%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    true
  );

  PERFORM public.create_supplier_payment(
    v_tenant,
    v_invoice_a,
    150,
    'bank_transfer',
    v_key_b,
    'BANK-REF-2'
  );

  PERFORM public.create_supplier_payment(
    v_tenant,
    v_invoice_a,
    750,
    'bank_transfer',
    v_key_c,
    'BANK-REF-3'
  );

  v_replay := public.create_supplier_payment(
    v_tenant,
    v_invoice_a,
    100,
    'bank_transfer',
    v_key_a,
    'BANK-REF-1'
  );

  SELECT count(*), sum(payment.amount)
  INTO v_count, v_sum
  FROM public.supplier_payments payment
  WHERE payment.supplier_invoice_id = v_invoice_a
    AND payment.idempotency_key IS NOT NULL;

  SELECT invoice.paid_amount, invoice.payment_status
  INTO v_paid, v_status
  FROM public.supplier_invoices invoice
  WHERE invoice.id = v_invoice_a;

  IF (v_replay ->> 'payment_id')::bigint <> v_payment_id
    OR (v_replay ->> 'payment_status') <> 'paid'
    OR v_count <> 3
    OR v_sum <> 1000
    OR v_paid <> 1000
    OR v_status <> 'paid'
  THEN
    RAISE EXCEPTION 'Distinct supplier-payment keys did not preserve ledger totals';
  END IF;
END;
$$;

ROLLBACK;
